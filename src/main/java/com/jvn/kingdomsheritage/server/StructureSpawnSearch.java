package com.jvn.kingdomsheritage.server;

import com.jvn.kingdomsheritage.HeritageConfig;
import com.jvn.kingdomsheritage.data.HeritageException;
import com.jvn.kingdomsheritage.data.SpawnDefinition;
import com.jvn.kingdomsheritage.server.StructureSearchCursor.Candidate;
import com.jvn.kingdomsheritage.server.StructureSearchCursor.Group;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Supplier;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.LevelHeightAccessor;
import net.minecraft.world.level.chunk.ChunkGeneratorStructureState;
import net.minecraft.world.level.chunk.status.ChunkStatus;
import net.minecraft.world.level.chunk.storage.ChunkScanAccess;
import net.minecraft.world.level.chunk.storage.IOWorker;
import net.minecraft.world.level.dimension.DimensionType;
import net.minecraft.world.level.levelgen.structure.Structure;
import net.minecraft.world.level.levelgen.structure.StructureCheck;
import net.minecraft.world.level.levelgen.structure.StructureCheckResult;
import net.minecraft.world.level.levelgen.structure.StructureStart;
import net.minecraft.world.level.levelgen.structure.placement.ConcentricRingsStructurePlacement;
import net.minecraft.world.level.levelgen.structure.placement.RandomSpreadStructurePlacement;
import net.minecraft.world.level.levelgen.structure.placement.StructurePlacement;
import net.minecraft.world.level.storage.LevelResource;

final class StructureSpawnSearch implements AutoCloseable {
    private record Probe(Candidate candidate, boolean loaded, boolean present) {}
    private static final ExecutorService WORKERS = Executors.newFixedThreadPool(2, task -> {
        var thread = new Thread(task, "heritage-structure-search");
        thread.setDaemon(true);
        return thread;
    });
    private final ServerLevel level;
    private final SpawnChunks chunks;
    private final Supplier<StructureCheck> presenceChecks;
    private final ChunkGeneratorStructureState state;
    private final CompletableFuture<StructureSearchCursor> candidates;
    private StructureSearchCursor cursor;
    private Iterator<Probe> candidateBatch = java.util.Collections.emptyIterator();
    private CompletableFuture<Candidate> probing;
    private Candidate pending;
    private final int candidateLimit = HeritageConfig.STRUCTURE_SEARCH_CANDIDATES.get();
    private int candidatesQueued;
    private boolean limited;
    private boolean exhausted;
    private boolean rejected;
    private volatile boolean closed;
    private StructureStart result;

    StructureSpawnSearch(ServerLevel level, SpawnDefinition definition, BlockPos origin, SpawnChunks chunks) {
        this.level = level;
        this.chunks = chunks;
        if (!level.getServer().getWorldData().worldGenOptions().generateStructures()) {
            throw new HeritageException("structures_disabled", "Structure generation is disabled in this world");
        }
        int radius = SpawnResolver.searchRadius(definition);
        int initialRadius = Math.min(radius, HeritageConfig.SEARCH_RADIUS.get());
        var source = level.getChunkSource();
        var generator = source.getGenerator();
        var directory = DimensionType.getStorageFolder(level.dimension(), level.getServer().getWorldPath(LevelResource.ROOT));
        var scanner = source.chunkScanner();
        var storage = scanner instanceof IOWorker ? existingRegions(directory.resolve("region"), scanner) : scanner;
        presenceChecks = () -> new StructureCheck(storage, level.registryAccess(), level.getStructureManager(),
                level.dimension(), generator, source.randomState(), LevelHeightAccessor.create(level.getMinBuildHeight(), level.getHeight()),
                generator.getBiomeSource(), level.getSeed(), level.getServer().getFixerUpper());
        state = source.getGeneratorState();
        var placements = new LinkedHashMap<StructurePlacement, List<Holder<Structure>>>();
        for (var holder : StructureSpawnResolver.targets(level, definition)) {
            for (var placement : state.getPlacementsForStructure(holder)) {
                placements.computeIfAbsent(placement, key -> new ArrayList<>()).add(holder);
            }
        }
        var spread = new ArrayList<Group>();
        var concentricGroups = new ArrayList<Group>();
        for (var entry : placements.entrySet()) {
            var value = new Group(entry.getKey(), List.copyOf(entry.getValue()));
            if (entry.getKey() instanceof RandomSpreadStructurePlacement) spread.add(value);
            else if (entry.getKey() instanceof ConcentricRingsStructurePlacement) concentricGroups.add(value);
        }
        if (spread.isEmpty() && concentricGroups.isEmpty()) {
            throw new HeritageException("structure_placement", "No supported structure placements are available for this target in this dimension");
        }
        candidates = CompletableFuture.supplyAsync(() -> {
            var rings = new ArrayList<Candidate>();
            for (var value : concentricGroups) {
                if (closed) break;
                var positions = state.getRingPositionsFor((ConcentricRingsStructurePlacement) value.placement());
                if (positions != null) for (var pos : positions) rings.add(new Candidate(value, pos));
            }
            rings.sort(java.util.Comparator.comparingDouble(candidate -> {
                var location = candidate.group().placement().getLocatePos(candidate.chunk());
                double x = (double) location.getX() - origin.getX();
                double z = (double) location.getZ() - origin.getZ();
                return x * x + z * z;
            }));
            return new StructureSearchCursor(state.getLevelSeed(), origin, initialRadius, radius, spread, rings);
        }, WORKERS);
    }

    private static ChunkScanAccess existingRegions(Path directory, ChunkScanAccess storage) {
        return (pos, visitor) -> {
            // opening a missing anvil region for a speculative read can create an empty file
            var region = directory.resolve("r." + pos.getRegionX() + "." + pos.getRegionZ() + ".mca");
            if (Files.notExists(region)) return CompletableFuture.completedFuture(null);
            return storage.scanChunk(pos, visitor);
        };
    }

    StructureStart result() { return result; }

    void next() {
        result = null;
        rejected = true;
    }

    boolean step(long deadline) {
        if (closed) return false;
        if (result != null) return true;
        if (cursor == null) {
            if (!candidates.isDone()) return false;
            cursor = candidates.join();
        }
        for (int work = 0; work < 128 && System.nanoTime() < deadline; work++) {
            if (pending == null) {
                if (probing == null) {
                    if (!candidateBatch.hasNext()) {
                        if (limited) throw new HeritageException("structure_search_limit", "Checked %s candidate placements without finding a safe structure destination. Choose another location", candidateLimit);
                        if (exhausted) {
                            if (rejected) throw new HeritageException("structure_room", "No safe standing room found inside this structure within the search limit");
                            throw new HeritageException("not_found", "No matching location found within the configured search radius");
                        }
                        candidateBatch = probes(deadline).iterator();
                    }
                    if (!candidateBatch.hasNext()) continue;
                    var batch = candidateBatch;
                    probing = CompletableFuture.supplyAsync(() -> probe(batch), WORKERS);
                    return false;
                }
                if (!probing.isDone()) return false;
                pending = probing.join();
                probing = null;
                if (pending == null) continue;
            }
            var candidate = pending;
            var location = candidate.group().placement().getLocatePos(candidate.chunk());
            if (!level.getWorldBorder().isWithinBounds(location)) {
                pending = null;
                continue;
            }
            var chunk = chunks.structure(candidate.chunk());
            if (chunk == null) return false;
            pending = null;
            for (var holder : candidate.group().structures()) {
                var start = chunk.getStartForStructure(holder.value());
                if (start == null || !start.isValid()) continue;
                result = start;
                return true;
            }
        }
        return false;
    }

    @Override
    public void close() {
        closed = true;
        candidates.cancel(false);
        if (probing != null) probing.cancel(false);
    }

    private List<Probe> probes(long deadline) {
        var batch = new ArrayList<Probe>();
        for (int work = 0; work < 128 && System.nanoTime() < deadline; work++) {
            var candidate = cursor.next();
            if (candidate == null) {
                exhausted = true;
                break;
            }
            var pos = candidate.chunk();
            var location = candidate.group().placement().getLocatePos(pos);
            if (cursor.includes(candidate) && level.getWorldBorder().isWithinBounds(location)) {
                if (candidatesQueued == candidateLimit) {
                    limited = true;
                    break;
                }
                candidatesQueued++;
                var holder = level.getChunkSource().chunkMap.getVisibleChunkIfPresent(pos.toLong());
                var loaded = holder == null ? null : holder.getChunkIfPresent(ChunkStatus.STRUCTURE_STARTS);
                boolean present = loaded != null && candidate.group().structures().stream().anyMatch(target -> {
                    var start = loaded.getStartForStructure(target.value());
                    return start != null && start.isValid();
                });
                batch.add(new Probe(candidate, loaded != null, present));
            }
        }
        return batch;
    }

    private Candidate probe(Iterator<Probe> batch) {
        // discard vanilla's per-chunk caches between slices to bound sparse-search memory
        var presenceCheck = presenceChecks.get();
        long deadline = System.nanoTime() + 20000000;
        while (!closed && batch.hasNext() && System.nanoTime() < deadline) {
            var probe = batch.next();
            var candidate = probe.candidate;
            if (!candidate.group().placement().isStructureChunk(state, candidate.chunk().x, candidate.chunk().z)) continue;
            if (probe.loaded) {
                if (probe.present) return candidate;
                continue;
            }
            for (var target : candidate.group().structures()) {
                if (closed) return null;
                if (presenceCheck.checkStart(candidate.chunk(), target.value(), candidate.group().placement(), false)
                        != StructureCheckResult.START_NOT_PRESENT) return candidate;
            }
        }
        return null;
    }
}

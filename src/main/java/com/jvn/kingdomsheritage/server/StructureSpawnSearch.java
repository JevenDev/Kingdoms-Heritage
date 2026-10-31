package com.jvn.kingdomsheritage.server;

import com.jvn.kingdomsheritage.data.HeritageException;
import com.jvn.kingdomsheritage.data.SpawnDefinition;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.LevelHeightAccessor;
import net.minecraft.world.level.chunk.status.ChunkStatus;
import net.minecraft.world.level.levelgen.structure.Structure;
import net.minecraft.world.level.levelgen.structure.StructureCheck;
import net.minecraft.world.level.levelgen.structure.StructureCheckResult;
import net.minecraft.world.level.levelgen.structure.StructureStart;
import net.minecraft.world.level.levelgen.structure.placement.ConcentricRingsStructurePlacement;
import net.minecraft.world.level.levelgen.structure.placement.RandomSpreadStructurePlacement;
import net.minecraft.world.level.levelgen.structure.placement.StructurePlacement;

final class StructureSpawnSearch implements AutoCloseable {
    private record Group(StructurePlacement placement, List<Holder<Structure>> structures) {}
    private record Candidate(Group group, ChunkPos chunk) {}
    private record Probe(Candidate candidate, boolean loaded, boolean present) {}
    private final ServerLevel level;
    private final BlockPos origin;
    private final SpawnChunks chunks;
    private final StructureCheck presenceCheck;
    private final List<Group> spread = new ArrayList<>();
    private final CompletableFuture<List<Candidate>> ringCandidates;
    private Iterator<Candidate> concentric;
    private final int radius;
    private final int rings;
    private int ring;
    private int group;
    private Iterator<BlockPos> offsets;
    private Iterator<Probe> candidateBatch = java.util.Collections.emptyIterator();
    private CompletableFuture<Candidate> probing;
    private Candidate pending;
    private boolean exhausted;
    private volatile boolean closed;
    private StructureStart result;
    private BlockPos resultLocation;
    private boolean foundInRing;
    private boolean scanningRings = true;
    private boolean complete;

    StructureSpawnSearch(ServerLevel level, SpawnDefinition definition, BlockPos origin, SpawnChunks chunks) {
        this.level = level;
        this.origin = origin;
        this.chunks = chunks;
        if (!level.getServer().getWorldData().worldGenOptions().generateStructures()) {
            throw new HeritageException("structures_disabled", "Structure generation is disabled in this world");
        }
        radius = SpawnResolver.searchRadius(definition);
        var source = level.getChunkSource();
        var generator = source.getGenerator();
        presenceCheck = new StructureCheck(source.chunkScanner(), level.registryAccess(), level.getStructureManager(),
                level.dimension(), generator, source.randomState(), LevelHeightAccessor.create(level.getMinBuildHeight(), level.getHeight()),
                generator.getBiomeSource(), level.getSeed(), level.getServer().getFixerUpper());
        var state = level.getChunkSource().getGeneratorState();
        var placements = new LinkedHashMap<StructurePlacement, List<Holder<Structure>>>();
        for (var holder : StructureSpawnResolver.targets(level, definition)) {
            for (var placement : state.getPlacementsForStructure(holder)) {
                placements.computeIfAbsent(placement, key -> new ArrayList<>()).add(holder);
            }
        }
        var concentricGroups = new ArrayList<Group>();
        int spacing = Integer.MAX_VALUE;
        for (var entry : placements.entrySet()) {
            var value = new Group(entry.getKey(), entry.getValue());
            if (entry.getKey() instanceof RandomSpreadStructurePlacement random) {
                spread.add(value);
                spacing = Math.min(spacing, random.spacing());
            } else if (entry.getKey() instanceof ConcentricRingsStructurePlacement) {
                concentricGroups.add(value);
            }
        }
        ringCandidates = concentricGroups.isEmpty() ? CompletableFuture.completedFuture(List.of())
                : CompletableFuture.supplyAsync(() -> {
                    var candidates = new ArrayList<Candidate>();
                    for (var value : concentricGroups) {
                        var positions = state.getRingPositionsFor((ConcentricRingsStructurePlacement) value.placement);
                        if (positions != null) for (var pos : positions) candidates.add(new Candidate(value, pos));
                    }
                    candidates.sort(java.util.Comparator.comparingDouble(candidate -> distance(candidate.group.placement.getLocatePos(candidate.chunk))));
                    return candidates;
                });
        rings = spacing == Integer.MAX_VALUE ? 0 : Math.max(1, (int) Math.ceil(radius / (16.0 * spacing)));
    }

    StructureStart result() { return result; }

    boolean step(long deadline) {
        if (closed) return false;
        if (complete) return true;
        if (concentric == null) {
            if (!ringCandidates.isDone()) return false;
            concentric = ringCandidates.join().iterator();
        }
        for (int work = 0; work < 128 && System.nanoTime() < deadline; work++) {
            if (pending == null && probing == null && exhausted) {
                if (result == null || distance(resultLocation) > (double) radius * radius) {
                    throw new HeritageException("not_found", "No matching location found within the configured search radius");
                }
                complete = true;
                return true;
            }
            if (pending == null) {
                if (probing == null) {
                    if (!candidateBatch.hasNext()) candidateBatch = probes(deadline).iterator();
                    if (!candidateBatch.hasNext()) continue;
                    var batch = candidateBatch;
                    probing = CompletableFuture.supplyAsync(() -> probe(batch));
                    return false;
                }
                if (!probing.isDone()) return false;
                pending = probing.join();
                probing = null;
                if (pending == null) continue;
            }
            var candidate = pending;
            var placement = candidate.group.placement;
            var pos = candidate.chunk;
            BlockPos location = placement.getLocatePos(pos);
            if (distance(location) > (double) radius * radius || !level.getWorldBorder().isWithinBounds(location)) {
                pending = null;
                continue;
            }
            var chunk = chunks.structure(pos);
            if (chunk == null) return false;
            for (var holder : candidate.group.structures) {
                var start = chunk.getStartForStructure(holder.value());
                if (start == null || !start.isValid()) continue;
                if (result == null || distance(location) < distance(resultLocation)) {
                    result = start;
                    resultLocation = location;
                }
                candidateBatch = java.util.Collections.emptyIterator();
                if (!scanningRings) {
                    foundInRing = true;
                    offsets = null;
                    group++;
                }
                break;
            }
            pending = null;
        }
        return false;
    }

    @Override
    public void close() {
        closed = true;
        ringCandidates.cancel(false);
        if (probing != null) probing.cancel(false);
    }

    private List<Probe> probes(long deadline) {
        var batch = new ArrayList<Probe>();
        for (int work = 0; work < 128 && System.nanoTime() < deadline; work++) {
            var candidate = next();
            if (candidate == null) {
                exhausted = true;
                break;
            }
            var placement = candidate.group.placement;
            var pos = candidate.chunk;
            var location = placement.getLocatePos(pos);
            if (distance(location) <= (double) radius * radius && level.getWorldBorder().isWithinBounds(location)
                    && placement.isStructureChunk(level.getChunkSource().getGeneratorState(), pos.x, pos.z)) {
                var holder = level.getChunkSource().chunkMap.getVisibleChunkIfPresent(pos.toLong());
                var loaded = holder == null ? null : holder.getChunkIfPresent(ChunkStatus.STRUCTURE_STARTS);
                boolean present = loaded != null && candidate.group.structures.stream().anyMatch(target -> {
                    var start = loaded.getStartForStructure(target.value());
                    return start != null && start.isValid();
                });
                batch.add(new Probe(candidate, loaded != null, present));
            }
            if (scanningRings ? !concentric.hasNext() : !offsets.hasNext()) break;
        }
        return batch;
    }

    private Candidate probe(Iterator<Probe> batch) {
        long deadline = System.nanoTime() + 20000000;
        while (!closed && batch.hasNext() && System.nanoTime() < deadline) {
            var probe = batch.next();
            if (probe.loaded) {
                if (probe.present) return probe.candidate;
                continue;
            }
            var candidate = probe.candidate;
            for (var target : candidate.group.structures) {
                if (closed) return null;
                if (presenceCheck.checkStart(candidate.chunk, target.value(), candidate.group.placement, false)
                        != StructureCheckResult.START_NOT_PRESENT) return candidate;
            }
        }
        return null;
    }

    private Candidate next() {
        if (scanningRings) {
            if (concentric.hasNext()) {
                var candidate = concentric.next();
                double candidateDistance = distance(candidate.group.placement.getLocatePos(candidate.chunk));
                if (candidateDistance <= (double) radius * radius
                        && (result == null || candidateDistance < distance(resultLocation))) return candidate;
            }
            scanningRings = false;
        }
        if (spread.isEmpty()) return null;
        while (ring <= rings) {
            if (group >= spread.size()) {
                if (foundInRing) return null;
                ring++;
                group = 0;
                if (ring > rings) return null;
            }
            var value = spread.get(group);
            var placement = (RandomSpreadStructurePlacement) value.placement;
            if (offsets == null) offsets = SpawnResolver.ring(BlockPos.ZERO, ring);
            if (offsets.hasNext()) {
                var offset = offsets.next();
                var pos = placement.getPotentialStructureChunk(level.getChunkSource().getGeneratorState().getLevelSeed(),
                        (origin.getX() >> 4) + placement.spacing() * offset.getX(),
                        (origin.getZ() >> 4) + placement.spacing() * offset.getZ());
                return new Candidate(value, pos);
            }
            offsets = null;
            group++;
        }
        return null;
    }

    private double distance(BlockPos position) {
        double x = (double) position.getX() - origin.getX();
        double z = (double) position.getZ() - origin.getZ();
        return x * x + z * z;
    }
}

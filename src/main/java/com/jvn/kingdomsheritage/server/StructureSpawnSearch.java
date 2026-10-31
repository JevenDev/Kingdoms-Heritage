package com.jvn.kingdomsheritage.server;

import com.jvn.kingdomsheritage.data.HeritageException;
import com.jvn.kingdomsheritage.data.SpawnDefinition;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.levelgen.structure.Structure;
import net.minecraft.world.level.levelgen.structure.StructureStart;
import net.minecraft.world.level.levelgen.structure.placement.ConcentricRingsStructurePlacement;
import net.minecraft.world.level.levelgen.structure.placement.RandomSpreadStructurePlacement;
import net.minecraft.world.level.levelgen.structure.placement.StructurePlacement;

final class StructureSpawnSearch {
    private record Group(StructurePlacement placement, List<Holder<Structure>> structures) {}
    private record Candidate(Group group, ChunkPos chunk) {}
    private final ServerLevel level;
    private final BlockPos origin;
    private final SpawnChunks chunks;
    private final List<Group> spread = new ArrayList<>();
    private final Iterator<Candidate> concentric;
    private final int radius;
    private final int rings;
    private int ring;
    private int group;
    private Iterator<BlockPos> offsets;
    private Candidate pending;
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
        var state = level.getChunkSource().getGeneratorState();
        var placements = new LinkedHashMap<StructurePlacement, List<Holder<Structure>>>();
        for (var holder : StructureSpawnResolver.targets(level, definition)) {
            for (var placement : state.getPlacementsForStructure(holder)) {
                placements.computeIfAbsent(placement, key -> new ArrayList<>()).add(holder);
            }
        }
        var ringCandidates = new ArrayList<Candidate>();
        int spacing = Integer.MAX_VALUE;
        for (var entry : placements.entrySet()) {
            var value = new Group(entry.getKey(), entry.getValue());
            if (entry.getKey() instanceof RandomSpreadStructurePlacement random) {
                spread.add(value);
                spacing = Math.min(spacing, random.spacing());
            } else if (entry.getKey() instanceof ConcentricRingsStructurePlacement concentricPlacement) {
                var positions = state.getRingPositionsFor(concentricPlacement);
                if (positions != null) for (var pos : positions) ringCandidates.add(new Candidate(value, pos));
            }
        }
        ringCandidates.sort(java.util.Comparator.comparingDouble(candidate -> distance(candidate.group.placement.getLocatePos(candidate.chunk))));
        concentric = ringCandidates.iterator();
        rings = spacing == Integer.MAX_VALUE ? 0 : Math.max(1, (int) Math.ceil(radius / (16.0 * spacing)));
    }

    StructureStart result() { return result; }

    boolean step(long deadline) {
        if (complete) return true;
        for (int work = 0; work < 128 && System.nanoTime() < deadline; work++) {
            if (pending == null) pending = next();
            if (pending == null) {
                if (result == null || distance(resultLocation) > (double) radius * radius) {
                    throw new HeritageException("not_found", "No matching location found within the configured search radius");
                }
                complete = true;
                return true;
            }
            var candidate = pending;
            var placement = candidate.group.placement;
            var pos = candidate.chunk;
            if (!placement.isStructureChunk(level.getChunkSource().getGeneratorState(), pos.x, pos.z)) {
                pending = null;
                continue;
            }
            boolean possible = candidate.group.structures.stream().anyMatch(holder -> level.structureManager()
                    .checkStructurePresence(pos, holder.value(), placement, false)
                    != net.minecraft.world.level.levelgen.structure.StructureCheckResult.START_NOT_PRESENT);
            if (!possible) {
                pending = null;
                continue;
            }
            var chunk = chunks.structure(pos);
            if (chunk == null) return false;
            for (var holder : candidate.group.structures) {
                var start = chunk.getStartForStructure(holder.value());
                if (start == null || !start.isValid()) continue;
                BlockPos location = placement.getLocatePos(pos);
                if (result == null || distance(location) < distance(resultLocation)) {
                    result = start;
                    resultLocation = location;
                }
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

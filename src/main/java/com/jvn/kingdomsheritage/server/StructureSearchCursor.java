package com.jvn.kingdomsheritage.server;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.levelgen.structure.Structure;
import net.minecraft.world.level.levelgen.structure.placement.RandomSpreadStructurePlacement;
import net.minecraft.world.level.levelgen.structure.placement.StructurePlacement;

final class StructureSearchCursor {
    record Group(StructurePlacement placement, List<Holder<Structure>> structures) {}
    record Candidate(Group group, ChunkPos chunk) {}
    private record Spread(Group group, int centerX, int centerZ, int rings) {}
    private final long seed;
    private final BlockPos origin;
    private final int maximumRadius;
    private final List<Group> groups;
    private final List<Candidate> concentric;
    private final List<Spread> spread = new ArrayList<>();
    private int radius;
    private int innerRadius = -1;
    private int concentricIndex;
    private int ring;
    private int group;
    private int rings;
    private Iterator<BlockPos> offsets;

    StructureSearchCursor(long seed, BlockPos origin, int initialRadius, int maximumRadius,
                          List<Group> groups, List<Candidate> concentric) {
        this.seed = seed;
        this.origin = origin;
        this.maximumRadius = maximumRadius;
        this.groups = List.copyOf(groups);
        this.concentric = List.copyOf(concentric);
        radius = Math.min(initialRadius, maximumRadius);
        begin();
    }

    Candidate next() {
        while (true) {
            if (concentricIndex < concentric.size()) return concentric.get(concentricIndex++);
            while (ring <= rings && !spread.isEmpty()) {
                if (group >= spread.size()) {
                    ring++;
                    group = 0;
                    continue;
                }
                var value = spread.get(group);
                if (ring > value.rings) {
                    group++;
                    continue;
                }
                if (offsets == null) offsets = SpawnResolver.ring(BlockPos.ZERO, ring);
                if (offsets.hasNext()) {
                    var offset = offsets.next();
                    var placement = (RandomSpreadStructurePlacement) value.group.placement;
                    long x = (long) (value.centerX + offset.getX()) * placement.spacing();
                    long z = (long) (value.centerZ + offset.getZ()) * placement.spacing();
                    if (x < Integer.MIN_VALUE || x > Integer.MAX_VALUE || z < Integer.MIN_VALUE || z > Integer.MAX_VALUE) continue;
                    return new Candidate(value.group, placement.getPotentialStructureChunk(seed, (int) x, (int) z));
                }
                offsets = null;
                group++;
            }
            if (radius == maximumRadius) return null;
            innerRadius = radius;
            radius = (int) Math.min((long) radius * 2, maximumRadius);
            begin();
        }
    }

    // expansion revisits placement cells, but probes each candidate only in its distance band
    boolean includes(Candidate candidate) {
        double distance = distance(candidate);
        return distance <= (double) radius * radius
                && (innerRadius < 0 || distance > (double) innerRadius * innerRadius);
    }

    private double distance(Candidate candidate) {
        var offset = candidate.group.placement.getLocatePos(new ChunkPos(0, 0));
        double x = (long) candidate.chunk.x * 16 + offset.getX() - (double) origin.getX();
        double z = (long) candidate.chunk.z * 16 + offset.getZ() - (double) origin.getZ();
        return x * x + z * z;
    }

    private void begin() {
        concentricIndex = ring = group = rings = 0;
        offsets = null;
        spread.clear();
        for (var value : groups) {
            var placement = (RandomSpreadStructurePlacement) value.placement;
            var locateOffset = placement.getLocatePos(new ChunkPos(0, 0));
            int x = origin.getX() - locateOffset.getX();
            int z = origin.getZ() - locateOffset.getZ();
            int spacing = placement.spacing();
            int centerX = Math.floorDiv(x >> 4, spacing);
            int centerZ = Math.floorDiv(z >> 4, spacing);
            int count = Math.max(Math.max(centerX - Math.floorDiv((x - radius) >> 4, spacing),
                            Math.floorDiv((x + radius) >> 4, spacing) - centerX),
                    Math.max(centerZ - Math.floorDiv((z - radius) >> 4, spacing),
                            Math.floorDiv((z + radius) >> 4, spacing) - centerZ));
            spread.add(new Spread(value, centerX, centerZ, count));
            rings = Math.max(rings, count);
        }
    }
}

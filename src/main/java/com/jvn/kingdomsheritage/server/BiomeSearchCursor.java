package com.jvn.kingdomsheritage.server;

import com.google.common.collect.AbstractIterator;
import com.google.common.collect.Iterators;
import java.util.Iterator;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;

final class BiomeSearchCursor extends AbstractIterator<BlockPos> {
    static final int SPACING = 32;
    private static final int COARSE_STEP = 8;
    private static final int FINE_COLUMNS = 3;
    private final Iterator<BlockPos.MutableBlockPos> coarse;
    private final Iterator<BlockPos.MutableBlockPos> fine;
    private int remainingFine;

    BiomeSearchCursor(int radius) {
        coarse = grid(radius, SPACING * COARSE_STEP);
        fine = grid(radius, SPACING);
    }

    private static Iterator<BlockPos.MutableBlockPos> grid(int radius, int spacing) {
        var positions = BlockPos.spiralAround(BlockPos.ZERO, radius / spacing, Direction.EAST, Direction.SOUTH);
        return Iterators.filter(positions.iterator(), pos ->
                withinRadius((long) pos.getX() * spacing, (long) pos.getZ() * spacing, radius));
    }

    static boolean withinRadius(long dx, long dz, int radius) {
        return dx * dx + dz * dz <= (long) radius * radius;
    }

    @Override
    protected BlockPos computeNext() {
        // interleave distant probes with the full grid so small biome patches still get checked
        if (remainingFine == 0 && coarse.hasNext()) {
            remainingFine = FINE_COLUMNS;
            return coarse.next().multiply(COARSE_STEP);
        }
        while (fine.hasNext()) {
            var position = fine.next();
            if (position.getX() % COARSE_STEP == 0 && position.getZ() % COARSE_STEP == 0) continue;
            if (remainingFine > 0) remainingFine--;
            return position.immutable();
        }
        if (coarse.hasNext()) return coarse.next().multiply(COARSE_STEP);
        return endOfData();
    }
}

package com.jvn.kingdomsheritage.server;

import com.google.common.collect.AbstractIterator;
import java.util.Iterator;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;

final class BiomeSearchCursor extends AbstractIterator<BlockPos> {
    private static final int COARSE_STEP = 8;
    private static final int FINE_COLUMNS = 3;
    private final Iterator<BlockPos.MutableBlockPos> coarse;
    private final Iterator<BlockPos.MutableBlockPos> fine;
    private int remainingFine;

    BiomeSearchCursor(int radius) {
        int size = radius / 32;
        coarse = BlockPos.spiralAround(BlockPos.ZERO, size / COARSE_STEP, Direction.EAST, Direction.SOUTH).iterator();
        fine = BlockPos.spiralAround(BlockPos.ZERO, size, Direction.EAST, Direction.SOUTH).iterator();
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

package com.jvn.kingdomsheritage.server;

import com.jvn.kingdomsheritage.data.HeritageException;
import com.jvn.kingdomsheritage.data.SpawnDefinition;
import java.util.Iterator;
import java.util.Set;
import java.util.stream.Collectors;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.Holder;
import net.minecraft.core.QuartPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.tags.TagKey;
import net.minecraft.util.Mth;
import net.minecraft.world.level.biome.Biome;

final class BiomeSpawnSearch {
    private final ServerLevel level;
    private final BlockPos origin;
    private final Set<Holder<Biome>> targets;
    private final Iterator<BlockPos.MutableBlockPos> columns;
    private final int[] heights;
    private BlockPos column;
    private int height;
    private BlockPos result;

    BiomeSpawnSearch(ServerLevel level, SpawnDefinition definition, BlockPos origin) {
        SpawnResolver.validateBiome(level, definition);
        this.level = level;
        this.origin = origin;
        targets = level.getChunkSource().getGenerator().getBiomeSource().possibleBiomes().stream()
                .filter(holder -> definition.targetTag() ? holder.is(TagKey.create(Registries.BIOME, definition.target()))
                        : holder.is(ResourceKey.create(Registries.BIOME, definition.target())))
                .collect(Collectors.toUnmodifiableSet());
        columns = BlockPos.spiralAround(BlockPos.ZERO, SpawnResolver.searchRadius(definition) / 32,
                Direction.EAST, Direction.SOUTH).iterator();
        heights = Mth.outFromOrigin(origin.getY(), level.getMinBuildHeight() + 1, level.getMaxBuildHeight(), 64).toArray();
    }

    BlockPos result() { return result; }

    boolean step(long deadline) {
        if (result != null) return true;
        var source = level.getChunkSource().getGenerator().getBiomeSource();
        var sampler = level.getChunkSource().randomState().sampler();
        for (int work = 0; work < 256 && System.nanoTime() < deadline; work++) {
            if (targets.isEmpty() || heights.length == 0) throw notFound();
            if (column == null) {
                if (!columns.hasNext()) throw notFound();
                var offset = columns.next();
                column = new BlockPos(origin.getX() + offset.getX() * 32, 0, origin.getZ() + offset.getZ() * 32);
                height = 0;
            }
            int y = heights[height++];
            var biome = source.getNoiseBiome(QuartPos.fromBlock(column.getX()), QuartPos.fromBlock(y),
                    QuartPos.fromBlock(column.getZ()), sampler);
            if (targets.contains(biome)) {
                result = new BlockPos(column.getX(), y, column.getZ());
                return true;
            }
            if (height == heights.length) column = null;
        }
        return false;
    }

    private static HeritageException notFound() {
        return new HeritageException("not_found", "No matching location found within the configured search radius");
    }
}

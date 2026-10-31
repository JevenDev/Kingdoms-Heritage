package com.jvn.kingdomsheritage.server;

import com.jvn.kingdomsheritage.data.HeritageException;
import com.jvn.kingdomsheritage.data.SpawnDefinition;
import java.util.Iterator;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
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
import net.minecraft.world.level.biome.BiomeSource;
import net.minecraft.world.level.biome.Climate;

final class BiomeSpawnSearch implements AutoCloseable {
    private final BiomeSource source;
    private final Climate.Sampler sampler;
    private final BlockPos origin;
    private final Set<Holder<Biome>> targets;
    private final Iterator<BlockPos.MutableBlockPos> columns;
    private final int[] heights;
    private final double minX, maxX, minZ, maxZ;
    private CompletableFuture<BlockPos> pending;
    private volatile boolean closed;
    private BlockPos column;
    private int height;
    private BlockPos result;

    BiomeSpawnSearch(ServerLevel level, SpawnDefinition definition, BlockPos origin) {
        SpawnResolver.validateBiome(level, definition);
        source = level.getChunkSource().getGenerator().getBiomeSource();
        sampler = level.getChunkSource().randomState().sampler();
        this.origin = origin;
        targets = source.possibleBiomes().stream()
                .filter(holder -> definition.targetTag() ? holder.is(TagKey.create(Registries.BIOME, definition.target()))
                        : holder.is(ResourceKey.create(Registries.BIOME, definition.target())))
                .collect(Collectors.toUnmodifiableSet());
        columns = BlockPos.spiralAround(BlockPos.ZERO, SpawnResolver.searchRadius(definition) / 32,
                Direction.EAST, Direction.SOUTH).iterator();
        int minY = level.getMinBuildHeight() + 1;
        int maxY = level.dimensionType().hasCeiling()
                ? Math.min(level.getMaxBuildHeight() - 1, level.getMinBuildHeight() + level.dimensionType().logicalHeight() - 1)
                : level.getMaxBuildHeight() - 1;
        heights = Mth.outFromOrigin(Mth.clamp(origin.getY(), minY, maxY), minY, maxY, 64).toArray();
        minX = level.getWorldBorder().getMinX();
        maxX = level.getWorldBorder().getMaxX();
        minZ = level.getWorldBorder().getMinZ();
        maxZ = level.getWorldBorder().getMaxZ();
    }

    BlockPos result() { return result; }

    boolean step() {
        if (result != null) return true;
        if (closed) return false;
        if (targets.isEmpty() || heights.length == 0) throw notFound();
        if (pending != null) {
            if (!pending.isDone()) return false;
            try {
                result = pending.join();
            } catch (CompletionException error) {
                if (error.getCause() instanceof HeritageException failure) throw failure;
                throw error;
            }
            pending = null;
            if (result != null) return true;
        }
        pending = CompletableFuture.supplyAsync(this::sample);
        return false;
    }

    private BlockPos sample() {
        long deadline = System.nanoTime() + 20000000;
        for (int work = 0; work < 4096 && !closed && System.nanoTime() < deadline; work++) {
            if (column == null) {
                if (!columns.hasNext()) throw notFound();
                var offset = columns.next();
                column = new BlockPos(origin.getX() + offset.getX() * 32, 0, origin.getZ() + offset.getZ() * 32);
                height = 0;
                if (column.getX() < minX || column.getX() >= maxX || column.getZ() < minZ || column.getZ() >= maxZ) {
                    column = null;
                    continue;
                }
            }
            BlockPos position = column;
            int y = heights[height++];
            if (height == heights.length) column = null;
            var biome = source.getNoiseBiome(QuartPos.fromBlock(position.getX()), QuartPos.fromBlock(y),
                    QuartPos.fromBlock(position.getZ()), sampler);
            if (targets.contains(biome)) return new BlockPos(position.getX(), y, position.getZ());
        }
        return null;
    }

    void next() {
        result = null;
        column = null;
    }

    @Override
    public void close() {
        closed = true;
        if (pending != null) pending.cancel(false);
    }

    private static HeritageException notFound() {
        return new HeritageException("not_found", "No matching location found within the configured search radius");
    }
}

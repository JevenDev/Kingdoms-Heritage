package com.jvn.kingdomsheritage.server;

import com.jvn.kingdomsheritage.HeritageConfig;
import com.jvn.kingdomsheritage.data.SpawnDefinition;
import java.util.Optional;
import net.minecraft.core.BlockPos;
import net.minecraft.core.HolderSet;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.tags.BlockTags;
import net.minecraft.tags.TagKey;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.levelgen.structure.Structure;
import net.minecraft.world.phys.AABB;

public final class SpawnResolver {
    public record Destination(ServerLevel level, BlockPos position) {}

    private SpawnResolver() {}

    public static Destination resolve(ServerPlayer player, SpawnDefinition definition, BlockPos originalSpawn) {
        ServerLevel level = player.server.getLevel(ResourceKey.create(Registries.DIMENSION, definition.dimension()));
        if (level == null) throw new IllegalArgumentException("Dimension is unavailable: " + definition.dimension());
        BlockPos origin = level.getSharedSpawnPos();
        if (definition.kind() == SpawnDefinition.Kind.DEFAULT) {
            BlockPos preferred = level == player.server.overworld() ? originalSpawn : origin;
            if (safe(level, preferred)) return new Destination(level, preferred);
            return new Destination(level, nearby(level, preferred, 32, null)
                    .orElseThrow(() -> new IllegalArgumentException("No safe ground near world spawn")));
        }
        if (definition.kind() == SpawnDefinition.Kind.RANDOM) {
            int radius = HeritageConfig.RANDOM_RADIUS.get();
            for (int attempt = 0; attempt < 96; attempt++) {
                double angle = level.random.nextDouble() * Math.PI * 2;
                double distance = Math.sqrt(level.random.nextDouble()) * radius;
                int x = origin.getX() + (int) (Math.cos(angle) * distance);
                int z = origin.getZ() + (int) (Math.sin(angle) * distance);
                if (!level.getWorldBorder().isWithinBounds(new BlockPos(x, origin.getY(), z))) continue;
                BlockPos position = surface(level, x, z);
                if (safe(level, position)) return new Destination(level, position);
            }
            throw new IllegalArgumentException("No safe random location found. Please try again or choose another location");
        }
        if (definition.kind() == SpawnDefinition.Kind.FIXED) {
            BlockPos position = new BlockPos(definition.x(), definition.y(), definition.z());
            if (!safe(level, position)) throw new IllegalArgumentException("The configured location is obstructed or unsafe");
            return new Destination(level, position);
        }
        BlockPos target;
        if (definition.kind() == SpawnDefinition.Kind.STRUCTURE) {
            target = structure(level, definition, origin);
        } else {
            var biome = ResourceKey.create(Registries.BIOME, definition.target());
            if (!level.registryAccess().registryOrThrow(Registries.BIOME).containsKey(definition.target())) {
                throw new IllegalArgumentException("Unknown biome: " + definition.target());
            }
            var found = level.findClosestBiome3d(holder -> holder.is(biome), origin,
                    HeritageConfig.SEARCH_RADIUS.get(), 32, 64);
            target = found == null ? null : found.getFirst();
        }
        if (target == null) throw new IllegalArgumentException("No matching location found within the configured search radius");
        return new Destination(level, nearby(level, target, 48,
                definition.kind() == SpawnDefinition.Kind.BIOME ? definition : null)
                .orElseThrow(() -> new IllegalArgumentException("No safe ground found at this location")));
    }

    private static BlockPos structure(ServerLevel level, SpawnDefinition definition, BlockPos origin) {
        if (!level.getServer().getWorldData().worldGenOptions().generateStructures()) {
            throw new IllegalArgumentException("Structure generation is disabled in this world");
        }
        var registry = level.registryAccess().registryOrThrow(Registries.STRUCTURE);
        HolderSet<Structure> structures = registry.getTag(TagKey.create(Registries.STRUCTURE, definition.target()))
                .filter(tag -> tag.size() > 0).orElse(null);
        if (structures == null && !definition.targetTag()) {
            structures = registry.getHolder(ResourceKey.create(Registries.STRUCTURE, definition.target()))
                    .map(HolderSet::direct).orElse(null);
        }
        if (structures == null) throw new IllegalArgumentException("Unknown or empty structure target: " + definition.target());
        var found = level.getChunkSource().getGenerator().findNearestMapStructure(level, structures,
                origin, Math.max(1, HeritageConfig.SEARCH_RADIUS.get() / 16), false);
        return found == null ? null : found.getFirst();
    }

    static Optional<BlockPos> nearby(ServerLevel level, BlockPos center, int radius, SpawnDefinition biome) {
        for (int ring = 0; ring <= radius; ring++) {
            for (int dx = -ring; dx <= ring; dx++) {
                for (int dz = -ring; dz <= ring; dz++) {
                    if (Math.max(Math.abs(dx), Math.abs(dz)) != ring) continue;
                    BlockPos column = center.offset(dx, 0, dz);
                    if (!level.getWorldBorder().isWithinBounds(column)) continue;
                    BlockPos position = surface(level, column.getX(), column.getZ());
                    if (biome != null && !level.getBiome(position).is(ResourceKey.create(Registries.BIOME, biome.target()))) continue;
                    if (safe(level, position)) return Optional.of(position);
                }
            }
        }
        return Optional.empty();
    }

    private static BlockPos surface(ServerLevel level, int x, int z) {
        var chunk = level.getChunk(x >> 4, z >> 4);
        return new BlockPos(x, chunk.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, x & 15, z & 15) + 1, z);
    }

    static boolean safe(ServerLevel level, BlockPos position) {
        AABB body = new AABB(position.getX() + 0.2, position.getY(), position.getZ() + 0.2,
                position.getX() + 0.8, position.getY() + 1.8, position.getZ() + 0.8);
        if (position.getY() <= level.getMinBuildHeight() || position.getY() + 2 >= level.getMaxBuildHeight()
                || !level.getWorldBorder().isWithinBounds(body)) return false;
        level.getChunkAt(position);
        if (!level.noCollision(body) || level.containsAnyLiquid(body)) return false;
        var ground = level.getBlockState(position.below());
        if (!ground.isFaceSturdy(level, position.below(), net.minecraft.core.Direction.UP)
                || ground.is(BlockTags.LEAVES)) return false;
        for (BlockPos nearby : BlockPos.betweenClosed(position.offset(-1, -1, -1), position.offset(1, 1, 1))) {
            var block = level.getBlockState(nearby);
            if (block.is(Blocks.LAVA) || block.is(Blocks.FIRE) || block.is(Blocks.SOUL_FIRE)
                    || block.is(Blocks.MAGMA_BLOCK) || block.is(Blocks.CACTUS) || block.is(Blocks.CAMPFIRE)
                    || block.is(Blocks.SOUL_CAMPFIRE) || block.is(Blocks.POWDER_SNOW)
                    || block.is(Blocks.SWEET_BERRY_BUSH) || block.is(Blocks.WITHER_ROSE)
                    || block.is(Blocks.NETHER_PORTAL) || block.is(Blocks.END_PORTAL) || block.is(Blocks.END_GATEWAY)) return false;
        }
        return true;
    }
}

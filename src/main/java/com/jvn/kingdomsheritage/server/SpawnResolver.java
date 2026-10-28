package com.jvn.kingdomsheritage.server;

import com.jvn.kingdomsheritage.HeritageConfig;
import com.jvn.kingdomsheritage.data.HeritageCatalog;
import com.jvn.kingdomsheritage.data.HeritageException;
import com.jvn.kingdomsheritage.data.SpawnDefinition;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Optional;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.tags.BlockTags;
import net.minecraft.tags.TagKey;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.phys.AABB;

public final class SpawnResolver {
    public record Destination(ServerLevel level, BlockPos position) {}
    private record CacheKey(ServerLevel level, SpawnDefinition definition, BlockPos origin, int radius) {}
    private static final LinkedHashMap<CacheKey, BlockPos> CACHE = new LinkedHashMap<>();
    private static long cachedRevision = -1;

    private SpawnResolver() {}

    public static void clearCache() {
        CACHE.clear();
        cachedRevision = -1;
    }

    public static Destination resolve(ServerPlayer player, SpawnDefinition definition, BlockPos originalSpawn) {
        var search = new Search(player, definition, originalSpawn);
        while (!search.step()) {}
        return search.destination();
    }

    public static final class Search {
        private final ServerLevel level;
        private final SpawnDefinition definition;
        private final BlockPos original;
        private final BlockPos origin;
        private final CacheKey cacheKey;
        private Iterator<BlockPos> columns;
        private boolean located;
        private int attempts;
        private Destination destination;
        private long workNanos;

        public Search(ServerPlayer player, SpawnDefinition definition, BlockPos original) {
            this.definition = definition;
            this.original = original;
            level = player.server.getLevel(ResourceKey.create(Registries.DIMENSION, definition.dimension()));
            if (level == null) throw new HeritageException("dimension", "Dimension is unavailable: %s", definition.dimension().toString());
            origin = level.getSharedSpawnPos();
            cacheKey = new CacheKey(level, definition, origin, searchRadius(definition));
        }

        public Destination destination() { return destination; }
        public long workMillis() { return workNanos / 1000000; }
        public String stage() { return located ? "checking" : "searching"; }

        public boolean step() {
            if (destination != null) return true;
            long start = System.nanoTime();
            try {
                if (!located) {
                    locate();
                    located = true;
                    return destination != null;
                }
                for (int count = 0; count < 8 && (count == 0 || System.nanoTime() - start < 4000000); count++) {
                    BlockPos column;
                    if (definition.kind() == SpawnDefinition.Kind.RANDOM) {
                        if (attempts++ >= 96) throw new HeritageException("random", "No safe random location found. Please try again or choose another location");
                        int radius = definition.randomRadius() == 0 ? HeritageConfig.RANDOM_RADIUS.get() : definition.randomRadius();
                        double angle = level.random.nextDouble() * Math.PI * 2;
                        double distance = Math.sqrt(level.random.nextDouble()) * radius;
                        column = origin.offset((int) (Math.cos(angle) * distance), 0, (int) (Math.sin(angle) * distance));
                    } else {
                        if (!columns.hasNext()) throw new HeritageException("ground", "No safe ground found at this location. Choose another location or ask an administrator to check its terrain");
                        column = columns.next();
                    }
                    if (!level.getWorldBorder().isWithinBounds(column)) continue;
                    var position = ground(level, column.getX(), column.getZ(),
                            definition.kind() == SpawnDefinition.Kind.BIOME ? definition : null);
                    if (position.isPresent()) {
                        complete(position.get());
                        return true;
                    }
                }
                return false;
            } finally {
                workNanos += System.nanoTime() - start;
            }
        }

        private void locate() {
            if (cachedRevision != HeritageCatalog.revision()) {
                clearCache();
                cachedRevision = HeritageCatalog.revision();
            }
            if (definition.kind() == SpawnDefinition.Kind.BIOME || definition.kind() == SpawnDefinition.Kind.STRUCTURE) {
                BlockPos cached = CACHE.get(cacheKey);
                if (cached != null) {
                    if (safe(level, cached) && (definition.kind() != SpawnDefinition.Kind.BIOME || matchesBiome(level, cached, definition))) {
                        destination = new Destination(level, cached);
                        return;
                    }
                    CACHE.remove(cacheKey);
                }
            }
            if (definition.kind() == SpawnDefinition.Kind.DEFAULT) {
                BlockPos preferred = level == level.getServer().overworld() ? original : origin;
                if (safe(level, preferred)) complete(preferred);
                else columns = columns(preferred, 32);
            } else if (definition.kind() == SpawnDefinition.Kind.FIXED) {
                BlockPos position = new BlockPos(definition.x(), definition.y(), definition.z());
                if (!safe(level, position)) throw new HeritageException("fixed", "The configured location is obstructed or unsafe");
                complete(position);
            } else if (definition.kind() == SpawnDefinition.Kind.STRUCTURE) {
                complete(StructureSpawnResolver.resolve(level, definition, origin));
            } else if (definition.kind() == SpawnDefinition.Kind.BIOME) {
                validateBiome(level, definition);
                var found = level.findClosestBiome3d(holder -> definition.targetTag()
                                ? holder.is(TagKey.create(Registries.BIOME, definition.target()))
                                : holder.is(ResourceKey.create(Registries.BIOME, definition.target())),
                        origin, searchRadius(definition), 32, 64);
                if (found == null) throw new HeritageException("not_found", "No matching location found within the configured search radius");
                columns = columns(found.getFirst(), 48);
            }
        }

        private void complete(BlockPos position) {
            destination = new Destination(level, position);
            if (definition.kind() == SpawnDefinition.Kind.BIOME || definition.kind() == SpawnDefinition.Kind.STRUCTURE) {
                if (CACHE.size() >= 128) CACHE.remove(CACHE.keySet().iterator().next());
                CACHE.put(cacheKey, position);
            }
        }
    }

    static int searchRadius(SpawnDefinition definition) {
        return definition.searchRadius() == 0 ? HeritageConfig.SEARCH_RADIUS.get() : definition.searchRadius();
    }

    static void validateBiome(ServerLevel level, SpawnDefinition definition) {
        var registry = level.registryAccess().registryOrThrow(Registries.BIOME);
        boolean exists = definition.targetTag()
                ? registry.getTag(TagKey.create(Registries.BIOME, definition.target())).filter(tag -> tag.size() > 0).isPresent()
                : registry.containsKey(definition.target());
        if (!exists) throw new HeritageException("biome", "Unknown biome: %s", definition.target().toString());
    }

    private static boolean matchesBiome(ServerLevel level, BlockPos position, SpawnDefinition definition) {
        return definition.targetTag() ? level.getBiome(position).is(TagKey.create(Registries.BIOME, definition.target()))
                : level.getBiome(position).is(ResourceKey.create(Registries.BIOME, definition.target()));
    }

    private static Iterator<BlockPos> columns(BlockPos center, int radius) {
        var positions = new ArrayList<BlockPos>();
        for (int ring = 0; ring <= radius; ring++) {
            for (int dx = -ring; dx <= ring; dx++) {
                for (int dz = -ring; dz <= ring; dz++) {
                    if (Math.max(Math.abs(dx), Math.abs(dz)) == ring) positions.add(center.offset(dx, 0, dz));
                }
            }
        }
        return positions.iterator();
    }

    static Optional<BlockPos> nearby(ServerLevel level, BlockPos center, int radius, SpawnDefinition biome) {
        var columns = columns(center, radius);
        while (columns.hasNext()) {
            BlockPos column = columns.next();
            if (!level.getWorldBorder().isWithinBounds(column)) continue;
            var position = ground(level, column.getX(), column.getZ(), biome);
            if (position.isPresent()) return position;
        }
        return Optional.empty();
    }

    private static Optional<BlockPos> ground(ServerLevel level, int x, int z, SpawnDefinition biome) {
        var chunk = level.getChunk(x >> 4, z >> 4);
        if (level.dimensionType().hasCeiling()) {
            int top = Math.min(level.getMaxBuildHeight(), level.getMinBuildHeight() + level.dimensionType().logicalHeight()) - 3;
            for (int y = top; y > level.getMinBuildHeight(); y--) {
                BlockPos position = new BlockPos(x, y, z);
                if (level.getBlockState(position).isAir() && (biome == null || matchesBiome(level, position, biome))
                        && safe(level, position)) return Optional.of(position);
            }
            return Optional.empty();
        }
        BlockPos position = new BlockPos(x, chunk.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, x & 15, z & 15) + 1, z);
        return (biome == null || matchesBiome(level, position, biome)) && safe(level, position) ? Optional.of(position) : Optional.empty();
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

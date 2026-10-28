package com.jvn.kingdomsheritage.server;

import com.google.gson.JsonElement;
import com.jvn.kingdomsheritage.HeritageConfig;
import com.jvn.kingdomsheritage.KingdomsHeritage;
import com.jvn.kingdomsheritage.data.SpawnDefinition;
import com.mojang.serialization.JsonOps;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.Holder;
import net.minecraft.core.HolderSet;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.RegistryOps;
import net.minecraft.resources.ResourceKey;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.tags.TagKey;
import net.minecraft.util.Mth;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.levelgen.structure.PoolElementStructurePiece;
import net.minecraft.world.level.levelgen.structure.Structure;
import net.minecraft.world.level.levelgen.structure.StructurePiece;
import net.minecraft.world.level.levelgen.structure.StructureStart;
import net.minecraft.world.level.levelgen.structure.pools.StructurePoolElement;
import net.minecraft.world.level.levelgen.structure.placement.RandomSpreadStructurePlacement;

final class StructureSpawnResolver {
    private StructureSpawnResolver() {}

    static BlockPos resolve(ServerLevel level, SpawnDefinition definition, BlockPos origin) {
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
        int radius = HeritageConfig.SEARCH_RADIUS.get();
        int spacing = structures.stream()
                .flatMap(holder -> level.getChunkSource().getGeneratorState().getPlacementsForStructure(holder).stream())
                .filter(RandomSpreadStructurePlacement.class::isInstance).map(RandomSpreadStructurePlacement.class::cast)
                .mapToInt(RandomSpreadStructurePlacement::spacing).min().orElse(1);
        int rings = Math.max(1, Mth.ceil((double) radius / (16 * spacing)));
        var found = level.getChunkSource().getGenerator().findNearestMapStructure(level, structures, origin, rings, false);
        if (found != null && found.getFirst().distToCenterSqr(origin.getX() + 0.5, found.getFirst().getY() + 0.5,
                origin.getZ() + 0.5) > (double) radius * radius) found = null;
        if (found == null) throw new IllegalArgumentException("No matching location found within the configured search radius");
        var start = startAt(level, found.getFirst(), found.getSecond());
        return inside(level, start.getPieces(), definition.piece())
                .orElseThrow(() -> new IllegalArgumentException("No safe standing room found inside this structure within the search limit"));
    }

    static StructureStart startAt(ServerLevel level, BlockPos locator, Holder<Structure> structure) {
        for (var placement : level.getChunkSource().getGeneratorState().getPlacementsForStructure(structure)) {
            BlockPos offset = placement.getLocatePos(new ChunkPos(0, 0));
            ChunkPos chunkPos = new ChunkPos(locator.subtract(offset));
            if (!placement.getLocatePos(chunkPos).equals(locator)) continue;
            var start = level.getChunk(chunkPos.x, chunkPos.z).getStartForStructure(structure.value());
            if (start != null && start.isValid()) return start;
        }
        throw new IllegalArgumentException("The located structure has no available pieces");
    }

    static Optional<BlockPos> inside(ServerLevel level, List<StructurePiece> pieces, ResourceLocation preferred) {
        Set<StructurePiece> matching = new HashSet<>();
        if (preferred != null) {
            var search = new Search(level);
            for (var piece : pieces) {
                if (!matches(level, piece, preferred)) continue;
                matching.add(piece);
                var position = search.inside(piece);
                if (position.isPresent()) return position;
            }
        }
        var search = new Search(level);
        for (var piece : pieces) {
            if (matching.contains(piece)) continue;
            var position = search.inside(piece);
            if (position.isPresent()) return position;
        }
        return Optional.empty();
    }

    static boolean matches(ServerLevel level, StructurePiece piece, ResourceLocation template) {
        if (!(piece instanceof PoolElementStructurePiece poolPiece)) return false;
        return StructurePoolElement.CODEC.encodeStart(RegistryOps.create(JsonOps.INSTANCE, level.registryAccess()), poolPiece.getElement())
                .resultOrPartial(error -> KingdomsHeritage.LOGGER.warn("Cannot identify a structure piece template: {}", error))
                .map(json -> containsTemplate(json, template)).orElse(false);
    }

    private static boolean containsTemplate(JsonElement element, ResourceLocation template) {
        if (!element.isJsonObject()) return false;
        var object = element.getAsJsonObject();
        var location = object.get("location");
        if (location != null && location.isJsonPrimitive() && location.getAsJsonPrimitive().isString()
                && template.toString().equals(location.getAsString())) return true;
        var children = object.get("elements");
        if (children != null && children.isJsonArray()) {
            for (var child : children.getAsJsonArray()) if (containsTemplate(child, template)) return true;
        }
        return false;
    }

    private static final class Search {
        private final ServerLevel level;
        private final Set<Long> chunks = new HashSet<>();
        private int remaining = 262144;

        private Search(ServerLevel level) {
            this.level = level;
        }

        private boolean load(int x, int z) {
            long key = ChunkPos.asLong(x >> 4, z >> 4);
            if (!chunks.contains(key) && chunks.size() >= 64) return false;
            chunks.add(key);
            level.getChunk(x >> 4, z >> 4);
            return true;
        }

        private Optional<BlockPos> inside(StructurePiece piece) {
            if (remaining <= 0) return Optional.empty();
            var center = piece.getBoundingBox().getCenter();
            if (level.getWorldBorder().isWithinBounds(center)) load(center.getX(), center.getZ());
            var box = piece.getBoundingBox();
            int minX = Math.max(box.minX(), Mth.ceil(level.getWorldBorder().getMinX()));
            int maxX = Math.min(box.maxX(), Mth.floor(level.getWorldBorder().getMaxX()) - 1);
            int minZ = Math.max(box.minZ(), Mth.ceil(level.getWorldBorder().getMinZ()));
            int maxZ = Math.min(box.maxZ(), Mth.floor(level.getWorldBorder().getMaxZ()) - 1);
            int minY = Math.max(box.minY(), level.getMinBuildHeight() + 1);
            int maxY = Math.min(box.getYSpan() <= 2 ? box.maxY() + 1 : box.maxY() - 1, level.getMaxBuildHeight() - 3);
            int centerX = minX + (maxX - minX) / 2;
            int centerZ = minZ + (maxZ - minZ) / 2;
            for (int xi = 0; xi <= maxX - minX; xi++) {
                int x = centerX + offset(xi);
                for (int zi = 0; zi <= maxZ - minZ; zi++) {
                    if (--remaining < 0) return Optional.empty();
                    int z = centerZ + offset(zi);
                    if (!load(x, z)) continue;
                    for (int y = minY; y <= maxY; y++) {
                        if (--remaining < 0) return Optional.empty();
                        BlockPos position = new BlockPos(x, y, z);
                        if (level.getBlockState(position.below()).isFaceSturdy(level, position.below(), Direction.UP)
                                && SpawnResolver.safe(level, position)) return Optional.of(position);
                    }
                }
            }
            return Optional.empty();
        }

        private static int offset(int index) {
            return index % 2 == 0 ? -index / 2 : (index + 1) / 2;
        }
    }
}

package com.jvn.kingdomsheritage.server;

import com.google.gson.JsonElement;
import com.jvn.kingdomsheritage.KingdomsHeritage;
import com.jvn.kingdomsheritage.data.HeritageException;
import com.jvn.kingdomsheritage.data.SpawnDefinition;
import com.mojang.serialization.JsonOps;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
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
import net.minecraft.world.level.levelgen.structure.pools.StructurePoolElement;

final class StructureSpawnResolver {
    private StructureSpawnResolver() {}

    static HolderSet<Structure> targets(ServerLevel level, SpawnDefinition definition) {
        var registry = level.registryAccess().registryOrThrow(Registries.STRUCTURE);
        if (!definition.targetTag()) {
            var direct = registry.getHolder(ResourceKey.create(Registries.STRUCTURE, definition.target()));
            if (direct.isPresent()) return HolderSet.direct(direct.get());
        }
        // retain unprefixed tag aliases such as minecraft:village
        return registry.getTag(TagKey.create(Registries.STRUCTURE, definition.target()))
                .filter(tag -> tag.size() > 0)
                .orElseThrow(() -> new HeritageException("structure", "Unknown or empty structure target: %s", definition.target().toString()));
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

    static final class Search {
        private final ServerLevel level;
        private final SpawnDefinition definition;
        private final SpawnChunks chunks;
        private final StructureSpawnSearch locator;
        private final Set<StructurePiece> matching = new HashSet<>();
        private final Set<Long> visitedChunks = new HashSet<>();
        private List<StructurePiece> pieces;
        private StructurePiece piece;
        private int pass;
        private int pieceIndex;
        private int remaining = 262144;
        private int minX, maxX, minZ, maxZ, minY, maxY, centerX, centerZ, xi, zi, y;
        private BlockPos result;

        Search(ServerLevel level, SpawnDefinition definition, BlockPos origin, SpawnChunks chunks) {
            this.level = level;
            this.definition = definition;
            this.chunks = chunks;
            locator = new StructureSpawnSearch(level, definition, origin, chunks);
            pass = definition.piece() == null ? 1 : 0;
        }

        BlockPos result() { return result; }

        boolean step(long deadline) {
            if (result != null) return true;
            if (pieces == null) {
                if (!locator.step(deadline)) return false;
                pieces = locator.result().getPieces();
            }
            for (int work = 0; work < 512 && System.nanoTime() < deadline; work++) {
                if (remaining <= 0 || piece == null && pieceIndex >= pieces.size()) {
                    if (pass == 1) throw new HeritageException("structure_room", "No safe standing room found inside this structure within the search limit");
                    pass = 1;
                    pieceIndex = 0;
                    piece = null;
                    remaining = 262144;
                    visitedChunks.clear();
                    continue;
                }
                if (piece == null) {
                    var next = pieces.get(pieceIndex++);
                    if (pass == 0) {
                        if (!matches(level, next, definition.piece())) continue;
                        matching.add(next);
                    } else if (matching.contains(next)) continue;
                    begin(next);
                    if (minX > maxX || minZ > maxZ || minY > maxY) {
                        piece = null;
                        continue;
                    }
                }
                int x = centerX + offset(xi);
                int z = centerZ + offset(zi);
                long key = ChunkPos.asLong(x >> 4, z >> 4);
                if (!visitedChunks.contains(key) && visitedChunks.size() >= 64) {
                    advanceColumn();
                    continue;
                }
                visitedChunks.add(key);
                BlockPos position = new BlockPos(x, y, z);
                if (!chunks.prepare(position)) return false;
                remaining--;
                if (level.getBlockState(position.below()).isFaceSturdy(level, position.below(), Direction.UP)
                        && SpawnResolver.safe(level, position)) {
                    result = position;
                    return true;
                }
                if (++y > maxY) advanceColumn();
            }
            return false;
        }

        private void begin(StructurePiece next) {
            piece = next;
            var box = piece.getBoundingBox();
            minX = Math.max(box.minX(), Mth.ceil(level.getWorldBorder().getMinX()));
            maxX = Math.min(box.maxX(), Mth.floor(level.getWorldBorder().getMaxX()) - 1);
            minZ = Math.max(box.minZ(), Mth.ceil(level.getWorldBorder().getMinZ()));
            maxZ = Math.min(box.maxZ(), Mth.floor(level.getWorldBorder().getMaxZ()) - 1);
            minY = Math.max(box.minY(), level.getMinBuildHeight() + 1);
            maxY = Math.min(box.getYSpan() <= 2 ? box.maxY() + 1 : box.maxY() - 1, level.getMaxBuildHeight() - 3);
            centerX = minX + (maxX - minX) / 2;
            centerZ = minZ + (maxZ - minZ) / 2;
            xi = zi = 0;
            y = minY;
        }

        private void advanceColumn() {
            remaining--;
            y = minY;
            if (++zi > maxZ - minZ) {
                zi = 0;
                if (++xi > maxX - minX) piece = null;
            }
        }

        private static int offset(int index) {
            return index % 2 == 0 ? -index / 2 : (index + 1) / 2;
        }
    }
}

package com.jvn.kingdomsheritage.server;

import com.jvn.kingdomsheritage.data.HeritageException;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ChunkLevel;
import net.minecraft.server.level.ChunkResult;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.TicketType;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.chunk.ChunkAccess;
import net.minecraft.world.level.chunk.status.ChunkStatus;

final class SpawnChunks implements AutoCloseable {
    private static final TicketType<UUID> TICKET = TicketType.create("kingdomsheritage_search", UUID::compareTo);
    private final ServerLevel level;
    private final UUID owner = UUID.randomUUID();
    private final Map<ChunkPos, Request> terrain = new HashMap<>();
    private Request structure;

    SpawnChunks(ServerLevel level) { this.level = level; }

    boolean prepare(BlockPos position) {
        var needed = new HashSet<ChunkPos>();
        for (int x = (position.getX() - 1) >> 4; x <= (position.getX() + 1) >> 4; x++) {
            for (int z = (position.getZ() - 1) >> 4; z <= (position.getZ() + 1) >> 4; z++) needed.add(new ChunkPos(x, z));
        }
        terrain.entrySet().removeIf(entry -> {
            if (needed.contains(entry.getKey())) return false;
            entry.getValue().close();
            return true;
        });
        boolean ready = true;
        for (var pos : needed) {
            if (terrain.computeIfAbsent(pos, key -> new Request(key, ChunkStatus.FULL)).chunk() == null) ready = false;
        }
        return ready;
    }

    ChunkAccess structure(ChunkPos pos) {
        if (structure == null || !structure.position.equals(pos)) {
            if (structure != null) structure.close();
            structure = new Request(pos, ChunkStatus.STRUCTURE_STARTS);
        }
        return structure.chunk();
    }

    @Override
    public void close() {
        terrain.values().forEach(Request::close);
        terrain.clear();
        if (structure != null) structure.close();
        structure = null;
    }

    private final class Request {
        private final ChunkPos position;
        private final int distance;
        private final CompletableFuture<ChunkResult<ChunkAccess>> future;

        private Request(ChunkPos position, ChunkStatus status) {
            this.position = position;
            distance = 33 - ChunkLevel.byStatus(status);
            level.getChunkSource().addRegionTicket(TICKET, position, distance, owner);
            var loaded = level.getChunkSource().getChunkNow(position.x, position.z);
            if (loaded != null) {
                future = CompletableFuture.completedFuture(ChunkResult.of(loaded));
            } else {
                // this API dispatches to the server thread, but blocks if called from that thread
                future = CompletableFuture.supplyAsync(() -> level.getChunkSource()
                        .getChunkFuture(position.x, position.z, status, true)).thenCompose(value -> value);
            }
        }

        private ChunkAccess chunk() {
            var result = future.getNow(null);
            if (result == null) return null;
            return result.orElseThrow(() -> new HeritageException("chunk", "The destination could not be loaded. Please try again"));
        }

        private void close() {
            level.getChunkSource().removeRegionTicket(TICKET, position, distance, owner);
        }
    }
}

package com.jvn.kingdomsheritage.server;

import com.jvn.kingdomsheritage.api.SelectionEvent;
import com.jvn.kingdomsheritage.api.SelectionState;
import com.jvn.kingdomsheritage.data.HeritageCatalog;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.neoforged.neoforge.common.NeoForge;

final class SelectionLifecycle {
    private static final Map<UUID, SelectionState> STATES = new HashMap<>();
    private static final Set<UUID> ENDED = new HashSet<>();

    private SelectionLifecycle() {}

    static SelectionState state(ServerPlayer player) {
        start(player);
        return STATES.get(player.getUUID());
    }

    static SelectionState snapshot(ServerPlayer player) {
        var existing = STATES.get(player.getUUID());
        if (existing != null) return existing;
        var data = SelectionManager.inspect(player);
        return new SelectionState(UUID.randomUUID(), HeritageCatalog.revision(),
                Optional.ofNullable(ResourceLocation.tryParse(data.getString("spawn_choice"))),
                Optional.ofNullable(ResourceLocation.tryParse(data.getString("kit_choice"))),
                Optional.ofNullable(SelectionParty.leader(player)), SelectionParty.memberIds(player));
    }

    static void start(ServerPlayer player) {
        if (STATES.containsKey(player.getUUID())) return;
        var state = new SelectionState(UUID.randomUUID(), HeritageCatalog.revision(), Optional.empty(), Optional.empty(),
                Optional.ofNullable(SelectionParty.leader(player)), SelectionParty.memberIds(player));
        STATES.put(player.getUUID(), state);
        ENDED.remove(player.getUUID());
        NeoForge.EVENT_BUS.post(new SelectionEvent.Started(player, state));
    }

    static void choices(ServerPlayer player, ResourceLocation spawn, ResourceLocation kit) {
        var previous = state(player);
        var next = previous.choices(HeritageCatalog.revision(), spawn, kit);
        if (next.equals(previous)) return;
        STATES.put(player.getUUID(), next);
        SelectionParty.choices(player, spawn, kit);
        NeoForge.EVENT_BUS.post(new SelectionEvent.ChoicesChanged(player, previous, next));
    }

    static void party(ServerPlayer player) {
        var previous = STATES.get(player.getUUID());
        if (previous == null || ENDED.contains(player.getUUID())) return;
        var next = previous.party(SelectionParty.leader(player), SelectionParty.memberIds(player));
        if (next.equals(previous)) return;
        STATES.put(player.getUUID(), next);
        NeoForge.EVENT_BUS.post(new SelectionEvent.PartyChanged(player, previous, next));
    }

    static void complete(ServerPlayer player) {
        var state = STATES.get(player.getUUID());
        if (state != null && ENDED.add(player.getUUID())) NeoForge.EVENT_BUS.post(new SelectionEvent.Completed(player, state));
    }

    static void reset(ServerPlayer player) {
        var state = STATES.remove(player.getUUID());
        ENDED.remove(player.getUUID());
        if (state == null) {
            var data = SelectionManager.inspect(player);
            state = new SelectionState(UUID.randomUUID(), HeritageCatalog.revision(),
                    Optional.ofNullable(ResourceLocation.tryParse(data.getString("spawn_choice"))),
                    Optional.ofNullable(ResourceLocation.tryParse(data.getString("kit_choice"))), Optional.empty(), Set.of());
        }
        NeoForge.EVENT_BUS.post(new SelectionEvent.Reset(player, state));
    }

    static void cancel(ServerPlayer player, SelectionEvent.Reason reason) {
        var state = STATES.remove(player.getUUID());
        boolean ended = ENDED.remove(player.getUUID());
        if (state != null && !ended) NeoForge.EVENT_BUS.post(new SelectionEvent.Cancelled(player, state, reason));
    }

    static void clear() { STATES.clear(); ENDED.clear(); }
}

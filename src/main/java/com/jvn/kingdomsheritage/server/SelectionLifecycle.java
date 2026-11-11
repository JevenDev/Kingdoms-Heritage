package com.jvn.kingdomsheritage.server;

import com.jvn.kingdomsheritage.api.SelectionEvent;
import com.jvn.kingdomsheritage.api.SelectionState;
import com.jvn.kingdomsheritage.data.HeritageCatalog;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.neoforged.neoforge.common.NeoForge;

final class SelectionLifecycle {
    private SelectionLifecycle() {}

    static SelectionState state(ServerPlayer player) {
        start(player);
        return SelectionSession.of(player).state;
    }

    static SelectionState snapshot(ServerPlayer player) {
        var session = SelectionSession.find(player.getUUID());
        var existing = session == null ? null : session.state;
        if (existing != null) return existing;
        var data = SelectionManager.inspect(player);
        return new SelectionState(UUID.randomUUID(), HeritageCatalog.revision(),
                Optional.ofNullable(ResourceLocation.tryParse(data.getString("spawn_choice"))),
                Optional.ofNullable(ResourceLocation.tryParse(data.getString("kit_choice"))),
                Optional.ofNullable(SelectionParty.leader(player)), SelectionParty.memberIds(player));
    }

    static void start(ServerPlayer player) {
        var session = SelectionSession.of(player);
        if (session.state != null) return;
        var state = new SelectionState(UUID.randomUUID(), HeritageCatalog.revision(), Optional.empty(), Optional.empty(),
                Optional.ofNullable(SelectionParty.leader(player)), SelectionParty.memberIds(player));
        session.state = state;
        session.ended = false;
        NeoForge.EVENT_BUS.post(new SelectionEvent.Started(player, state));
    }

    static void choices(ServerPlayer player, ResourceLocation spawn, ResourceLocation kit) {
        var previous = state(player);
        var next = previous.choices(HeritageCatalog.revision(), spawn, kit);
        if (next.equals(previous)) return;
        SelectionSession.of(player).state = next;
        SelectionParty.choices(player, spawn, kit);
        NeoForge.EVENT_BUS.post(new SelectionEvent.ChoicesChanged(player, previous, next));
    }

    static void party(ServerPlayer player) {
        var session = SelectionSession.find(player.getUUID());
        if (session == null || session.state == null || session.ended) return;
        var previous = session.state;
        var next = previous.party(SelectionParty.leader(player), SelectionParty.memberIds(player));
        if (next.equals(previous)) return;
        SelectionSession.of(player).state = next;
        NeoForge.EVENT_BUS.post(new SelectionEvent.PartyChanged(player, previous, next));
    }

    static void complete(ServerPlayer player) {
        var session = SelectionSession.find(player.getUUID());
        if (session != null && session.state != null && !session.ended) {
            session.ended = true;
            NeoForge.EVENT_BUS.post(new SelectionEvent.Completed(player, session.state));
        }
    }

    static void reset(ServerPlayer player) {
        var session = SelectionSession.of(player);
        var state = session.state;
        session.state = null;
        session.ended = false;
        if (state == null) {
            var data = SelectionManager.inspect(player);
            state = new SelectionState(UUID.randomUUID(), HeritageCatalog.revision(),
                    Optional.ofNullable(ResourceLocation.tryParse(data.getString("spawn_choice"))),
                    Optional.ofNullable(ResourceLocation.tryParse(data.getString("kit_choice"))), Optional.empty(), Set.of());
        }
        NeoForge.EVENT_BUS.post(new SelectionEvent.Reset(player, state));
    }

    static void cancel(ServerPlayer player, SelectionEvent.Reason reason) {
        var session = SelectionSession.find(player.getUUID());
        if (session == null) return;
        var state = session.state;
        boolean ended = session.ended;
        session.state = null;
        session.ended = false;
        if (state != null && !ended) NeoForge.EVENT_BUS.post(new SelectionEvent.Cancelled(player, state, reason));
    }
}

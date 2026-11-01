package com.jvn.kingdomsheritage.client;

import com.google.gson.JsonObject;
import com.jvn.kingdomsheritage.api.SelectionCatalog;
import com.jvn.kingdomsheritage.api.SelectionEvent;
import com.jvn.kingdomsheritage.api.SelectionState;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import net.minecraft.client.Minecraft;
import net.minecraft.resources.ResourceLocation;
import net.neoforged.neoforge.common.NeoForge;

final class ClientSelectionEvents {
    private static SelectionState state;
    private static SelectionState last;
    private static SelectionCatalog catalog;
    private static UUID session;
    private static boolean reset;

    private ClientSelectionEvents() {}

    static void catalog(JsonObject data) {
        UUID nextSession = data.has("session") ? UUID.fromString(data.get("session").getAsString())
                : session == null ? UUID.randomUUID() : session;
        if (session != null && !session.equals(nextSession)) finish(false, SelectionEvent.Reason.RESET);
        session = nextSession;
        reset = data.has("reset") && data.get("reset").getAsBoolean();
        catalog = new SelectionCatalog(data);
        ensureStarted();
        if (state != null) {
            ResourceLocation spawn = state.spawnId().filter(id -> catalog.spawns().containsKey(id)).orElse(null);
            ResourceLocation kit = state.kitId().filter(id -> spawn != null
                    && catalog.allowedKits(spawn).stream().anyMatch(value -> value.id().equals(id))).orElse(null);
            choices(spawn, kit);
        }
    }

    static void ensureStarted() {
        var player = Minecraft.getInstance().player;
        if (state != null || player == null || catalog == null) return;
        state = new SelectionState(session, catalog.revision(), Optional.empty(), Optional.empty(), Optional.empty(), Set.of());
        if (reset) {
            NeoForge.EVENT_BUS.post(new SelectionEvent.Reset(player, last == null ? state : last));
            last = null;
        }
        NeoForge.EVENT_BUS.post(new SelectionEvent.Started(player, state));
        party();
    }

    static SelectionCatalog catalog() {
        if (catalog == null) throw new IllegalStateException("No Heritage selection catalog is active");
        return catalog;
    }

    static boolean matches(UUID id) { return state != null && state.sessionId().equals(id); }

    static SelectionState state() {
        ensureStarted();
        if (state == null) throw new IllegalStateException("No Heritage selection session is active");
        return state;
    }

    static void choices(ResourceLocation spawn, ResourceLocation kit) {
        if (state == null) return;
        var previous = state;
        state = previous.choices(catalog.revision(), spawn, kit);
        if (!state.equals(previous)) NeoForge.EVENT_BUS.post(new SelectionEvent.ChoicesChanged(Minecraft.getInstance().player, previous, state));
    }

    static void party() {
        if (state == null) return;
        var party = ClientParty.snapshot();
        var previous = state;
        state = previous.party(party.leader(), party.members());
        if (!state.equals(previous)) NeoForge.EVENT_BUS.post(new SelectionEvent.PartyChanged(Minecraft.getInstance().player, previous, state));
    }

    static void finish(boolean completed, SelectionEvent.Reason reason) {
        var player = Minecraft.getInstance().player;
        var previous = state;
        if (previous != null) last = previous;
        if (reason == SelectionEvent.Reason.DISCONNECTED) last = null;
        state = null;
        catalog = null;
        session = null;
        if (previous != null && player != null) {
            if (completed) NeoForge.EVENT_BUS.post(new SelectionEvent.Completed(player, previous));
            else NeoForge.EVENT_BUS.post(new SelectionEvent.Cancelled(player, previous, reason));
        }
    }
}

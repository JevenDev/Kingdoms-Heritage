package com.jvn.kingdomsheritage.server;

import com.google.gson.JsonObject;
import com.jvn.kingdomsheritage.api.SelectionState;
import com.jvn.kingdomsheritage.network.HeritageNetwork;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.UUID;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;

final class SelectionSession {
    private static final int REVIEW_TIMEOUT_TICKS = 2400;
    enum Phase { SEARCHING, REVIEWING, COMMITTING }
    private static final Map<UUID, SelectionSession> ACTIVE = new HashMap<>();
    private static final LinkedHashSet<SelectionSession> QUEUE = new LinkedHashSet<>();

    static final class Search {
        final SpawnResolver.Search resolver;
        private int users;

        Search(SpawnResolver.Search resolver) { this.resolver = resolver; }

        Search acquire() {
            users++;
            return this;
        }

        boolean idle() { return users == 0; }

        void release() {
            if (--users == 0) resolver.close();
        }
    }

    SelectionState state;
    boolean ended;
    SelectionSteps.Session flow;
    Map<ResourceLocation, JsonObject> decisions;
    long lastRequest = -100;
    long sentRevision = -1;
    private ServerPlayer player;
    private Phase phase;
    private Search search;
    private HeritageNetwork.Review request;
    private UUID token;
    private long reviewDeadline;
    private String progress = "";

    private SelectionSession() {}

    static SelectionSession of(ServerPlayer player) {
        return ACTIVE.computeIfAbsent(player.getUUID(), ignored -> new SelectionSession());
    }

    static SelectionSession find(UUID player) { return ACTIVE.get(player); }

    static SelectionSession poll() { return QUEUE.isEmpty() ? null : QUEUE.removeFirst(); }

    static void remove(UUID player) {
        var session = ACTIVE.remove(player);
        if (session != null) session.cancel();
    }

    static void clear() {
        ACTIVE.values().forEach(SelectionSession::cancel);
        ACTIVE.clear();
        QUEUE.clear();
    }

    ServerPlayer player() { return player; }
    Phase phase() { return phase; }
    HeritageNetwork.Review request() { return request; }
    SpawnResolver.Search resolver() { return search.resolver; }

    void begin(ServerPlayer player, HeritageNetwork.Review request, Search search) {
        this.player = player;
        this.request = request;
        this.search = search.acquire();
        phase = Phase.SEARCHING;
        requeue();
    }

    UUID review(long now) {
        token = UUID.randomUUID();
        reviewDeadline = now + REVIEW_TIMEOUT_TICKS;
        phase = Phase.REVIEWING;
        return token;
    }

    boolean expired(long now) { return phase == Phase.REVIEWING && now >= reviewDeadline; }
    boolean accepts(UUID token) { return phase == Phase.REVIEWING && token.equals(this.token); }
    boolean reviewed() { return phase == Phase.REVIEWING || phase == Phase.COMMITTING; }

    void commit() {
        phase = Phase.COMMITTING;
        requeue();
    }

    void requeue() { QUEUE.add(this); }

    void waitForParty() { phase = Phase.REVIEWING; }

    boolean progressChanged(String value) {
        if (progress.equals(value)) return false;
        progress = value;
        return true;
    }

    void cancel() {
        QUEUE.remove(this);
        var previous = search;
        search = null;
        player = null;
        phase = null;
        request = null;
        token = null;
        progress = "";
        if (previous != null) previous.release();
    }
}

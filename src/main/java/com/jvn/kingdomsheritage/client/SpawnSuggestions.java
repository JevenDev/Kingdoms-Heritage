package com.jvn.kingdomsheritage.client;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

final class SpawnSuggestions {
    record Vote(UUID player, String spawn) {}
    record Marker(UUID player, String spawn, float opacity, float offset, boolean active) {}
    private static final int DURATION = 180;
    private static final class Entry {
        final Vote vote;
        boolean active;
        float from;
        long changed;
        float offsetFrom, offset;
        long moved;
        boolean positioned;
        Entry(Vote vote, long now) { this.vote = vote; active = true; changed = now; }
        float opacity(long now) { return from + ((active ? 1 : 0) - from) * ease(now - changed); }
        float position(long now) { return offsetFrom + (offset - offsetFrom) * ease(now - moved); }
        void active(boolean next, long now) {
            if (active == next) return;
            from = opacity(now);
            changed = now;
            active = next;
        }
        void move(float next, long now) {
            if (!positioned) { positioned = true; offsetFrom = offset = next; }
            if (offset == next) return;
            offsetFrom = position(now);
            offset = next;
            moved = now;
        }
    }
    private final Map<Vote, Entry> entries = new LinkedHashMap<>();

    void sync(List<Vote> votes, long now) {
        for (var entry : entries.values()) entry.active(votes.contains(entry.vote), now);
        boolean changed = entries.values().removeIf(entry -> !entry.active && entry.opacity(now) <= 0);
        for (var vote : votes) if (!entries.containsKey(vote)) {
            entries.put(vote, new Entry(vote, now));
            changed = true;
        }
        if (!changed) return;
        var groups = new LinkedHashMap<String, List<Entry>>();
        for (var entry : entries.values()) groups.computeIfAbsent(entry.vote.spawn(), value -> new ArrayList<>()).add(entry);
        for (var group : groups.values()) {
            for (int index = 0; index < group.size(); index++) group.get(index).move((index - (group.size() - 1) / 2F) * 12, now);
        }
    }

    List<Marker> markers(long now) {
        return entries.values().stream().map(entry -> new Marker(entry.vote.player(), entry.vote.spawn(),
                entry.opacity(now), entry.position(now), entry.active)).toList();
    }

    private static float ease(long elapsed) {
        float progress = Math.max(0, Math.min(1, elapsed / (float) DURATION));
        return progress * progress * (3 - 2 * progress);
    }
}

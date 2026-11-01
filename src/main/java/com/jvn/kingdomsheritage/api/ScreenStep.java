package com.jvn.kingdomsheritage.api;

import java.util.Arrays;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.PriorityQueue;
import java.util.Set;
import net.minecraft.resources.ResourceLocation;

public record ScreenStep(ResourceLocation id, Placement placement, int order, boolean optional,
                         PartyPolicy partyPolicy, Set<ResourceLocation> before, Set<ResourceLocation> after) {
    public enum Placement { BEFORE_SPAWN, AFTER_SPAWN, BEFORE_KIT, AFTER_KIT }

    public enum PartyPolicy {
        PER_PLAYER(false, false), LEADER_DECIDES(true, false),
        EVERYONE_CONFIRMS(false, true), LEADER_WITH_CONFIRMATION(true, true);

        private final boolean leaderDecides;
        private final boolean everyoneConfirms;
        PartyPolicy(boolean leaderDecides, boolean everyoneConfirms) {
            this.leaderDecides = leaderDecides;
            this.everyoneConfirms = everyoneConfirms;
        }
        public boolean leaderDecides() { return leaderDecides; }
        public boolean everyoneConfirms() { return everyoneConfirms; }
    }

    public ScreenStep {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(placement, "placement");
        Objects.requireNonNull(partyPolicy, "partyPolicy");
        before = Set.copyOf(before);
        after = Set.copyOf(after);
        if (before.contains(id) || after.contains(id)) throw new IllegalArgumentException("A screen cannot depend on itself: " + id);
    }

    public ScreenStep(ResourceLocation id, Placement placement, int order) {
        this(id, placement, order, true, PartyPolicy.PER_PLAYER, Set.of(), Set.of());
    }

    public ScreenStep required() { return new ScreenStep(id, placement, order, false, partyPolicy, before, after); }
    public ScreenStep party(PartyPolicy policy) { return new ScreenStep(id, placement, order, optional, policy, before, after); }
    public ScreenStep order(int value) { return new ScreenStep(id, placement, value, optional, partyPolicy, before, after); }
    public ScreenStep before(ResourceLocation... ids) {
        var values = new LinkedHashSet<>(before);
        values.addAll(Arrays.asList(ids));
        return new ScreenStep(id, placement, order, optional, partyPolicy, values, after);
    }
    public ScreenStep after(ResourceLocation... ids) {
        var values = new LinkedHashSet<>(after);
        values.addAll(Arrays.asList(ids));
        return new ScreenStep(id, placement, order, optional, partyPolicy, before, values);
    }

    public static List<ScreenStep> sorted(Collection<ScreenStep> definitions) {
        Map<ResourceLocation, ScreenStep> all = new LinkedHashMap<>();
        for (var step : definitions) {
            if (all.putIfAbsent(step.id(), step) != null) throw new IllegalArgumentException("Duplicate Heritage screen: " + step.id());
        }
        var edges = new HashMap<ResourceLocation, Set<ResourceLocation>>();
        var degrees = new HashMap<ResourceLocation, Integer>();
        all.keySet().forEach(id -> { edges.put(id, new LinkedHashSet<>()); degrees.put(id, 0); });
        for (var step : all.values()) {
            for (var id : step.before()) edge(all, edges, degrees, step.id(), id);
            for (var id : step.after()) edge(all, edges, degrees, id, step.id());
        }
        var result = new java.util.ArrayList<ScreenStep>();
        for (var placement : Placement.values()) {
            var ready = new PriorityQueue<>(Comparator.comparingInt((ScreenStep step) -> step.order()).thenComparing(step -> step.id().toString()));
            all.values().stream().filter(step -> step.placement() == placement && degrees.get(step.id()) == 0).forEach(ready::add);
            while (!ready.isEmpty()) {
                var step = ready.remove();
                result.add(step);
                for (var id : edges.get(step.id())) {
                    if (degrees.compute(id, (key, value) -> value - 1) == 0) ready.add(all.get(id));
                }
            }
        }
        if (result.size() != all.size()) throw new IllegalArgumentException("Cyclic Heritage screen ordering: "
                + all.keySet().stream().filter(id -> degrees.get(id) > 0).sorted().toList());
        return List.copyOf(result);
    }

    private static void edge(Map<ResourceLocation, ScreenStep> all, Map<ResourceLocation, Set<ResourceLocation>> edges,
                             Map<ResourceLocation, Integer> degrees, ResourceLocation from, ResourceLocation to) {
        if (!all.containsKey(from) || !all.containsKey(to)) return;
        if (all.get(from).placement() != all.get(to).placement()) {
            throw new IllegalArgumentException("Heritage screen ordering cannot cross placements: " + from + " -> " + to);
        }
        if (edges.get(from).add(to)) degrees.compute(to, (key, value) -> value + 1);
    }
}

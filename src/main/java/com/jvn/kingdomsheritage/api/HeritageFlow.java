package com.jvn.kingdomsheritage.api;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.jvn.kingdomsheritage.HeritageConfig;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.neoforged.neoforge.event.server.ServerAboutToStartEvent;

public final class HeritageFlow {
    @FunctionalInterface
    public interface Validator {
        JsonObject validate(ServerPlayer player, SelectionState selection, JsonObject submitted);
    }
    private record Registration(ScreenStep step, Validator validator) {}
    private static final Map<ResourceLocation, Registration> REGISTRY = new LinkedHashMap<>();
    private static List<ScreenStep> active = List.of();
    private static Set<ResourceLocation> disabled = Set.of();
    private static boolean running;

    private HeritageFlow() {}

    public static synchronized void register(ScreenStep step) {
        register(step, (player, selection, submitted) -> {
            if (!submitted.isEmpty()) throw new IllegalArgumentException("This screen does not accept decision data: " + step.id());
            return new JsonObject();
        });
    }

    public static synchronized void register(ScreenStep step, Validator validator) {
        Objects.requireNonNull(step, "step");
        Objects.requireNonNull(validator, "validator");
        if (running) throw new IllegalStateException("Register Heritage flow steps before starting a server");
        if (REGISTRY.containsKey(step.id())) throw new IllegalArgumentException("Duplicate Heritage flow step: " + step.id());
        REGISTRY.put(step.id(), new Registration(step, validator));
    }

    public static synchronized Optional<ScreenStep> definition(ResourceLocation id) {
        var registration = REGISTRY.get(id);
        return registration == null ? Optional.empty() : Optional.of(registration.step());
    }

    public static synchronized void starting(ServerAboutToStartEvent event) {
        var orders = new HashMap<ResourceLocation, Integer>();
        for (String entry : HeritageConfig.SCREEN_ORDER.get()) {
            String[] parts = entry.split("=", -1);
            if (parts.length != 2) throw new IllegalArgumentException("Heritage screenFlow.order entries must be screen_id=number: " + entry);
            ResourceLocation id = ResourceLocation.parse(parts[0].trim());
            if (!REGISTRY.containsKey(id)) throw new IllegalArgumentException("Unknown Heritage screen in screenFlow.order: " + id);
            int order = Integer.parseInt(parts[1].trim());
            if (orders.putIfAbsent(id, order) != null) throw new IllegalArgumentException("Duplicate Heritage order override: " + id);
        }
        var excluded = new HashSet<ResourceLocation>();
        for (String entry : HeritageConfig.DISABLED_SCREENS.get()) {
            ResourceLocation id = ResourceLocation.parse(entry);
            var registration = REGISTRY.get(id);
            if (registration == null) throw new IllegalArgumentException("Unknown Heritage screen in screenFlow.disabled: " + id);
            if (!registration.step().optional()) throw new IllegalArgumentException("Required Heritage screen cannot be disabled: " + id);
            if (!excluded.add(id)) throw new IllegalArgumentException("Duplicate disabled Heritage screen: " + id);
        }
        for (var registration : REGISTRY.values()) {
            var step = registration.step();
            for (var id : java.util.stream.Stream.concat(step.before().stream(), step.after().stream()).toList()) {
                var dependency = REGISTRY.get(id);
                if (dependency == null) throw new IllegalArgumentException("Unknown ordering dependency " + id + " for " + step.id());
                if (dependency.step().placement() != step.placement()) throw new IllegalArgumentException("Ordering dependency crosses placements: " + step.id() + " -> " + id);
            }
        }
        active = ScreenStep.sorted(REGISTRY.values().stream().map(Registration::step).filter(step -> !excluded.contains(step.id()))
                .map(step -> step.order(orders.getOrDefault(step.id(), step.order()))).toList());
        disabled = Set.copyOf(excluded);
        if (com.jvn.kingdomsheritage.data.CatalogPayload.size(manifest().toString()) > 64_000) {
            throw new IllegalArgumentException("Heritage selection flow exceeds the 64000 byte manifest limit");
        }
        running = true;
    }

    public static synchronized List<ScreenStep> steps() { return active; }

    public static synchronized JsonObject manifest() {
        var result = new JsonObject();
        var steps = new JsonArray();
        for (var step : active) {
            var json = new JsonObject();
            json.addProperty("id", step.id().toString());
            json.addProperty("placement", step.placement().name());
            json.addProperty("order", step.order());
            json.addProperty("optional", step.optional());
            json.addProperty("party_policy", step.partyPolicy().name());
            var before = new JsonArray();
            step.before().forEach(id -> before.add(id.toString()));
            json.add("before", before);
            var after = new JsonArray();
            step.after().forEach(id -> after.add(id.toString()));
            json.add("after", after);
            steps.add(json);
        }
        result.add("steps", steps);
        var excluded = new JsonArray();
        disabled.stream().sorted().forEach(id -> excluded.add(id.toString()));
        result.add("disabled", excluded);
        return result;
    }

    public static JsonObject validate(ResourceLocation id, ServerPlayer player, SelectionState selection, JsonObject value) {
        var registration = REGISTRY.get(id);
        if (registration == null) throw new IllegalArgumentException("Unknown Heritage flow step: " + id);
        JsonObject accepted = Objects.requireNonNull(registration.validator().validate(player, selection, value.deepCopy()), "accepted decision");
        if (accepted.toString().length() > 16384) throw new IllegalArgumentException("Heritage decision exceeds 16384 characters");
        return accepted.deepCopy();
    }

    public static Optional<JsonObject> decision(ServerPlayer player, ResourceLocation step) {
        return com.jvn.kingdomsheritage.server.SelectionSteps.decision(player, step);
    }

    public static synchronized void stopped() { active = List.of(); disabled = Set.of(); running = false; }
}

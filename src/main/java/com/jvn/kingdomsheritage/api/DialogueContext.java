package com.jvn.kingdomsheritage.api;

import com.google.gson.JsonObject;
import com.jvn.toucanlib.text.ToucanPlaceholders;
import com.mojang.serialization.JsonOps;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.ComponentSerialization;

public final class DialogueContext {
    public static final Set<String> CORE_TAGS = Set.of("player", "kit", "spawn", "biome", "structure", "dimension",
            "place", "companions", "party_size", "party_leader", "equipment");
    private final Map<String, Component> values;
    private final Map<String, String> facts;

    public DialogueContext(Map<String, Component> values, Map<String, String> facts) {
        var copy = new LinkedHashMap<String, Component>();
        values.forEach((key, value) -> copy.put(key, value.copy()));
        this.values = Map.copyOf(copy);
        this.facts = Map.copyOf(facts);
    }

    public Optional<Component> value(String key) { return Optional.ofNullable(values.get(key)).map(Component::copy); }
    public Optional<String> fact(String key) { return Optional.ofNullable(facts.get(key)).or(() -> value(key).map(Component::getString)); }
    public boolean present(String key) { return !facts.getOrDefault(key, values.containsKey(key) ? values.get(key).getString() : "").isEmpty(); }

    public DialogueContext with(String key, Component value, String fact) {
        var nextValues = new LinkedHashMap<>(values);
        var nextFacts = new LinkedHashMap<>(facts);
        nextValues.put(key, value);
        nextFacts.put(key, fact);
        return new DialogueContext(nextValues, nextFacts);
    }

    public Component resolve(Component source) { return resolve(source, Map.of(), ignored -> null); }

    public Component resolve(Component source, Map<String, Component> fallbacks, java.util.function.Function<String, Component> keys) {
        return ToucanPlaceholders.resolve(source, true, placeholder -> {
            String tag = placeholder.key();
            Component replacement = values.get(tag);
            if (replacement == null && tag.startsWith("key:")) replacement = keys.apply(tag.substring(4));
            boolean available = values.containsKey(tag) ? present(tag) : replacement != null && !replacement.getString().isEmpty();
            if (!available) {
                if (placeholder.fallback() != null) replacement = Component.literal(placeholder.fallback());
                else if (fallbacks.containsKey(tag)) replacement = fallbacks.get(tag);
            }
            return replacement;
        });
    }

    public JsonObject json() {
        var json = new JsonObject();
        var text = new JsonObject();
        values.forEach((key, value) -> text.add(key, ComponentSerialization.CODEC.encodeStart(JsonOps.INSTANCE, value).getOrThrow()));
        var data = new JsonObject();
        facts.forEach(data::addProperty);
        json.add("values", text);
        json.add("facts", data);
        return json;
    }

    public static DialogueContext parse(JsonObject json) {
        var values = new LinkedHashMap<String, Component>();
        json.getAsJsonObject("values").entrySet().forEach(entry -> values.put(entry.getKey(),
                ComponentSerialization.CODEC.parse(JsonOps.INSTANCE, entry.getValue()).getOrThrow(IllegalArgumentException::new)));
        var facts = new LinkedHashMap<String, String>();
        json.getAsJsonObject("facts").entrySet().forEach(entry -> facts.put(entry.getKey(), entry.getValue().getAsString()));
        return new DialogueContext(values, facts);
    }
}

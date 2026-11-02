package com.jvn.kingdomsheritage.data;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.jvn.kingdomsheritage.api.DialogueContext;
import com.mojang.serialization.JsonOps;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.ComponentSerialization;
import net.minecraft.resources.ResourceLocation;

public record DialogueDefinition(Map<String, Component> variables, Map<String, Component> fallbacks, List<Variant> variants) {
    public static final DialogueDefinition EMPTY = new DialogueDefinition(Map.of(), Map.of(), List.of());
    public record Variant(DialogueCondition when, Component text, Component subtitle) {}
    public record Text(Component text, Component subtitle) {}

    public DialogueDefinition {
        variables = Map.copyOf(variables);
        fallbacks = Map.copyOf(fallbacks);
        variants = List.copyOf(variants);
    }

    public static DialogueDefinition parse(JsonObject json) {
        var variables = components(json, "variables");
        for (String id : variables.keySet()) {
            if (!id.contains(":")) throw new IllegalArgumentException("Dialogue variable IDs require a namespace: " + id);
            ResourceLocation.parse(id);
        }
        var fallbacks = components(json, "fallbacks");
        for (String tag : fallbacks.keySet()) {
            if (!tag.matches("[a-z_][a-z0-9_:./-]*")) throw new IllegalArgumentException("Invalid fallback tag: " + tag);
        }
        var variants = new ArrayList<Variant>();
        if (json.has("variants")) {
            if (!json.get("variants").isJsonArray() || json.getAsJsonArray("variants").size() > 32) {
                throw new IllegalArgumentException("variants must contain at most 32 entries");
            }
            for (var value : json.getAsJsonArray("variants")) {
                if (!value.isJsonObject()) throw new IllegalArgumentException("Each dialogue variant must be an object");
                var variant = value.getAsJsonObject();
                if (!java.util.Set.of("when", "text", "subtitle").containsAll(variant.keySet())
                        || !variant.has("when") || !variant.get("when").isJsonObject() || !variant.has("text") && !variant.has("subtitle")) {
                    throw new IllegalArgumentException("Each dialogue variant requires when and text or subtitle");
                }
                variants.add(new Variant(DialogueCondition.parse(variant.getAsJsonObject("when")),
                        variant.has("text") ? ComponentSerialization.CODEC.parse(JsonOps.INSTANCE, variant.get("text")).getOrThrow(IllegalArgumentException::new) : null,
                        variant.has("subtitle") ? ComponentSerialization.CODEC.parse(JsonOps.INSTANCE, variant.get("subtitle")).getOrThrow(IllegalArgumentException::new) : null));
            }
        }
        variables.values().forEach(value -> DialoguePacing.parse(value.getString()));
        fallbacks.values().forEach(value -> DialoguePacing.parse(value.getString()));
        for (var variant : variants) {
            if (variant.text() != null) DialoguePacing.parse(variant.text().getString());
            if (variant.subtitle() != null) DialoguePacing.parse(variant.subtitle().getString());
        }
        return new DialogueDefinition(variables, fallbacks, variants);
    }

    private static Map<String, Component> components(JsonObject json, String field) {
        var result = new LinkedHashMap<String, Component>();
        if (json.has(field)) {
            if (!json.get(field).isJsonObject() || json.getAsJsonObject(field).size() > 64) {
                throw new IllegalArgumentException(field + " must contain at most 64 entries");
            }
            json.getAsJsonObject(field).entrySet().forEach(entry -> result.put(entry.getKey(), component(entry.getValue())));
        }
        return result;
    }

    private static Component component(JsonElement value) {
        if (value.isJsonPrimitive() && !value.getAsJsonPrimitive().isString()) {
            if (value.getAsJsonPrimitive().isNumber() && !Double.isFinite(value.getAsDouble())) {
                throw new IllegalArgumentException("Dialogue values must be finite");
            }
            return Component.literal(value.getAsString());
        }
        return ComponentSerialization.CODEC.parse(JsonOps.INSTANCE, value).getOrThrow(IllegalArgumentException::new);
    }

    public void validatePacing(Component text, Component subtitle) {
        var context = context(new DialogueContext(Map.of(), Map.of()));
        DialoguePacing.parse(context.resolve(text, fallbacks, ignored -> null).getString() + "\n" + context.resolve(subtitle, fallbacks, ignored -> null).getString());
        for (var variant : variants) {
            DialoguePacing.parse(context.resolve(variant.text() == null ? text : variant.text(), fallbacks, ignored -> null).getString() + "\n"
                    + context.resolve(variant.subtitle() == null ? subtitle : variant.subtitle(), fallbacks, ignored -> null).getString());
        }
    }

    public DialogueContext context(DialogueContext base) {
        var result = base;
        for (var entry : variables.entrySet()) {
            String tag = "var:" + entry.getKey();
            if (base.value(tag).isPresent()) continue;
            Component value = base.resolve(entry.getValue());
            result = result.with(tag, value, value.getString());
        }
        return result;
    }

    public Text resolve(Component text, Component subtitle, DialogueContext base, Function<String, Component> keys) {
        var context = context(base);
        for (var variant : variants) {
            if (!variant.when().matches(context)) continue;
            if (variant.text() != null) text = variant.text();
            if (variant.subtitle() != null) subtitle = variant.subtitle();
            break;
        }
        return new Text(context.resolve(text, fallbacks, keys), context.resolve(subtitle, fallbacks, keys));
    }

    public void write(JsonObject json) {
        if (!variables.isEmpty()) json.add("variables", json(variables));
        if (!fallbacks.isEmpty()) json.add("fallbacks", json(fallbacks));
        if (!variants.isEmpty()) {
            var array = new com.google.gson.JsonArray();
            for (var variant : variants) {
                var value = new JsonObject();
                value.add("when", variant.when().json());
                if (variant.text() != null) value.add("text", encode(variant.text()));
                if (variant.subtitle() != null) value.add("subtitle", encode(variant.subtitle()));
                array.add(value);
            }
            json.add("variants", array);
        }
    }

    private static JsonObject json(Map<String, Component> values) {
        var json = new JsonObject();
        values.forEach((key, value) -> json.add(key, encode(value)));
        return json;
    }

    private static JsonElement encode(Component value) { return ComponentSerialization.CODEC.encodeStart(JsonOps.INSTANCE, value).getOrThrow(); }
}

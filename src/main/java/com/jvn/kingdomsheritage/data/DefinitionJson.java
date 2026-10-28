package com.jvn.kingdomsheritage.data;

import com.google.gson.JsonObject;
import java.util.LinkedHashSet;
import java.util.List;
import net.minecraft.core.HolderLookup;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.GsonHelper;

public final class DefinitionJson {
    private DefinitionJson() {}

    public static String text(JsonObject json, String key, int max, boolean optional) {
        if (!json.has(key) && json.has(key + "_key")) return text(json, key + "_key", max, false);
        String value = optional ? GsonHelper.getAsString(json, key, "") : GsonHelper.getAsString(json, key);
        if (value.length() > max || (!optional && value.isBlank())) {
            throw new IllegalArgumentException(key + " must contain " + (optional ? "0" : "1") + " to " + max + " characters");
        }
        return value;
    }

    public static Component component(JsonObject json, String field) {
        String fallback = json.has(field) ? json.get(field).getAsString() : "";
        String key = json.has(field + "_key") ? json.get(field + "_key").getAsString() : "";
        return key.isEmpty() ? Component.literal(fallback)
                : Component.translatableWithFallback(key, fallback);
    }

    public static Component message(JsonObject json, String field, HolderLookup.Provider registries) {
        return json.has(field + "_component") ? Component.Serializer.fromJson(
                json.get(field + "_component").getAsString(), registries)
                : Component.literal(json.has(field) ? json.get(field).getAsString() : "");
    }

    public static List<String> ids(JsonObject json, String key, boolean tags) {
        if (!json.has(key)) return List.of();
        var array = GsonHelper.getAsJsonArray(json, key);
        if (array.size() > 128) throw new IllegalArgumentException(key + " may contain at most 128 entries");
        var values = new LinkedHashSet<String>();
        for (var element : array) {
            if (!element.isJsonPrimitive() || !element.getAsJsonPrimitive().isString()) {
                throw new IllegalArgumentException(key + " entries must be resource ID strings");
            }
            String value = element.getAsString();
            ResourceLocation.parse(tags && value.startsWith("#") ? value.substring(1) : value);
            values.add(value);
        }
        return List.copyOf(values);
    }
}

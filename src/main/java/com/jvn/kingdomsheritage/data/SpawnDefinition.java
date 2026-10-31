package com.jvn.kingdomsheritage.data;

import com.google.gson.JsonObject;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.GsonHelper;
import net.minecraft.util.RandomSource;

public record SpawnDefinition(ResourceLocation id, String title, String description, ResourceLocation image,
                              int order, Kind kind, ResourceLocation dimension, ResourceLocation target,
                              int x, int y, int z, boolean targetTag, ResourceLocation piece,
                              List<String> kits, int searchRadius, int randomRadius, String titleKey, String descriptionKey, IntroDefinition intro, List<SpawnDefinition> pool,
                              String subtitle, String subtitleKey) {
    public enum Kind { DEFAULT, RANDOM, BIOME, STRUCTURE, FIXED, POOL }

    public SpawnDefinition {
        pool = List.copyOf(pool);
        if (kind == Kind.POOL && (pool.isEmpty() || pool.size() > 128)) {
            throw new IllegalArgumentException("pool must contain between 1 and 128 destinations");
        }
        if (kind != Kind.POOL && !pool.isEmpty()) throw new IllegalArgumentException("Only pool locations support a pool");
        if (pool.stream().anyMatch(entry -> entry.kind() == Kind.POOL)) {
            throw new IllegalArgumentException("A pool cannot contain another pool");
        }
    }

    public static SpawnDefinition parse(ResourceLocation id, JsonObject json) {
        String title = DefinitionJson.text(json, "title", 120, false);
        String description = DefinitionJson.text(json, "description", 4000, true);
        String subtitle = json.has("subtitle") ? DefinitionJson.text(json, "subtitle", 120, true) : "";
        Kind kind = Kind.valueOf(GsonHelper.getAsString(json, "type").toUpperCase(java.util.Locale.ROOT));
        ResourceLocation dimension = ResourceLocation.parse(GsonHelper.getAsString(json, "dimension", "minecraft:overworld"));
        String targetName = kind == Kind.BIOME || kind == Kind.STRUCTURE ? GsonHelper.getAsString(json, "target") : null;
        boolean targetTag = targetName != null && targetName.startsWith("#");
        ResourceLocation target = targetName == null ? null : ResourceLocation.parse(targetTag ? targetName.substring(1) : targetName);
        ResourceLocation piece = json.has("piece") ? ResourceLocation.parse(GsonHelper.getAsString(json, "piece")) : null;
        if (piece != null && kind != Kind.STRUCTURE) throw new IllegalArgumentException("Only structure locations support a preferred piece");
        ResourceLocation image = ResourceLocation.parse(GsonHelper.getAsString(json, "image",
                "kingdomsheritage:textures/gui/campaign_select_screen/campaign_select_screen_card_fallback.png"));
        int x = GsonHelper.getAsInt(json, "x", 0);
        int y = GsonHelper.getAsInt(json, "y", 64);
        int z = GsonHelper.getAsInt(json, "z", 0);
        if (Math.abs((long) x) > 29999984 || Math.abs((long) z) > 29999984) {
            throw new IllegalArgumentException("Fixed location is outside Minecraft's world limits");
        }
        if (kind == Kind.FIXED && (!json.has("x") || !json.has("y") || !json.has("z"))) {
            throw new IllegalArgumentException("Fixed locations require x, y and z");
        }
        return new SpawnDefinition(id, title, description, image, GsonHelper.getAsInt(json, "order", 0),
                kind, dimension, target, x, y, z, targetTag, piece, DefinitionJson.ids(json, "kits", true),
                radius(json, "search_radius"), radius(json, "random_radius"),
                DefinitionJson.text(json, "title_key", 256, true), DefinitionJson.text(json, "description_key", 256, true),
                json.has("intro") ? IntroDefinition.parse(GsonHelper.getAsJsonObject(json, "intro")) : null, pool(id, json, kind),
                subtitle, DefinitionJson.text(json, "subtitle_key", 256, true));
    }

    private static List<SpawnDefinition> pool(ResourceLocation id, JsonObject json, Kind kind) {
        if (kind != Kind.POOL) {
            if (json.has("pool")) throw new IllegalArgumentException("Only pool locations support a pool");
            return List.of();
        }
        for (String field : List.of("target", "x", "y", "z")) {
            if (json.has(field)) throw new IllegalArgumentException(field + " belongs inside a pool entry");
        }
        if (!json.has("pool") || !json.get("pool").isJsonArray()) {
            throw new IllegalArgumentException("pool must be an array of destinations");
        }
        var entries = json.getAsJsonArray("pool");
        if (entries.isEmpty() || entries.size() > 128) {
            throw new IllegalArgumentException("pool must contain between 1 and 128 destinations");
        }
        var destinations = new ArrayList<SpawnDefinition>();
        var fields = List.of("type", "dimension", "target", "piece", "x", "y", "z", "search_radius", "random_radius", "intro");
        for (int index = 0; index < entries.size(); index++) {
            try {
                if (!entries.get(index).isJsonObject()) throw new IllegalArgumentException("Destinations must be JSON objects");
                var entry = entries.get(index).getAsJsonObject();
                if (!entry.has("type") || !entry.get("type").isJsonPrimitive()
                        || !entry.getAsJsonPrimitive("type").isString()) {
                    throw new IllegalArgumentException("Destinations require a type");
                }
                if (entry.get("type").getAsString().equalsIgnoreCase("pool")) {
                    throw new IllegalArgumentException("A pool cannot contain another pool");
                }
                for (String field : entry.keySet()) {
                    if (!fields.contains(field)) throw new IllegalArgumentException("Unsupported destination field: " + field);
                }
                var destination = json.deepCopy();
                destination.remove("pool");
                entry.entrySet().forEach(field -> destination.add(field.getKey(), field.getValue()));
                if (destination.has("intro") && destination.get("intro").isJsonNull()) destination.remove("intro");
                destinations.add(parse(id, destination));
            } catch (IllegalArgumentException error) {
                throw new IllegalArgumentException("pool[" + index + "]: " + error.getMessage(), error);
            }
        }
        return List.copyOf(destinations);
    }

    public List<SpawnDefinition> destinations() {
        return kind == Kind.POOL ? pool : List.of(this);
    }

    public SpawnDefinition choose(RandomSource random) {
        return kind == Kind.POOL ? pool.get(random.nextInt(pool.size())) : this;
    }

    private static int radius(JsonObject json, String key) {
        if (!json.has(key)) return 0;
        int value = GsonHelper.getAsInt(json, key);
        if (value < 16 || value > 30000) throw new IllegalArgumentException(key + " must be between 16 and 30000 blocks");
        return value;
    }

    public boolean allows(KitDefinition kit) {
        return kits.isEmpty() || kits.contains(kit.id().toString())
                || kit.tags().stream().anyMatch(tag -> kits.contains("#" + tag));
    }
}

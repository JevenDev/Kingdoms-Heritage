package com.jvn.kingdomsheritage.data;

import com.google.gson.JsonObject;
import java.util.List;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.GsonHelper;

public record SpawnDefinition(ResourceLocation id, String title, String description, ResourceLocation image,
                              int order, Kind kind, ResourceLocation dimension, ResourceLocation target,
                              int x, int y, int z, boolean targetTag, ResourceLocation piece,
                              List<String> kits, int searchRadius, int randomRadius, String titleKey, String descriptionKey, IntroDefinition intro) {
    public enum Kind { DEFAULT, RANDOM, BIOME, STRUCTURE, FIXED }

    public SpawnDefinition(ResourceLocation id, String title, String description, ResourceLocation image,
                           int order, Kind kind, ResourceLocation dimension, ResourceLocation target,
                           int x, int y, int z, boolean targetTag, ResourceLocation piece) {
        this(id, title, description, image, order, kind, dimension, target, x, y, z, targetTag, piece,
                List.of(), 0, 0, "", "", null);
    }

    public SpawnDefinition(ResourceLocation id, String title, String description, ResourceLocation image,
                           int order, Kind kind, ResourceLocation dimension, ResourceLocation target,
                           int x, int y, int z, boolean targetTag, ResourceLocation piece,
                           List<String> kits, int searchRadius, int randomRadius, String titleKey, String descriptionKey) {
        this(id, title, description, image, order, kind, dimension, target, x, y, z, targetTag, piece,
                kits, searchRadius, randomRadius, titleKey, descriptionKey, null);
    }

    public static SpawnDefinition parse(ResourceLocation id, JsonObject json) {
        String title = DefinitionJson.text(json, "title", 120, false);
        String description = DefinitionJson.text(json, "description", 4000, true);
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
                json.has("intro") ? IntroDefinition.parse(GsonHelper.getAsJsonObject(json, "intro")) : null);
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

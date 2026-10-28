package com.jvn.kingdomsheritage.data;

import com.google.gson.JsonObject;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.GsonHelper;

public record SpawnDefinition(ResourceLocation id, String title, String description, ResourceLocation image,
                              int order, Kind kind, ResourceLocation dimension, ResourceLocation target,
                              int x, int y, int z) {
    public enum Kind { DEFAULT, RANDOM, BIOME, STRUCTURE, FIXED }

    public static SpawnDefinition parse(ResourceLocation id, JsonObject json) {
        String title = DefinitionJson.text(json, "title", 120, false);
        String description = DefinitionJson.text(json, "description", 4000, true);
        Kind kind = Kind.valueOf(GsonHelper.getAsString(json, "type").toUpperCase(java.util.Locale.ROOT));
        ResourceLocation dimension = ResourceLocation.parse(GsonHelper.getAsString(json, "dimension", "minecraft:overworld"));
        ResourceLocation target = kind == Kind.BIOME || kind == Kind.STRUCTURE
                ? ResourceLocation.parse(GsonHelper.getAsString(json, "target")) : null;
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
                kind, dimension, target, x, y, z);
    }
}

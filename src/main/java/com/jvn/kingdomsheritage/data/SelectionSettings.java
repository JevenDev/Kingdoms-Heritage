package com.jvn.kingdomsheritage.data;

import com.google.gson.JsonObject;
import net.minecraft.resources.ResourceLocation;

public record SelectionSettings(int guiScale, KitPreview kitPreview, boolean cardBorders, ResourceLocation introScene) {
    public enum KitPreview { INVENTORY, MODEL }

    public static final int MAX_GUI_SCALE = 4;
    private static final int LEGACY_MAX_GUI_SCALE = 16;
    public static final SelectionSettings DEFAULT = new SelectionSettings(0, KitPreview.INVENTORY);

    public SelectionSettings(int guiScale, KitPreview kitPreview) {
        this(guiScale, kitPreview, true);
    }

    public SelectionSettings(int guiScale, KitPreview kitPreview, boolean cardBorders) {
        this(guiScale, kitPreview, cardBorders, null);
    }

    public SelectionSettings {
        if (guiScale < 0 || guiScale > MAX_GUI_SCALE) throw new IllegalArgumentException("gui_scale must be a whole number from 0 to 4");
    }

    public static SelectionSettings parse(JsonObject json) {
        return new SelectionSettings(parseGuiScale(json), parseKitPreview(json), DefinitionJson.flag(json, "card_borders", true),
                DefinitionJson.optionalId(json, "intro_scene"));
    }

    public static KitPreview parseKitPreview(JsonObject json) {
        if (!json.has("kit_preview")) return KitPreview.INVENTORY;
        var value = json.get("kit_preview");
        if (value.isJsonPrimitive() && value.getAsJsonPrimitive().isString()) {
            if (value.getAsString().equals("inventory")) return KitPreview.INVENTORY;
            if (value.getAsString().equals("model")) return KitPreview.MODEL;
        }
        throw new IllegalArgumentException("kit_preview must be inventory or model");
    }

    private static int parseGuiScale(JsonObject json) {
        if (!json.has("gui_scale")) return 0;
        var value = json.get("gui_scale");
        if (!value.isJsonPrimitive() || !value.getAsJsonPrimitive().isNumber()) {
            throw new IllegalArgumentException("gui_scale must be a whole number from 0 to 4");
        }
        try {
            int scale = value.getAsBigDecimal().intValueExact();
            return scale <= LEGACY_MAX_GUI_SCALE ? Math.min(scale, MAX_GUI_SCALE) : scale;
        } catch (ArithmeticException error) {
            throw new IllegalArgumentException("gui_scale must be a whole number from 0 to 4", error);
        }
    }
}

package com.jvn.kingdomsheritage.data;

import com.google.gson.JsonObject;

public record SelectionSettings(int guiScale, KitPreview kitPreview) {
    public enum KitPreview { INVENTORY, MODEL }

    public static final SelectionSettings DEFAULT = new SelectionSettings(0, KitPreview.INVENTORY);

    public SelectionSettings {
        if (guiScale < 0 || guiScale > 16) throw new IllegalArgumentException("gui_scale must be a whole number from 0 to 16");
    }

    public static SelectionSettings parse(JsonObject json) {
        return new SelectionSettings(parseGuiScale(json), parseKitPreview(json));
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
            throw new IllegalArgumentException("gui_scale must be a whole number from 0 to 16");
        }
        try {
            return value.getAsBigDecimal().intValueExact();
        } catch (ArithmeticException error) {
            throw new IllegalArgumentException("gui_scale must be a whole number from 0 to 16", error);
        }
    }
}

package com.jvn.kingdomsheritage.data;

import com.google.gson.JsonObject;

public record SelectionSettings(int guiScale) {
    public static final SelectionSettings DEFAULT = new SelectionSettings(0);

    public SelectionSettings {
        if (guiScale < 0 || guiScale > 16) throw new IllegalArgumentException("gui_scale must be a whole number from 0 to 16");
    }

    public static SelectionSettings parse(JsonObject json) {
        if (!json.has("gui_scale")) return DEFAULT;
        var value = json.get("gui_scale");
        if (!value.isJsonPrimitive() || !value.getAsJsonPrimitive().isNumber()) {
            throw new IllegalArgumentException("gui_scale must be a whole number from 0 to 16");
        }
        try {
            return new SelectionSettings(value.getAsBigDecimal().intValueExact());
        } catch (ArithmeticException error) {
            throw new IllegalArgumentException("gui_scale must be a whole number from 0 to 16", error);
        }
    }
}

package com.jvn.kingdomsheritage.data;

import com.google.gson.JsonObject;
import net.minecraft.util.GsonHelper;

public final class DefinitionJson {
    private DefinitionJson() {}

    public static String text(JsonObject json, String key, int max, boolean optional) {
        String value = optional ? GsonHelper.getAsString(json, key, "") : GsonHelper.getAsString(json, key);
        if (value.length() > max || (!optional && value.isBlank())) {
            throw new IllegalArgumentException(key + " must contain " + (optional ? "0" : "1") + " to " + max + " characters");
        }
        return value;
    }
}

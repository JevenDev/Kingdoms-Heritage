package com.jvn.kingdomsheritage.data;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParseException;
import com.google.gson.JsonParser;

public final class FlowDecision {
    public static final int MAX_CHARACTERS = 16384;
    private static final int MAX_DEPTH = 64;

    private FlowDecision() {}

    public static JsonObject parse(String source) {
        if (source.length() > MAX_CHARACTERS) throw oversized();
        try {
            var value = JsonParser.parseString(source);
            if (!value.isJsonObject()) throw new IllegalArgumentException("A Heritage decision must be a JSON object");
            var decision = value.getAsJsonObject();
            validate(decision);
            return decision;
        } catch (JsonParseException error) {
            throw new IllegalArgumentException("Invalid Heritage decision JSON", error);
        }
    }

    public static void validate(JsonObject value) {
        depth(value, 1);
        if (value.toString().length() > MAX_CHARACTERS) throw oversized();
    }

    private static void depth(JsonElement value, int depth) {
        if (!value.isJsonObject() && !value.isJsonArray()) return;
        if (depth > MAX_DEPTH) throw new IllegalArgumentException("Heritage decision exceeds 64 levels of nesting");
        if (value.isJsonObject()) {
            for (var child : value.getAsJsonObject().entrySet()) depth(child.getValue(), depth + 1);
        } else {
            for (var child : value.getAsJsonArray()) depth(child, depth + 1);
        }
    }

    private static IllegalArgumentException oversized() {
        return new IllegalArgumentException("Heritage decision exceeds " + MAX_CHARACTERS + " characters");
    }
}

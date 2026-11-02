package com.jvn.kingdomsheritage.data;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.jvn.kingdomsheritage.api.DialogueContext;
import java.util.Set;

public final class DialogueCondition {
    private static final Set<String> COMPARISONS = Set.of("tag", "equals", "present", "min", "max");
    private final JsonObject json;

    private DialogueCondition(JsonObject json) { this.json = json.deepCopy(); }

    public static DialogueCondition parse(JsonObject json) {
        validate(json, 0, new int[]{0});
        return new DialogueCondition(json);
    }

    private static void validate(JsonObject json, int depth, int[] count) {
        if (depth > 16 || ++count[0] > 128) throw new IllegalArgumentException("Dialogue conditions are too complex");
        for (String group : java.util.List.of("all", "any", "not")) {
            if (!json.has(group)) continue;
            if (json.size() != 1) throw new IllegalArgumentException(group + " cannot be combined with other condition fields");
            if (group.equals("not")) {
                if (!json.get(group).isJsonObject()) throw new IllegalArgumentException("not requires a condition object");
                validate(json.getAsJsonObject(group), depth + 1, count);
            } else {
                if (!json.get(group).isJsonArray() || json.getAsJsonArray(group).isEmpty()) {
                    throw new IllegalArgumentException(group + " requires a non-empty list of conditions");
                }
                for (var child : json.getAsJsonArray(group)) {
                    if (!child.isJsonObject()) throw new IllegalArgumentException(group + " entries must be condition objects");
                    validate(child.getAsJsonObject(), depth + 1, count);
                }
            }
            return;
        }
        if (!COMPARISONS.containsAll(json.keySet()) || !json.has("tag") || json.size() < 2
                || !json.get("tag").isJsonPrimitive() || !json.getAsJsonPrimitive("tag").isString()
                || !json.get("tag").getAsString().matches("[a-z_][a-z0-9_:./-]*")) {
            throw new IllegalArgumentException("A dialogue condition requires a tag and equals, present, min or max");
        }
        if (json.has("equals") && !scalar(json.get("equals"))) throw new IllegalArgumentException("equals requires text, a boolean or a finite number");
        if (json.has("present") && (!json.get("present").isJsonPrimitive() || !json.getAsJsonPrimitive("present").isBoolean())) {
            throw new IllegalArgumentException("present must be true or false");
        }
        for (String bound : java.util.List.of("min", "max")) {
            if (json.has(bound) && (!json.get(bound).isJsonPrimitive() || !json.getAsJsonPrimitive(bound).isNumber()
                    || !Double.isFinite(json.get(bound).getAsDouble()))) throw new IllegalArgumentException(bound + " must be a finite number");
        }
        if (json.has("min") && json.has("max") && json.get("min").getAsDouble() > json.get("max").getAsDouble()) {
            throw new IllegalArgumentException("min cannot exceed max");
        }
    }

    private static boolean scalar(JsonElement value) {
        return value.isJsonPrimitive() && (!value.getAsJsonPrimitive().isNumber() || Double.isFinite(value.getAsDouble()));
    }

    public boolean matches(DialogueContext context) { return matches(json, context); }

    private static boolean matches(JsonObject json, DialogueContext context) {
        if (json.has("all")) return json.getAsJsonArray("all").asList().stream().allMatch(value -> matches(value.getAsJsonObject(), context));
        if (json.has("any")) return json.getAsJsonArray("any").asList().stream().anyMatch(value -> matches(value.getAsJsonObject(), context));
        if (json.has("not")) return !matches(json.getAsJsonObject("not"), context);
        String tag = json.get("tag").getAsString();
        boolean present = context.present(tag);
        if (json.has("present") && json.get("present").getAsBoolean() != present) return false;
        if (json.has("equals") && (!present || !context.fact(tag).orElse("").equals(json.get("equals").getAsString()))) return false;
        if (json.has("min") || json.has("max")) {
            if (!present) return false;
            String raw = context.fact(tag).orElse("");
            if (!raw.matches("-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?(?:[eE][+-]?[0-9]+)?")) return false;
            double number = Double.parseDouble(raw);
            if (!Double.isFinite(number) || json.has("min") && number < json.get("min").getAsDouble()
                    || json.has("max") && number > json.get("max").getAsDouble()) return false;
        }
        return true;
    }

    public JsonObject json() { return json.deepCopy(); }
}

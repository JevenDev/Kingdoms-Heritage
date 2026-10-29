package com.jvn.kingdomsheritage.data;

import com.google.gson.JsonObject;
import com.mojang.serialization.JsonOps;
import java.util.Locale;
import net.minecraft.core.HolderLookup;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.ComponentSerialization;
import net.minecraft.util.GsonHelper;

public record IntroDefinition(Component text, Component subtitle, boolean title, Animation animation,
                              Control control, boolean blip, int revealTicks, int holdTicks,
                              int fadeOutTicks, int fadeFromBlackTicks) {
    public enum Animation { FADE_IN, WORD_BY_WORD, LETTER_BY_LETTER, IMMEDIATE }
    public enum Control { AFTER_TITLE, DURING_TITLE }

    public static IntroDefinition parse(JsonObject json) {
        Component text = component(json, "text", false);
        Component subtitle = component(json, "subtitle", true);
        int size = ComponentSerialization.CODEC.encodeStart(JsonOps.INSTANCE, text).getOrThrow().toString().length()
                + ComponentSerialization.CODEC.encodeStart(JsonOps.INSTANCE, subtitle).getOrThrow().toString().length();
        if (size > 16384) throw new IllegalArgumentException("intro text and subtitle must contain at most 16384 serialized characters");
        return new IntroDefinition(text, subtitle, GsonHelper.getAsBoolean(json, "title", false),
                Animation.valueOf(GsonHelper.getAsString(json, "animation", "fade_in").toUpperCase(Locale.ROOT)),
                Control.valueOf(GsonHelper.getAsString(json, "control", "after_title").toUpperCase(Locale.ROOT)),
                GsonHelper.getAsBoolean(json, "blip", false), ticks(json, "reveal_ticks", 40),
                ticks(json, "hold_ticks", 60), ticks(json, "fade_out_ticks", 20),
                ticks(json, "fade_from_black_ticks", 60));
    }

    private static Component component(JsonObject json, String key, boolean optional) {
        if (optional && !json.has(key)) return Component.empty();
        if (!json.has(key)) throw new IllegalArgumentException("intro requires " + key);
        Component value = ComponentSerialization.CODEC.parse(JsonOps.INSTANCE, json.get(key))
                .getOrThrow(error -> new IllegalArgumentException("Invalid intro " + key + ": " + error));
        if (!optional && value.getString().isBlank()) throw new IllegalArgumentException("intro text must not be blank");
        return value;
    }

    private static int ticks(JsonObject json, String key, int fallback) {
        if (!json.has(key)) return fallback;
        var value = json.get(key);
        if (!value.isJsonPrimitive() || !value.getAsJsonPrimitive().isNumber()) {
            throw new IllegalArgumentException(key + " must be a whole number of ticks");
        }
        double number = value.getAsDouble();
        if (!Double.isFinite(number) || number != Math.rint(number) || number < 1 || number > 1200) {
            throw new IllegalArgumentException(key + " must be between 1 and 1200 ticks");
        }
        return (int) number;
    }

    public int durationTicks() {
        return Math.max(fadeFromBlackTicks, (animation == Animation.IMMEDIATE ? 0 : revealTicks) + holdTicks + fadeOutTicks);
    }

    public JsonObject json(HolderLookup.Provider registries) {
        JsonObject json = new JsonObject();
        json.add("text", com.google.gson.JsonParser.parseString(Component.Serializer.toJson(text, registries)));
        json.add("subtitle", com.google.gson.JsonParser.parseString(Component.Serializer.toJson(subtitle, registries)));
        json.addProperty("title", title);
        json.addProperty("animation", animation.name().toLowerCase(Locale.ROOT));
        json.addProperty("control", control.name().toLowerCase(Locale.ROOT));
        json.addProperty("blip", blip);
        json.addProperty("reveal_ticks", revealTicks);
        json.addProperty("hold_ticks", holdTicks);
        json.addProperty("fade_out_ticks", fadeOutTicks);
        json.addProperty("fade_from_black_ticks", fadeFromBlackTicks);
        return json;
    }
}

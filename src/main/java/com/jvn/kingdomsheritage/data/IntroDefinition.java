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
                              int fadeOutTicks, int fadeFromBlackTicks, boolean cinematicBars, BarStyle barStyle,
                              int barTransitionTicks, Position titlePosition, Position subtitlePosition, int blackHoldTicks,
                              boolean outline) {
    public enum Animation { FADE_IN, WORD_BY_WORD, LETTER_BY_LETTER, IMMEDIATE }
    public enum Control { AFTER_TITLE, DURING_TITLE }
    public enum BarStyle { RANDOM, STRAIGHT }
    public enum Position {
        MID_CENTER(1, 1), TOP_CENTER(1, 0), BOTTOM_CENTER(1, 2), LEFT_CENTER(0, 1), RIGHT_CENTER(2, 1),
        TOP_LEFT(0, 0), TOP_RIGHT(2, 0), BOTTOM_LEFT(0, 2), BOTTOM_RIGHT(2, 2);

        private final int column;
        private final int row;

        Position(int column, int row) {
            this.column = column;
            this.row = row;
        }

        public int column() { return column; }
        public int row() { return row; }

        public static Position parse(String value) {
            return switch (value.trim().toUpperCase(Locale.ROOT).replace(' ', '_')) {
                case "CENTER", "MC", "MID_C" -> MID_CENTER;
                case "TC", "TOP_C" -> TOP_CENTER;
                case "BC", "BOTTOM_C" -> BOTTOM_CENTER;
                case "LC", "LEFT_C" -> LEFT_CENTER;
                case "RC", "RIGHT_C" -> RIGHT_CENTER;
                case "TL" -> TOP_LEFT;
                case "TR" -> TOP_RIGHT;
                case "BL" -> BOTTOM_LEFT;
                case "BR" -> BOTTOM_RIGHT;
                default -> valueOf(value.trim().toUpperCase(Locale.ROOT).replace(' ', '_'));
            };
        }
    }

    public IntroDefinition(Component text, Component subtitle, boolean title, Animation animation,
                           Control control, boolean blip, int revealTicks, int holdTicks,
                           int fadeOutTicks, int fadeFromBlackTicks) {
        this(text, subtitle, title, animation, control, blip, revealTicks, holdTicks, fadeOutTicks,
                fadeFromBlackTicks, false, BarStyle.RANDOM, 40, Position.MID_CENTER, Position.MID_CENTER);
    }

    public IntroDefinition(Component text, Component subtitle, boolean title, Animation animation,
                           Control control, boolean blip, int revealTicks, int holdTicks,
                           int fadeOutTicks, int fadeFromBlackTicks, boolean cinematicBars, BarStyle barStyle,
                           int barTransitionTicks, Position titlePosition, Position subtitlePosition) {
        this(text, subtitle, title, animation, control, blip, revealTicks, holdTicks, fadeOutTicks,
                fadeFromBlackTicks, cinematicBars, barStyle, barTransitionTicks, titlePosition, subtitlePosition, 60);
    }

    public IntroDefinition(Component text, Component subtitle, boolean title, Animation animation,
                           Control control, boolean blip, int revealTicks, int holdTicks,
                           int fadeOutTicks, int fadeFromBlackTicks, boolean cinematicBars, BarStyle barStyle,
                           int barTransitionTicks, Position titlePosition, Position subtitlePosition, int blackHoldTicks) {
        this(text, subtitle, title, animation, control, blip, revealTicks, holdTicks, fadeOutTicks,
                fadeFromBlackTicks, cinematicBars, barStyle, barTransitionTicks, titlePosition, subtitlePosition, blackHoldTicks, true);
    }

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
                ticks(json, "fade_from_black_ticks", 60), GsonHelper.getAsBoolean(json, "cinematic_bars", false),
                BarStyle.valueOf(GsonHelper.getAsString(json, "bar_style", "random").toUpperCase(Locale.ROOT)),
                ticks(json, "bar_transition_ticks", 40),
                Position.parse(GsonHelper.getAsString(json, "title_position", "mid_center")),
                Position.parse(GsonHelper.getAsString(json, "subtitle_position", "mid_center")), ticks(json, "black_hold_ticks", 60, 0),
                GsonHelper.getAsBoolean(json, "outline", true));
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
        return ticks(json, key, fallback, 1);
    }

    private static int ticks(JsonObject json, String key, int fallback, int minimum) {
        if (!json.has(key)) return fallback;
        var value = json.get(key);
        if (!value.isJsonPrimitive() || !value.getAsJsonPrimitive().isNumber()) {
            throw new IllegalArgumentException(key + " must be a whole number of ticks");
        }
        double number = value.getAsDouble();
        if (!Double.isFinite(number) || number != Math.rint(number) || number < minimum || number > 1200) {
            throw new IllegalArgumentException(key + " must be between " + minimum + " and 1200 ticks");
        }
        return (int) number;
    }

    public int durationTicks() {
        return blackHoldTicks + presentationTicks();
    }

    public int presentationTicks() {
        return Math.max(fadeFromBlackTicks, (animation == Animation.IMMEDIATE ? 0 : revealTicks) + holdTicks + fadeOutTicks);
    }

    public JsonObject json(HolderLookup.Provider registries) {
        JsonObject json = new JsonObject();
        json.add("text", com.google.gson.JsonParser.parseString(Component.Serializer.toJson(text, registries)));
        json.add("subtitle", com.google.gson.JsonParser.parseString(Component.Serializer.toJson(subtitle, registries)));
        json.addProperty("title", title);
        json.addProperty("outline", outline);
        json.addProperty("animation", animation.name().toLowerCase(Locale.ROOT));
        json.addProperty("control", control.name().toLowerCase(Locale.ROOT));
        json.addProperty("blip", blip);
        json.addProperty("reveal_ticks", revealTicks);
        json.addProperty("hold_ticks", holdTicks);
        json.addProperty("fade_out_ticks", fadeOutTicks);
        json.addProperty("fade_from_black_ticks", fadeFromBlackTicks);
        json.addProperty("black_hold_ticks", blackHoldTicks);
        json.addProperty("cinematic_bars", cinematicBars);
        json.addProperty("bar_style", barStyle.name().toLowerCase(Locale.ROOT));
        json.addProperty("bar_transition_ticks", barTransitionTicks);
        json.addProperty("title_position", titlePosition.name().toLowerCase(Locale.ROOT));
        json.addProperty("subtitle_position", subtitlePosition.name().toLowerCase(Locale.ROOT));
        return json;
    }
}

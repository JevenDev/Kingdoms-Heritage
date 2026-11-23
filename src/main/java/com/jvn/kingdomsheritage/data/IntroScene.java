package com.jvn.kingdomsheritage.data;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.GsonHelper;

public record IntroScene(ResourceLocation animationFile, String clip, int durationTicks,
                         Perspective perspective, Perspective exitPerspective, boolean smoothCameraReturn,
                         Integer firstPersonHideTorsoAtTick, boolean firstPersonHideArmsWithTorso, List<Pause> pauses) {
    private static final int CAMERA_RETURN_TICKS = 12;
    private static final int MAX_WAITS = 16;

    public record Pause(int tick, String key, String prompt) {
        public static final String DEFAULT_KEY = "key.inventory";

        public Pause {
            if (key == null || !key.matches("[A-Za-z0-9_.:/-]{1,128}")) {
                throw new IllegalArgumentException("scene pause key must be a key binding name");
            }
            if (prompt != null && (prompt.isBlank() || prompt.length() > 256 || prompt.chars().anyMatch(Character::isISOControl))) {
                throw new IllegalArgumentException("scene pause prompt must be one line of 1 to 256 characters");
            }
        }

        private static Pause parse(JsonObject json) {
            return new Pause(ticks(json.get("tick"), "pause tick"), string(json, "key", DEFAULT_KEY), string(json, "prompt", null));
        }

        private static String string(JsonObject json, String field, String fallback) {
            var value = json.get(field);
            if (value == null) return fallback;
            if (!value.isJsonPrimitive() || !value.getAsJsonPrimitive().isString()) {
                throw new IllegalArgumentException("scene pause " + field + " must be a string");
            }
            return value.getAsString();
        }

        private JsonObject json() {
            var json = new JsonObject();
            json.addProperty("tick", tick);
            if (!key.equals(DEFAULT_KEY)) json.addProperty("key", key);
            if (prompt != null) json.addProperty("prompt", prompt);
            return json;
        }
    }

    public enum Perspective {
        FIRST_PERSON, THIRD_PERSON_BACK, THIRD_PERSON_FRONT, PREVIOUS;

        private String id() { return name().toLowerCase(Locale.ROOT); }

        private static Perspective parse(JsonObject json, String field) {
            String value = GsonHelper.getAsString(json, field, FIRST_PERSON.id());
            try {
                return valueOf(value.toUpperCase(Locale.ROOT));
            } catch (IllegalArgumentException error) {
                throw new IllegalArgumentException("Unknown scene " + field + " " + value, error);
            }
        }
    }

    public IntroScene(ResourceLocation animationFile, String clip, int durationTicks, List<Integer> waitAtTicks,
                      Perspective perspective, Perspective exitPerspective) {
        this(animationFile, clip, durationTicks, waitAtTicks, perspective, exitPerspective, false);
    }

    public IntroScene(ResourceLocation animationFile, String clip, int durationTicks, List<Integer> waitAtTicks,
                      Perspective perspective, Perspective exitPerspective, boolean smoothCameraReturn) {
        this(animationFile, clip, durationTicks, waitAtTicks, perspective, exitPerspective, smoothCameraReturn, null);
    }

    public IntroScene(ResourceLocation animationFile, String clip, int durationTicks, List<Integer> waitAtTicks,
                      Perspective perspective, Perspective exitPerspective, boolean smoothCameraReturn, Integer firstPersonHideTorsoAtTick) {
        this(animationFile, clip, durationTicks, waitAtTicks, perspective, exitPerspective,
                smoothCameraReturn, firstPersonHideTorsoAtTick, false);
    }

    public IntroScene(ResourceLocation animationFile, String clip, int durationTicks, List<Integer> waitAtTicks,
                      Perspective perspective, Perspective exitPerspective, boolean smoothCameraReturn,
                      Integer firstPersonHideTorsoAtTick, boolean firstPersonHideArmsWithTorso) {
        this(animationFile, clip, durationTicks, perspective, exitPerspective, smoothCameraReturn,
                firstPersonHideTorsoAtTick, firstPersonHideArmsWithTorso,
                waitAtTicks.stream().map(tick -> new Pause(tick, Pause.DEFAULT_KEY, null)).toList());
    }

    public List<Integer> waitAtTicks() { return pauses.stream().map(Pause::tick).toList(); }

    public IntroScene {
        Objects.requireNonNull(animationFile, "animationFile");
        Objects.requireNonNull(perspective, "perspective");
        Objects.requireNonNull(exitPerspective, "exitPerspective");
        if (clip == null || clip.isBlank() || clip.length() > 256) {
            throw new IllegalArgumentException("scene clip must be a nonempty animation name of at most 256 characters");
        }
        if (durationTicks < 1 || durationTicks > 1200) {
            throw new IllegalArgumentException("scene duration_ticks must be between 1 and 1200");
        }
        if (firstPersonHideTorsoAtTick != null && (firstPersonHideTorsoAtTick < 1 || firstPersonHideTorsoAtTick >= durationTicks)) {
            throw new IllegalArgumentException("scene first_person_hide_torso_at_tick must be within the clip");
        }
        pauses = List.copyOf(pauses);
        if (pauses.size() > MAX_WAITS) throw new IllegalArgumentException("scene supports at most " + MAX_WAITS + " pauses");
        int previous = 0;
        for (var pause : pauses) {
            if (pause.tick() <= previous || pause.tick() >= durationTicks) {
                throw new IllegalArgumentException("scene pause ticks must be increasing and within the clip");
            }
            previous = pause.tick();
        }
    }

    static IntroScene parse(JsonObject json) {
        if (json.has("pauses") && json.has("wait_at_ticks")) {
            throw new IllegalArgumentException("scene cannot specify both pauses and wait_at_ticks");
        }
        var pauses = new ArrayList<Pause>();
        if (json.has("pauses")) {
            for (var value : GsonHelper.getAsJsonArray(json, "pauses")) {
                pauses.add(Pause.parse(GsonHelper.convertToJsonObject(value, "pause")));
            }
        } else {
            for (var tick : GsonHelper.getAsJsonArray(json, "wait_at_ticks", new JsonArray())) {
                pauses.add(new Pause(ticks(tick, "wait_at_ticks"), Pause.DEFAULT_KEY, null));
            }
        }
        return new IntroScene(ResourceLocation.parse(GsonHelper.getAsString(json, "animation_file")),
                GsonHelper.getAsString(json, "clip"), ticks(json.get("duration_ticks"), "duration_ticks"),
                Perspective.parse(json, "perspective"), Perspective.parse(json, "exit_perspective"),
                GsonHelper.getAsBoolean(json, "smooth_camera_return", false),
                json.has("first_person_hide_torso_at_tick")
                        ? ticks(json.get("first_person_hide_torso_at_tick"), "first_person_hide_torso_at_tick") : null,
                GsonHelper.getAsBoolean(json, "first_person_hide_arms_with_torso", false), pauses);
    }

    private static int ticks(JsonElement value, String field) {
        if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isNumber()) {
            throw new IllegalArgumentException("scene " + field + " must contain whole ticks");
        }
        double ticks = value.getAsDouble();
        if (!Double.isFinite(ticks) || ticks != Math.rint(ticks) || ticks < 1 || ticks > 1200) {
            throw new IllegalArgumentException("scene " + field + " must contain whole ticks between 1 and 1200");
        }
        return (int) ticks;
    }

    JsonObject json() {
        JsonObject json = new JsonObject();
        json.addProperty("animation_file", animationFile.toString());
        json.addProperty("clip", clip);
        json.addProperty("duration_ticks", durationTicks);
        if (perspective != Perspective.FIRST_PERSON) json.addProperty("perspective", perspective.id());
        if (exitPerspective != Perspective.FIRST_PERSON) json.addProperty("exit_perspective", exitPerspective.id());
        if (smoothCameraReturn) json.addProperty("smooth_camera_return", true);
        if (firstPersonHideTorsoAtTick != null) json.addProperty("first_person_hide_torso_at_tick", firstPersonHideTorsoAtTick);
        if (firstPersonHideArmsWithTorso) json.addProperty("first_person_hide_arms_with_torso", true);
        if (!pauses.isEmpty()) {
            var serialized = new JsonArray();
            boolean legacy = pauses.stream().allMatch(pause -> pause.key().equals(Pause.DEFAULT_KEY) && pause.prompt() == null);
            if (legacy) {
                for (var pause : pauses) serialized.add(pause.tick());
                json.add("wait_at_ticks", serialized);
            } else {
                for (var pause : pauses) serialized.add(pause.json());
                json.add("pauses", serialized);
            }
        }
        return json;
    }

    public int playbackTicks() {
        return durationTicks + (smoothCameraReturn ? CAMERA_RETURN_TICKS : 0);
    }

    public ResourceLocation asset() {
        return animationFile.withPath(path -> "heritage/animations/" + path + ".animation.json");
    }
}

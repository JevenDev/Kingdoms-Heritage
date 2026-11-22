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

public record IntroScene(ResourceLocation animationFile, String clip, int durationTicks, List<Integer> waitAtTicks,
                         Perspective perspective, Perspective exitPerspective, boolean smoothCameraReturn,
                         Integer firstPersonHideTorsoAtTick, boolean firstPersonHideArmsWithTorso) {
    private static final int CAMERA_RETURN_TICKS = 12;
    private static final int MAX_WAITS = 16;

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
        waitAtTicks = List.copyOf(waitAtTicks);
        if (waitAtTicks.size() > MAX_WAITS) throw new IllegalArgumentException("scene supports at most " + MAX_WAITS + " waits");
        int previous = 0;
        for (int tick : waitAtTicks) {
            if (tick <= previous || tick >= durationTicks) {
                throw new IllegalArgumentException("scene wait_at_ticks must be increasing and within the clip");
            }
            previous = tick;
        }
    }

    static IntroScene parse(JsonObject json) {
        var waits = new ArrayList<Integer>();
        for (JsonElement tick : GsonHelper.getAsJsonArray(json, "wait_at_ticks", new JsonArray())) {
            waits.add(ticks(tick, "wait_at_ticks"));
        }
        return new IntroScene(ResourceLocation.parse(GsonHelper.getAsString(json, "animation_file")),
                GsonHelper.getAsString(json, "clip"), ticks(json.get("duration_ticks"), "duration_ticks"), waits,
                Perspective.parse(json, "perspective"), Perspective.parse(json, "exit_perspective"),
                GsonHelper.getAsBoolean(json, "smooth_camera_return", false),
                json.has("first_person_hide_torso_at_tick")
                        ? ticks(json.get("first_person_hide_torso_at_tick"), "first_person_hide_torso_at_tick") : null,
                GsonHelper.getAsBoolean(json, "first_person_hide_arms_with_torso", false));
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
        if (!waitAtTicks.isEmpty()) {
            var waits = new JsonArray();
            waitAtTicks.forEach(waits::add);
            json.add("wait_at_ticks", waits);
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

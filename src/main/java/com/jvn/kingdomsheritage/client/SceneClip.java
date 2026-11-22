package com.jvn.kingdomsheritage.client;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.jvn.kingdomsheritage.data.IntroScene;
import java.io.IOException;
import java.util.Collections;
import java.util.NavigableMap;
import java.util.TreeMap;
import net.minecraft.server.packs.resources.ResourceManager;
import net.minecraft.util.GsonHelper;
import net.minecraft.world.phys.Vec3;

record SceneClip(SceneClip.Track camera, SceneClip.Track head, SceneClip.Track body, SceneClip.Track leftArm,
                 SceneClip.Track rightArm, SceneClip.Track leftLeg, SceneClip.Track rightLeg) {
    private static final int MAX_KEYS = 2048;

    record Pose(Vec3 position, Vec3 rotation) {}

    record Track(Channel position, Channel rotation) {
        boolean animated() { return !position.keys.isEmpty() || rotates(); }

        boolean rotates() { return !rotation.keys.isEmpty(); }

        Pose sample(float ticks) {
            return new Pose(position.sample(ticks), rotation.sample(ticks));
        }
    }

    private record Key(Vec3 before, Vec3 after) {}

    private record Channel(NavigableMap<Float, Key> keys) {
        private Vec3 sample(float ticks) {
            if (keys.isEmpty()) return Vec3.ZERO;
            var from = keys.floorEntry(ticks);
            var to = keys.higherEntry(ticks);
            if (from == null) return to.getValue().before();
            if (to == null) return from.getValue().after();
            return from.getValue().after().lerp(to.getValue().before(), (ticks - from.getKey()) / (to.getKey() - from.getKey()));
        }
    }

    static SceneClip load(ResourceManager resources, IntroScene scene) throws IOException {
        try (var reader = resources.openAsReader(scene.asset())) {
            return parse(GsonHelper.convertToJsonObject(JsonParser.parseReader(reader), scene.asset().toString()), scene);
        }
    }

    static SceneClip parse(JsonObject json, IntroScene scene) {
        var clip = GsonHelper.getAsJsonObject(GsonHelper.getAsJsonObject(json, "animations"), scene.clip());
        double length = number(clip.get("animation_length"), "animation_length") * 20;
        if (Math.abs(length - scene.durationTicks()) > 0.01) {
            throw new IllegalArgumentException("animation_length must match scene duration_ticks");
        }
        var bones = GsonHelper.getAsJsonObject(clip, "bones");
        int duration = scene.durationTicks();
        return new SceneClip(track(bones, "camera", duration), track(bones, "head", duration), track(bones, "body", duration),
                track(bones, "left_arm", duration), track(bones, "right_arm", duration),
                track(bones, "left_leg", duration), track(bones, "right_leg", duration));
    }

    private static Track track(JsonObject bones, String name, int duration) {
        var bone = GsonHelper.getAsJsonObject(bones, name, new JsonObject());
        return new Track(channel(bone.get("position"), duration, 64, name + " position"),
                channel(bone.get("rotation"), duration, 1440, name + " rotation"));
    }

    private static Channel channel(JsonElement channel, int duration, double limit, String name) {
        if (channel == null) return new Channel(Collections.emptyNavigableMap());
        var keys = new TreeMap<Float, Key>();
        if (!channel.isJsonObject() || channel.getAsJsonObject().has("post")) {
            keys.put(0F, key(channel, limit, name));
        } else {
            var entries = channel.getAsJsonObject().entrySet();
            if (entries.isEmpty() || entries.size() > MAX_KEYS) {
                throw new IllegalArgumentException(name + " must contain between 1 and " + MAX_KEYS + " keyframes");
            }
            for (var entry : entries) {
                float time = Float.parseFloat(entry.getKey()) * 20;
                if (!Float.isFinite(time) || time < 0 || time > duration + 0.01F) {
                    throw new IllegalArgumentException(name + " keyframe is outside the clip");
                }
                if (keys.putIfAbsent(Math.min(time, duration), key(entry.getValue(), limit, name)) != null) {
                    throw new IllegalArgumentException(name + " has duplicate keyframe times");
                }
            }
        }
        return new Channel(Collections.unmodifiableNavigableMap(keys));
    }

    private static Key key(JsonElement json, double limit, String name) {
        if (json.isJsonObject()) {
            var object = json.getAsJsonObject();
            if (!GsonHelper.getAsString(object, "lerp_mode", "linear").equals("linear")) {
                throw new IllegalArgumentException(name + " requires linear keyframes");
            }
            Vec3 after = vector(object.get("post"), limit, name);
            return new Key(object.has("pre") ? vector(object.get("pre"), limit, name) : after, after);
        }
        Vec3 value = vector(json, limit, name);
        return new Key(value, value);
    }

    private static Vec3 vector(JsonElement json, double limit, String name) {
        if (json != null && json.isJsonPrimitive() && json.getAsJsonPrimitive().isNumber()) {
            double value = number(json, name);
            if (Math.abs(value) <= limit) return new Vec3(value, value, value);
        }
        if (json != null && json.isJsonArray() && json.getAsJsonArray().size() == 3) {
            var values = json.getAsJsonArray();
            var vector = new Vec3(number(values.get(0), name), number(values.get(1), name), number(values.get(2), name));
            if (Math.abs(vector.x) <= limit && Math.abs(vector.y) <= limit && Math.abs(vector.z) <= limit) return vector;
        }
        throw new IllegalArgumentException(name + " must contain three numeric coordinates within " + limit);
    }

    private static double number(JsonElement json, String name) {
        if (json == null || !json.isJsonPrimitive() || !json.getAsJsonPrimitive().isNumber()
                || !Double.isFinite(json.getAsDouble())) {
            throw new IllegalArgumentException(name + " must be numeric");
        }
        return json.getAsDouble();
    }
}

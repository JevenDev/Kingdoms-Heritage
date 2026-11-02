package com.jvn.kingdomsheritage.api;

import com.jvn.kingdomsheritage.data.HeritageCatalog;
import com.jvn.kingdomsheritage.data.IntroDefinition;
import com.jvn.kingdomsheritage.server.SpawnIntro;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;

public final class HeritageCinematics {
    private HeritageCinematics() {}

    // datapack definitions live at data/<namespace>/heritage/cinematics/<path>.json
    public static Optional<IntroDefinition> definition(ResourceLocation id) {
        return Optional.ofNullable(HeritageCatalog.cinematics().get(Objects.requireNonNull(id, "id")));
    }

    // call playback methods on the server thread, after the player's selection has finished
    public static boolean play(ServerPlayer player, ResourceLocation id) {
        return play(player, id, new DialogueContext(Map.of(), Map.of()));
    }

    public static boolean play(ServerPlayer player, ResourceLocation id, DialogueContext context) {
        var intro = definition(id).orElseThrow(() -> new IllegalArgumentException("Unknown Heritage cinematic: " + id));
        return play(player, intro, context);
    }

    public static boolean play(ServerPlayer player, IntroDefinition intro) {
        return play(player, intro, new DialogueContext(Map.of(), Map.of()));
    }

    // false means the player is unavailable, choosing a background, or already watching a cinematic
    public static boolean play(ServerPlayer player, IntroDefinition intro, DialogueContext context) {
        return SpawnIntro.play(Objects.requireNonNull(player, "player"), Objects.requireNonNull(intro, "intro"),
                Objects.requireNonNull(context, "context"));
    }

    // includes the spawn intro so callers can wait until it has finished
    public static boolean isPlaying(ServerPlayer player) {
        return SpawnIntro.playing(Objects.requireNonNull(player, "player"));
    }

    // stops standalone playback only, leaving the spawn intro under selection's control
    public static boolean stop(ServerPlayer player) {
        return SpawnIntro.stop(Objects.requireNonNull(player, "player"));
    }
}

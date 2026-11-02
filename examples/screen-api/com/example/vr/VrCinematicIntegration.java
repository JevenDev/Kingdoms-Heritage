package com.example.vr;

import com.jvn.kingdomsheritage.api.HeritageCinematics;
import com.jvn.kingdomsheritage.data.IntroDefinition;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;

public final class VrCinematicIntegration {
    private static final ResourceLocation CHAPTER_TWO = ResourceLocation.fromNamespaceAndPath("vr", "chapter_2");

    private VrCinematicIntegration() {}

    public static boolean enterChapterTwo(ServerPlayer player) {
        return HeritageCinematics.play(player, CHAPTER_TWO);
    }

    public static boolean showCustomChapter(ServerPlayer player, IntroDefinition cinematic) {
        return HeritageCinematics.play(player, cinematic);
    }

    public static boolean stopChapterScreen(ServerPlayer player) {
        return HeritageCinematics.stop(player);
    }
}

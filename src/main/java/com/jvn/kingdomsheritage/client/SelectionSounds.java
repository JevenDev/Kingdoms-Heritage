package com.jvn.kingdomsheritage.client;

import net.minecraft.client.Minecraft;
import net.minecraft.client.resources.sounds.SimpleSoundInstance;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.util.RandomSource;

enum SelectionSounds {
    NOTICE("ui_notice"),
    ERROR("ui_error"),
    CONFIRMATION("ui_confirmation"),
    CLICK("ui_click"),
    HOVER("ui_hover"),
    DISSOLVE("ui_dissolve"),
    DIALOGUE("dialogue");

    private static final RandomSource RANDOM = RandomSource.create();

    private final SoundEvent sound;

    SelectionSounds(String name) {
        sound = SoundEvent.createVariableRangeEvent(ResourceLocation.fromNamespaceAndPath("kingdomsheritage", name));
    }

    void play() {
        play(0.25F);
    }

    void play(float volume) {
        Minecraft.getInstance().getSoundManager().play(SimpleSoundInstance.forUI(sound, 0.95F + RANDOM.nextFloat() * 0.1F, volume));
    }
}

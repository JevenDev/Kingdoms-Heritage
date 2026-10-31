package com.jvn.kingdomsheritage.client;

import com.jvn.kingdomsheritage.HeritageConfig;
import net.minecraft.client.Minecraft;
import net.minecraft.client.resources.sounds.AbstractTickableSoundInstance;
import net.minecraft.client.resources.sounds.SoundInstance;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.Mth;
import net.neoforged.bus.api.EventPriority;
import net.neoforged.neoforge.client.event.SelectMusicEvent;
import net.neoforged.neoforge.common.NeoForge;

final class SelectionMusic {
    private static final SoundEvent MUSIC = SoundEvent.createVariableRangeEvent(
            ResourceLocation.fromNamespaceAndPath("kingdomsheritage", "selection_music"));
    private static Track track;

    private SelectionMusic() {}

    static void register() {
        NeoForge.EVENT_BUS.addListener(EventPriority.LOWEST, SelectionMusic::select);
    }

    static void tick(boolean selecting, boolean ducked) {
        Minecraft minecraft = Minecraft.getInstance();
        if (minecraft.player == null || minecraft.level == null || !minecraft.player.isAlive()
                || minecraft.options.getSoundSourceVolume(SoundSource.MUSIC) <= 0
                || minecraft.options.getSoundSourceVolume(SoundSource.MASTER) <= 0) {
            stop();
            return;
        }
        boolean playing = selecting && HeritageConfig.SELECTION_MUSIC.get();
        if (track != null && (track.isStopped() || !minecraft.getSoundManager().isActive(track))) {
            track.finish();
            track = null;
        }
        if (track == null && playing) {
            minecraft.getMusicManager().stopPlaying();
            track = new Track();
            minecraft.getSoundManager().play(track);
        }
        if (track != null) {
            track.playing = playing;
            track.ducked = ducked;
            if (!playing && track.toast != null) track.toast.hide();
            if (playing && track.toast == null && track.getVolume() > 0) {
                track.toast = new SelectionMusicToast();
                minecraft.getToasts().addToast(track.toast);
            }
        }
    }

    static void stop() {
        if (track == null) return;
        track.finish();
        Minecraft.getInstance().getSoundManager().stop(track);
        track = null;
    }

    private static void select(SelectMusicEvent event) {
        if (track != null) event.overrideMusic(null);
    }

    private static final class Track extends AbstractTickableSoundInstance {
        private static final int FADE_IN_TICKS = 30;
        private static final int FADE_OUT_TICKS = 40;
        private SelectionMusicToast toast;
        private boolean playing = true;
        private boolean ducked;
        private float duck = 1;
        private float fade;

        private Track() {
            super(MUSIC, SoundSource.MUSIC, SoundInstance.createUnseededRandom());
            looping = true;
            delay = 0;
            relative = true;
            attenuation = SoundInstance.Attenuation.NONE;
            volume = 0;
        }

        @Override
        public boolean canStartSilent() {
            // the fade starts at zero, but the stream still needs to be created
            return true;
        }

        @Override
        public void tick() {
            fade = Mth.clamp(fade + (playing ? 1F / FADE_IN_TICKS : -1F / FADE_OUT_TICKS), 0, 1);
            duck = Mth.approach(duck, ducked ? 0.5F : 1, 0.05F);
            volume = 0.5F * fade * fade * (3 - 2 * fade) * duck;
            if (!playing && fade == 0) stop();
        }

        private void finish() {
            if (toast != null) toast.hide();
            stop();
        }
    }
}

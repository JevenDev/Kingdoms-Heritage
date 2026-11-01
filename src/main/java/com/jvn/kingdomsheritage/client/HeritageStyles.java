package com.jvn.kingdomsheritage.client;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.network.chat.Component;

public final class HeritageStyles {
    public enum Sound {
        NOTICE, ERROR, CONFIRMATION, CLICK, HOVER, DISSOLVE, DIALOGUE;

        public void play() { SelectionSounds.valueOf(name()).play(); }
        public void play(float volume) { SelectionSounds.valueOf(name()).play(volume); }
    }

    private HeritageStyles() {}

    public static void background(GuiGraphics graphics, int width, int height) {
        SelectionBackground.render(graphics, width, height);
    }

    public static Component markup(Component text) { return IntroMarkup.style(text); }

    public static void text(GuiGraphics graphics, Component text, int x, int y, int color) {
        SelectionText.draw(graphics, Minecraft.getInstance().font, markup(text), x, y, color);
    }

    public static void centeredText(GuiGraphics graphics, Component text, int centerX, int y, int color) {
        SelectionText.centered(graphics, Minecraft.getInstance().font, markup(text), centerX, y, color);
    }

    public static Button button(int x, int y, int width, int height, Component text, Button.OnPress onPress) {
        return new SelectionControls.SoundButton(x, y, width, height, text, onPress);
    }

    public static Button arrow(int x, int y, boolean forward, Component text, Button.OnPress onPress) {
        return SelectionControls.arrow(x, y, forward, text, onPress);
    }

    public static Button disconnect(int screenHeight) { return SelectionControls.disconnect(screenHeight); }

    public static void loading(GuiGraphics graphics, int centerX, int centerY, long elapsedMillis, int opacity) {
        LoadingIndicator.render(graphics, centerX, centerY, elapsedMillis, net.minecraft.util.Mth.clamp(opacity, 0, 255));
    }

    public static void cinematicBars(GuiGraphics graphics, int width, int height, float visibility, float slant) {
        IntroCinematicBars.render(graphics, width, height, net.minecraft.util.Mth.clamp(visibility, 0, 1), slant);
    }

    public static void dissolve(GuiGraphics graphics, float progress, Runnable drawing) {
        SelectionDissolve.render(graphics, progress, drawing);
    }

    public static void toastBackground(GuiGraphics graphics, int width, int height, long elapsedMillis) {
        SelectionToasts.background(graphics, width, height, elapsedMillis);
    }
}

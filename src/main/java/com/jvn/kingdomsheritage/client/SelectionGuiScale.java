package com.jvn.kingdomsheritage.client;

import com.google.gson.JsonObject;
import com.jvn.kingdomsheritage.data.SelectionSettings;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.DeathScreen;
import net.minecraft.client.gui.screens.DisconnectedScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.neoforged.neoforge.client.event.ScreenEvent;
import net.neoforged.neoforge.common.NeoForge;

public final class SelectionGuiScale {
    private static int configured;
    private static int applied;

    private SelectionGuiScale() {}

    static void register() {
        NeoForge.EVENT_BUS.addListener(SelectionGuiScale::screen);
    }

    public static int requested(int playerScale) { return applied == 0 ? playerScale : applied; }

    static void configure(JsonObject message) {
        configured = SelectionSettings.parse(message).guiScale();
        refresh();
    }

    static void refresh() {
        Minecraft minecraft = Minecraft.getInstance();
        boolean active = minecraft.player != null && minecraft.level != null && minecraft.player.isAlive()
                && !interrupted(minecraft.screen)
                && (ClientSelection.selecting() || SpawnIntroOverlay.active() || SelectionTransition.active());
        apply(active ? configured : 0);
    }

    static void clear() {
        configured = 0;
        apply(0);
    }

    private static void apply(int value) {
        if (applied == value) return;
        applied = value;
        Minecraft.getInstance().resizeDisplay();
    }

    private static boolean interrupted(Screen screen) {
        return screen instanceof DeathScreen || screen instanceof DisconnectedScreen || screen instanceof TitleScreen;
    }

    private static void screen(ScreenEvent.Opening event) {
        if (interrupted(event.getNewScreen())) apply(0);
    }
}

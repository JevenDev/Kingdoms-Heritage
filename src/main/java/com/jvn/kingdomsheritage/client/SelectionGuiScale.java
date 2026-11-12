package com.jvn.kingdomsheritage.client;

import com.google.gson.JsonObject;
import com.jvn.kingdomsheritage.data.SelectionSettings;
import com.mojang.blaze3d.platform.Window;
import java.util.function.IntUnaryOperator;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.DeathScreen;
import net.minecraft.client.gui.screens.DisconnectedScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.neoforged.neoforge.client.event.ScreenEvent;
import net.neoforged.neoforge.common.NeoForge;

public final class SelectionGuiScale {
    private static int configured;
    private static int applied = -1;
    private static int minimumWidth;

    private SelectionGuiScale() {}

    static void register() {
        NeoForge.EVENT_BUS.addListener(SelectionGuiScale::screen);
    }

    public static int calculate(Window window, int playerScale, boolean forceUnicode, IntUnaryOperator calculate) {
        if (applied < 0) return calculate.applyAsInt(playerScale);
        int requested = applied == 0 ? playerScale : applied;
        int limit = SelectionSettings.MAX_GUI_SCALE;
        if (minimumWidth > 0) limit = Math.max(1, Math.min(limit, window.getWidth() / minimumWidth));
        int scale = calculate.applyAsInt(requested == 0 ? limit : Math.min(requested, limit));
        if (scale <= limit) return scale;
        return forceUnicode && limit > 1 ? limit - limit % 2 : limit;
    }

    static void configure(JsonObject message) {
        configured = SelectionSettings.parse(message).guiScale();
        refresh();
    }

    static void refresh() {
        Minecraft minecraft = Minecraft.getInstance();
        boolean active = minecraft.player != null && minecraft.level != null && minecraft.player.isAlive()
                && !interrupted(minecraft.screen)
                && (ClientSelection.selecting() || SpawnIntroOverlay.active() || SelectionTransition.active());
        apply(active ? configured : -1, active && minecraft.screen instanceof KitShopScreen shop ? shop.minimumWidth() : 0);
    }

    static void clear() {
        configured = 0;
        apply(-1, 0);
    }

    private static void apply(int value, int shopWidth) {
        if (applied == value && minimumWidth == shopWidth) return;
        applied = value;
        minimumWidth = shopWidth;
        Minecraft.getInstance().resizeDisplay();
    }

    private static boolean interrupted(Screen screen) {
        return screen instanceof DeathScreen || screen instanceof DisconnectedScreen || screen instanceof TitleScreen;
    }

    private static void screen(ScreenEvent.Opening event) {
        if (interrupted(event.getNewScreen())) apply(-1, 0);
    }
}

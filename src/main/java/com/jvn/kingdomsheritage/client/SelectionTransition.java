package com.jvn.kingdomsheritage.client;

import net.minecraft.Util;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.DeathScreen;
import net.minecraft.client.gui.screens.DisconnectedScreen;
import net.minecraft.client.gui.screens.ReceivingLevelScreen;
import net.minecraft.network.chat.Component;
import net.minecraft.util.Mth;
import net.neoforged.bus.api.EventPriority;
import net.neoforged.bus.api.ICancellableEvent;
import net.neoforged.neoforge.client.event.ScreenEvent;
import net.neoforged.neoforge.common.NeoForge;
import org.lwjgl.glfw.GLFW;

final class SelectionTransition {
    private static final int DURATION_MILLIS = 300;
    private static boolean active;
    private static boolean revealing;
    private static boolean awaitingWorld;
    private static long started;
    private static float from;
    private static Runnable onBlack;
    private static Button disconnect;

    private SelectionTransition() {}

    static void register() {
        NeoForge.EVENT_BUS.addListener(EventPriority.LOWEST, SelectionTransition::screen);
        NeoForge.EVENT_BUS.addListener(EventPriority.HIGHEST, SelectionTransition::mouse);
        NeoForge.EVENT_BUS.addListener(EventPriority.HIGHEST, SelectionTransition::key);
        NeoForge.EVENT_BUS.addListener(EventPriority.HIGHEST, (ScreenEvent.MouseScrolled.Pre event) -> input(event));
        NeoForge.EVENT_BUS.addListener(EventPriority.HIGHEST, (ScreenEvent.MouseDragged.Pre event) -> input(event));
        NeoForge.EVENT_BUS.addListener(EventPriority.HIGHEST, (ScreenEvent.CharacterTyped.Pre event) -> input(event));
        NeoForge.EVENT_BUS.addListener(SelectionTransition::opening);
    }

    static boolean active() { return active; }

    static void fadeOut(Runnable action) {
        if (active) return;
        active = true;
        revealing = awaitingWorld = false;
        from = 0;
        started = Util.getMillis();
        onBlack = action;
    }

    static void reveal() {
        if (!active) return;
        from = opacity(Util.getMillis());
        revealing = true;
        awaitingWorld = false;
        onBlack = null;
        started = Util.getMillis();
    }

    static void arrive() {
        if (!active) return;
        awaitingWorld = true;
        onBlack = null;
    }

    static void introReady() {
        if (awaitingWorld) clear();
    }

    static void tick() {
        if (!active) return;
        Minecraft minecraft = Minecraft.getInstance();
        if (minecraft.player != null && !minecraft.player.isAlive()) {
            clear();
            return;
        }
        if (awaitingWorld && !SpawnIntroOverlay.active() && minecraft.level != null && minecraft.player != null
                && !(minecraft.screen instanceof ReceivingLevelScreen)
                && minecraft.level.hasChunkAt(minecraft.player.blockPosition())) {
            reveal();
        }
        if (Util.getMillis() - started < DURATION_MILLIS) return;
        if (revealing) {
            clear();
        } else if (onBlack != null) {
            Runnable action = onBlack;
            onBlack = null;
            action.run();
        }
    }

    static void clear() {
        active = revealing = awaitingWorld = false;
        from = 0;
        onBlack = null;
        disconnect = null;
    }

    private static float opacity(long now) {
        float progress = Mth.clamp((now - started) / (float) DURATION_MILLIS, 0, 1);
        float eased = progress * progress * (3 - 2 * progress);
        return Mth.lerp(eased, from, revealing ? 0 : 1);
    }

    private static boolean waiting() {
        return active && !revealing && !awaitingWorld && onBlack == null
                && Util.getMillis() - started >= DURATION_MILLIS + 400;
    }

    static void render(GuiGraphics graphics) {
        if (!active) return;
        int alpha = Math.round(opacity(Util.getMillis()) * 255);
        graphics.flush();
        graphics.pose().pushPose();
        graphics.pose().translate(0, 0, 1000);
        graphics.fill(0, 0, graphics.guiWidth(), graphics.guiHeight(), alpha << 24);
        if (waiting()) {
            Minecraft minecraft = Minecraft.getInstance();
            graphics.drawCenteredString(minecraft.font, ClientSelection.progress(), graphics.guiWidth() / 2,
                    graphics.guiHeight() / 2, 0xffffff);
            if (disconnect == null) disconnect = Button.builder(Component.translatable("menu.disconnect"),
                    button -> ClientSelection.disconnect()).bounds(0, 0, 130, 20).build();
            disconnect.setPosition((graphics.guiWidth() - disconnect.getWidth()) / 2, graphics.guiHeight() - 28);
            double scale = minecraft.getWindow().getGuiScale();
            disconnect.render(graphics, (int) (minecraft.mouseHandler.xpos() / scale),
                    (int) (minecraft.mouseHandler.ypos() / scale), 0);
        }
        graphics.flush();
        graphics.pose().popPose();
    }

    private static void screen(ScreenEvent.Render.Post event) {
        render(event.getGuiGraphics());
    }

    private static void mouse(ScreenEvent.MouseButtonPressed.Pre event) {
        if (!active) return;
        if (waiting() && disconnect != null) disconnect.mouseClicked(event.getMouseX(), event.getMouseY(), event.getButton());
        event.setCanceled(true);
    }

    private static void key(ScreenEvent.KeyPressed.Pre event) {
        if (!active) return;
        if (waiting() && disconnect != null) {
            if (event.getKeyCode() == GLFW.GLFW_KEY_TAB) disconnect.setFocused(true);
            else disconnect.keyPressed(event.getKeyCode(), event.getScanCode(), event.getModifiers());
        }
        event.setCanceled(true);
    }

    private static void input(ICancellableEvent event) {
        if (active) event.setCanceled(true);
    }

    private static void opening(ScreenEvent.Opening event) {
        if (event.getNewScreen() instanceof DeathScreen || event.getNewScreen() instanceof DisconnectedScreen) clear();
    }
}

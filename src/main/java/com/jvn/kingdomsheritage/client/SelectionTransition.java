package com.jvn.kingdomsheritage.client;

import net.minecraft.Util;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.ConnectScreen;
import net.minecraft.client.gui.screens.DeathScreen;
import net.minecraft.client.gui.screens.DisconnectedScreen;
import net.minecraft.client.gui.screens.GenericMessageScreen;
import net.minecraft.client.gui.screens.LevelLoadingScreen;
import net.minecraft.client.gui.screens.ProgressScreen;
import net.minecraft.client.gui.screens.ReceivingLevelScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.contents.TranslatableContents;
import net.minecraft.util.Mth;
import net.neoforged.bus.api.EventPriority;
import net.neoforged.bus.api.ICancellableEvent;
import net.neoforged.neoforge.client.event.ScreenEvent;
import net.neoforged.neoforge.common.NeoForge;
import org.lwjgl.glfw.GLFW;

final class SelectionTransition {
    private static final int DURATION_MILLIS = 300;
    private static boolean active;
    private static boolean joining;
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
    static boolean joining() { return joining; }

    static void join() {
        beginJoin(true);
    }

    private static void beginJoin(boolean opaque) {
        if (joining && !opaque) return;
        active = joining = true;
        revealing = awaitingWorld = false;
        from = opaque ? 1 : 0;
        onBlack = null;
        started = Util.getMillis();
    }

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
        joining = awaitingWorld = false;
        onBlack = null;
        started = Util.getMillis();
    }

    static void arrive() {
        if (!active) return;
        awaitingWorld = true;
        joining = false;
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
        active = joining = revealing = awaitingWorld = false;
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
        return active && !joining && !revealing && !awaitingWorld && onBlack == null
                && Util.getMillis() - started >= DURATION_MILLIS + 400;
    }

    static void render(GuiGraphics graphics) {
        if (!active) return;
        long now = Util.getMillis();
        int alpha = Math.round(opacity(now) * 255);
        graphics.flush();
        graphics.pose().pushPose();
        graphics.pose().translate(0, 0, 1000);
        graphics.fill(0, 0, graphics.guiWidth(), graphics.guiHeight(), alpha << 24);
        graphics.flush();
        if (alpha >= 4 && (joining || awaitingWorld || waiting())) {
            LoadingIndicator.render(graphics, graphics.guiWidth() / 2, graphics.guiHeight() / 2 - 8, now, alpha);
            SelectionText.centered(graphics, Minecraft.getInstance().font, joining || awaitingWorld
                            ? Component.translatable("screen.kingdomsheritage.loading") : ClientSelection.progress(),
                    graphics.guiWidth() / 2, graphics.guiHeight() / 2 + 16, alpha << 24 | 0xffffff);
        }
        if (waiting()) {
            Minecraft minecraft = Minecraft.getInstance();
            if (disconnect == null) disconnect = SelectionControls.disconnect(graphics.guiHeight(), true);
            disconnect.setPosition(8, graphics.guiHeight() - disconnect.getHeight() - 8);
            double scale = minecraft.getWindow().getGuiScale();
            int mouseX = (int) (minecraft.mouseHandler.xpos() / scale);
            int mouseY = (int) (minecraft.mouseHandler.ypos() / scale);
            disconnect.render(graphics, mouseX, mouseY, 0);
            if (disconnect.isHoveredOrFocused()) graphics.renderTooltip(minecraft.font, disconnect.getMessage(), mouseX, mouseY);
        }
        graphics.flush();
        graphics.pose().popPose();
    }

    private static void screen(ScreenEvent.Render.Post event) {
        render(event.getGuiGraphics());
        if (joining && loadingScreen(event.getScreen())) {
            GuiGraphics graphics = event.getGuiGraphics();
            graphics.pose().pushPose();
            graphics.pose().translate(0, 0, 1100);
            for (var child : event.getScreen().children()) {
                if (child instanceof Button button) button.render(graphics, event.getMouseX(), event.getMouseY(), event.getPartialTick());
            }
            graphics.flush();
            graphics.pose().popPose();
        }
    }

    private static void mouse(ScreenEvent.MouseButtonPressed.Pre event) {
        if (!active || joining && loadingScreen(event.getScreen())) return;
        if (waiting() && disconnect != null) disconnect.mouseClicked(event.getMouseX(), event.getMouseY(), event.getButton());
        event.setCanceled(true);
    }

    private static void key(ScreenEvent.KeyPressed.Pre event) {
        if (!active || joining && loadingScreen(event.getScreen())) return;
        if (waiting() && disconnect != null) {
            if (event.getKeyCode() == GLFW.GLFW_KEY_TAB) disconnect.setFocused(true);
            else disconnect.keyPressed(event.getKeyCode(), event.getScanCode(), event.getModifiers());
        }
        event.setCanceled(true);
    }

    private static void input(ICancellableEvent event) {
        if (active && !joining) event.setCanceled(true);
    }

    private static boolean loadingScreen(Screen screen) {
        if (screen instanceof ConnectScreen || screen instanceof LevelLoadingScreen || screen instanceof ReceivingLevelScreen) return true;
        if (screen instanceof ProgressScreen) return joining;
        return screen instanceof GenericMessageScreen && screen.getTitle().getContents() instanceof TranslatableContents contents
                && (contents.getKey().equals("selectWorld.data_read") || contents.getKey().equals("createWorld.preparing"));
    }

    private static void opening(ScreenEvent.Opening event) {
        Screen screen = event.getNewScreen();
        if (screen instanceof DeathScreen || screen instanceof DisconnectedScreen) {
            clear();
        } else if (screen != null && !(screen instanceof SpawnSelectScreen)) {
            if ((Minecraft.getInstance().level == null || joining) && loadingScreen(screen)) beginJoin(false);
            else if (joining) clear();
        }
    }
}

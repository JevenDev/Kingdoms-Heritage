package com.jvn.kingdomsheritage.client;

import com.google.gson.JsonObject;
import com.jvn.kingdomsheritage.network.HeritageNetwork;
import com.jvn.toucanlib.client.ToucanPlayerSkinResolver;
import com.mojang.blaze3d.systems.RenderSystem;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import net.minecraft.ChatFormatting;
import net.minecraft.Util;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.PlayerFaceRenderer;
import net.minecraft.client.gui.screens.inventory.tooltip.TooltipRenderUtil;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;
import net.neoforged.bus.api.EventPriority;
import net.neoforged.neoforge.client.event.ScreenEvent;
import net.neoforged.neoforge.common.NeoForge;
import net.neoforged.neoforge.network.PacketDistributor;

final class ClientParty {
    record Peer(UUID id, String name, int stage, boolean available) {}
    private record Invitation(long expires, long received) {}
    private record RemoteCursor(float fromX, float fromY, float x, float y, int page, long received) {
        float x(long now) { return Mth.lerp(Mth.clamp((now - received) / 100F, 0, 1), fromX, x); }
        float y(long now) { return Mth.lerp(Mth.clamp((now - received) / 100F, 0, 1), fromY, y); }
    }
    private static final ResourceLocation CROSSHAIR = ResourceLocation.fromNamespaceAndPath("kingdomsheritage", "textures/gui/party_crosshair.png");
    private static final ToucanPlayerSkinResolver SKINS = new ToucanPlayerSkinResolver(128, 30000);
    private static final Map<UUID, Peer> PLAYERS = new LinkedHashMap<>();
    private static final Set<UUID> MEMBERS = new LinkedHashSet<>();
    private static final Map<UUID, Invitation> INVITES = new LinkedHashMap<>();
    private static final Set<UUID> OUTGOING = new LinkedHashSet<>();
    private static final Map<UUID, RemoteCursor> CURSORS = new HashMap<>();
    private static final List<Button> CONTROLS = new ArrayList<>();
    private static final Map<String, Button> BUTTONS = new HashMap<>();
    private static List<Peer> peers = List.of();
    private static long generation = -1;
    private static String pendingSpawn;
    private static final List<Button> MENU = new ArrayList<>();
    private static UUID leader;
    private static String spawn = "";
    private static String reportedStage = "";
    private static int headPage;
    private static int ticks;
    private static int sentX = -1, sentY = -1, sentPage = -1;
    private static int menuX, menuY, menuWidth;
    private static UUID menuPlayer;
    private static UUID hovered;
    private static Button leave;

    private ClientParty() {}

    static void register() {
        HeritageNetwork.cursorReceiver = ClientParty::cursor;
        NeoForge.EVENT_BUS.addListener(EventPriority.LOWEST, ClientParty::renderScreen);
        NeoForge.EVENT_BUS.addListener(EventPriority.HIGHEST, true, ClientParty::mouse);
        NeoForge.EVENT_BUS.addListener(EventPriority.HIGHEST, true, ClientParty::key);
    }

    static boolean grouped() { return leader != null; }
    static boolean follower() { return grouped() && !leader.equals(self()); }
    static String spawn() { return spawn; }
    private static UUID self() { return Minecraft.getInstance().player.getUUID(); }

    static void receive(JsonObject state) {
        long now = Util.getMillis();
        var previousMembers = Set.copyOf(MEMBERS);
        PLAYERS.clear();
        for (var value : state.getAsJsonArray("players")) {
            var player = value.getAsJsonObject();
            UUID id = UUID.fromString(player.get("id").getAsString());
            PLAYERS.put(id, new Peer(id, player.get("name").getAsString(), player.get("stage").getAsInt(), !player.has("available") || player.get("available").getAsBoolean()));
        }
        String leaderId = state.get("leader").getAsString();
        leader = leaderId.isEmpty() ? null : UUID.fromString(leaderId);
        MEMBERS.clear();
        for (var value : state.getAsJsonArray("members")) MEMBERS.add(UUID.fromString(value.getAsString()));
        peers = PLAYERS.values().stream().filter(player -> !player.id().equals(self()))
                .sorted(java.util.Comparator.comparing(player -> !MEMBERS.contains(player.id()))).toList();
        if (!previousMembers.equals(MEMBERS)) {
            headPage = 0;
            if (!MEMBERS.isEmpty()) SelectionSounds.CONFIRMATION.play();
            CURSORS.clear();
            sentX = -1;
        }
        var nextInvites = new LinkedHashMap<UUID, Invitation>();
        for (var value : state.getAsJsonArray("invites")) {
            var invite = value.getAsJsonObject();
            UUID id = UUID.fromString(invite.get("sender").getAsString());
            long remaining = Math.min(30000, invite.get("remaining").getAsLong());
            var previous = INVITES.get(id);
            nextInvites.put(id, new Invitation(now + remaining, previous == null ? now : previous.received()));
            if (previous == null) SelectionSounds.NOTICE.play();
        }
        INVITES.clear();
        INVITES.putAll(nextInvites);
        OUTGOING.clear();
        for (var value : state.getAsJsonArray("outgoing")) OUTGOING.add(UUID.fromString(value.getAsString()));
        MENU.clear();
        menuPlayer = null;
        CURSORS.keySet().retainAll(PLAYERS.keySet());
        String nextSpawn = state.get("spawn").getAsString();
        long nextGeneration = state.get("generation").getAsLong();
        boolean changed = !spawn.equals(nextSpawn) || generation != nextGeneration;
        spawn = nextSpawn;
        generation = nextGeneration;
        if (changed) pendingSpawn = spawn.isEmpty() ? null : spawn;
    }

    static void action(int action, UUID target, String spawn) {
        PacketDistributor.sendToServer(new HeritageNetwork.PartyAction(action, target == null ? self() : target,
                spawn, ClientSelection.revision()));
    }

    static void select(String location) {
        action(follower() ? HeritageNetwork.PartyAction.SUGGEST : HeritageNetwork.PartyAction.SELECT, null, location);
        SelectionSounds.NOTICE.play();
    }

    static void tick() {
        if (!ClientSelection.selecting()) return;
        var minecraft = Minecraft.getInstance();
        ticks++;
        if (pendingSpawn != null && !SelectionTransition.active()) {
            String location = pendingSpawn;
            pendingSpawn = null;
            ClientSelection.followPartySpawn(location);
        }
        String stage = SelectionTransition.active() ? "loading" : ClientSelection.choosingKit() ? "kit" : "spawn";
        if (!reportedStage.equals(stage) || ticks % 10 == 0) {
            reportedStage = stage;
            action(HeritageNetwork.PartyAction.STAGE, null, stage);
        }
        if (ticks % 2 != 0 || !(minecraft.screen instanceof SpawnSelectScreen screen) || SelectionTransition.active()) return;
        double scale = minecraft.getWindow().getGuiScale();
        int x = Mth.clamp((int) (minecraft.mouseHandler.xpos() / scale / screen.width * 65535), 0, 65535);
        int y = Mth.clamp((int) (minecraft.mouseHandler.ypos() / scale / screen.height * 65535), 0, 65535);
        if (x == sentX && y == sentY && screen.page() == sentPage && ticks % 10 != 0) return;
        sentX = x;
        sentY = y;
        sentPage = screen.page();
        PacketDistributor.sendToServer(new HeritageNetwork.Cursor(self(), x, y, sentPage));
    }

    private static void cursor(HeritageNetwork.Cursor packet) {
        if (!PLAYERS.containsKey(packet.player()) || packet.player().equals(self())) return;
        long now = Util.getMillis();
        var previous = CURSORS.get(packet.player());
        float x = packet.x() / 65535F, y = packet.y() / 65535F;
        CURSORS.put(packet.player(), new RemoteCursor(previous == null ? x : previous.x(now),
                previous == null ? y : previous.y(now), x, y, packet.page(), now));
    }

    static void clear() {
        PLAYERS.clear();
        MEMBERS.clear();
        INVITES.clear();
        OUTGOING.clear();
        CURSORS.clear();
        CONTROLS.clear();
        MENU.clear();
        BUTTONS.clear();
        peers = List.of();
        pendingSpawn = null;
        generation = -1;
        SKINS.clear();
        leader = null;
        spawn = reportedStage = "";
        menuPlayer = hovered = null;
        leave = null;
        ticks = headPage = 0;
        sentX = sentY = sentPage = -1;
    }

    private static Component text(String key, Object... arguments) {
        return Component.translatable("screen.kingdomsheritage.party_" + key, arguments);
    }

    private static void head(GuiGraphics graphics, Peer player, int x, int y, int size, boolean status) {
        PlayerFaceRenderer.draw(graphics, SKINS.resolve(player.id(), player.name()).texture(), x, y, size);
        if (status && player.stage() != 0) graphics.fill(x, y, x + size, y + size, 0xaa343434);
        if (MEMBERS.contains(player.id())) graphics.renderOutline(x - 1, y - 1, size + 2, size + 2, 0xffffffff);
        if (status && (player.stage() == 2 || player.stage() == 4)) {
            graphics.pose().pushPose();
            graphics.pose().translate(x + size / 2F, y + size / 2F, 0);
            graphics.pose().scale(0.5F, 0.5F, 1);
            LoadingIndicator.render(graphics, 0, 0, Util.getMillis(), 255);
            graphics.pose().popPose();
        }
    }

    private static List<Peer> others() {
        return peers;
    }

    private static int columns(int width) {
        int titleWidth = Minecraft.getInstance().font.width(Component.translatable("screen.kingdomsheritage.location"));
        return Math.max(1, Math.min(3, ((width - titleWidth) / 2 - 16) / 20));
    }

    private static void renderScreen(ScreenEvent.Render.Post event) {
        if (!ClientSelection.selecting() || KitSelection.capturingPreview()) return;
        render(event.getGuiGraphics(), event.getScreen().width, event.getScreen().height, event.getMouseX(), event.getMouseY());
    }

    static void render(GuiGraphics graphics, int width, int height, int mouseX, int mouseY) {
        var minecraft = Minecraft.getInstance();
        long now = Util.getMillis();
        CONTROLS.clear();
        graphics.flush();
        graphics.pose().pushPose();
        graphics.pose().translate(0, 0, 1200);
        boolean selectingSpawn = minecraft.screen instanceof SpawnSelectScreen;
        var others = others();
        int columns = columns(width);
        headPage = Math.min(headPage, Math.max(0, (others.size() - 1) / columns));
        UUID nextHovered = null;
        if (selectingSpawn || SelectionTransition.active()) {
            for (int i = 0; i < columns && headPage * columns + i < others.size(); i++) {
                var player = others.get(headPage * columns + i);
                int x = 8 + i * 20;
                head(graphics, player, x, 8, 16, true);
                if (inside(mouseX, mouseY, x - 1, 7, 18, 18)) nextHovered = player.id();
            }
            if (others.size() > columns) {
                String pageLabel = (headPage + 1) + "/" + ((others.size() + columns - 1) / columns);
                pageArrow(4, false, headPage > 0);
                SelectionText.draw(graphics, minecraft.font, pageLabel, 28, 32, 0xffcccccc);
                pageArrow(32 + minecraft.font.width(pageLabel), true, (headPage + 1) * columns < others.size());
            }
        }
        if (nextHovered != null && !nextHovered.equals(hovered) && !SelectionTransition.active()) SelectionSounds.HOVER.play();
        hovered = nextHovered;
        if (grouped()) {
            leave = control(43, height - 29, Math.min(104, width / 3), 21, text("leave"), true,
                    () -> action(HeritageNetwork.PartyAction.LEAVE, null, ""));
        } else leave = null;
        if (selectingSpawn && !SelectionTransition.active()) {
            int page = ((SpawnSelectScreen) minecraft.screen).page();
            for (var entry : CURSORS.entrySet()) {
                var cursor = entry.getValue();
                var player = PLAYERS.get(entry.getKey());
                if (player == null || player.stage() != 0 || cursor.page() != page || now - cursor.received() > 1000) continue;
                int x = Mth.clamp(Math.round(cursor.x(now) * width), 0, width - 16);
                int y = Mth.clamp(Math.round(cursor.y(now) * height), 0, height - 16);
                RenderSystem.enableBlend();
                RenderSystem.defaultBlendFunc();
                graphics.blit(CROSSHAIR, x - 7, y - 7, 0, 0, 15, 15, 15, 15);
                RenderSystem.disableBlend();
                head(graphics, player, x + 5, y + 5, 8, false);
            }
        }
        int toastIndex = 0;
        for (var entry : INVITES.entrySet()) {
            if (entry.getValue().expires() <= now || toastIndex >= Math.max(1, (height - 104) / 64)) continue;
            var player = PLAYERS.get(entry.getKey());
            if (player == null) continue;
            int toastWidth = Math.min(216, width), x = width - toastWidth, y = 44 + toastIndex++ * 64;
            graphics.pose().pushPose();
            graphics.pose().translate(x, y, 0);
            SelectionToasts.background(graphics, toastWidth, 60, now - entry.getValue().received());
            head(graphics, player, 8, 8, 16, false);
            SelectionText.draw(graphics, minecraft.font, minecraft.font.plainSubstrByWidth(player.name(), toastWidth - 38), 30, 7, 0xffffffff);
            SelectionText.draw(graphics, minecraft.font, text("invite_toast", (entry.getValue().expires() - now + 999) / 1000), 30, 20, 0xffbbbbbb);
            graphics.pose().popPose();
            int buttonWidth = (toastWidth - 20) / 2;
            control(x + 8, y + 35, buttonWidth, 18, text("join"), !SelectionTransition.active(), () -> respond(player.id(), true));
            control(x + 12 + buttonWidth, y + 35, buttonWidth, 18, text("decline"), !SelectionTransition.active(), () -> respond(player.id(), false));
        }
        BUTTONS.values().removeIf(button -> !CONTROLS.contains(button));
        for (var button : CONTROLS) button.render(graphics, mouseX, mouseY, 0);
        if (menuPlayer != null) {
            var player = PLAYERS.get(menuPlayer);
            if (player != null) {
                TooltipRenderUtil.renderTooltipBackground(graphics, menuX, menuY - 14, menuWidth, 16 + MENU.size() * 14, 0);
                graphics.drawString(minecraft.font, player.name(), menuX, menuY - 14, 0xffffffff);
                for (var button : MENU) button.render(graphics, mouseX, mouseY, 0);
            }
        } else if (hovered != null && !SelectionTransition.active()) {
            var player = PLAYERS.get(hovered);
            Component name = Component.literal(player.name()).append(" - ").append(text("stage_" + player.stage()));
            graphics.renderComponentTooltip(minecraft.font, List.of(name,
                    text("more").copy().withStyle(ChatFormatting.GRAY, ChatFormatting.ITALIC)), mouseX, mouseY);
        }
        graphics.flush();
        graphics.pose().popPose();
    }

    private static void pageArrow(int x, boolean forward, boolean active) {
        String key = "page:" + forward;
        var button = BUTTONS.computeIfAbsent(key, ignored -> SelectionControls.arrow(x, 26, forward,
                Component.translatable(forward ? "spectatorMenu.next_page" : "spectatorMenu.previous_page"),
                pressed -> headPage += forward ? 1 : -1));
        button.setX(x);
        button.setWidth(20);
        button.setHeight(20);
        button.active = active;
        CONTROLS.add(button);
    }

    private static Button control(int x, int y, int width, int height, Component text, boolean active, Runnable action) {
        String key = x + ":" + y + ":" + text.getString();
        var button = BUTTONS.computeIfAbsent(key, ignored ->
                new SelectionControls.SoundButton(x, y, width, height, text, pressed -> action.run()));
        button.setWidth(width);
        button.active = active;
        CONTROLS.add(button);
        return button;
    }

    private static boolean inside(double x, double y, int left, int top, int width, int height) {
        return x >= left && x < left + width && y >= top && y < top + height;
    }

    private static void respond(UUID id, boolean accept) {
        var invite = INVITES.get(id);
        if (invite == null || invite.expires() <= Util.getMillis()) return;
        action(accept ? HeritageNetwork.PartyAction.ACCEPT : HeritageNetwork.PartyAction.DECLINE, id, "");
        INVITES.remove(id);
        MENU.clear();
        menuPlayer = null;
    }

    private static void mouse(ScreenEvent.MouseButtonPressed.Pre event) {
        if (!ClientSelection.selecting()) return;
        double x = event.getMouseX(), y = event.getMouseY();
        int button = event.getButton();
        if (SelectionTransition.active()) {
            if (button == 0 && leave != null && leave.mouseClicked(x, y, button)) event.setCanceled(true);
            return;
        }
        if (menuPlayer != null) {
            for (var control : List.copyOf(MENU)) if (control.mouseClicked(x, y, button)) {
                event.setCanceled(true);
                return;
            }
            MENU.clear();
            menuPlayer = null;
            event.setCanceled(true);
            return;
        }
        if (button == 0) for (var control : List.copyOf(CONTROLS)) if (control.mouseClicked(x, y, button)) {
            event.setCanceled(true);
            return;
        }
        if (button != 1 || !(event.getScreen() instanceof SpawnSelectScreen)) return;
        var others = others();
        int columns = columns(event.getScreen().width);
        for (int i = 0; i < columns && headPage * columns + i < others.size(); i++) {
            var player = others.get(headPage * columns + i);
            if (!inside(x, y, 7 + i * 20, 7, 18, 18)) continue;
            menuPlayer = player.id();
            menuWidth = Math.max(Minecraft.getInstance().font.width(player.name()), Minecraft.getInstance().font.width(text("invite"))) + 8;
            menuX = Mth.clamp((int) x + 12, 4, Math.max(4, event.getScreen().width - menuWidth - 4));
            menuY = Mth.clamp((int) y + 18, 20, Math.max(20, event.getScreen().height - 34));
            var invite = INVITES.get(player.id());
            if (invite != null && invite.expires() > Util.getMillis()) {
                menuButton(text("join"), true, () -> respond(player.id(), true));
                menuButton(text("decline"), true, () -> respond(player.id(), false));
            } else {
                boolean outgoing = OUTGOING.contains(player.id());
                boolean available = !follower() && spawn.isEmpty() && player.stage() == 0 && !MEMBERS.contains(player.id())
                        && MEMBERS.size() < 8 && !outgoing && player.available();
                menuButton(text(outgoing ? "invited" : "invite"), available, () -> {
                    action(HeritageNetwork.PartyAction.INVITE, player.id(), "");
                    MENU.clear();
                    menuPlayer = null;
                });
            }
            SelectionSounds.CLICK.play();
            event.setCanceled(true);
            return;
        }
    }

    private static void menuButton(Component text, boolean active, Runnable action) {
        var button = new SelectionControls.SoundButton(menuX, menuY + MENU.size() * 14, menuWidth, 14, text, ignored -> action.run()) {
            private boolean highlighted;

            @Override
            protected void renderWidget(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
                boolean highlight = active && isHoveredOrFocused();
                if (highlight && !highlighted) SelectionSounds.HOVER.play();
                highlighted = highlight;
                graphics.drawString(Minecraft.getInstance().font, getMessage(), getX(), getY() + 2,
                        active ? highlight ? 0xffffff55 : 0xffffffff : 0xff888888);
            }
        };
        button.active = active;
        MENU.add(button);
    }

    private static void key(ScreenEvent.KeyPressed.Pre event) {
        if (menuPlayer == null) return;
        int key = event.getKeyCode();
        if (key == org.lwjgl.glfw.GLFW.GLFW_KEY_ESCAPE) {
            MENU.clear();
            menuPlayer = null;
            event.setCanceled(true);
        } else if (key == org.lwjgl.glfw.GLFW.GLFW_KEY_DOWN || key == org.lwjgl.glfw.GLFW.GLFW_KEY_UP
                || key == org.lwjgl.glfw.GLFW.GLFW_KEY_TAB) {
            int current = -1;
            for (int i = 0; i < MENU.size(); i++) if (MENU.get(i).isFocused()) current = i;
            int direction = key == org.lwjgl.glfw.GLFW.GLFW_KEY_UP ? -1 : 1;
            for (int step = 1; step <= MENU.size(); step++) {
                int index = Math.floorMod(current + step * direction, MENU.size());
                if (!MENU.get(index).active) continue;
                for (var button : MENU) button.setFocused(false);
                MENU.get(index).setFocused(true);
                break;
            }
            event.setCanceled(true);
        } else if (key == org.lwjgl.glfw.GLFW.GLFW_KEY_ENTER || key == org.lwjgl.glfw.GLFW.GLFW_KEY_SPACE) {
            for (var button : List.copyOf(MENU)) if (button.isFocused() && button.active) {
                button.playDownSound(Minecraft.getInstance().getSoundManager());
                button.onPress();
                break;
            }
            event.setCanceled(true);
        }
    }
}

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
import net.minecraft.client.gui.screens.Screen;
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
    private static final int INVITATION_NOTICE_HEIGHT = 32;
    private static final ResourceLocation CROSSHAIR = ResourceLocation.fromNamespaceAndPath("kingdomsheritage", "textures/gui/party_crosshair.png");
    private static final ToucanPlayerSkinResolver SKINS = new ToucanPlayerSkinResolver(128, 30000);
    private static final Map<UUID, Peer> PLAYERS = new LinkedHashMap<>();
    private static final PartyPlayerList PLAYER_LIST = new PartyPlayerList();
    private static final Set<UUID> MEMBERS = new LinkedHashSet<>();
    private static final Map<UUID, Invitation> INVITES = new LinkedHashMap<>();
    private static final Set<UUID> OUTGOING = new LinkedHashSet<>();
    private static final Map<UUID, RemoteCursor> CURSORS = new HashMap<>();
    private static final Map<UUID, Component> KITS = new HashMap<>();
    private static final Map<UUID, String> SUGGESTIONS = new LinkedHashMap<>();
    private static final List<Button> CONTROLS = new ArrayList<>();
    private static final Map<String, Button> BUTTONS = new HashMap<>();
    private static List<Peer> peers = List.of();
    private static long generation = -1;
    private static String pendingSpawn;
    private static final List<Button> MENU = new ArrayList<>();
    private static UUID leader;
    private static String spawn = "";
    private static String reportedStage = "";
    private static int ticks;
    private static int sentX = -1, sentY = -1, sentPage = -1;
    private static int menuX, menuY, menuTop, menuWidth;
    private static UUID menuPlayer;
    private static UUID hovered;
    private static Button leave;
    private static Peer headerHovered;
    private static Component summaryHovered;
    private static UUID noticePlayer;
    private static boolean noticeHovered;
    private static int noticeX, noticeY, noticeWidth;
    private static Screen overlayScreen;

    private ClientParty() {}

    static void register() {
        HeritageNetwork.cursorReceiver = ClientParty::cursor;
        NeoForge.EVENT_BUS.addListener(EventPriority.LOWEST, ClientParty::renderScreen);
        NeoForge.EVENT_BUS.addListener(EventPriority.HIGHEST, true, ClientParty::mouse);
        NeoForge.EVENT_BUS.addListener(EventPriority.HIGHEST, true, ClientParty::key);
        NeoForge.EVENT_BUS.addListener(EventPriority.HIGHEST, true, ClientParty::scroll);
    }

    static HeritageParty.Snapshot snapshot() {
        long now = Util.getMillis();
        return new HeritageParty.Snapshot(PLAYERS.values().stream().map(player -> new HeritageParty.Player(
                player.id(), player.name(), HeritageParty.Stage.values()[player.stage()], player.available())).toList(),
                leader, MEMBERS, spawn, INVITES.entrySet().stream().filter(entry -> entry.getValue().expires() > now)
                        .map(entry -> new HeritageParty.Invitation(entry.getKey(), entry.getValue().expires() - now)).toList(), OUTGOING);
    }

    private static boolean partyScreen(Screen screen) {
        return screen instanceof SpawnSelectScreen || screen instanceof HeritageScreen heritage && heritage.showsParty();
    }

    private static boolean overlay(Screen screen) {
        if (overlayScreen != screen) {
            overlayScreen = screen;
            PLAYER_LIST.reset();
            CONTROLS.clear();
            BUTTONS.clear();
            MENU.clear();
            menuPlayer = hovered = null;
            leave = null;
        }
        return ClientSelection.selecting() && (HeritageScreens.finished() || partyScreen(screen));
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
        KITS.clear();
        if (state.has("choices")) for (var value : state.getAsJsonArray("choices")) {
            var choice = value.getAsJsonObject();
            UUID id = UUID.fromString(choice.get("id").getAsString());
            if (MEMBERS.contains(id) && choice.has("kit") && !choice.get("kit").getAsString().isEmpty())
                KITS.put(id, com.jvn.kingdomsheritage.data.DefinitionJson.component(choice, "title"));
        }
        if (state.has("suggestions") || !previousMembers.equals(MEMBERS)) SUGGESTIONS.clear();
        if (state.has("suggestions")) for (var value : state.getAsJsonArray("suggestions")) {
            var vote = value.getAsJsonObject();
            UUID id = UUID.fromString(vote.get("player").getAsString());
            if (MEMBERS.contains(id) && PLAYERS.containsKey(id)) SUGGESTIONS.put(id, vote.get("spawn").getAsString());
        }
        SUGGESTIONS.keySet().retainAll(PLAYERS.keySet());
        peers = orderedPlayers(List.copyOf(PLAYERS.values()), MEMBERS, self());
        if (!previousMembers.equals(MEMBERS)) {
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
        if (state.has("feedback")) {
            for (var value : state.getAsJsonArray("feedback")) {
                var feedback = value.getAsJsonObject();
                SelectionToasts.add(new PartyNoticeToast(feedback.get("name").getAsString(), feedback.get("result").getAsString()));
                if (!feedback.get("result").getAsString().equals("accepted")) SelectionSounds.NOTICE.play();
            }
        }
        CURSORS.keySet().retainAll(PLAYERS.keySet());
        String nextSpawn = state.get("spawn").getAsString();
        long nextGeneration = state.get("generation").getAsLong();
        boolean changed = !spawn.equals(nextSpawn) || generation != nextGeneration;
        spawn = nextSpawn;
        generation = nextGeneration;
        if (changed) pendingSpawn = spawn.isEmpty() ? null : spawn;
        if (menuPlayer != null) refreshMenu();
        ClientSelectionEvents.party();
    }

    static void action(int action, UUID target, String spawn) {
        PacketDistributor.sendToServer(new HeritageNetwork.PartyAction(action, target == null ? self() : target,
                spawn, ClientSelection.revision()));
    }

    static void kitChanged(String location, String kit) {
        if (!grouped() || spawn.isEmpty() || !spawn.equals(location)) return;
        action(HeritageNetwork.PartyAction.KIT, null, kit == null ? "" : kit);
    }

    static List<SpawnSuggestions.Vote> suggestions() {
        return SUGGESTIONS.entrySet().stream().map(entry -> new SpawnSuggestions.Vote(entry.getKey(), entry.getValue())).toList();
    }

    static void suggested(String spawn, String name) {
        var player = player(name);
        if (player == null) return;
        SUGGESTIONS.remove(player.id());
        if (!spawn.isEmpty()) SUGGESTIONS.put(player.id(), spawn);
    }

    static Peer player(UUID id) { return PLAYERS.get(id); }

    static Component kitChoice(UUID player) { return KITS.getOrDefault(player, text("choosing_kit")); }
    static Component spawnChoice() { return text("spawn_choice", spawn.isEmpty() ? text("choosing_spawn") : ClientSelection.spawnTitle(spawn)); }

    static void select(String location) {
        action(follower() ? HeritageNetwork.PartyAction.SUGGEST : HeritageNetwork.PartyAction.SELECT, null, location);
        SelectionSounds.NOTICE.play();
    }

    static void tick() {
        if (!ClientSelection.selecting()) return;
        var minecraft = Minecraft.getInstance();
        ticks++;
        if (pendingSpawn != null && HeritageScreens.finished() && !SelectionTransition.active()) {
            String location = pendingSpawn;
            pendingSpawn = null;
            ClientSelection.followPartySpawn(location);
        }
        boolean choosingKit = ClientSelection.choosingKit() || !HeritageScreens.finished()
                && (HeritageScreens.placement() != HeritageScreens.Placement.BEFORE_SPAWN || !partyScreen(minecraft.screen));
        String stage = SelectionTransition.active() ? "loading" : choosingKit ? "kit" : "spawn";
        if (!reportedStage.equals(stage) || ticks % 10 == 0) {
            reportedStage = stage;
            action(HeritageNetwork.PartyAction.STAGE, null, stage);
        }
        if (grouped() && !spawn.isEmpty() && ticks % 10 == 0) {
            var kits = ClientSelection.kits();
            kitChanged(spawn, kits != null && kits.spawnId().equals(spawn) ? kits.kitId() : null);
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
        KITS.clear();
        SUGGESTIONS.clear();
        leader = null;
        spawn = reportedStage = "";
        menuPlayer = hovered = null;
        leave = null;
        headerHovered = null;
        summaryHovered = null;
        noticePlayer = null;
        noticeHovered = false;
        overlayScreen = null;
        ticks = 0;
        PLAYER_LIST.reset();
        sentX = sentY = sentPage = -1;
    }

    record Readiness(int ready, int total, List<HeritageParty.Player> waiting) {}

    static Readiness readiness(HeritageParty.Snapshot party) {
        var members = party.players().stream().filter(player -> party.members().contains(player.id())).toList();
        var waiting = members.stream().filter(player -> player.stage() != HeritageParty.Stage.READY).toList();
        return new Readiness(members.size() - waiting.size(), members.size(), waiting);
    }

    static Component waitingSummary() {
        var status = readiness(snapshot());
        return text("ready_count", status.ready(), status.total());
    }

    static Component waitingNames() {
        var names = Component.empty();
        for (var player : readiness(snapshot()).waiting()) {
            if (!names.getString().isEmpty()) names.append(", ");
            names.append(text("waiting_member", player.name(), text("stage_" + player.stage().ordinal())));
        }
        return text("waiting_for", names);
    }

    private static Component text(String key, Object... arguments) {
        return Component.translatable("screen.kingdomsheritage.party_" + key, arguments);
    }

    static ResourceLocation skin(Peer player) { return SKINS.resolve(player.id(), player.name()).texture(); }

    static Peer player(String name) {
        return PLAYERS.values().stream().filter(player -> player.name().equals(name)).findFirst().orElse(null);
    }

    static void face(GuiGraphics graphics, Peer player, int x, int y, int size, float opacity) {
        if (opacity <= 0) return;
        graphics.setColor(1, 1, 1, opacity);
        RenderSystem.enableBlend();
        RenderSystem.defaultBlendFunc();
        try {
            PlayerFaceRenderer.draw(graphics, skin(player), x, y, size);
        } finally {
            RenderSystem.disableBlend();
            graphics.setColor(1, 1, 1, 1);
        }
    }

    static void head(GuiGraphics graphics, Peer player, int x, int y, int size, boolean status) {
        head(graphics, player, x, y, size, status, 1);
    }

    static void head(GuiGraphics graphics, Peer player, int x, int y, int size, boolean status, float opacity) {
        if (opacity <= 0) return;
        graphics.fill(x - 1, y - 1, x + size + 1, y + size + 1, Math.round(opacity * 255) << 24);
        face(graphics, player, x, y, size, opacity);
        if (status && player.stage() != 0) graphics.fill(x, y, x + size, y + size, Math.round(opacity * 170) << 24 | 0x343434);
        if (status && player.stage() == HeritageParty.Stage.LOADING.ordinal()) {
            graphics.pose().pushPose();
            graphics.pose().translate(x + size / 2F, y + size / 2F, 0);
            float scale = size / 32F;
            graphics.pose().scale(scale, scale, 1);
            LoadingIndicator.render(graphics, 0, 0, Util.getMillis(), Math.round(opacity * 255));
            graphics.pose().popPose();
        }
    }

    private record CursorMarker(Peer player, int x, int y) {
        boolean contains(int mouseX, int mouseY) {
            return mouseX >= x - 7 && mouseX < x + 8 && mouseY >= y - 7 && mouseY < y + 8
                    || mouseX >= x + 4 && mouseX < x + 14 && mouseY >= y + 4 && mouseY < y + 14;
        }
    }

    private static List<CursorMarker> cursorMarkers(SpawnSelectScreen screen, long now) {
        var markers = new ArrayList<CursorMarker>();
        for (var entry : CURSORS.entrySet()) {
            var cursor = entry.getValue();
            var player = PLAYERS.get(entry.getKey());
            if (player == null || player.stage() != 0 || cursor.page() != screen.page() || now - cursor.received() > 1000) continue;
            int x = Mth.clamp(Math.round(cursor.x(now) * screen.width), 0, screen.width - 16);
            int y = Mth.clamp(Math.round(cursor.y(now) * screen.height), 0, screen.height - 16);
            markers.add(new CursorMarker(player, x, y));
        }
        return markers;
    }

    static Peer hoveredName(SpawnSelectScreen screen, int mouseX, int mouseY) {
        if (blocksInput() || SelectionTransition.active()) return null;
        var suggestion = screen.suggestionAt(mouseX, mouseY);
        if (suggestion != null) return suggestion;
        Peer hovered = null;
        for (var marker : cursorMarkers(screen, Util.getMillis())) if (marker.contains(mouseX, mouseY)) hovered = marker.player;
        return hovered;
    }

    static boolean blocksInput() { return PLAYER_LIST.active(Util.getMillis()) || menuPlayer != null; }
    static boolean menuOpen() { return menuPlayer != null; }
    static boolean blocksHover(int mouseX, int mouseY) {
        return blocksInput() || overInvitation(mouseX, mouseY) || !peers.isEmpty() && PLAYER_LIST.overTrigger(mouseX, mouseY);
    }

    static void closeListBlur() { PLAYER_LIST.closeBlur(); }

    static List<Peer> orderedPlayers(List<Peer> players, Set<UUID> members, UUID self) {
        return players.stream().filter(player -> !player.id().equals(self))
                .sorted(java.util.Comparator.comparing((Peer player) -> !members.contains(player.id()))
                        .thenComparing(Peer::name, String.CASE_INSENSITIVE_ORDER).thenComparing(Peer::id)).toList();
    }

    private static List<Peer> roster() { return peers; }

    static boolean member(UUID player) { return MEMBERS.contains(player); }

    static int invitationCount() {
        long now = Util.getMillis();
        return (int) INVITES.entrySet().stream().filter(entry -> entry.getValue().expires() > now && PLAYERS.containsKey(entry.getKey())).count();
    }

    private static UUID firstInvitation() {
        long now = Util.getMillis();
        return INVITES.entrySet().stream().filter(entry -> entry.getValue().expires() > now && PLAYERS.containsKey(entry.getKey()))
                .map(Map.Entry::getKey).findFirst().orElse(null);
    }

    private static void openList(UUID player) {
        closeMenu();
        if (leave != null) leave.setFocused(false);
        PLAYER_LIST.setOpen(true, Util.getMillis());
        if (player != null) PLAYER_LIST.focus(player);
        else PLAYER_LIST.moveFocus(roster(), 1);
        SelectionSounds.CLICK.play();
    }

    static void renderPartyHeader(GuiGraphics graphics, int width, int y, int mouseX, int mouseY, float visibility, float slide) {
        var player = PLAYERS.get(leader);
        if (player == null) return;
        var font = Minecraft.getInstance().font;
        int leaveWidth = font.width(text("leave")) + 12;
        int textWidth = Math.min(156, Math.max(1, width - leaveWidth - 58));
        int left = (width - (22 + textWidth + 12 + leaveWidth)) / 2;
        int opacity = Math.max(4, Math.round(visibility * 255)) << 24;
        graphics.pose().pushPose();
        graphics.pose().translate(0, slide, 0);
        graphics.fill(left - 1, y - 1, left + 17, y + 17, opacity);
        face(graphics, player, left, y, 16, visibility);
        SelectionText.draw(graphics, font, fitLabel(font, text("leader_name", player.name()).getString(), textWidth), left + 22, y - 1, opacity | 0xffff55);
        SelectionText.draw(graphics, font, fitLabel(font, text("member_count", MEMBERS.size(), waitingSummary()).getString(), textWidth), left + 22, y + 10, opacity | 0xcccccc);
        int summaryWidth = 22 + textWidth + 12 + leaveWidth;
        var spawnSummary = spawnChoice();
        var ownKit = text("your_kit", kitChoice(self()));
        SelectionText.draw(graphics, font, fitLabel(font, spawnSummary.getString(), summaryWidth), left, y + 25, opacity | 0xf2cd83);
        SelectionText.draw(graphics, font, fitLabel(font, ownKit.getString(), summaryWidth), left, y + 36, opacity | 0xcccccc);
        graphics.flush();
        graphics.pose().popPose();
        int screenY = y + Math.round(slide);
        if (PLAYER_LIST.open() && visibility > 0.65F && mouseX >= left && mouseX < left + summaryWidth) {
            if (mouseY >= screenY + 25 && mouseY < screenY + 25 + font.lineHeight) summaryHovered = spawnSummary;
            if (mouseY >= screenY + 36 && mouseY < screenY + 36 + font.lineHeight) summaryHovered = ownKit;
        }
        if (PLAYER_LIST.open() && visibility > 0.65F && mouseX >= left - 1 && mouseX < left + 17 && mouseY >= screenY - 1 && mouseY < screenY + 17) {
            headerHovered = player;
            graphics.renderOutline(left - 2, screenY - 2, 20, 20, opacity | 0xffffff);
        }
        leave = control("leave", left + 22 + textWidth + 12, screenY - 2, leaveWidth, 21, text("leave"),
                PLAYER_LIST.open() && visibility > 0.65F, () -> action(HeritageNetwork.PartyAction.LEAVE, null, ""));
        leave.setAlpha(visibility);
        if (!PLAYER_LIST.keyboardFocused()) leave.setFocused(false);
    }

    private static String fitLabel(net.minecraft.client.gui.Font font, String label, int width) {
        return font.width(label) <= width ? label : font.plainSubstrByWidth(label, Math.max(0, width - font.width("..."))) + "...";
    }

    private static void renderInvitation(GuiGraphics graphics, int width, int mouseX, int mouseY, long now) {
        noticePlayer = null;
        if (PLAYER_LIST.active(now)) { noticeHovered = false; return; }
        var invitations = INVITES.entrySet().stream().filter(entry -> entry.getValue().expires() > now && PLAYERS.containsKey(entry.getKey())).toList();
        if (invitations.isEmpty()) { noticeHovered = false; return; }
        var invitation = invitations.getFirst();
        var player = PLAYERS.get(invitation.getKey());
        noticePlayer = player.id();
        noticeWidth = Math.min(152, width - 8);
        noticeX = width - noticeWidth - 4;
        noticeY = 32;
        boolean hover = overInvitation(mouseX, mouseY);
        if (hover && !noticeHovered) SelectionSounds.HOVER.play();
        noticeHovered = hover;
        graphics.pose().pushPose();
        graphics.pose().translate(noticeX, noticeY, 0);
        SelectionToasts.background(graphics, noticeWidth, INVITATION_NOTICE_HEIGHT, now - invitation.getValue().received());
        int portraitSize = 16;
        head(graphics, player, 7, (INVITATION_NOTICE_HEIGHT - portraitSize) / 2, portraitSize, false);
        var font = Minecraft.getInstance().font;
        int glyphHeight = font.lineHeight - 2;
        int lineSpacing = font.lineHeight + 2;
        int textY = (INVITATION_NOTICE_HEIGHT - glyphHeight - lineSpacing) / 2;
        SelectionText.draw(graphics, font, fitLabel(font, player.name(), noticeWidth - 36), 29, textY, 0xffffff55);
        SelectionText.draw(graphics, font, text("invite_toast", (invitation.getValue().expires() - now + 999) / 1000), 29, textY + lineSpacing, 0xffbbbbbb);
        graphics.flush();
        graphics.pose().popPose();
    }

    private static boolean overInvitation(double x, double y) {
        var invite = INVITES.get(noticePlayer);
        return invite != null && invite.expires() > Util.getMillis() && PLAYERS.containsKey(noticePlayer) && x >= noticeX && x < noticeX + noticeWidth && y >= noticeY && y < noticeY + INVITATION_NOTICE_HEIGHT;
    }

    static Component playerCount(int count) { return text(count == 1 ? "player_count_single" : "player_count", count); }

    private static void renderScreen(ScreenEvent.Render.Post event) {
        if (!overlay(event.getScreen()) || KitSelection.capturingPreview()) return;
        render(event.getGuiGraphics(), event.getScreen().width, event.getScreen().height, event.getMouseX(), event.getMouseY());
    }

    static void render(GuiGraphics graphics, int width, int height, int mouseX, int mouseY) {
        var minecraft = Minecraft.getInstance();
        long now = Util.getMillis();
        CONTROLS.clear();
        headerHovered = null;
        summaryHovered = null;
        leave = null;
        graphics.flush();
        graphics.pose().pushPose();
        graphics.pose().translate(0, 0, 1200);
        if (minecraft.screen instanceof SpawnSelectScreen selection && !SelectionTransition.active()) {
            for (var marker : cursorMarkers(selection, now)) {
                int x = marker.x, y = marker.y;
                RenderSystem.enableBlend();
                RenderSystem.defaultBlendFunc();
                graphics.blit(CROSSHAIR, x - 7, y - 7, 0, 0, 15, 15, 15, 15);
                RenderSystem.disableBlend();
                head(graphics, marker.player, x + 5, y + 5, 8, false);
            }
        }
        renderInvitation(graphics, width, mouseX, mouseY, now);
        if (!peers.isEmpty()) {
            PLAYER_LIST.render(graphics, width, height, roster(), mouseX, mouseY);
            PLAYER_LIST.renderTrigger(graphics, peers, mouseX, mouseY);
        } else PLAYER_LIST.reset();
        BUTTONS.values().removeIf(button -> !CONTROLS.contains(button));
        for (var button : CONTROLS) button.render(graphics, menuPlayer == null ? mouseX : -10000, menuPlayer == null ? mouseY : -10000, 0);
        hovered = PLAYER_LIST.open() ? PLAYER_LIST.selected() : null;
        if (menuPlayer != null) {
            var player = PLAYERS.get(menuPlayer);
            if (player != null) {
                var header = layoutMenu(player);
                int menuHeight = menuY - menuTop + MENU.size() * (minecraft.font.lineHeight + 1) - 2;
                graphics.flush();
                graphics.pose().pushPose();
                graphics.pose().translate(0, 0, 400);
                TooltipRenderUtil.renderTooltipBackground(graphics, menuX, menuTop, menuWidth, menuHeight, 0);
                int y = menuTop;
                for (int index = 0; index < header.size(); index++) {
                    graphics.drawString(minecraft.font, header.get(index), menuX, y, 0xffffffff);
                    y += minecraft.font.lineHeight + 1 + (index == 0 ? 2 : 0);
                }
                for (var button : MENU) button.render(graphics, mouseX, mouseY, 0);
                graphics.flush();
                graphics.pose().popPose();
            }
        } else if (!peers.isEmpty() && PLAYER_LIST.overTrigger(mouseX, mouseY)) {
            var lines = new ArrayList<Component>();
            lines.add(playerCount(peers.size()).copy().withStyle(ChatFormatting.YELLOW));
            if (grouped()) lines.add(waitingSummary().copy().withStyle(ChatFormatting.GRAY));
            int invitations = invitationCount();
            if (invitations > 0) lines.add(text(invitations == 1 ? "invitation_single" : "invitations", invitations).copy().withStyle(ChatFormatting.GOLD));
            lines.add(text("list_hint", minecraft.options.keyPlayerList.getTranslatedKeyMessage()).copy().withStyle(ChatFormatting.GRAY));
            graphics.renderComponentTooltip(minecraft.font, lines, mouseX, mouseY);
        } else if (overInvitation(mouseX, mouseY)) {
            graphics.renderTooltip(minecraft.font, text("invitation_hint", minecraft.options.keyPlayerList.getTranslatedKeyMessage()), mouseX, mouseY);
        } else if (leave != null && leave.isHoveredOrFocused()) {
            graphics.renderTooltip(minecraft.font, text(follower() ? "leave_hint" : "leave_leader_hint"),
                    leave.isFocused() ? leave.getX() : mouseX, leave.isFocused() ? leave.getY() : mouseY);
        } else if (summaryHovered != null) {
            graphics.renderTooltip(minecraft.font, summaryHovered, mouseX, mouseY);
        } else if (headerHovered != null) {
            graphics.renderComponentTooltip(minecraft.font, playerInfo(headerHovered), mouseX, mouseY);
        } else if (hovered != null) {
            var player = PLAYERS.get(hovered);
            if (player != null) graphics.renderComponentTooltip(minecraft.font, playerTooltip(player),
                    PLAYER_LIST.keyboardFocused() ? PLAYER_LIST.menuX() : mouseX,
                    PLAYER_LIST.keyboardFocused() ? PLAYER_LIST.menuY() : mouseY);
        } else if (minecraft.screen instanceof SpawnSelectScreen selection && selection.overSuggestion(mouseX, mouseY)) {
            graphics.renderTooltip(minecraft.font, text("suggestion_jump"), mouseX, mouseY);
        } else if (minecraft.screen instanceof SpawnSelectScreen selection) {
            var player = hoveredName(selection, mouseX, mouseY);
            if (player != null) graphics.renderTooltip(minecraft.font, Component.literal(player.name()).withStyle(ChatFormatting.YELLOW), mouseX, mouseY);
        }
        graphics.flush();
        graphics.pose().popPose();
    }

    private static Button control(String key, int x, int y, int width, int height, Component text, boolean active, Runnable action) {
        var button = BUTTONS.computeIfAbsent(key, ignored ->
                new SelectionControls.SoundButton(x, y, width, height, text, pressed -> action.run()));
        button.setPosition(x, y);
        button.setWidth(width);
        button.setHeight(height);
        button.active = active;
        CONTROLS.add(button);
        return button;
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
        if (!overlay(event.getScreen())) return;
        double x = event.getMouseX(), y = event.getMouseY();
        int button = event.getButton();
        if (button == 0 && !blocksInput() && !SelectionTransition.active() && overInvitation(x, y)) {
            openList(noticePlayer);
            event.setCanceled(true);
            return;
        }
        if (!peers.isEmpty() && button == 0 && PLAYER_LIST.overTrigger(x, y)) {
            closeMenu();
            if (PLAYER_LIST.open()) {
                PLAYER_LIST.setOpen(false, Util.getMillis());
                SelectionSounds.CLICK.play();
            } else openList(firstInvitation());
            event.setCanceled(true);
            return;
        }
        if (menuPlayer != null) {
            for (var control : List.copyOf(MENU)) if (control.mouseClicked(x, y, button)) {
                event.setCanceled(true);
                return;
            }
            closeMenu();
            event.setCanceled(true);
            return;
        }
        if (PLAYER_LIST.active(Util.getMillis())) {
            if (PLAYER_LIST.open() && button == 0 && leave != null && leave.mouseClicked(x, y, button)) {
                event.setCanceled(true);
                return;
            }
            if (PLAYER_LIST.clickPageArrow(x, y, button)) {
                event.setCanceled(true);
                return;
            }
            UUID player = PLAYER_LIST.open() ? PLAYER_LIST.hit(x, y) : null;
            if (player != null && (button == 0 || button == 1)) openMenu(player, (int) x + 12, (int) y - 12, false);
            else if (button == 0 && PLAYER_LIST.open()) {
                PLAYER_LIST.setOpen(false, Util.getMillis());
                SelectionSounds.CLICK.play();
            }
            event.setCanceled(true);
            return;
        }
    }

    private static void closeMenu() {
        MENU.clear();
        menuPlayer = null;
    }

    private static void openMenu(UUID id, int x, int y, boolean keyboard) {
        var player = PLAYERS.get(id);
        if (player == null) return;
        closeMenu();
        menuPlayer = id;
        menuX = x;
        menuTop = y;
        refreshMenu();
        layoutMenu(player);
        if (keyboard) for (var button : MENU) if (button.active) {
            button.setFocused(true);
            break;
        }
        SelectionSounds.CLICK.play();
    }

    private static List<Component> playerInfo(Peer player) {
        var lines = new ArrayList<Component>();
        lines.add(Component.literal(player.name()).withStyle(member(player.id()) ? ChatFormatting.YELLOW : ChatFormatting.WHITE));
        lines.add(text("stage_" + player.stage()).copy().withStyle(ChatFormatting.GRAY));
        if (member(player.id())) lines.add(text("kit_choice", kitChoice(player.id())).copy().withStyle(ChatFormatting.GRAY));
        if (player.id().equals(self())) lines.add(text("you").copy().withStyle(ChatFormatting.GRAY));
        if (player.id().equals(leader)) lines.add(text("leader").copy().withStyle(ChatFormatting.GOLD));
        else if (MEMBERS.contains(player.id())) lines.add(text("member").copy().withStyle(ChatFormatting.GREEN));
        if (OUTGOING.contains(player.id())) lines.add(text("invited").copy().withStyle(ChatFormatting.GRAY));
        var invite = INVITES.get(player.id());
        if (invite != null && invite.expires() > Util.getMillis()) lines.add(text("invite_toast",
                (invite.expires() - Util.getMillis() + 999) / 1000).copy().withStyle(ChatFormatting.GRAY));
        return lines;
    }

    private static List<Component> playerTooltip(Peer player) {
        var lines = new ArrayList<>(playerInfo(player));
        lines.add(text(member(player.id()) ? "details" : "more").copy().withStyle(ChatFormatting.GRAY, ChatFormatting.ITALIC));
        return lines;
    }

    private static List<Component> layoutMenu(Peer player) {
        var header = playerInfo(player);
        var minecraft = Minecraft.getInstance();
        int lineHeight = minecraft.font.lineHeight + 1;
        menuWidth = header.stream().mapToInt(minecraft.font::width).max().orElse(1);
        for (var button : MENU) menuWidth = Math.max(menuWidth, minecraft.font.width(button.getMessage()));
        int headerHeight = header.size() * lineHeight + 2;
        int gap = MENU.isEmpty() ? 0 : 3;
        int height = headerHeight + gap + MENU.size() * lineHeight - 2;
        menuX = Mth.clamp(menuX, 4, Math.max(4, minecraft.screen.width - menuWidth - 4));
        menuTop = Mth.clamp(menuTop, 4, Math.max(4, minecraft.screen.height - height - 4));
        menuY = menuTop + headerHeight + gap;
        for (int index = 0; index < MENU.size(); index++) {
            var button = MENU.get(index);
            button.setPosition(menuX, menuY + index * lineHeight);
            button.setWidth(menuWidth);
            button.setHeight(lineHeight);
        }
        return header;
    }

    private static void refreshMenu() {
        var player = PLAYERS.get(menuPlayer);
        if (player == null) {
            MENU.clear();
            menuPlayer = null;
            return;
        }
        if (member(player.id())) {
            MENU.clear();
            return;
        }
        var invitation = INVITES.get(player.id());
        boolean incoming = invitation != null && invitation.expires() > Util.getMillis();
        boolean outgoing = OUTGOING.contains(player.id());
        var self = PLAYERS.get(self());
        boolean available = self != null && self.stage() == 0 && !follower() && spawn.isEmpty() && player.stage() == 0
                && !MEMBERS.contains(player.id()) && MEMBERS.size() < 8 && !outgoing && player.available()
                && (HeritageScreens.finished() || HeritageScreens.placement() == HeritageScreens.Placement.BEFORE_SPAWN);
        Component label = text(player.id().equals(self()) ? "you" : incoming ? "join" : outgoing ? "invited" : "invite");
        boolean active = incoming ? self != null && self.stage() == 0 && !grouped() && player.stage() == 0 : available;
        if (MENU.size() == (incoming ? 2 : 1) && MENU.getFirst().getMessage().equals(label) && MENU.getFirst().active == active) return;
        int focused = -1;
        for (int index = 0; index < MENU.size(); index++) if (MENU.get(index).isFocused()) focused = index;
        MENU.clear();
        if (incoming) {
            menuButton(label, active, () -> respond(player.id(), true));
            menuButton(text("decline"), true, () -> respond(player.id(), false));
        } else {
            menuButton(label, active, () -> {
                action(HeritageNetwork.PartyAction.INVITE, player.id(), "");
                MENU.clear();
                menuPlayer = null;
            });
        }
        if (focused >= 0) MENU.get(Math.min(focused, MENU.size() - 1)).setFocused(true);
    }

    private static void menuButton(Component text, boolean active, Runnable action) {
        var button = new SelectionControls.SoundButton(menuX, menuY + MENU.size() * 14, menuWidth, 14, text, ignored -> action.run()) {
            private boolean highlighted;

            @Override
            protected void renderWidget(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
                boolean highlight = active && isHoveredOrFocused();
                if (highlight && !highlighted) SelectionSounds.HOVER.play();
                highlighted = highlight;
                graphics.drawString(Minecraft.getInstance().font, getMessage(), getX(), getY(),
                        active ? highlight ? 0xffffff55 : 0xffffffff : 0xff888888);
            }
        };
        button.active = active;
        MENU.add(button);
    }

    static int nextMenuFocus(List<Boolean> active, int current, int direction) {
        int start = current < 0 && direction < 0 ? 0 : current;
        for (int step = 1; step <= active.size(); step++) {
            int index = Math.floorMod(start + step * direction, active.size());
            if (active.get(index)) return index;
        }
        return -1;
    }

    private static void key(ScreenEvent.KeyPressed.Pre event) {
        if (!overlay(event.getScreen())) return;
        int key = event.getKeyCode();
        if (menuPlayer != null) {
            if (key == org.lwjgl.glfw.GLFW.GLFW_KEY_ESCAPE) {
                closeMenu();
                SelectionSounds.CLICK.play();
            } else if (key == org.lwjgl.glfw.GLFW.GLFW_KEY_DOWN || key == org.lwjgl.glfw.GLFW.GLFW_KEY_UP
                    || key == org.lwjgl.glfw.GLFW.GLFW_KEY_TAB) {
                int current = -1;
                for (int i = 0; i < MENU.size(); i++) if (MENU.get(i).isFocused()) current = i;
                int direction = key == org.lwjgl.glfw.GLFW.GLFW_KEY_UP
                        || key == org.lwjgl.glfw.GLFW.GLFW_KEY_TAB && (event.getModifiers() & org.lwjgl.glfw.GLFW.GLFW_MOD_SHIFT) != 0 ? -1 : 1;
                int next = nextMenuFocus(MENU.stream().map(button -> button.active).toList(), current, direction);
                if (next >= 0) {
                    for (var button : MENU) button.setFocused(false);
                    MENU.get(next).setFocused(true);
                }
            } else if (key == org.lwjgl.glfw.GLFW.GLFW_KEY_ENTER || key == org.lwjgl.glfw.GLFW.GLFW_KEY_SPACE) {
                for (var button : List.copyOf(MENU)) if (button.isFocused() && button.active) {
                    button.playDownSound(Minecraft.getInstance().getSoundManager());
                    button.onPress();
                    break;
                }
            }
            event.setCanceled(true);
            return;
        }
        if (!PLAYER_LIST.open() && !peers.isEmpty()
                && Minecraft.getInstance().options.keyPlayerList.matches(key, event.getScanCode())) {
            openList(firstInvitation());
            event.setCanceled(true);
            return;
        }
        if (!PLAYER_LIST.active(Util.getMillis())) return;
        if (key == org.lwjgl.glfw.GLFW.GLFW_KEY_ESCAPE) {
            PLAYER_LIST.setOpen(false, Util.getMillis());
            SelectionSounds.CLICK.play();
        } else if (PLAYER_LIST.open()) {
            if (leave != null && leave.isFocused()) {
                if (key == org.lwjgl.glfw.GLFW.GLFW_KEY_ENTER || key == org.lwjgl.glfw.GLFW.GLFW_KEY_SPACE) {
                    leave.playDownSound(Minecraft.getInstance().getSoundManager());
                    leave.onPress();
                } else if (key == org.lwjgl.glfw.GLFW.GLFW_KEY_TAB || key == org.lwjgl.glfw.GLFW.GLFW_KEY_LEFT
                        || key == org.lwjgl.glfw.GLFW.GLFW_KEY_RIGHT || key == org.lwjgl.glfw.GLFW.GLFW_KEY_UP || key == org.lwjgl.glfw.GLFW.GLFW_KEY_DOWN) {
                    boolean reverse = key == org.lwjgl.glfw.GLFW.GLFW_KEY_UP || key == org.lwjgl.glfw.GLFW.GLFW_KEY_LEFT
                            || key == org.lwjgl.glfw.GLFW.GLFW_KEY_TAB && (event.getModifiers() & org.lwjgl.glfw.GLFW.GLFW_MOD_SHIFT) != 0;
                    leave.setFocused(false);
                    PLAYER_LIST.focus(reverse ? roster().getLast().id() : roster().getFirst().id());
                    SelectionSounds.HOVER.play();
                }
                event.setCanceled(true);
                return;
            }
            int direction = key == org.lwjgl.glfw.GLFW.GLFW_KEY_LEFT ? -1
                    : key == org.lwjgl.glfw.GLFW.GLFW_KEY_RIGHT ? 1
                    : key == org.lwjgl.glfw.GLFW.GLFW_KEY_UP ? -PLAYER_LIST.columns()
                    : key == org.lwjgl.glfw.GLFW.GLFW_KEY_DOWN ? PLAYER_LIST.columns()
                    : key == org.lwjgl.glfw.GLFW.GLFW_KEY_TAB
                    ? (event.getModifiers() & org.lwjgl.glfw.GLFW.GLFW_MOD_SHIFT) != 0 ? -1 : 1 : 0;
            if (direction != 0) {
                if (key == org.lwjgl.glfw.GLFW.GLFW_KEY_TAB && leave != null
                        && PLAYER_LIST.focused().equals((direction > 0 ? roster().getLast() : roster().getFirst()).id())) {
                    leave.setFocused(true);
                    PLAYER_LIST.focusHeader();
                } else PLAYER_LIST.moveFocus(roster(), direction);
                SelectionSounds.HOVER.play();
            } else if (key == org.lwjgl.glfw.GLFW.GLFW_KEY_PAGE_UP || key == org.lwjgl.glfw.GLFW.GLFW_KEY_PAGE_DOWN) {
                PLAYER_LIST.changePage(roster(), key == org.lwjgl.glfw.GLFW.GLFW_KEY_PAGE_UP ? -1 : 1);
                SelectionSounds.HOVER.play();
            } else if ((key == org.lwjgl.glfw.GLFW.GLFW_KEY_ENTER || key == org.lwjgl.glfw.GLFW.GLFW_KEY_SPACE)
                    && PLAYER_LIST.focused() != null) {
                openMenu(PLAYER_LIST.focused(), PLAYER_LIST.menuX(), PLAYER_LIST.menuY(), true);
            }
        }
        event.setCanceled(true);
    }

    private static void scroll(ScreenEvent.MouseScrolled.Pre event) {
        if (!overlay(event.getScreen()) || !PLAYER_LIST.active(Util.getMillis())) return;
        if (PLAYER_LIST.open() && menuPlayer == null && event.getScrollDeltaY() != 0) {
            if (leave != null) leave.setFocused(false);
            if (PLAYER_LIST.scroll(roster(), event.getScrollDeltaY())) SelectionSounds.HOVER.play();
        }
        event.setCanceled(true);
    }
}

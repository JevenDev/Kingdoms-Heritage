package com.jvn.kingdomsheritage.client;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import net.minecraft.Util;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.components.Button;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;

final class PartyPlayerList {
    private static final int BACKGROUND_OPACITY = 104;
    private static final float RESPONSE = 14;
    private static final ResourceLocation TAB = texture("tab_button");
    private static final ResourceLocation SELECTED = texture("tab_button_selected");
    private final PartyListBlur blur = new PartyListBlur();
    private final List<Cell> cells = new ArrayList<>();
    private boolean open;
    private float from;
    private float velocity;
    private float slide;
    private long changed;
    private UUID focused;
    private UUID hovered;
    private boolean keyboard;
    private boolean headerFocused;
    private boolean triggerHovered;
    private int lastMouseX = -1;
    private int lastMouseY = -1;
    private int columns = 1;
    private int capacity = 1;
    private int rowHeight = 56;
    private int page;
    private double scrollRemainder;
    private Button previousPage;
    private Button nextPage;
    private Button hoveredPageArrow;
    private List<ClientParty.Peer> pagePlayers = List.of();

    private record Cell(ClientParty.Peer player, int x, int y) {}

    private static ResourceLocation texture(String name) {
        return ResourceLocation.fromNamespaceAndPath("kingdomsheritage", "textures/gui/selection/" + name + ".png");
    }

    void setOpen(boolean open, long now) {
        if (this.open == open) return;
        var current = motion(now);
        from = current.position;
        velocity = current.velocity;
        this.open = open;
        changed = now;
        hovered = null;
    }

    boolean open() { return open; }
    boolean active(long now) { return open || visibility(now) > 0.001F; }
    UUID focused() { return focused; }

    float visibility(long now) { return Mth.clamp(motion(now).position, 0, 1); }

    private Motion motion(long now) {
        float target = open ? 1 : 0;
        float elapsed = Math.max(0, (now - changed) / 1000F);
        float offset = from - target;
        float coefficient = velocity + RESPONSE * offset;
        float decay = (float) Math.exp(-RESPONSE * elapsed);
        float position = target + (offset + coefficient * elapsed) * decay;
        float speed = (velocity - RESPONSE * coefficient * elapsed) * decay;
        if (Math.abs(position - target) < 0.001F && Math.abs(speed) < 0.02F) return new Motion(target, 0);
        return new Motion(position, speed);
    }

    private record Motion(float position, float velocity) {}

    void reset() {
        open = false;
        from = velocity = slide = 0;
        changed = 0;
        focused = hovered = null;
        headerFocused = false;
        lastMouseX = lastMouseY = -1;
        cells.clear();
        pagePlayers = List.of();
        hoveredPageArrow = null;
        if (previousPage != null) previousPage.visible = nextPage.visible = false;
        page = 0;
        scrollRemainder = 0;
        triggerHovered = false;
        blur.close();
    }

    void closeBlur() { blur.reload(); }

    void focus(UUID player) {
        focused = player;
        keyboard = true;
        headerFocused = false;
    }

    void focusHeader() { keyboard = headerFocused = true; }

    void moveFocus(List<ClientParty.Peer> players, int direction) {
        if (players.isEmpty()) { focused = null; return; }
        int index = -1;
        for (int i = 0; i < players.size(); i++) if (players.get(i).id().equals(focused)) index = i;
        int next = index < 0 ? direction < 0 ? players.size() - 1 : 0 : Math.floorMod(index + direction, players.size());
        focus(players.get(next).id());
        page = next / capacity;
        keyboard = true;
    }

    void changePage(List<ClientParty.Peer> players, int direction) {
        int next = Mth.clamp(page + direction, 0, Math.max(0, (players.size() - 1) / capacity));
        if (next == page) return;
        page = next;
        focus(players.get(page * capacity).id());
        keyboard = true;
    }

    boolean scroll(List<ClientParty.Peer> players, double delta) {
        if (players.isEmpty() || delta == 0) return false;
        if (Math.signum(delta) != Math.signum(scrollRemainder)) scrollRemainder = 0;
        scrollRemainder += delta;
        int steps = (int) scrollRemainder;
        scrollRemainder -= steps;
        int previous = page;
        changePage(players, -steps);
        keyboard = false;
        return page != previous;
    }

    int columns() { return columns; }

    UUID selected() { return keyboard ? headerFocused ? null : focused : hoveredPageArrow == null ? hovered : null; }
    boolean keyboardFocused() { return keyboard; }

    boolean clickPageArrow(double x, double y, int button) {
        if (!open || visibility(Util.getMillis()) < 0.65F || button != 0 || previousPage == null) return false;
        for (var arrow : List.of(previousPage, nextPage)) {
            if (overArrow(arrow, x, y)) {
                arrow.mouseClicked(x, y, button);
                keyboard = false;
                return true;
            }
        }
        return false;
    }

    private static boolean overArrow(Button arrow, double x, double y) {
        return arrow.visible && x >= arrow.getX() && x < arrow.getRight() && y >= arrow.getY()
                && y < arrow.getY() + arrow.getHeight();
    }

    UUID hit(double x, double y) {
        y -= slide;
        for (var cell : cells) {
            if (x >= cell.x && x < cell.x + 64 && y >= cell.y && y < cell.y + rowHeight - 6) return cell.player.id();
        }
        return null;
    }

    int menuX() {
        for (var cell : cells) if (cell.player.id().equals(focused)) return cell.x + 48;
        return 24;
    }

    int menuY() {
        for (var cell : cells) if (cell.player.id().equals(focused)) return cell.y + 16 + Math.round(slide);
        return 40;
    }

    boolean overTrigger(double x, double y) {
        return x >= 5 && x < 69 && y >= (ClientParty.invitationCount() > 0 ? 3 : 6) && y < 28;
    }

    void renderTrigger(GuiGraphics graphics, List<ClientParty.Peer> others, int mouseX, int mouseY) {
        if (others.isEmpty()) return;
        boolean hover = overTrigger(mouseX, mouseY);
        if (hover && !triggerHovered) SelectionSounds.HOVER.play();
        triggerHovered = hover;
        long now = Util.getMillis();
        int index = (int) ((now / 3000) % others.size());
        float blend = Mth.clamp((now % 3000) / 240F, 0, 1);
        blend = blend * blend * (3 - 2 * blend);
        var previous = others.get(Math.floorMod(index - 1, others.size()));
        var current = others.get(index);
        graphics.fill(7, 8, 25, 26, 0xff000000);
        float memberOpacity = Mth.lerp(blend, ClientParty.member(previous.id()) ? 1 : 0, ClientParty.member(current.id()) ? 1 : 0);
        if (memberOpacity > 0) graphics.renderOutline(6, 7, 20, 20, Math.round(memberOpacity * 255) << 24 | 0xffff55);
        if (hover) graphics.renderOutline(5, 6, 22, 22, 0xffffffff);
        ClientParty.face(graphics, previous, 8, 9, 16, 1);
        ClientParty.face(graphics, current, 8, 9, 16, blend);
        graphics.blit(hover || open ? SELECTED : TAB, 28, 8, 0, 0, 41, 19, 41, 19);
        int invitations = ClientParty.invitationCount();
        if (invitations > 0) {
            var font = Minecraft.getInstance().font;
            String count = Integer.toString(invitations);
            graphics.pose().pushPose();
            graphics.pose().translate(0, 0, 1);
            SelectionText.draw(graphics, font, count, 25 - font.width(count), 8 - font.lineHeight / 2, 0xffffff55);
            graphics.pose().popPose();
        }
    }

    static String playerLabel(Font font, String name) {
        return font.width(name) <= 60 ? name : font.plainSubstrByWidth(name, 60 - font.width("...")) + "...";
    }

    private void renderPageArrows(GuiGraphics graphics, int width, int y, int mouseX, int mouseY, float visibility) {
        if (previousPage == null) {
            previousPage = SelectionControls.arrow(0, 0, false, Component.translatable("spectatorMenu.previous_page"),
                    button -> changePage(pagePlayers, -1));
            nextPage = SelectionControls.arrow(0, 0, true, Component.translatable("spectatorMenu.next_page"),
                    button -> changePage(pagePlayers, 1));
            previousPage.setTooltip(null);
            nextPage.setTooltip(null);
            for (var arrow : List.of(previousPage, nextPage)) {
                arrow.setWidth(20);
                arrow.setHeight(20);
            }
        }
        var font = Minecraft.getInstance().font;
        String label = (page + 1) + " / " + ((pagePlayers.size() + capacity - 1) / capacity);
        int halfLabel = font.width(label) / 2;
        previousPage.setPosition(width / 2 - halfLabel - 28, y - 5);
        nextPage.setPosition(width / 2 + halfLabel + 8, y - 5);
        previousPage.active = open && page > 0;
        nextPage.active = open && (page + 1) * capacity < pagePlayers.size();
        previousPage.visible = nextPage.visible = true;
        Button hovered = null;
        for (var arrow : List.of(previousPage, nextPage)) {
            arrow.setAlpha(visibility);
            arrow.render(graphics, mouseX, mouseY, 0);
            if (overArrow(arrow, mouseX, mouseY)) hovered = arrow;
        }
        if (hovered != hoveredPageArrow && hovered != null && hovered.active) SelectionSounds.HOVER.play();
        hoveredPageArrow = hovered;
        if (hovered != null && !keyboard && !ClientParty.menuOpen() && visibility > 0.65F)
            graphics.renderTooltip(font, hovered.getMessage(), mouseX, mouseY);
    }

    private static void renderProgress(GuiGraphics graphics, ClientParty.Peer player, int x, int y, int opacity) {
        graphics.fill(x, y, x + 11, y + 11, opacity);
        if (player.stage() == 4) {
            graphics.fill(x + 2, y + 5, x + 4, y + 7, opacity | 0x55ff55);
            graphics.fill(x + 4, y + 7, x + 6, y + 9, opacity | 0x55ff55);
            graphics.fill(x + 6, y + 5, x + 8, y + 7, opacity | 0x55ff55);
            graphics.fill(x + 8, y + 3, x + 10, y + 5, opacity | 0x55ff55);
        } else if (player.stage() == 2) {
            graphics.pose().pushPose();
            graphics.pose().translate(x + 5.5F, y + 5.5F, 0);
            graphics.pose().scale(0.4F, 0.4F, 1);
            LoadingIndicator.render(graphics, 0, 0, Util.getMillis(), opacity >>> 24);
            graphics.pose().popPose();
        } else {
            var font = Minecraft.getInstance().font;
            SelectionText.centered(graphics, font, Component.translatable("screen.kingdomsheritage.party_stage_short_" + player.stage()),
                    x + 6, y + 2, opacity | (player.stage() == 1 ? 0x55ffff : 0xffff55));
        }
    }

    void render(GuiGraphics graphics, int width, int height, List<ClientParty.Peer> players, int mouseX, int mouseY) {
        long now = Util.getMillis();
        float visibility = visibility(now);
        if (!active(now)) {
            cells.clear();
            blur.close();
            return;
        }
        if (players.isEmpty()) { reset(); return; }
        if (lastMouseX >= 0 && (mouseX != lastMouseX || mouseY != lastMouseY)) keyboard = headerFocused = false;
        lastMouseX = mouseX;
        lastMouseY = mouseY;
        blur.render(graphics, visibility);
        graphics.fill(0, 0, width, height, Math.round(BACKGROUND_OPACITY * visibility) << 24);
        columns = Math.max(1, Math.min(6, (width - 32) / 64));
        rowHeight = ClientParty.grouped() ? 68 : 56;
        int rows = Math.max(1, (height - (ClientParty.grouped() ? 160 : 104)) / rowHeight);
        capacity = columns * rows;
        int focusedIndex = -1;
        for (int i = 0; i < players.size(); i++) if (players.get(i).id().equals(focused)) focusedIndex = i;
        if (focusedIndex < 0) { focused = players.getFirst().id(); focusedIndex = 0; }
        page = Mth.clamp(focusedIndex / capacity, 0, (players.size() - 1) / capacity);
        int first = page * capacity;
        int last = Math.min(players.size(), first + capacity);
        int visibleColumns = Math.min(columns, last - first);
        int visibleRows = (last - first + columns - 1) / columns;
        int left = (width - visibleColumns * 64) / 2;
        int top = Math.max(ClientParty.grouped() ? 104 : 48, (height - visibleRows * rowHeight) / 2);
        slide = (1 - visibility) * 10;
        cells.clear();
        for (int index = first; index < last; index++) {
            int local = index - first;
            cells.add(new Cell(players.get(index), left + local % columns * 64, top + local / columns * rowHeight));
        }
        UUID nextHovered = open && visibility > 0.65F ? hit(mouseX, mouseY) : null;
        if (nextHovered != null && !nextHovered.equals(hovered)) SelectionSounds.HOVER.play();
        hovered = nextHovered;
        int opacity = Math.max(4, Math.round(visibility * 255)) << 24;
        var font = Minecraft.getInstance().font;
        graphics.pose().pushPose();
        graphics.pose().translate(0, slide, 0);
        SelectionText.centered(graphics, font, ClientParty.playerCount(players.size()), width / 2, top - 24, opacity | 0xffff55);
        for (var cell : cells) {
            int x = cell.x + 16;
            int y = cell.y;
            graphics.fill(x - 1, y - 1, x + 33, y + 33, opacity);
            boolean member = ClientParty.member(cell.player.id());
            if (member) graphics.renderOutline(x - 2, y - 2, 36, 36, opacity | 0xffff55);
            if (cell.player.id().equals(selected())) {
                int border = member ? 3 : 2;
                graphics.renderOutline(x - border, y - border, 32 + border * 2, 32 + border * 2, opacity | 0xffffff);
            }
            ClientParty.face(graphics, cell.player, x, y, 32, visibility);
            if (member) renderProgress(graphics, cell.player, x + 25, y + 25, opacity);
            SelectionText.centered(graphics, font, playerLabel(font, cell.player.name()), cell.x + 32, y + 38,
                    opacity | (member ? 0xffff55 : 0xffffff));
            if (member) SelectionText.centered(graphics, font, playerLabel(font, ClientParty.kitChoice(cell.player.id()).getString()),
                    cell.x + 32, y + 50, opacity | 0xcccccc);
        }
        if (players.size() > capacity) SelectionText.centered(graphics, font,
                Component.literal((page + 1) + " / " + ((players.size() + capacity - 1) / capacity)),
                width / 2, top + visibleRows * rowHeight + 2, opacity | 0xcccccc);
        SelectionText.centered(graphics, font, Component.translatable("screen.kingdomsheritage.party_list_controls"),
                width / 2, height - 24, opacity | 0xcccccc);
        graphics.flush();
        graphics.pose().popPose();
        if (ClientParty.grouped()) ClientParty.renderPartyHeader(graphics, width, top - 78, mouseX, mouseY, visibility, slide);
        pagePlayers = players;
        if (players.size() > capacity) {
            renderPageArrows(graphics, width, top + visibleRows * rowHeight + 2 + Math.round(slide), mouseX, mouseY, visibility);
        } else {
            hoveredPageArrow = null;
            if (previousPage != null) previousPage.visible = nextPage.visible = false;
        }
    }
}

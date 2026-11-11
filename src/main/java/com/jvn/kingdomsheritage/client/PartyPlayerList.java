package com.jvn.kingdomsheritage.client;

import com.jvn.kingdomsheritage.network.HeritageNetwork;
import com.mojang.blaze3d.systems.RenderSystem;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import net.minecraft.Util;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;

final class PartyPlayerList {
    private static final float BACKDROP_OPACITY = 0.94F;
    private static final int PORTRAIT_SIZE = 24;
    private static final int GRID_STEP = 36;
    private static final float RESPONSE = 14;
    private static final ResourceLocation TAB = texture("tab_button");
    private static final ResourceLocation SELECTED = texture("tab_button_selected");
    private static final ResourceLocation EMPTY_SLOT = texture("empty_slot");
    private final PartyListBlur blur = new PartyListBlur();
    private final List<Cell> cells = new ArrayList<>();
    private final List<EmptySlot> emptySlots = new ArrayList<>();
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
    private int page;
    private double scrollRemainder;
    private Button previousPage;
    private Button nextPage;
    private Button hoveredPageArrow;
    private List<ClientParty.Peer> pagePlayers = List.of();

    private record Cell(ClientParty.Peer player, int x, int y, boolean party) {}
    private record EmptySlot(int x, int y) {}

    private static boolean overPortrait(double mouseX, double mouseY, int x, int y) {
        return mouseX >= x - 1 && mouseX < x + PORTRAIT_SIZE + 1 && mouseY >= y - 1 && mouseY < y + PORTRAIT_SIZE + 1;
    }

    private int portraitX(int center, int index, int count) {
        int rowSize = Math.min(columns, count - index / columns * columns);
        return center - (PORTRAIT_SIZE + (rowSize - 1) * GRID_STEP) / 2 + index % columns * GRID_STEP;
    }

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
        emptySlots.clear();
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
        keyboard = player != null;
        headerFocused = false;
    }

    void focusHeader() { keyboard = headerFocused = true; }

    void moveFocus(List<ClientParty.Peer> players, int direction) {
        if (players.isEmpty()) { focused = null; return; }
        int index = indexOf(players, focused);
        int next = index < 0 ? direction < 0 ? players.size() - 1 : 0 : Math.floorMod(index + direction, players.size());
        focus(players.get(next).id());
        int otherIndex = indexOf(pagePlayers, focused);
        if (otherIndex >= 0) page = otherIndex / capacity;
    }

    void moveVertical(List<ClientParty.Peer> players, int direction) {
        int index = indexOf(players, focused);
        int next = index + direction * columns;
        if (index >= 0 && next >= 0 && next < players.size()) moveFocus(players, next - index);
    }

    private static int indexOf(List<ClientParty.Peer> players, UUID id) {
        for (int i = 0; i < players.size(); i++) if (players.get(i).id().equals(id)) return i;
        return -1;
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
            if (overPortrait(x, y, cell.x, cell.y)) return cell.player.id();
        }
        return null;
    }

    boolean overEmptySlot(double x, double y) {
        if (!open || visibility(Util.getMillis()) < 0.65F) return false;
        for (var slot : emptySlots) if (overPortrait(x, y - slide, slot.x, slot.y)) return true;
        return false;
    }

    int menuX() {
        for (var cell : cells) if (cell.player.id().equals(focused)) return cell.x + PORTRAIT_SIZE + 5;
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

    private void renderPageArrows(GuiGraphics graphics, int center, int y, int mouseX, int mouseY, float visibility) {
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
        previousPage.setPosition(center - halfLabel - 28, y - 5);
        nextPage.setPosition(center + halfLabel + 8, y - 5);
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
        } else {
            var font = Minecraft.getInstance().font;
            SelectionText.centered(graphics, font, Component.translatable("screen.kingdomsheritage.party_stage_short_" + player.stage()),
                    x + 6, y + 2, opacity | (player.stage() == 1 ? 0x55ffff : 0xffff55));
        }
    }

    private void renderCell(GuiGraphics graphics, Cell cell, float visibility, int opacity) {
        int x = cell.x;
        int y = cell.y;
        boolean loading = cell.player.stage() == HeritageParty.Stage.LOADING.ordinal();
        ClientParty.head(graphics, cell.player, x, y, PORTRAIT_SIZE, loading, visibility);
        if (cell.party) {
            int color = ClientParty.partyPortraitColor(cell.player.id());
            graphics.renderOutline(x - 1, y - 1, PORTRAIT_SIZE + 2, PORTRAIT_SIZE + 2, opacity | color);
            if (!loading) renderProgress(graphics, cell.player, x + PORTRAIT_SIZE - 12, y + PORTRAIT_SIZE - 12, opacity);
        }
        if (cell.player.id().equals(selected()))
            graphics.renderOutline(x - 2, y - 2, PORTRAIT_SIZE + 4, PORTRAIT_SIZE + 4, opacity | 0xffffff);
    }

    void render(GuiGraphics graphics, int width, int height, List<ClientParty.Peer> players, int mouseX, int mouseY) {
        long now = Util.getMillis();
        float visibility = visibility(now);
        if (!active(now)) {
            cells.clear();
            emptySlots.clear();
            blur.close();
            return;
        }
        if (players.isEmpty()) { reset(); return; }
        if (lastMouseX >= 0 && (mouseX != lastMouseX || mouseY != lastMouseY)) keyboard = headerFocused = false;
        lastMouseX = mouseX;
        lastMouseY = mouseY;
        blur.render(graphics, visibility);
        SelectionBackground.render(graphics, width, height, BACKDROP_OPACITY * visibility);

        int top = Math.max(32, (height - 192) / 2);
        int sectionWidth = Math.max(1, (Math.min(width - 24, 372) - 14) / 2);
        int partyCenter = (width - sectionWidth - 14) / 2;
        int otherCenter = width - partyCenter;
        int gridY = top + 20;
        slide = (1 - visibility) * 10;

        var partyPlayers = players.stream().filter(player -> ClientParty.onPartySide(player.id())).toList();
        pagePlayers = players.stream().filter(player -> !ClientParty.onPartySide(player.id())).toList();
        columns = Mth.clamp((sectionWidth + GRID_STEP - PORTRAIT_SIZE - 4) / GRID_STEP, 1, 4);
        int rows = Mth.clamp((height - gridY - 76) / GRID_STEP, 1, 3);
        capacity = columns * rows;
        if (focused != null && indexOf(players, focused) < 0) focus(null);
        int focusedIndex = indexOf(pagePlayers, focused);
        if (focusedIndex >= 0) page = focusedIndex / capacity;
        page = Mth.clamp(page, 0, Math.max(0, (pagePlayers.size() - 1) / capacity));
        int first = page * capacity;
        int last = Math.min(pagePlayers.size(), first + capacity);

        cells.clear();
        emptySlots.clear();
        int slotCount = HeritageNetwork.MAX_PARTY_SIZE;
        for (int index = 0; index < slotCount; index++) {
            int x = portraitX(partyCenter, index, slotCount);
            int y = gridY + index / columns * GRID_STEP;
            if (index < partyPlayers.size()) cells.add(new Cell(partyPlayers.get(index), x, y, true));
            else emptySlots.add(new EmptySlot(x, y));
        }
        for (int index = first; index < last; index++) {
            int local = index - first;
            cells.add(new Cell(pagePlayers.get(index), portraitX(otherCenter, local, last - first),
                    gridY + local / columns * GRID_STEP, false));
        }

        UUID nextHovered = open && visibility > 0.65F ? hit(mouseX, mouseY) : null;
        if (nextHovered != null && !nextHovered.equals(hovered)) SelectionSounds.HOVER.play();
        hovered = nextHovered;
        int opacity = Math.max(4, Math.round(visibility * 255)) << 24;
        var font = Minecraft.getInstance().font;
        graphics.pose().pushPose();
        graphics.pose().translate(0, slide, 0);
        SelectionText.centered(graphics, font, Component.translatable("screen.kingdomsheritage.party_other_players"),
                otherCenter, top, opacity | 0xf4f1e8);
        if (pagePlayers.isEmpty()) SelectionText.centered(graphics, font, Component.translatable("screen.kingdomsheritage.party_no_other_players"),
                otherCenter, gridY, opacity | 0xaaaaaa);
        graphics.setColor(1, 1, 1, visibility);
        RenderSystem.enableBlend();
        RenderSystem.defaultBlendFunc();
        for (var slot : emptySlots) {
            graphics.blit(EMPTY_SLOT, slot.x - 1, slot.y - 1, PORTRAIT_SIZE + 2, PORTRAIT_SIZE + 2, 0, 0, 32, 32, 32, 32);
        }
        RenderSystem.disableBlend();
        graphics.setColor(1, 1, 1, 1);
        for (var cell : cells) renderCell(graphics, cell, visibility, opacity);
        int pageY = gridY + rows * GRID_STEP + 2;
        boolean paged = pagePlayers.size() > capacity;
        if (paged) SelectionText.centered(graphics, font,
                Component.literal((page + 1) + " / " + ((pagePlayers.size() + capacity - 1) / capacity)),
                otherCenter, pageY, opacity | 0xcccccc);
        graphics.flush();
        graphics.pose().popPose();
        SelectionText.centered(graphics, font, Component.translatable("screen.kingdomsheritage.party_list_controls"),
                width / 2, height - 12, opacity | 0xcccccc);
        int lastRow = (Math.max(slotCount, last - first) - 1) / columns;
        int summaryY = gridY + lastRow * GRID_STEP + PORTRAIT_SIZE + 10;
        if (paged) summaryY = Math.max(summaryY, pageY + 20);
        ClientParty.renderPartySummary(graphics, partyCenter, top, width, summaryY, mouseX, mouseY, visibility, slide);
        if (paged) {
            renderPageArrows(graphics, otherCenter, pageY + Math.round(slide), mouseX, mouseY, visibility);
        } else {
            hoveredPageArrow = null;
            if (previousPage != null) previousPage.visible = nextPage.visible = false;
        }
    }
}

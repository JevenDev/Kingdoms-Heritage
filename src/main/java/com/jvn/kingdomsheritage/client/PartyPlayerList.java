package com.jvn.kingdomsheritage.client;

import com.jvn.kingdomsheritage.network.HeritageNetwork;
import com.jvn.toucanlib.client.ToucanTextRenderer;
import com.mojang.blaze3d.systems.RenderSystem;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import net.minecraft.Util;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.Style;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.FormattedCharSequence;
import net.minecraft.util.Mth;

final class PartyPlayerList {
    private static final float BACKDROP_OPACITY = 0.94F;
    private static final int PORTRAIT_SIZE = 24;
    private static final int GRID_STEP = 36;
    private static final int HEADER_TO_GRID = 20;
    private static final int TOP_MARGIN = 28;
    private static final int FOOTER_MARGIN = 20;
    private static final float RESPONSE = 14;
    private static final int SLOT_FADE_MILLIS = 180;
    private static final ResourceLocation TAB = texture("tab_button");
    private static final ResourceLocation SELECTED = texture("tab_button_selected");
    private static final ResourceLocation EMPTY_SLOT = texture("empty_slot");
    private static final Style BADGE_FONT = Style.EMPTY.withFont(ResourceLocation.fromNamespaceAndPath("kingdomsheritage", "party_badges"));
    private static final Badge INVITED = new Badge(0xe000, 7, 7);
    private static final Badge SEND_REQUEST = new Badge(0xe001, 15, 15);
    private static final Badge SEARCH = new Badge(0xe002, 12, 12);
    private static final Badge READY = new Badge(0xe003, 9, 8);
    private static final Badge REVIEW = new Badge(0xe004, 9, 10);
    private final PartyListBlur blur = new PartyListBlur();
    private final List<Cell> cells = new ArrayList<>();
    private final List<EmptySlot> emptySlots = new ArrayList<>();
    private final Map<SlotKey, SlotFade> slotFades = new LinkedHashMap<>();
    private int layoutWidth;
    private int layoutHeight;
    private int partyCenter;
    private int otherCenter;
    private int gridY;
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

    private record Cell(ClientParty.Peer player, int x, int y, boolean party, int color, InviteBadge badge) {}
    private record EmptySlot(int x, int y) {}
    private record SlotKey(UUID player, int columnOffset, int rowOffset, boolean party) {}

    private record Badge(FormattedCharSequence glyph, int width, int height) {
        Badge(int codepoint, int width, int height) {
            this(FormattedCharSequence.codepoint(codepoint, BADGE_FONT), width, height);
        }
    }

    private enum InviteBadge {
        INCOMING(INVITED), OUTGOING(SEND_REQUEST);

        final Badge icon;

        InviteBadge(Badge icon) {
            this.icon = icon;
        }
    }

    private static final class SlotFade {
        Cell cell;
        float from;
        boolean present = true;
        long changed;

        SlotFade(Cell cell, float opacity, long now) {
            this.cell = cell;
            from = opacity;
            changed = now;
        }

        float opacity(long now) {
            float progress = Mth.clamp((now - changed) / (float) SLOT_FADE_MILLIS, 0, 1);
            return Mth.lerp(progress * progress * (3 - 2 * progress), from, present ? 1 : 0);
        }

        void setPresent(boolean present, long now) {
            if (this.present == present) return;
            from = opacity(now);
            changed = now;
            this.present = present;
        }
    }

    private static boolean overPortrait(double mouseX, double mouseY, int x, int y) {
        return mouseX >= x - 1 && mouseX < x + PORTRAIT_SIZE + 1 && mouseY >= y - 1 && mouseY < y + PORTRAIT_SIZE + 1;
    }

    private static int portraitSpan(int count) {
        return PORTRAIT_SIZE + 2 + (count - 1) * GRID_STEP;
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
        clearSlotFades();
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

    boolean moveDirectional(List<ClientParty.Peer> players, int direction, boolean vertical) {
        UUID selected = keyboard ? focused : hovered != null ? hovered : focused;
        if (selected == null) {
            if (cells.isEmpty()) moveFocus(players, direction);
            else focus((direction < 0 ? cells.getLast() : cells.getFirst()).player.id());
            return focused != null;
        }
        Cell origin = null;
        for (var cell : cells) {
            if (cell.player.id().equals(selected)) {
                origin = cell;
                break;
            }
        }
        if (origin == null) return false;

        Cell target = null;
        int nearestRow = Integer.MAX_VALUE;
        int nearestColumn = Integer.MAX_VALUE;
        for (var cell : cells) {
            int dx = cell.x - origin.x;
            int dy = cell.y - origin.y;
            if (vertical ? cell.party != origin.party || dy * direction <= 0 : dx * direction <= 0) continue;
            int rowDistance = Math.abs(dy);
            int columnDistance = Math.abs(dx);
            if (rowDistance < nearestRow || rowDistance == nearestRow && columnDistance < nearestColumn) {
                target = cell;
                nearestRow = rowDistance;
                nearestColumn = columnDistance;
            }
        }
        if (target == null) return false;
        focus(target.player.id());
        return true;
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
        long now = Util.getMillis();
        for (var cell : cells) {
            if (overPortrait(x, y, cell.x, cell.y) && slotFades.get(slotKey(cell)).opacity(now) >= 0.5F) return cell.player.id();
        }
        return null;
    }

    boolean overFadingPortrait(double x, double y) {
        long now = Util.getMillis();
        for (var entry : slotFades.entrySet()) {
            var slot = entry.getKey();
            var fade = entry.getValue();
            if (slot.player != null && (!fade.present || fade.opacity(now) < 0.5F)
                    && overPortrait(x, y - slide, slotX(slot), gridY + slot.rowOffset)) return true;
        }
        return false;
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

    private void renderPageArrows(GuiGraphics graphics, int center, int y, int labelWidth, int mouseX, int mouseY, float visibility) {
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
        int halfLabel = labelWidth / 2;
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

    private static void renderProgress(GuiGraphics graphics, ClientParty.Peer player, int right, int bottom, int opacity) {
        boolean choosingSpawn = player.stage() == HeritageParty.Stage.SPAWN.ordinal();
        boolean choosingKit = player.stage() == HeritageParty.Stage.KIT.ordinal();
        if (choosingSpawn || choosingKit) {
            renderCornerBadge(graphics, SEARCH, right, bottom, opacity);
            var font = Minecraft.getInstance().font;
            var letter = Component.translatable("screen.kingdomsheritage.party_stage_short_" + player.stage());
            SelectionText.centered(graphics, font, letter, right + 3, bottom - 1,
                    opacity | (choosingKit ? 0x55ffff : 0xffff55));
        } else if (player.stage() == HeritageParty.Stage.REVIEW.ordinal()) {
            renderCornerBadge(graphics, REVIEW, right, bottom, opacity);
        } else if (player.stage() == HeritageParty.Stage.READY.ordinal()) {
            renderCornerBadge(graphics, READY, right, bottom, opacity);
        }
    }

    private static InviteBadge inviteBadge(UUID player, long now) {
        if (ClientParty.invitedBy(player, now)) return InviteBadge.INCOMING;
        return ClientParty.inviteSentTo(player) ? InviteBadge.OUTGOING : null;
    }

    private static void renderCornerBadge(GuiGraphics graphics, Badge badge, int right, int bottom, int opacity) {
        ToucanTextRenderer.renderOutlinedLine(graphics, Minecraft.getInstance().font, badge.glyph(),
                right - badge.width() / 2, bottom - badge.height() / 2, opacity | 0xffffff, 0);
    }

    private void renderCell(GuiGraphics graphics, Cell cell, int x, int y, float visibility, int opacity, boolean present) {
        boolean loading = cell.player.stage() == HeritageParty.Stage.LOADING.ordinal();
        ClientParty.head(graphics, cell.player, x, y, PORTRAIT_SIZE, loading, visibility);
        if (cell.party)
            graphics.renderOutline(x - 1, y - 1, PORTRAIT_SIZE + 2, PORTRAIT_SIZE + 2, opacity | cell.color);
        if (present && cell.player.id().equals(selected()))
            graphics.renderOutline(x - 2, y - 2, PORTRAIT_SIZE + 4, PORTRAIT_SIZE + 4, opacity | 0xffffff);
        int right = x + PORTRAIT_SIZE, bottom = y + PORTRAIT_SIZE;
        if (cell.party && !loading) renderProgress(graphics, cell.player, right, bottom, opacity);
        if (cell.badge != null)
            renderCornerBadge(graphics, cell.badge.icon, right, bottom, opacity);
    }

    private SlotKey slotKey(Cell cell) {
        int center = cell.party ? partyCenter : otherCenter;
        return new SlotKey(cell.player.id(), cell.x - center, cell.y - gridY, cell.party);
    }

    private int slotX(SlotKey slot) {
        return (slot.party ? partyCenter : otherCenter) + slot.columnOffset;
    }

    private void clearSlotFades() {
        slotFades.clear();
        layoutWidth = layoutHeight = 0;
    }

    private void updateSlotFades(int width, int height, long now) {
        boolean animate = width == layoutWidth && height == layoutHeight;
        if (!animate) slotFades.clear();
        layoutWidth = width;
        layoutHeight = height;

        Map<SlotKey, Cell> current = new LinkedHashMap<>();
        for (var slot : emptySlots) current.put(new SlotKey(null, slot.x - partyCenter, slot.y - gridY, true), null);
        for (var cell : cells) current.put(slotKey(cell), cell);
        slotFades.entrySet().removeIf(entry -> {
            if (current.containsKey(entry.getKey())) return false;
            var fade = entry.getValue();
            fade.setPresent(false, now);
            return fade.opacity(now) <= 0;
        });
        current.forEach((key, cell) -> {
            var fade = slotFades.computeIfAbsent(key, ignored -> new SlotFade(cell, animate ? 0 : 1, now));
            fade.cell = cell;
            fade.setPresent(true, now);
        });
    }

    private void renderSlots(GuiGraphics graphics, float visibility, long now, boolean present) {
        for (var entry : slotFades.entrySet()) {
            var fade = entry.getValue();
            if (fade.present != present) continue;
            float opacity = visibility * fade.opacity(now);
            int alpha = Math.round(opacity * 255);
            if (alpha < 4) continue;
            var slot = entry.getKey();
            int x = slotX(slot);
            int y = gridY + slot.rowOffset;
            if (fade.cell != null) {
                renderCell(graphics, fade.cell, x, y, opacity, alpha << 24, present);
            } else {
                graphics.setColor(1, 1, 1, opacity);
                RenderSystem.enableBlend();
                RenderSystem.defaultBlendFunc();
                graphics.blit(EMPTY_SLOT, x - 1, y - 1, PORTRAIT_SIZE + 2, PORTRAIT_SIZE + 2, 0, 0, 32, 32, 32, 32);
                RenderSystem.disableBlend();
                graphics.setColor(1, 1, 1, 1);
            }
        }
    }

    void render(GuiGraphics graphics, int width, int height, List<ClientParty.Peer> players, int mouseX, int mouseY) {
        long now = Util.getMillis();
        float visibility = visibility(now);
        if (!active(now)) {
            cells.clear();
            emptySlots.clear();
            clearSlotFades();
            blur.close();
            return;
        }
        if (players.isEmpty()) { reset(); return; }
        if (lastMouseX >= 0 && (mouseX != lastMouseX || mouseY != lastMouseY)) keyboard = headerFocused = false;
        lastMouseX = mouseX;
        lastMouseY = mouseY;
        blur.render(graphics, visibility);
        SelectionBackground.render(graphics, width, height, BACKDROP_OPACITY * visibility);

        var font = Minecraft.getInstance().font;
        var partyTitle = ClientParty.partyTitle();
        var otherTitle = Component.translatable("screen.kingdomsheritage.party_other_players");
        var noOthers = Component.translatable("screen.kingdomsheritage.party_no_other_players");
        var summary = ClientParty.grouped() ? ClientParty.partySummary(font, width) : null;
        int summaryHeight = summary == null ? 0 : summary.height();
        int pageGap = summary == null ? 15 : 20;
        int sectionWidth = Math.max(1, (Math.min(width - 24, 372) - 14) / 2);
        int slotCount = HeritageNetwork.MAX_PARTY_SIZE;
        slide = (1 - visibility) * 10;

        var partyPlayers = players.stream().filter(player -> ClientParty.onPartySide(player.id())).toList();
        pagePlayers = players.stream().filter(player -> !ClientParty.onPartySide(player.id())).toList();
        columns = Mth.clamp((sectionWidth + GRID_STEP - PORTRAIT_SIZE - 4) / GRID_STEP, 1, 4);
        int gridHeight = height - TOP_MARGIN - FOOTER_MARGIN - HEADER_TO_GRID - 2 - pageGap - summaryHeight;
        int rows = Mth.clamp(gridHeight / GRID_STEP, 1, 3);
        capacity = columns * rows;
        boolean paged = pagePlayers.size() > capacity;
        if (focused != null && indexOf(players, focused) < 0) focus(null);
        int focusedIndex = indexOf(pagePlayers, focused);
        if (focusedIndex >= 0) page = focusedIndex / capacity;
        page = Mth.clamp(page, 0, Math.max(0, (pagePlayers.size() - 1) / capacity));
        int first = page * capacity;
        int last = Math.min(pagePlayers.size(), first + capacity);
        int pageCount = (pagePlayers.size() + capacity - 1) / capacity;
        String pageLabel = (page + 1) + " / " + pageCount;
        int pageLabelWidth = paged ? font.width(pageCount + " / " + pageCount) : 0;

        int partySpan = Math.max(font.width(partyTitle), portraitSpan(Math.min(columns, slotCount)));
        int otherSpan = pagePlayers.isEmpty() ? font.width(noOthers) : portraitSpan(Math.min(columns, pagePlayers.size()));
        otherSpan = Math.max(otherSpan, font.width(otherTitle));
        if (paged) otherSpan = Math.max(otherSpan, pageLabelWidth + 56);
        int centerGap = sectionWidth + 14;
        partyCenter = (width - centerGap + (partySpan - otherSpan) / 2) / 2;
        otherCenter = partyCenter + centerGap;

        int lastRow = (Math.max(slotCount, Math.min(pagePlayers.size(), capacity)) - 1) / columns;
        int gridBottom = HEADER_TO_GRID + lastRow * GRID_STEP + PORTRAIT_SIZE + 1;
        int pageOffset = HEADER_TO_GRID + rows * GRID_STEP + 2;
        int groupHeight = gridBottom + (summary == null ? 0 : 9 + summaryHeight);
        if (paged) groupHeight = Math.max(groupHeight, pageOffset + pageGap + summaryHeight);
        int top = Math.max(TOP_MARGIN, (height - groupHeight) / 2);
        gridY = top + HEADER_TO_GRID;
        int pageY = top + pageOffset;

        cells.clear();
        emptySlots.clear();
        for (int index = 0; index < slotCount; index++) {
            int x = portraitX(partyCenter, index, slotCount);
            int y = gridY + index / columns * GRID_STEP;
            if (index < partyPlayers.size()) {
                var player = partyPlayers.get(index);
                cells.add(new Cell(player, x, y, true, ClientParty.partyPortraitColor(player.id()), null));
            } else emptySlots.add(new EmptySlot(x, y));
        }
        for (int index = first; index < last; index++) {
            int local = index - first;
            var player = pagePlayers.get(index);
            cells.add(new Cell(player, portraitX(otherCenter, local, last - first),
                    gridY + local / columns * GRID_STEP, false, 0, inviteBadge(player.id(), now)));
        }
        updateSlotFades(width, height, now);

        UUID nextHovered = open && visibility > 0.65F ? hit(mouseX, mouseY) : null;
        if (nextHovered != null && !nextHovered.equals(hovered)) SelectionSounds.HOVER.play();
        hovered = nextHovered;
        int opacity = Math.max(4, Math.round(visibility * 255)) << 24;
        graphics.pose().pushPose();
        graphics.pose().translate(0, slide, 0);
        SelectionText.centered(graphics, font, partyTitle, partyCenter, top, opacity | 0xf4f1e8);
        SelectionText.centered(graphics, font, otherTitle, otherCenter, top, opacity | 0xf4f1e8);
        if (pagePlayers.isEmpty()) SelectionText.centered(graphics, font, noOthers, otherCenter, gridY, opacity | 0xaaaaaa);
        renderSlots(graphics, visibility, now, false);
        renderSlots(graphics, visibility, now, true);
        if (paged) SelectionText.centered(graphics, font, pageLabel, otherCenter, pageY, opacity | 0xcccccc);
        graphics.flush();
        graphics.pose().popPose();
        SelectionText.centered(graphics, font, Component.translatable("screen.kingdomsheritage.party_list_controls"),
                width / 2, height - 12, opacity | 0xcccccc);
        if (summary != null) ClientParty.renderPartySummary(graphics, font, summary, width, top + groupHeight - summaryHeight,
                mouseX, mouseY, visibility, slide);
        if (paged) {
            renderPageArrows(graphics, otherCenter, pageY + Math.round(slide), pageLabelWidth, mouseX, mouseY, visibility);
        } else {
            hoveredPageArrow = null;
            if (previousPage != null) previousPage.visible = nextPage.visible = false;
        }
    }
}

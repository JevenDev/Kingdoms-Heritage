package com.jvn.kingdomsheritage.client;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.toasts.Toast;
import net.minecraft.client.gui.components.toasts.ToastComponent;
import net.minecraft.network.chat.Component;

final class PartyNoticeToast implements Toast {
    static final int MAX_WIDTH = 152;
    static final int MIN_HEIGHT = 32;
    private static final int TEXT_X = 29;
    private static final int TEXT_PADDING = TEXT_X + 7;
    private static final Component JOINED = Component.translatable("screen.kingdomsheritage.party_feedback_accepted");
    private final ClientParty.Peer player;
    private final int width;
    private final int height;
    private Component message;
    private boolean inviteSent;
    private boolean restartTimer;
    private long displayStart;

    PartyNoticeToast(ClientParty.Peer player, String result) {
        this.player = player;
        inviteSent = result.equals("sent");
        message = Component.translatable("screen.kingdomsheritage.party_feedback_" + result);
        var font = Minecraft.getInstance().font;
        int bodyWidth = font.width(message);
        if (inviteSent) bodyWidth = Math.max(bodyWidth, font.width(JOINED));
        width = Math.min(MAX_WIDTH, TEXT_PADDING + Math.max(font.width(player.name()), bodyWidth));
        int bodyLines = font.split(message, width - TEXT_PADDING).size();
        if (inviteSent) bodyLines = Math.max(bodyLines, font.split(JOINED, width - TEXT_PADDING).size());
        height = Math.max(MIN_HEIGHT, font.lineHeight - 2 + bodyLines * (font.lineHeight + 2) + 12);
    }

    @Override
    public Object getToken() { return inviteSent ? player.id() : NO_TOKEN; }

    void updateInvite(boolean accepted) {
        if (accepted) {
            inviteSent = false;
            message = JOINED;
        }
        restartTimer = true;
    }

    @Override
    public int width() { return width; }

    @Override
    public int height() { return height; }

    @Override
    public Visibility render(GuiGraphics graphics, ToastComponent toasts, long elapsed) {
        if (restartTimer || elapsed < displayStart) {
            displayStart = elapsed;
            restartTimer = false;
        }
        long displayTime = elapsed - displayStart;
        renderNotice(graphics, toasts.getMinecraft().font, player, message, width, height, displayTime);
        return displayTime < 4000 * toasts.getNotificationDisplayTimeMultiplier() ? Visibility.SHOW : Visibility.HIDE;
    }

    static void renderNotice(GuiGraphics graphics, Font font, ClientParty.Peer player, Component message, int width, int height, long elapsed) {
        SelectionToasts.background(graphics, width, height, elapsed);
        int portraitSize = 16;
        ClientParty.head(graphics, player, 7, (height - portraitSize) / 2, portraitSize, false);
        int textWidth = Math.max(1, width - TEXT_PADDING);
        var lines = font.split(message, textWidth);
        int lineStep = font.lineHeight + 2;
        int y = (height - (font.lineHeight - 2 + lines.size() * lineStep)) / 2;
        String name = player.name();
        if (font.width(name) > textWidth) name = font.plainSubstrByWidth(name, Math.max(0, textWidth - font.width("..."))) + "...";
        SelectionText.draw(graphics, font, name, TEXT_X, y, 0xffffff55);
        for (var line : lines) {
            y += lineStep;
            SelectionText.draw(graphics, font, line, TEXT_X, y, 0xffbbbbbb);
        }
    }
}

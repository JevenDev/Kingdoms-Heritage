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
    private final ClientParty.Peer player;
    private final Component message;

    PartyNoticeToast(ClientParty.Peer player, String result) {
        this.player = player;
        message = Component.translatable("screen.kingdomsheritage.party_feedback_" + result);
    }

    @Override
    public int width() {
        var font = Minecraft.getInstance().font;
        return Math.min(MAX_WIDTH, TEXT_PADDING + Math.max(font.width(player.name()), font.width(message)));
    }

    @Override
    public int height() {
        var font = Minecraft.getInstance().font;
        int bodyLines = font.split(message, width() - TEXT_PADDING).size();
        return Math.max(MIN_HEIGHT, font.lineHeight - 2 + bodyLines * (font.lineHeight + 2) + 12);
    }

    @Override
    public Visibility render(GuiGraphics graphics, ToastComponent toasts, long elapsed) {
        renderNotice(graphics, toasts.getMinecraft().font, player, message, width(), height(), elapsed);
        return elapsed < 4000 * toasts.getNotificationDisplayTimeMultiplier() ? Visibility.SHOW : Visibility.HIDE;
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

package com.jvn.kingdomsheritage.client;

import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.toasts.Toast;
import net.minecraft.client.gui.components.toasts.ToastComponent;
import net.minecraft.network.chat.Component;

final class PartyNoticeToast implements Toast {
    private final Component message;

    PartyNoticeToast(String name, String result) {
        message = Component.translatable("screen.kingdomsheritage.party_feedback_" + result, name);
    }

    @Override
    public int width() { return 216; }

    @Override
    public int height() {
        var font = net.minecraft.client.Minecraft.getInstance().font;
        return Math.max(48, font.split(message, width() - 16).size() * font.lineHeight + 16);
    }

    @Override
    public Visibility render(GuiGraphics graphics, ToastComponent toasts, long elapsed) {
        SelectionToasts.background(graphics, width(), height(), elapsed);
        var font = toasts.getMinecraft().font;
        var lines = font.split(message, width() - 16);
        int y = (height() - lines.size() * font.lineHeight) / 2;
        for (int index = 0; index < lines.size(); index++) {
            SelectionText.draw(graphics, font, lines.get(index), 8, y + index * font.lineHeight, 0xffffffff);
        }
        return elapsed < 4000 * toasts.getNotificationDisplayTimeMultiplier() ? Visibility.SHOW : Visibility.HIDE;
    }
}

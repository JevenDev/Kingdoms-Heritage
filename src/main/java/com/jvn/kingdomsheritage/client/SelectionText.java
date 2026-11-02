package com.jvn.kingdomsheritage.client;

import com.jvn.toucanlib.client.ToucanTextRenderer;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.network.chat.Component;
import net.minecraft.util.FormattedCharSequence;

final class SelectionText {
    private SelectionText() {}

    static void draw(GuiGraphics graphics, Font font, String text, int x, int y, int color) {
        draw(graphics, font, Component.literal(text), x, y, color);
    }

    static void draw(GuiGraphics graphics, Font font, Component text, int x, int y, int color) {
        draw(graphics, font, text.getVisualOrderText(), x, y, color);
    }

    static void draw(GuiGraphics graphics, Font font, String text, int x, int y, int color, boolean outline) {
        draw(graphics, font, Component.literal(text).getVisualOrderText(), x, y, color, outline);
    }

    static void draw(GuiGraphics graphics, Font font, FormattedCharSequence text, int x, int y, int color) {
        draw(graphics, font, text, x, y, color, true);
    }

    static void draw(GuiGraphics graphics, Font font, FormattedCharSequence text, int x, int y, int color, boolean outline) {
        draw(graphics, font, text, x, y, color, Minecraft.getInstance().gui.getGuiTicks(), outline);
    }

    static void draw(GuiGraphics graphics, Font font, FormattedCharSequence text, int x, int y, int color, int ticks, boolean outline) {
        if ((color >>> 24) == 0) color |= 0xff000000;
        if (outline) ToucanTextRenderer.renderOutlinedLine(graphics, font, text, x, y, color, ticks);
        else ToucanTextRenderer.renderChatLine(graphics, font, text, x, y, color, ticks,
                (glyph, drawX, drawY, tint) -> graphics.drawString(font, glyph, drawX, drawY, tint, true));
    }

    static void centered(GuiGraphics graphics, Font font, String text, int center, int y, int color) {
        draw(graphics, font, text, center - font.width(text) / 2, y, color);
    }

    static void centered(GuiGraphics graphics, Font font, Component text, int center, int y, int color) {
        draw(graphics, font, text, center - font.width(text) / 2, y, color);
    }

    static void centered(GuiGraphics graphics, Font font, FormattedCharSequence text, int center, int y, int color) {
        draw(graphics, font, text, center - font.width(text) / 2, y, color);
    }
}

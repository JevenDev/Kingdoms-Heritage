package com.jvn.kingdomsheritage.client;

import net.minecraft.client.gui.GuiGraphics;

final class LoadingIndicator {
    private static final int[] CELLS = {0, 1, 2, 5, 8, 7, 6, 3};
    private static final int SIZE = 5;
    private static final int GAP = 2;

    private LoadingIndicator() {}

    static void render(GuiGraphics graphics, int centerX, int centerY, long now, int opacity) {
        render(graphics, centerX, centerY, now, opacity, SIZE, GAP);
    }

    static void renderPortrait(GuiGraphics graphics, int centerX, int centerY, long now, int opacity) {
        render(graphics, centerX, centerY, now, opacity, 4, 1);
    }

    static void renderInline(GuiGraphics graphics, int centerX, int centerY, long now, int opacity) {
        render(graphics, centerX, centerY, now, opacity, 2, 1);
    }

    private static void render(GuiGraphics graphics, int centerX, int centerY, long now, int opacity, int size, int gap) {
        if (opacity < 4) return;
        float head = (now % 960) / 120F;
        for (int index = 0; index < CELLS.length; index++) {
            int cell = CELLS[index];
            int x = centerX + (cell % 3 - 1) * (size + gap) - size / 2;
            int y = centerY + (cell / 3 - 1) * (size + gap) - size / 2;
            float trail = (float) (0.5 + 0.5 * Math.cos((index - head) * Math.PI * 2 / CELLS.length));
            int alpha = Math.round(opacity * (0.2F + 0.8F * trail * trail * trail));
            graphics.fill(x, y, x + size, y + size, alpha << 24 | 0xffffff);
        }
    }
}

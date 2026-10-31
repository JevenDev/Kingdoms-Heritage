package com.jvn.kingdomsheritage.client;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.toasts.Toast;
import net.minecraft.client.gui.components.toasts.ToastComponent;

public final class SelectionToasts {
    private static ToastComponent toasts;

    private SelectionToasts() {}

    static void add(Toast toast) {
        if (toasts == null) toasts = new ToastComponent(Minecraft.getInstance());
        toasts.addToast(toast);
    }

    public static ToastComponent component() { return toasts; }

    static void clear() {
        if (toasts != null) toasts.clear();
    }

    static void background(GuiGraphics graphics, int width, int height, long elapsed) {
        SelectionMusicToastBackground.render(graphics, width, height, elapsed / 1000F);
    }
}

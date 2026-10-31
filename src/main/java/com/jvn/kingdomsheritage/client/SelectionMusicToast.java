package com.jvn.kingdomsheritage.client;

import com.jvn.toucanlib.client.ToucanTextRenderer;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.toasts.Toast;
import net.minecraft.client.gui.components.toasts.ToastComponent;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

final class SelectionMusicToast implements Toast {
    private static final ResourceLocation BACKGROUND = ResourceLocation.withDefaultNamespace("toast/advancement");
    private final ItemStack icon = new ItemStack(Items.JUKEBOX);
    private boolean hidden;

    void hide() {
        hidden = true;
    }

    @Override
    public Visibility render(GuiGraphics graphics, ToastComponent toasts, long timeSinceLastVisible) {
        if (hidden) return Visibility.HIDE;
        var font = toasts.getMinecraft().font;
        graphics.blitSprite(BACKGROUND, 0, 0, width(), height());
        graphics.renderFakeItem(icon, 8, 8);
        var title = IntroMarkup.style(Component.literal("<rainbow>")
                .append(Component.translatable("toast.kingdomsheritage.now_playing")).append("</rainbow>"));
        ToucanTextRenderer.renderLine(graphics, font, title.getVisualOrderText(), 30, 7,
                0xffffffff, 255, (int) (timeSinceLastVisible / 50));
        graphics.drawString(font, Component.translatable("music.kingdomsheritage.selection"), 30, 18, 0xffffffff, false);
        return timeSinceLastVisible < 5000 * toasts.getNotificationDisplayTimeMultiplier() ? Visibility.SHOW : Visibility.HIDE;
    }
}

package com.jvn.kingdomsheritage.client;

import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.math.Axis;
import java.util.function.BooleanSupplier;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.Tooltip;
import net.minecraft.client.gui.components.WidgetSprites;
import net.minecraft.client.sounds.SoundManager;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;

final class SelectionControls {
    private static final WidgetSprites DISCONNECT = new WidgetSprites(
            ResourceLocation.fromNamespaceAndPath("kingdomsheritage", "selection/disconnect"),
            ResourceLocation.fromNamespaceAndPath("kingdomsheritage", "selection/disconnect_highlighted"));
    private static final WidgetSprites SELECT = new WidgetSprites(
            ResourceLocation.withDefaultNamespace("transferable_list/select"),
            ResourceLocation.withDefaultNamespace("transferable_list/select_highlighted"));
    private static final WidgetSprites UNSELECT = new WidgetSprites(
            ResourceLocation.withDefaultNamespace("transferable_list/unselect"),
            ResourceLocation.withDefaultNamespace("transferable_list/unselect_highlighted"));

    private SelectionControls() {}

    static Button disconnect(int screenHeight) {
        return disconnect(screenHeight, false);
    }

    static Button disconnect(int screenHeight, boolean duringTransition) {
        Component message = Component.translatable("menu.disconnect");
        var button = new Button(8, screenHeight - 29, 31, 21, message,
                ignored -> {
                    ClientSelection.disconnect();
                    SelectionSounds.CLICK.play();
                }, narration -> narration.get()) {
            private boolean highlighted;

            @Override
            protected void renderWidget(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
                boolean highlight = active && isHoveredOrFocused() && (!SelectionTransition.active() || duringTransition);
                if (highlight && !highlighted) SelectionSounds.HOVER.play();
                highlighted = highlight;
                RenderSystem.enableBlend();
                graphics.setColor(1, 1, 1, alpha);
                graphics.blitSprite(DISCONNECT.get(active, active && isHoveredOrFocused()), getX() + 4, getY() + 4, 23, 13);
                graphics.setColor(1, 1, 1, 1);
                RenderSystem.disableBlend();
            }

            @Override
            public void playDownSound(SoundManager soundManager) {
                // disconnect clears active sounds, so the press callback plays the click afterwards
            }
        };
        button.setTooltip(Tooltip.create(message));
        return button;
    }

    static Button arrow(int x, int y, boolean forward, Component message, Button.OnPress onPress) {
        return arrow(x, y, forward, message, onPress, null);
    }

    static Button arrow(int x, int y, boolean forward, Component message, Button.OnPress onPress, BooleanSupplier available) {
        return arrow(x, y, forward, false, message, onPress, available);
    }

    static Button verticalArrow(int x, int y, boolean down, Component message, Button.OnPress onPress) {
        return arrow(x, y, down, true, message, onPress, null);
    }

    private static Button arrow(int x, int y, boolean forward, boolean vertical, Component message, Button.OnPress onPress,
                                BooleanSupplier available) {
        var button = new SoundButton(x, y, 32, 32, message, onPress, narration -> narration.get()) {
            @Override
            protected void renderWidget(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
                boolean bright = available == null ? active : available.getAsBoolean();
                float brightness = bright ? 1 : 0.35F;
                RenderSystem.enableBlend();
                graphics.setColor(brightness, brightness, brightness, alpha);
                graphics.pose().pushPose();
                graphics.pose().translate(getX(), getY(), 0);
                graphics.pose().scale(getWidth() / 32F, getHeight() / 32F, 1);
                if (vertical) {
                    graphics.pose().translate(16, 16, 0);
                    graphics.pose().mulPose(Axis.ZP.rotationDegrees(90));
                    graphics.pose().translate(-16, -16, 0);
                }
                drawArrow(graphics, forward, active && isHoveredOrFocused(), 8, 4);
                graphics.pose().popPose();
                graphics.setColor(1, 1, 1, 1);
                RenderSystem.disableBlend();
            }
        };
        button.setTooltip(Tooltip.create(message));
        return button;
    }

    static class SoundButton extends Button {
        private boolean hovered;

        SoundButton(int x, int y, int width, int height, Component message, OnPress onPress) {
            this(x, y, width, height, message, onPress, DEFAULT_NARRATION);
        }

        SoundButton(int x, int y, int width, int height, Component message, OnPress onPress, CreateNarration narration) {
            super(x, y, width, height, message, onPress, narration);
        }

        @Override
        protected void renderWidget(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
            boolean hover = active && alpha * 255 >= 4 && isHovered();
            if (hover && !hovered && !SelectionTransition.active()) SelectionSounds.HOVER.play();
            hovered = hover;
            if (alpha * 255 < 4) return;
            super.renderWidget(graphics, mouseX, mouseY, partialTick);
        }

        @Override
        public void playDownSound(SoundManager soundManager) {
            SelectionSounds.CLICK.play();
        }
    }

    static void drawArrow(GuiGraphics graphics, boolean forward, boolean highlighted, int x, int y) {
        ResourceLocation sprite = (forward ? SELECT : UNSELECT).get(true, highlighted);
        graphics.blitSprite(sprite, 32, 32, forward ? 8 : 0, 4, x, y, 16, 24);
    }
}

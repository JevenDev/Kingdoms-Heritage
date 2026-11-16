package com.jvn.kingdomsheritage.client;

import com.jvn.kingdomsheritage.compat.NumismaticCompat;
import io.wispforest.owo.ui.core.OwoUIDrawContext;
import java.lang.reflect.Constructor;
import java.util.List;
import java.util.function.IntSupplier;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.inventory.InventoryScreen;
import net.minecraft.client.gui.screens.inventory.tooltip.ClientTooltipComponent;
import net.minecraft.client.renderer.Rect2i;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.player.Player;

final class NumismaticKitPreview {
    private static final ResourceLocation TEXTURE = ResourceLocation.fromNamespaceAndPath(
            "numismaticoverhaul", "textures/gui/purse_widget.png");
    private static final int WIDTH = 11;
    private static final int HEIGHT = 13;

    private NumismaticKitPreview() {}

    static Rect2i bounds(Screen screen) {
        if (!(screen instanceof InventoryScreen inventory) || !NumismaticCompat.available()) return null;
        // reforged again applies the survival y offset to both coordinates
        int offset = ClientConfig.SURVIVAL_OFFSET.getAsInt();
        int x = inventory.getGuiLeft() + 160 + offset;
        int y = inventory.getGuiTop() + 5 + offset;
        if (x >= screen.width || y >= screen.height || x + WIDTH <= 0 || y + HEIGHT <= 0) return null;
        return new Rect2i(x, y, WIDTH, HEIGHT);
    }

    static void render(GuiGraphics graphics, Font font, Rect2i purse, Player player, long grant, int mouseX, int mouseY) {
        int x = purse.getX();
        int y = purse.getY();
        boolean hovered = mouseX >= x && mouseX < x + WIDTH && mouseY >= y && mouseY < y + HEIGHT;
        graphics.pose().pushPose();
        graphics.pose().translate(0, 0, 300);
        graphics.blit(TEXTURE, x, y, 62, hovered ? HEIGHT : 0, WIDTH, HEIGHT, 128, 64);
        if (hovered) {
            long balance = NumismaticCompat.balance(player);
            long previewBalance = balance <= Long.MAX_VALUE - grant ? balance + grant : balance;
            PurseTooltip.INSTANCE.render(graphics, font, mouseX, mouseY, previewBalance);
        }
        graphics.pose().popPose();
    }

    private record PurseTooltip(Constructor<?> data, Constructor<? extends ClientTooltipComponent> renderer, Component title) {
        private static final PurseTooltip INSTANCE = create();

        private static PurseTooltip create() {
            try {
                var data = Class.forName("tallestred.numismaticoverhaul.item.CurrencyTooltipData");
                var renderer = Class.forName("tallestred.numismaticoverhaul.client.gui.CurrencyTooltipComponent")
                        .asSubclass(ClientTooltipComponent.class);
                var currency = Class.forName("tallestred.numismaticoverhaul.currency.Currency");
                int gold = (int) currency.getMethod("getNameColor").invoke(currency.getField("GOLD").get(null));
                var title = Component.translatable("gui.numismaticoverhaul.purse_title").withColor(gold);
                return new PurseTooltip(data.getConstructor(long.class, long.class), renderer.getConstructor(data), title);
            } catch (ReflectiveOperationException error) {
                throw new IllegalStateException("Could not resolve the Numismatic purse tooltip", error);
            }
        }

        private void render(GuiGraphics graphics, Font font, int x, int y, long balance) {
            try {
                var coins = renderer.newInstance(data.newInstance(balance, -1L));
                OwoUIDrawContext.of(graphics).drawTooltip(font, x, y,
                        List.of(ClientTooltipComponent.create(title.getVisualOrderText()), coins));
            } catch (ReflectiveOperationException error) {
                throw new IllegalStateException("Could not create the Numismatic purse tooltip", error);
            }
        }
    }

    private static final class ClientConfig {
        private static final IntSupplier SURVIVAL_OFFSET = survivalOffset();

        private static IntSupplier survivalOffset() {
            try {
                var config = Class.forName("tallestred.numismaticoverhaul.config.NOClientConfig");
                return (IntSupplier) config.getField("survivalPursePositionY").get(config.getField("CLIENT").get(null));
            } catch (ClassNotFoundException | NoSuchFieldException | IllegalAccessException error) {
                return () -> 0;
            }
        }
    }
}

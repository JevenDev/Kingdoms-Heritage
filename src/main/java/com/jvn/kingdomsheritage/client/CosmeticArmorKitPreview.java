package com.jvn.kingdomsheritage.client;

import com.jvn.kingdomsheritage.compat.EquipmentCompat;
import com.jvn.kingdomsheritage.data.KitLoadout;
import lain.mods.cos.impl.ModConfigs;
import lain.mods.cos.impl.client.gui.GuiCosArmorButton;
import lain.mods.cos.impl.client.gui.GuiCosArmorInventory;
import lain.mods.cos.impl.client.gui.GuiCosArmorToggleButton;
import lain.mods.cos.impl.inventory.ContainerCosArmor;
import lain.mods.cos.impl.inventory.InventoryCosArmor;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.inventory.AbstractContainerScreen;
import net.minecraft.client.gui.screens.inventory.InventoryScreen;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.player.Player;

final class CosmeticArmorKitPreview {
    private CosmeticArmorKitPreview() {}

    static Button switchButton(InventoryScreen screen, boolean cosmetic, Button.OnPress onPress) {
        if (ModConfigs.CosArmorGuiButton_Hidden.get()) return null;
        return new GuiCosArmorButton(screen.getGuiLeft() + ModConfigs.CosArmorGuiButton_Left.get(),
                screen.getGuiTop() + ModConfigs.CosArmorGuiButton_Top.get(), 10, 10, switchLabel(cosmetic),
                onPress, (button, selected) -> {});
    }

    static Component switchLabel(boolean cosmetic) {
        return Component.translatable(cosmetic ? "cos.gui.buttonnormal" : "cos.gui.buttoncos");
    }

    static AbstractContainerScreen<?> create(InventoryScreen inventory, Player player) {
        var preview = new PreviewScreen(player, new InventoryCosArmor());
        preview.init(Minecraft.getInstance(), inventory.width, inventory.height);
        return preview;
    }

    static void render(AbstractContainerScreen<?> screen, GuiGraphics graphics, KitLoadout.Snapshot loadout,
                       int mouseX, int mouseY, float partialTick) {
        var preview = (PreviewScreen) screen;
        for (var slot : EquipmentCompat.ARMOR_SLOTS) {
            int index = slot.getIndex();
            preview.cosmetics.setStackInSlot(index, loadout.cosmeticArmor(index));
        }
        preview.render(graphics, mouseX, mouseY, partialTick);
    }

    private static final class PreviewScreen extends GuiCosArmorInventory {
        private static final int CRAFTING_LEFT = 95;
        private static final int COSMETIC_ROW_TOP = 61;
        private final InventoryCosArmor cosmetics;

        PreviewScreen(Player player, InventoryCosArmor cosmetics) {
            super(new ContainerCosArmor(player.getInventory(), cosmetics, player, 0), player.getInventory(), Component.empty());
            this.cosmetics = cosmetics;
        }

        @Override
        protected void init() {
            super.init();
            // the preview menu never becomes the player's active container
            renderables.removeIf(widget -> !(widget instanceof GuiCosArmorToggleButton));
            renderables.forEach(widget -> ((GuiCosArmorToggleButton) widget).active = false);
        }

        @Override
        public void renderBackground(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
            renderBg(graphics, partialTick, mouseX, mouseY);
            graphics.fill(leftPos + CRAFTING_LEFT, topPos + 4, leftPos + 173, topPos + COSMETIC_ROW_TOP, 0xffc6c6c6);
        }

        @Override
        protected void renderLabels(GuiGraphics graphics, int mouseX, int mouseY) {}

        @Override
        protected boolean isHovering(int x, int y, int width, int height, double mouseX, double mouseY) {
            return (x < CRAFTING_LEFT || y >= COSMETIC_ROW_TOP) && super.isHovering(x, y, width, height, mouseX, mouseY);
        }

        @Override
        public void renderTransparentBackground(GuiGraphics graphics) {}
    }
}

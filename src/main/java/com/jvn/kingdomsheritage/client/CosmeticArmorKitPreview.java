package com.jvn.kingdomsheritage.client;

import com.jvn.kingdomsheritage.compat.EquipmentCompat;
import com.jvn.kingdomsheritage.data.KitLoadout;
import java.util.List;
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
        private final InventoryCosArmor cosmetics;

        PreviewScreen(Player player, InventoryCosArmor cosmetics) {
            super(new ContainerCosArmor(player.getInventory(), cosmetics, player, 0), player.getInventory(), Component.empty());
            this.cosmetics = cosmetics;
        }

        @Override
        protected void init() {
            var activeMenu = minecraft.player.containerMenu;
            try {
                super.init();
            } finally {
                minecraft.player.containerMenu = activeMenu;
            }
            setFocused(null);
            for (var child : List.copyOf(children())) {
                if (!(child instanceof GuiCosArmorToggleButton)) removeWidget(child);
            }
            renderables.forEach(widget -> ((GuiCosArmorToggleButton) widget).active = false);
        }

        @Override
        public void renderTransparentBackground(GuiGraphics graphics) {}
    }
}

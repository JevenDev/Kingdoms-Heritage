package com.jvn.kingdomsheritage.mixin;

import com.jvn.kingdomsheritage.client.KitSelection;
import com.llamalad7.mixinextras.injector.wrapmethod.WrapMethod;
import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.neoforged.neoforge.client.ClientHooks;
import org.spongepowered.asm.mixin.Mixin;

@Mixin(value = ClientHooks.class, remap = false)
public abstract class KitPreviewInventory {
    @WrapMethod(method = "drawScreenInternal")
    private static void previewInventory(Screen screen, GuiGraphics graphics, int mouseX, int mouseY,
                                         float partialTick, Operation<Void> original) {
        KitSelection.renderPreview(screen, () -> {
            try {
                original.call(screen, graphics, mouseX, mouseY, partialTick);
            } finally {
                graphics.flush();
            }
        });
    }
}

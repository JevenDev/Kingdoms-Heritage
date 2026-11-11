package com.jvn.kingdomsheritage.mixin;

import com.jvn.kingdomsheritage.client.KitSelection;
import net.minecraft.client.gui.GuiGraphics;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Pseudo;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Pseudo
@Mixin(targets = "io.wispforest.owo.ui.core.OwoUIAdapter", remap = false)
public abstract class AccessoriesLayerPreview {
    @Inject(method = "render", at = @At("HEAD"), cancellable = true, remap = false)
    private void suppressStandaloneInventoryLayer(GuiGraphics graphics, int mouseX, int mouseY, float partialTick, CallbackInfo callback) {
        if (KitSelection.suppressExternalInventoryLayer(this)) callback.cancel();
    }
}

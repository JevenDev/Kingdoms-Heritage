package com.jvn.kingdomsheritage.mixin;

import com.jvn.kingdomsheritage.client.SelectionBackground;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(Screen.class)
public abstract class SelectionScreenBackground {
    @Inject(method = "renderBackground", at = @At("HEAD"), cancellable = true)
    private void renderKitMenuBackground(GuiGraphics graphics, int mouseX, int mouseY, float partialTick, CallbackInfo callback) {
        if (SelectionBackground.renderKitBackground((Screen) (Object) this, graphics)) callback.cancel();
    }

    @Inject(method = "renderTransparentBackground", at = @At("HEAD"), cancellable = true)
    private void renderKitInventoryBackground(GuiGraphics graphics, CallbackInfo callback) {
        if (SelectionBackground.renderKitBackground((Screen) (Object) this, graphics)) callback.cancel();
    }
}

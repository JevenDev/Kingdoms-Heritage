package com.jvn.kingdomsheritage.mixin;

import com.jvn.kingdomsheritage.client.ClientSelection;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Pseudo;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Pseudo
@Mixin(targets = "io.wispforest.accessories.client.gui.AccessoriesExperimentalScreen", remap = false)
public abstract class AccessoriesCraftingPreview {
    @Inject(method = "showCraftingGrid", at = @At("HEAD"), cancellable = true, remap = false)
    private void hideDuringSelection(CallbackInfoReturnable<Boolean> callback) {
        if (ClientSelection.choosingKit()) callback.setReturnValue(false);
    }
}

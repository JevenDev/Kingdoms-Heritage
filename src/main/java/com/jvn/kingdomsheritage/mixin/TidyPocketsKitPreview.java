package com.jvn.kingdomsheritage.mixin;

import com.jvn.kingdomsheritage.client.KitSelection;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Pseudo;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Pseudo
@Mixin(targets = "io.github.profetgit.tidypockets.anim.SlotAnims", remap = false)
public abstract class TidyPocketsKitPreview {
    @Inject(method = "trackCount", at = @At("HEAD"), cancellable = true, require = 0)
    private static void ignorePreviewCounts(CallbackInfo callback) {
        // neighboring kits reuse the same slots with different stack counts
        if (KitSelection.capturingPreview()) callback.cancel();
    }
}

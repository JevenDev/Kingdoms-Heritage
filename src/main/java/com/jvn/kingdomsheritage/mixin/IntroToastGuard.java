package com.jvn.kingdomsheritage.mixin;

import com.jvn.kingdomsheritage.client.SpawnIntroOverlay;
import net.minecraft.client.gui.components.toasts.ToastComponent;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(ToastComponent.class)
public abstract class IntroToastGuard {
    @Inject(method = "render", at = @At("HEAD"), cancellable = true)
    private void hideIntroToasts(CallbackInfo callback) {
        if (SpawnIntroOverlay.active()) callback.cancel();
    }
}

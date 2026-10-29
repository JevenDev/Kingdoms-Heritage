package com.jvn.kingdomsheritage.mixin;

import com.jvn.kingdomsheritage.client.SpawnIntroOverlay;
import net.minecraft.client.gui.Gui;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(Gui.class)
public abstract class IntroSavingIndicatorGuard {
    @Inject(method = "renderSavingIndicator", at = @At("HEAD"), cancellable = true)
    private void hideIntroSavingIndicator(CallbackInfo callback) {
        if (SpawnIntroOverlay.active()) callback.cancel();
    }
}

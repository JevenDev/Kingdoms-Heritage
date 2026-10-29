package com.jvn.kingdomsheritage.mixin;

import com.jvn.kingdomsheritage.client.SpawnIntroOverlay;
import net.minecraft.client.MouseHandler;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(MouseHandler.class)
public abstract class IntroMouseGuard {
    @Inject(method = "turnPlayer", at = @At("HEAD"), cancellable = true)
    private void holdIntroCamera(CallbackInfo callback) {
        if (SpawnIntroOverlay.blocked()) callback.cancel();
    }
}

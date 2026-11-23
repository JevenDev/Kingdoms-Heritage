package com.jvn.kingdomsheritage.mixin;

import com.jvn.kingdomsheritage.client.SpawnIntroOverlay;
import net.minecraft.client.player.LocalPlayer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(LocalPlayer.class)
public abstract class IntroMovementGuard {
    @Inject(method = "move", at = @At("HEAD"), cancellable = true)
    private void holdCinematicPosition(CallbackInfo callback) {
        if (SpawnIntroOverlay.active() && SpawnIntroOverlay.blocked()) callback.cancel();
    }
}

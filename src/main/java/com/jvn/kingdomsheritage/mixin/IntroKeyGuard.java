package com.jvn.kingdomsheritage.mixin;

import com.jvn.kingdomsheritage.client.SpawnIntroOverlay;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(Minecraft.class)
public abstract class IntroKeyGuard {
    @Inject(method = "handleKeybinds", at = @At("HEAD"), cancellable = true)
    private void holdIntroKeys(CallbackInfo callback) {
        if (SpawnIntroOverlay.blocked()) {
            KeyMapping.releaseAll();
            callback.cancel();
        }
    }
}

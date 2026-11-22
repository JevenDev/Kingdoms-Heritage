package com.jvn.kingdomsheritage.mixin;

import com.jvn.kingdomsheritage.client.SpawnIntroOverlay;
import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.client.renderer.ItemInHandRenderer;
import net.minecraft.client.renderer.MultiBufferSource;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(ItemInHandRenderer.class)
public abstract class IntroArms {
    @Inject(method = "renderHandsWithItems", at = @At("HEAD"), cancellable = true)
    private void animateIntroArms(float partialTick, PoseStack poses, MultiBufferSource.BufferSource buffer,
                                  LocalPlayer player, int light, CallbackInfo callback) {
        if (SpawnIntroOverlay.renderSceneArms(partialTick, poses, buffer, player, light)) callback.cancel();
    }
}

package com.jvn.kingdomsheritage.mixin;

import com.jvn.kingdomsheritage.client.SpawnIntroOverlay;
import com.llamalad7.mixinextras.injector.wrapmethod.WrapMethod;
import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.client.renderer.ItemInHandRenderer;
import net.minecraft.client.renderer.MultiBufferSource;
import org.spongepowered.asm.mixin.Mixin;

@Mixin(ItemInHandRenderer.class)
public abstract class IntroArms {
    @WrapMethod(method = "renderHandsWithItems")
    private void renderIntroPlayer(float partialTick, PoseStack poses, MultiBufferSource.BufferSource buffer,
                                  LocalPlayer player, int light, Operation<Void> original) {
        if (SpawnIntroOverlay.renderSceneArms(partialTick, poses, buffer, player, light)) return;
        float reveal = SpawnIntroOverlay.gameplayHandReveal(partialTick, player);
        if (reveal >= 1F) {
            original.call(partialTick, poses, buffer, player, light);
            return;
        }
        poses.pushPose();
        try {
            poses.translate(0, -1.4F * (1 - reveal), 0);
            original.call(partialTick, poses, buffer, player, light);
        } finally {
            poses.popPose();
        }
    }
}

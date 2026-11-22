package com.jvn.kingdomsheritage.mixin;

import com.jvn.kingdomsheritage.client.SpawnIntroOverlay;
import com.llamalad7.mixinextras.injector.wrapmethod.WrapMethod;
import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import com.llamalad7.mixinextras.injector.wrapoperation.WrapOperation;
import com.llamalad7.mixinextras.sugar.Local;
import com.mojang.blaze3d.vertex.PoseStack;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.client.model.EntityModel;
import net.minecraft.client.model.PlayerModel;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.entity.LivingEntityRenderer;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;

@Mixin(LivingEntityRenderer.class)
public abstract class IntroPlayerPose {
    @Unique private List<Runnable> heritage$scenePose;

    @WrapMethod(method = "render(Lnet/minecraft/world/entity/LivingEntity;FFLcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/MultiBufferSource;I)V")
    private void restoreScenePose(LivingEntity entity, float yaw, float partialTick, PoseStack poses, MultiBufferSource buffer,
                                  int light, Operation<Void> original) {
        if (!SpawnIntroOverlay.animatesPlayerModel(entity)) {
            original.call(entity, yaw, partialTick, poses, buffer, light);
            return;
        }
        var previous = heritage$scenePose;
        var restore = new ArrayList<Runnable>();
        heritage$scenePose = restore;
        try {
            original.call(entity, yaw, partialTick, poses, buffer, light);
        } finally {
            heritage$scenePose = previous;
            restore.forEach(Runnable::run);
        }
    }

    @WrapOperation(method = "render(Lnet/minecraft/world/entity/LivingEntity;FFLcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/MultiBufferSource;I)V",
            at = @At(value = "INVOKE", target = "Lnet/minecraft/client/model/EntityModel;setupAnim(Lnet/minecraft/world/entity/Entity;FFFFF)V"))
    private void applyScenePose(EntityModel<?> model, Entity entity, float swing, float strength, float age, float yaw,
                                float pitch, Operation<Void> original, @Local(argsOnly = true, ordinal = 1) float partialTick) {
        original.call(model, entity, swing, strength, age, yaw, pitch);
        if (heritage$scenePose != null && model instanceof PlayerModel<?> player && SpawnIntroOverlay.animatesPlayerModel(entity)) {
            SpawnIntroOverlay.poseScenePlayer(player, partialTick, heritage$scenePose);
        }
    }
}

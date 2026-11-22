package com.jvn.kingdomsheritage.mixin;

import com.jvn.kingdomsheritage.client.SpawnIntroOverlay;
import net.minecraft.client.Camera;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.phys.Vec3;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(Camera.class)
public abstract class IntroCamera {
    @Shadow protected abstract void setPosition(Vec3 position);
    @Shadow protected abstract void setRotation(float yaw, float pitch, float roll);

    @Inject(method = "setup", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/Camera;setPosition(DDD)V", shift = At.Shift.AFTER))
    private void animateIntroCamera(BlockGetter level, Entity entity, boolean detached, boolean reversed,
                                    float partialTick, CallbackInfo callback) {
        Camera camera = (Camera) (Object) this;
        var pose = SpawnIntroOverlay.sceneCamera(entity, camera.getPosition(), camera.getYRot(), camera.getXRot(), camera.getRoll(), partialTick);
        applyScenePose(pose);
    }

    @Inject(method = "setup", at = @At("TAIL"))
    private void returnIntroCamera(BlockGetter level, Entity entity, boolean detached, boolean reversed,
                                   float partialTick, CallbackInfo callback) {
        applyScenePose(SpawnIntroOverlay.returnSceneCamera(entity, (Camera) (Object) this, partialTick));
    }

    @Unique
    private void applyScenePose(SpawnIntroOverlay.CameraPose pose) {
        if (pose != null) {
            setPosition(pose.position());
            setRotation(pose.yaw(), pose.pitch(), pose.roll());
        }
    }
}

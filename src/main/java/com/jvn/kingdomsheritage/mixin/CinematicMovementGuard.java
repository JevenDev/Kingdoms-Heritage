package com.jvn.kingdomsheritage.mixin;

import com.jvn.kingdomsheritage.server.SpawnIntro;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.Entity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(Entity.class)
public abstract class CinematicMovementGuard {
    @Inject(method = {"move", "push(DDD)V"}, at = @At("HEAD"), cancellable = true)
    private void holdCinematicPosition(CallbackInfo callback) {
        if ((Object) this instanceof ServerPlayer player && SpawnIntro.locked(player)) callback.cancel();
    }
}

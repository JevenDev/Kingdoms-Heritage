package com.jvn.kingdomsheritage.mixin;

import com.jvn.kingdomsheritage.client.KitSelection;
import net.minecraft.world.entity.LivingEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Pseudo;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Pseudo
@Mixin(targets = "io.github.profetgit.tidypockets.anim.PlayerHop", remap = false)
public abstract class TidyPocketsKitModel {
    @Inject(method = "offset", at = @At("HEAD"), cancellable = true, require = 0)
    private static void ignorePreviewEquipment(LivingEntity entity, CallbackInfoReturnable<Float> callback) {
        // preview loadouts temporarily change the equipment on the same player
        if (KitSelection.isRenderingPreviewPlayer(entity)) callback.setReturnValue(0F);
    }
}

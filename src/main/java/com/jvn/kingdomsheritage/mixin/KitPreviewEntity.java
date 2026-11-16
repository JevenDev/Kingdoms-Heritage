package com.jvn.kingdomsheritage.mixin;

import com.jvn.kingdomsheritage.client.KitSelection;
import net.minecraft.client.renderer.entity.EntityRenderDispatcher;
import net.minecraft.world.entity.Entity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyVariable;

@Mixin(EntityRenderDispatcher.class)
public abstract class KitPreviewEntity {
    @ModifyVariable(method = "render", at = @At("HEAD"), argsOnly = true)
    private Entity previewEntity(Entity entity) {
        return KitSelection.previewEntity(entity);
    }
}

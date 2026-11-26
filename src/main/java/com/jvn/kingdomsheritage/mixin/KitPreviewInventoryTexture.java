package com.jvn.kingdomsheritage.mixin;

import com.jvn.kingdomsheritage.client.KitInventoryTextures;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.resources.ResourceLocation;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyVariable;

@Mixin(GuiGraphics.class)
public abstract class KitPreviewInventoryTexture {
    @ModifyVariable(method = "blit(Lnet/minecraft/resources/ResourceLocation;IIIIII)V", at = @At("HEAD"), argsOnly = true)
    private ResourceLocation kitInventoryTexture(ResourceLocation texture) {
        return KitInventoryTextures.previewTexture(texture);
    }
}

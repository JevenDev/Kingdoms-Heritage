package com.jvn.kingdomsheritage.mixin;

import com.jvn.kingdomsheritage.client.SelectionGuiScale;
import net.minecraft.client.Minecraft;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyArg;

@Mixin(Minecraft.class)
public abstract class SelectionGuiScaleOverride {
    @ModifyArg(method = "resizeDisplay", at = @At(value = "INVOKE",
            target = "Lcom/mojang/blaze3d/platform/Window;calculateScale(IZ)I"), index = 0)
    private int overrideSelectionGuiScale(int playerScale) {
        return SelectionGuiScale.requested(playerScale);
    }
}

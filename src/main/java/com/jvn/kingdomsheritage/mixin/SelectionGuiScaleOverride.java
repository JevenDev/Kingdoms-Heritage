package com.jvn.kingdomsheritage.mixin;

import com.jvn.kingdomsheritage.client.SelectionGuiScale;
import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import com.llamalad7.mixinextras.injector.wrapoperation.WrapOperation;
import com.mojang.blaze3d.platform.Window;
import net.minecraft.client.Minecraft;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

@Mixin(Minecraft.class)
public abstract class SelectionGuiScaleOverride {
    @WrapOperation(method = "resizeDisplay", at = @At(value = "INVOKE",
            target = "Lcom/mojang/blaze3d/platform/Window;calculateScale(IZ)I"))
    private int overrideSelectionGuiScale(Window window, int playerScale, boolean forceUnicode, Operation<Integer> original) {
        return SelectionGuiScale.calculate(window, playerScale, forceUnicode,
                requested -> original.call(window, requested, forceUnicode));
    }
}

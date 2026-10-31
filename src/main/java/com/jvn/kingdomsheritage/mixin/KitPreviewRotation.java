package com.jvn.kingdomsheritage.mixin;

import com.jvn.kingdomsheritage.client.KitSelection;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.inventory.InventoryScreen;
import net.minecraft.world.entity.LivingEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyVariable;

@Mixin(InventoryScreen.class)
public abstract class KitPreviewRotation {
    @ModifyVariable(method = "renderEntityInInventoryFollowsAngle", at = @At("HEAD"), argsOnly = true, ordinal = 1)
    private static float smoothYaw(float angle, GuiGraphics graphics, int left, int top, int right, int bottom,
                                   int scale, float offset, float yaw, float pitch, LivingEntity entity) {
        return KitSelection.previewAngle(entity, angle, (left + right) / 2F, true);
    }

    @ModifyVariable(method = "renderEntityInInventoryFollowsAngle", at = @At("HEAD"), argsOnly = true, ordinal = 2)
    private static float smoothPitch(float angle, GuiGraphics graphics, int left, int top, int right, int bottom,
                                     int scale, float offset, float yaw, float pitch, LivingEntity entity) {
        return KitSelection.previewAngle(entity, angle, (top + bottom) / 2F, false);
    }
}

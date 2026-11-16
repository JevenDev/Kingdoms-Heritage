package com.jvn.kingdomsheritage.mixin;

import net.minecraft.world.entity.LivingEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Invoker;

@Mixin(LivingEntity.class)
public interface KitEquipmentUpdates {
    @Invoker("detectEquipmentUpdates")
    void heritage$refreshEquipment();
}

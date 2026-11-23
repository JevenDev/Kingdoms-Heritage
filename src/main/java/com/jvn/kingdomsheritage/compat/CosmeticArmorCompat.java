package com.jvn.kingdomsheritage.compat;

import java.util.List;
import java.util.function.IntFunction;
import lain.mods.cos.api.CosArmorAPI;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;

final class CosmeticArmorCompat {
    private CosmeticArmorCompat() {}

    static void addSlots(Player player, List<EquipmentCompat.Slot> slots) {
        var stacks = player.level().isClientSide ? CosArmorAPI.getCAStacksClient(player.getUUID())
                : CosArmorAPI.getCAStacks(player.getUUID());
        for (var equipmentSlot : EquipmentCompat.ARMOR_SLOTS) {
            int index = equipmentSlot.getIndex();
            slots.add(new EquipmentCompat.Slot(EquipmentCompat.COSMETIC_ARMOR, "", index, false,
                    () -> stacks.getStackInSlot(index), stack -> stacks.setStackInSlot(index, stack)));
        }
    }

    static void preview(Player player, IntFunction<ItemStack> items) {
        var stacks = CosArmorAPI.getCAStacksClient(player.getUUID());
        for (var equipmentSlot : EquipmentCompat.ARMOR_SLOTS) {
            int index = equipmentSlot.getIndex();
            stacks.setStackInSlot(index, items.apply(index));
        }
    }
}

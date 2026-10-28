package com.jvn.kingdomsheritage.compat;

import java.util.List;
import net.minecraft.world.entity.player.Player;
import top.theillusivec4.curios.api.CuriosApi;

final class CuriosCompat {
    private CuriosCompat() {}

    static void addSlots(Player player, List<EquipmentCompat.Slot> slots) {
        CuriosApi.getCuriosInventory(player).ifPresent(inventory ->
                inventory.getCurios().forEach((name, handler) -> {
                    for (boolean cosmetic : new boolean[]{false, true}) {
                        var stacks = cosmetic ? handler.getCosmeticStacks() : handler.getStacks();
                        for (int index = 0; index < stacks.getSlots(); index++) {
                            int slot = index;
                            slots.add(new EquipmentCompat.Slot("curios", name, slot, cosmetic,
                                    () -> stacks.getStackInSlot(slot), stack -> stacks.setStackInSlot(slot, stack)));
                        }
                    }
                }));
    }
}

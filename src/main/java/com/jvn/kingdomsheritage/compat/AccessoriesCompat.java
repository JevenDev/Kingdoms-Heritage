package com.jvn.kingdomsheritage.compat;

import io.wispforest.accessories.api.AccessoriesCapability;
import java.util.List;
import net.minecraft.world.entity.player.Player;

final class AccessoriesCompat {
    private AccessoriesCompat() {}

    static void addSlots(Player player, List<EquipmentCompat.Slot> slots) {
        var capability = AccessoriesCapability.get(player);
        if (capability == null) return;
        capability.getContainers().forEach((name, container) -> {
            for (boolean cosmetic : new boolean[]{false, true}) {
                var stacks = cosmetic ? container.getCosmeticAccessories() : container.getAccessories();
                for (int index = 0; index < stacks.getContainerSize(); index++) {
                    int slot = index;
                    slots.add(new EquipmentCompat.Slot("accessories", name, slot, cosmetic,
                            () -> stacks.getItem(slot), stack -> {
                                stacks.setItem(slot, stack);
                                container.markChanged(false);
                            }));
                }
            }
        });
    }
}

package com.jvn.kingdomsheritage.data;

import com.jvn.kingdomsheritage.HeritageConfig.InventoryPolicy;
import com.jvn.kingdomsheritage.compat.EquipmentCompat;
import java.util.List;
import net.minecraft.world.item.ItemStack;

public final class KitLoadout {
    private KitLoadout() {}

    public static void apply(net.minecraft.world.entity.player.Player player, KitDefinition kit, List<KitDefinition.StackEntry> entries, InventoryPolicy policy) {
        if (policy == InventoryPolicy.PRESERVE) return;
        var slots = EquipmentCompat.slots(player);
        var inventory = player.getInventory();
        var previous = inventory.items.stream().map(ItemStack::copy).toList();
        var previousArmor = inventory.armor.stream().map(ItemStack::copy).toList();
        ItemStack offhand = inventory.offhand.getFirst().copy();
        var equipment = slots.stream().map(slot -> slot.get().get().copy()).toList();
        int selected = inventory.selected;
        try {
            if (policy == InventoryPolicy.REPLACE) {
                inventory.clearContent();
                slots.forEach(slot -> slot.set().accept(ItemStack.EMPTY));
            }
            for (var entry : entries) {
                if (entry.inventory().equals("player")) {
                    if (policy == InventoryPolicy.REPLACE || inventory.getItem(entry.index()).isEmpty()) {
                        inventory.setItem(entry.index(), entry.stack().copy());
                    } else merge(inventory, entry.stack().copy());
                } else {
                    var slot = slots.stream().filter(value -> value.matches(entry)).findFirst().orElseThrow();
                    if (policy == InventoryPolicy.REPLACE || slot.get().get().isEmpty()) slot.set().accept(entry.stack().copy());
                    else merge(inventory, entry.stack().copy());
                }
            }
            if (policy == InventoryPolicy.REPLACE || previous.stream().allMatch(ItemStack::isEmpty)) inventory.selected = kit.selectedSlot();
            inventory.setChanged();
            player.inventoryMenu.broadcastChanges();
        } catch (RuntimeException error) {
            for (int index = 0; index < previous.size(); index++) inventory.items.set(index, previous.get(index));
            for (int index = 0; index < previousArmor.size(); index++) inventory.armor.set(index, previousArmor.get(index));
            inventory.offhand.set(0, offhand);
            inventory.selected = selected;
            for (int index = 0; index < slots.size(); index++) slots.get(index).set().accept(equipment.get(index));
            inventory.setChanged();
            player.inventoryMenu.broadcastChanges();
            throw error;
        }
    }

    private static void merge(net.minecraft.world.entity.player.Inventory inventory, ItemStack stack) {
        for (var existing : inventory.items) {
            if (!existing.isEmpty() && ItemStack.isSameItemSameComponents(existing, stack)) {
                int count = Math.min(stack.getCount(), existing.getMaxStackSize() - existing.getCount());
                if (count > 0) {
                    existing.grow(count);
                    stack.shrink(count);
                }
                if (stack.isEmpty()) return;
            }
        }
        for (int index = 0; index < inventory.items.size(); index++) {
            if (inventory.items.get(index).isEmpty()) {
                inventory.items.set(index, stack.copy());
                return;
            }
        }
        throw new IllegalArgumentException("There is not enough inventory space for this kit. Choose a smaller kit or ask an administrator to recover your selection");
    }

}

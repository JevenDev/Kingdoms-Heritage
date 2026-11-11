package com.jvn.kingdomsheritage.data;

import com.jvn.kingdomsheritage.HeritageConfig.InventoryPolicy;
import com.jvn.kingdomsheritage.compat.EquipmentCompat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.IntConsumer;
import java.util.function.IntFunction;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;

public final class KitLoadout {
    private KitLoadout() {}

    private record EquipmentSlot(String inventory, String name, int index, boolean cosmetic) {
        static EquipmentSlot of(EquipmentCompat.Slot slot) {
            return new EquipmentSlot(slot.inventory(), slot.name(), slot.index(), slot.cosmetic());
        }

        static EquipmentSlot of(KitDefinition.StackEntry entry) {
            return new EquipmentSlot(entry.inventory(), entry.slot(), entry.index(), entry.cosmetic());
        }
    }

    public static final class Snapshot {
        private final List<ItemStack> items;
        private final Map<EquipmentSlot, ItemStack> equipment;
        private final int selected;
        private final int[] purchaseIndices;

        private Snapshot(List<ItemStack> items, Map<EquipmentSlot, ItemStack> equipment, int selected, int[] purchaseIndices) {
            this.items = items;
            this.equipment = equipment;
            this.selected = selected;
            this.purchaseIndices = purchaseIndices;
        }

        public ItemStack item(int index) { return items.get(index).copy(); }

        public int purchaseIndex(int slot) {
            return purchaseIndices == null || slot < 0 || slot >= purchaseIndices.length ? -1 : purchaseIndices[slot];
        }

        public boolean matches(Player player) {
            var inventory = player.getInventory();
            if (inventory.selected != selected || inventory.getContainerSize() != items.size()) return false;
            for (int slot = 0; slot < items.size(); slot++) {
                if (!ItemStack.matches(inventory.getItem(slot), items.get(slot))) return false;
            }
            var slots = EquipmentCompat.slots(player);
            if (slots.size() != equipment.size()) return false;
            for (var slot : slots) {
                var stack = equipment.get(EquipmentSlot.of(slot));
                if (stack == null || !ItemStack.matches(slot.get().get(), stack)) return false;
            }
            return true;
        }

        public void write(Player player, boolean copy) {
            var inventory = player.getInventory();
            for (int slot = 0; slot < items.size(); slot++) {
                var stack = items.get(slot);
                if (changed(inventory.getItem(slot), stack, copy)) inventory.setItem(slot, copy ? stack.copy() : stack);
            }
            RuntimeException failure = null;
            for (var slot : EquipmentCompat.slots(player)) {
                var stack = equipment.getOrDefault(EquipmentSlot.of(slot), ItemStack.EMPTY);
                try {
                    if (changed(slot.get().get(), stack, copy)) slot.set().accept(copy ? stack.copy() : stack);
                } catch (RuntimeException error) {
                    if (failure == null) failure = error;
                    else if (failure != error) failure.addSuppressed(error);
                }
            }
            inventory.selected = selected;
            if (failure != null) throw failure;
        }

        private static boolean changed(ItemStack current, ItemStack next, boolean copy) {
            return copy ? !ItemStack.matches(current, next) : current != next;
        }
    }

    public static Snapshot capture(Player player, boolean copy) {
        var inventory = player.getInventory();
        var items = new ArrayList<ItemStack>(inventory.getContainerSize());
        for (int slot = 0; slot < inventory.getContainerSize(); slot++) {
            var stack = inventory.getItem(slot);
            items.add(copy ? stack.copy() : stack);
        }
        var equipment = new LinkedHashMap<EquipmentSlot, ItemStack>();
        for (var slot : EquipmentCompat.slots(player)) {
            var stack = slot.get().get();
            equipment.put(EquipmentSlot.of(slot), copy ? stack.copy() : stack);
        }
        return new Snapshot(items, equipment, inventory.selected, null);
    }

    public static Snapshot plan(Snapshot original, int mainSize, KitDefinition kit,
                                List<KitDefinition.StackEntry> entries, InventoryPolicy policy) {
        if (policy == InventoryPolicy.PRESERVE) return original;
        boolean replace = policy == InventoryPolicy.REPLACE;
        var items = new ArrayList<ItemStack>(original.items.size());
        original.items.forEach(stack -> items.add(replace ? ItemStack.EMPTY : stack.copy()));
        var equipment = new LinkedHashMap<EquipmentSlot, ItemStack>();
        original.equipment.forEach((slot, stack) -> equipment.put(slot, replace ? ItemStack.EMPTY : stack.copy()));
        int[] purchaseIndices = new int[items.size()];
        Arrays.fill(purchaseIndices, -1);
        int purchases = 0;
        for (var entry : entries) {
            if (entry.inventory().equals("player")) {
                if (entry.purchase()) {
                    int purchaseIndex = purchases++;
                    placePurchase(items, mainSize, entry.index(), entry.stack().copy(), slot -> purchaseIndices[slot] = purchaseIndex);
                } else if (replace || items.get(entry.index()).isEmpty()) items.set(entry.index(), entry.stack().copy());
                else merge(items, mainSize, entry.stack().copy());
            } else {
                var slot = EquipmentSlot.of(entry);
                var current = equipment.get(slot);
                if (current == null) throw new HeritageException("equipment", "Unavailable equipment slot: %s",
                        entry.inventory() + "/" + entry.slot() + "/" + entry.index());
                if (replace || current.isEmpty()) equipment.put(slot, entry.stack().copy());
                else merge(items, mainSize, entry.stack().copy());
            }
        }
        int selected = replace || original.items.subList(0, mainSize).stream().allMatch(ItemStack::isEmpty)
                ? kit.selectedSlot() : original.selected;
        return new Snapshot(items, equipment, selected, purchaseIndices);
    }

    static int purchaseSlot(IntFunction<ItemStack> items, int mainSize, int equipment, ItemStack stack) {
        int matching = -1, empty = -1, remaining = stack.getCount();
        for (int slot = 0; slot < mainSize; slot++) {
            var current = items.apply(slot);
            if (current.isEmpty() && empty < 0) empty = slot;
            int capacity = stackRoom(current, stack);
            if (capacity > 0) {
                if (matching < 0) matching = slot;
                remaining -= capacity;
            }
        }
        if (matching >= 0 && (remaining <= 0 || empty >= 0)) return matching;
        if (equipment >= 0 && items.apply(equipment).isEmpty()) return equipment;
        return empty;
    }

    static void placePurchase(List<ItemStack> items, int mainSize, int slot, ItemStack stack, IntConsumer filled) {
        var target = items.get(slot);
        if (!target.isEmpty() && (slot >= mainSize || stackRoom(target, stack) == 0)) {
            throw new HeritageException("shop_occupied", "A starter kit slot is already occupied");
        }
        if (slot >= mainSize) {
            items.set(slot, stack);
            filled.accept(slot);
            return;
        }
        if (fillStack(target, stack)) filled.accept(slot);
        for (int i = 0; i < mainSize && !stack.isEmpty(); i++) {
            if (i != slot && fillStack(items.get(i), stack)) filled.accept(i);
        }
        if (stack.isEmpty()) return;
        if (target.isEmpty()) {
            items.set(slot, stack);
            filled.accept(slot);
        } else {
            filled.accept(putInEmptySlot(items, mainSize, stack));
        }
    }

    private static int stackRoom(ItemStack current, ItemStack offered) {
        if (current.isEmpty() || !ItemStack.isSameItemSameComponents(current, offered)) return 0;
        return Math.max(0, current.getMaxStackSize() - current.getCount());
    }

    private static boolean fillStack(ItemStack current, ItemStack incoming) {
        int count = Math.min(incoming.getCount(), stackRoom(current, incoming));
        if (count == 0) return false;
        current.grow(count);
        incoming.shrink(count);
        return true;
    }

    private static void merge(List<ItemStack> items, int mainSize, ItemStack stack) {
        for (int slot = 0; slot < mainSize; slot++) {
            fillStack(items.get(slot), stack);
            if (stack.isEmpty()) return;
        }
        putInEmptySlot(items, mainSize, stack);
    }

    private static int putInEmptySlot(List<ItemStack> items, int mainSize, ItemStack stack) {
        for (int slot = 0; slot < mainSize; slot++) {
            if (items.get(slot).isEmpty()) {
                items.set(slot, stack);
                return slot;
            }
        }
        throw new HeritageException("full_inventory", "There is not enough inventory space for this kit. Choose a smaller kit or ask an administrator to recover your selection");
    }
}

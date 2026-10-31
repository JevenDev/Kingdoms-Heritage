package com.jvn.kingdomsheritage.client;

import com.jvn.kingdomsheritage.HeritageConfig.InventoryPolicy;
import com.jvn.kingdomsheritage.compat.EquipmentCompat;
import com.jvn.kingdomsheritage.data.KitDefinition;
import com.jvn.kingdomsheritage.data.KitLoadout;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;

final class KitPreview {
    private final Player player;
    private Snapshot original;
    private Snapshot expected;
    private KitDefinition kit;
    private InventoryPolicy policy;
    private IllegalArgumentException failure;

    KitPreview(Player player) {
        this.player = player;
    }

    void apply(KitDefinition kit, List<KitDefinition.StackEntry> stacks, InventoryPolicy policy) {
        if (this.kit == kit && this.policy == policy && original != null && original.matches(player)) {
            if (failure != null) throw failure;
            return;
        }
        var actual = Snapshot.capture(player, false);
        original = Snapshot.capture(player, true);
        expected = null;
        failure = null;
        this.kit = kit;
        this.policy = policy;
        try {
            if (kit != null) {
                if (policy != InventoryPolicy.PRESERVE) EquipmentCompat.validate(player, stacks);
                Snapshot.capture(player, true).restore(player, false);
                KitLoadout.apply(player, kit, stacks, policy);
            }
            expected = Snapshot.capture(player, true);
        } catch (IllegalArgumentException error) {
            failure = error;
            throw error;
        } finally {
            actual.restore(player, false);
        }
    }

    void render(Runnable draw) {
        if (expected == null) {
            draw.run();
            return;
        }
        // keep preview stacks out of packet processing and player ticks
        var actual = Snapshot.capture(player, false);
        try {
            expected.restore(player, true);
            draw.run();
        } finally {
            actual.restore(player, false);
        }
    }

    private record EquipmentSlot(String inventory, String name, int index, boolean cosmetic) {
        static EquipmentSlot of(EquipmentCompat.Slot slot) {
            return new EquipmentSlot(slot.inventory(), slot.name(), slot.index(), slot.cosmetic());
        }
    }

    private record Snapshot(List<ItemStack> inventory, Map<EquipmentSlot, ItemStack> equipment, int selected) {
        static Snapshot capture(Player player, boolean copy) {
            List<ItemStack> inventory = new ArrayList<>();
            for (int slot = 0; slot < player.getInventory().getContainerSize(); slot++) {
                var stack = player.getInventory().getItem(slot);
                inventory.add(copy ? stack.copy() : stack);
            }
            Map<EquipmentSlot, ItemStack> equipment = new HashMap<>();
            for (var slot : EquipmentCompat.slots(player)) {
                var stack = slot.get().get();
                equipment.put(EquipmentSlot.of(slot), copy ? stack.copy() : stack);
            }
            return new Snapshot(inventory, equipment, player.getInventory().selected);
        }

        boolean matches(Player player) {
            var current = player.getInventory();
            if (current.selected != selected || current.getContainerSize() != inventory.size()) return false;
            for (int slot = 0; slot < inventory.size(); slot++) {
                if (!ItemStack.matches(current.getItem(slot), inventory.get(slot))) return false;
            }
            var slots = EquipmentCompat.slots(player);
            if (slots.size() != equipment.size()) return false;
            for (var slot : slots) {
                var stack = equipment.get(EquipmentSlot.of(slot));
                if (stack == null || !ItemStack.matches(slot.get().get(), stack)) return false;
            }
            return true;
        }

        void restore(Player player, boolean copy) {
            for (int slot = 0; slot < inventory.size(); slot++) {
                var stack = inventory.get(slot);
                if (copy ? !ItemStack.matches(player.getInventory().getItem(slot), stack) : player.getInventory().getItem(slot) != stack) {
                    player.getInventory().setItem(slot, copy ? stack.copy() : stack);
                }
            }
            for (var slot : EquipmentCompat.slots(player)) {
                var stack = equipment.getOrDefault(EquipmentSlot.of(slot), ItemStack.EMPTY);
                if (copy ? !ItemStack.matches(slot.get().get(), stack) : slot.get().get() != stack) {
                    slot.set().accept(copy ? stack.copy() : stack);
                }
            }
            player.getInventory().selected = selected;
        }
    }
}

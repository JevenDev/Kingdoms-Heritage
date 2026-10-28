package com.jvn.kingdomsheritage.compat;

import com.jvn.kingdomsheritage.data.KitDefinition.StackEntry;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import java.util.function.Supplier;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.neoforged.fml.ModList;

public final class EquipmentCompat {
    public record Slot(String inventory, String name, int index, boolean cosmetic,
                       Supplier<ItemStack> get, Consumer<ItemStack> set) {
        public boolean matches(StackEntry entry) {
            return inventory.equals(entry.inventory()) && name.equals(entry.slot())
                    && index == entry.index() && cosmetic == entry.cosmetic();
        }
    }

    private EquipmentCompat() {}

    public static List<Slot> slots(Player player) {
        List<Slot> slots = new ArrayList<>();
        if (ModList.get().isLoaded("accessories")) AccessoriesCompat.addSlots(player, slots);
        if (ModList.get().isLoaded("curios") && !ModList.get().isLoaded("curios_compat_layer")) CuriosCompat.addSlots(player, slots);
        return slots;
    }

    public static void validate(Player player, List<StackEntry> entries) {
        var slots = slots(player);
        for (var entry : entries) {
            if (entry.inventory().equals("player")) continue;
            if (slots.stream().noneMatch(slot -> slot.matches(entry))) {
                throw new IllegalArgumentException("Unavailable equipment slot: " + entry.inventory() + "/" + entry.slot() + "/" + entry.index());
            }
        }
    }
}

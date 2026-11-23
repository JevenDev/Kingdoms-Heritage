package com.jvn.kingdomsheritage.compat;

import com.jvn.kingdomsheritage.data.HeritageException;
import com.jvn.kingdomsheritage.data.KitDefinition.StackEntry;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import java.util.function.IntFunction;
import java.util.function.Supplier;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.neoforged.fml.ModList;

public final class EquipmentCompat {
    public static final String COSMETIC_ARMOR = "cosmeticarmorreworked";
    public static final List<EquipmentSlot> ARMOR_SLOTS = List.of(EquipmentSlot.FEET, EquipmentSlot.LEGS,
            EquipmentSlot.CHEST, EquipmentSlot.HEAD);

    public record Slot(String inventory, String name, int index, boolean cosmetic,
                       Supplier<ItemStack> get, Consumer<ItemStack> set) {
        public boolean matches(StackEntry entry) {
            return inventory.equals(entry.inventory()) && name.equals(entry.slot())
                    && index == entry.index() && cosmetic == entry.cosmetic();
        }
    }

    private EquipmentCompat() {}

    public static List<Slot> slots(Player player) {
        return slots(player, true);
    }

    public static List<Slot> slots(Player player, boolean includeCosmeticArmor) {
        List<Slot> slots = new ArrayList<>();
        if (ModList.get().isLoaded("accessories")) AccessoriesCompat.addSlots(player, slots);
        if (ModList.get().isLoaded("curios") && !ModList.get().isLoaded("curios_compat_layer")) CuriosCompat.addSlots(player, slots);
        if (includeCosmeticArmor && ModList.get().isLoaded(COSMETIC_ARMOR)) CosmeticArmorCompat.addSlots(player, slots);
        return slots;
    }

    public static void previewCosmeticArmor(Player player, IntFunction<ItemStack> items) {
        if (ModList.get().isLoaded(COSMETIC_ARMOR)) CosmeticArmorCompat.preview(player, items);
    }

    public static void validate(Player player, List<StackEntry> entries) {
        var slots = slots(player);
        for (var entry : entries) {
            if (entry.inventory().equals("player")) continue;
            if (slots.stream().noneMatch(slot -> slot.matches(entry))) {
                throw new HeritageException("equipment", "Unavailable equipment slot: %s", entry.inventory() + "/" + entry.slot() + "/" + entry.index());
            }
            if (COSMETIC_ARMOR.equals(entry.inventory()) && !entry.stack().canEquip(ARMOR_SLOTS.get(entry.index()), player)) {
                throw new HeritageException("equipment", "Item does not fit cosmetic armor slot: %s",
                        ARMOR_SLOTS.get(entry.index()).getName());
            }
        }
    }
}

package com.jvn.kingdomsheritage.data;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.mojang.serialization.JsonOps;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import net.minecraft.core.HolderLookup;
import net.minecraft.resources.RegistryOps;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.GsonHelper;
import net.minecraft.world.item.ItemStack;

public record KitDefinition(ResourceLocation id, String title, String description, int order,
                            int selectedSlot, List<Entry> entries, List<String> tags, String titleKey, String descriptionKey) {
    public record Entry(String inventory, String slot, int index, boolean cosmetic, JsonObject item) {}
    public record StackEntry(String inventory, String slot, int index, boolean cosmetic, ItemStack stack) {}

    public static KitDefinition parse(ResourceLocation id, JsonObject json) {
        String title = DefinitionJson.text(json, "title", 120, false);
        String description = DefinitionJson.text(json, "description", 4000, true);
        int selectedSlot = GsonHelper.getAsInt(json, "selected_slot", 0);
        if (selectedSlot < 0 || selectedSlot > 8) throw new IllegalArgumentException("selected_slot must be 0 to 8");
        JsonArray array = GsonHelper.getAsJsonArray(json, "items");
        if (array.size() > 256) throw new IllegalArgumentException("A kit may contain at most 256 item entries");
        List<Entry> entries = new ArrayList<>();
        var occupied = new HashSet<String>();
        for (var element : array) {
            JsonObject entry = element.getAsJsonObject();
            String inventory = GsonHelper.getAsString(entry, "inventory", "player");
            if (!List.of("player", "curios", "accessories").contains(inventory)) {
                throw new IllegalArgumentException("Unknown inventory: " + inventory);
            }
            String slot = GsonHelper.getAsString(entry, "slot", "");
            int index = GsonHelper.getAsInt(entry, "index");
            boolean cosmetic = GsonHelper.getAsBoolean(entry, "cosmetic", false);
            if (index < 0 || index > 255 || (inventory.equals("player") && (index > 40 || cosmetic || !slot.isEmpty()))) {
                throw new IllegalArgumentException("Invalid slot in " + inventory + ": " + index);
            }
            if (!inventory.equals("player") && (slot.isBlank() || slot.length() > 128)) {
                throw new IllegalArgumentException("Equipment entries require a slot name");
            }
            if (!occupied.add(inventory + "/" + slot + "/" + index + "/" + cosmetic)) {
                throw new IllegalArgumentException("Duplicate kit slot");
            }
            entries.add(new Entry(inventory, slot, index, cosmetic, GsonHelper.getAsJsonObject(entry, "item").deepCopy()));
        }
        return new KitDefinition(id, title, description, GsonHelper.getAsInt(json, "order", 0), selectedSlot, List.copyOf(entries),
                DefinitionJson.ids(json, "tags", false), DefinitionJson.text(json, "title_key", 256, true),
                DefinitionJson.text(json, "description_key", 256, true));
    }

    public List<StackEntry> decode(HolderLookup.Provider registries) {
        var ops = RegistryOps.create(JsonOps.INSTANCE, registries);
        return entries.stream().map(entry -> {
            ItemStack stack = ItemStack.CODEC.parse(ops, entry.item()).getOrThrow(IllegalArgumentException::new);
            if (stack.isEmpty() || stack.getCount() > stack.getMaxStackSize()) {
                throw new com.jvn.kingdomsheritage.data.HeritageException("item_count", "Invalid item count in kit %s", id.toString());
            }
            return new StackEntry(entry.inventory(), entry.slot(), entry.index(), entry.cosmetic(), stack);
        }).toList();
    }
}

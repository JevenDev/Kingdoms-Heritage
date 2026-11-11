package com.jvn.kingdomsheritage.data;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.jvn.kingdomsheritage.HeritageConfig.InventoryPolicy;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.GsonHelper;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

public record KitShop(int budget, List<Offer> offers, List<Section> sections) {
    public static final int MAX_OFFERS = 256;
    public static final int MAX_PICKS = 41;
    private static final int MAX_POINTS = 1_000_000;

    public record Section(String id, String name, ResourceLocation icon) {}
    public record Offer(JsonObject item, int cost, int limit, String section) {
        public Offer(JsonObject item, int cost, int limit) { this(item, cost, limit, ""); }
    }

    public KitShop(int budget, List<Offer> offers) { this(budget, offers, List.of()); }
    public record Pick(int offer, int slot) {}

    static KitShop parse(JsonObject json) {
        int budget = integer(json.get("budget"), "budget", 0, MAX_POINTS);
        JsonArray stock = GsonHelper.getAsJsonArray(json, "offers");
        if (stock.isEmpty() || stock.size() > MAX_OFFERS) {
            throw new IllegalArgumentException("A kit shop requires between 1 and " + MAX_OFFERS + " offers");
        }
        var sections = new ArrayList<Section>();
        var sectionIds = new HashSet<String>();
        if (json.has("sections")) {
            var values = GsonHelper.getAsJsonArray(json, "sections");
            if (values.size() > MAX_OFFERS) throw new IllegalArgumentException("A kit shop may contain at most 256 sections");
            for (var value : values) {
                var section = GsonHelper.convertToJsonObject(value, "section");
                String id = sectionText(section, "id", 64);
                if (!id.matches("[a-z0-9_-]+") || !sectionIds.add(id)) {
                    throw new IllegalArgumentException("Invalid or duplicate shop section ID: " + id);
                }
                String name = sectionText(section, "name", 120);
                String icon = sectionText(section, "icon", Integer.MAX_VALUE);
                if (!icon.matches("(?:[a-z0-9_.-]+:)?[a-z0-9/._-]+")) {
                    throw new IllegalArgumentException("Invalid shop section item ID: " + icon);
                }
                sections.add(new Section(id, name, ResourceLocation.parse(icon)));
            }
        }
        var offers = new ArrayList<Offer>();
        for (var value : stock) {
            var offer = GsonHelper.convertToJsonObject(value, "offer");
            String section = offer.has("section") ? sectionText(offer, "section", 64) : "";
            if (!section.isEmpty() && !sectionIds.contains(section)) {
                throw new IllegalArgumentException("Unknown shop section: " + section);
            }
            offers.add(new Offer(GsonHelper.getAsJsonObject(offer, "item").deepCopy(),
                    integer(offer.get("cost"), "cost", 0, MAX_POINTS),
                    offer.has("limit") ? integer(offer.get("limit"), "limit", 1, MAX_PICKS) : 1, section));
        }
        return new KitShop(budget, List.copyOf(offers), List.copyOf(sections));
    }

    private static String sectionText(JsonObject json, String field, int max) {
        var value = json.get(field);
        if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isString()) {
            throw new IllegalArgumentException("Shop section " + field + " must be text");
        }
        String text = value.getAsString();
        if (text.isBlank() || text.length() > max) throw new IllegalArgumentException("Invalid shop section " + field);
        return text;
    }

    private static int integer(JsonElement value, String field, int min, int max) {
        if (value != null && value.isJsonPrimitive() && value.getAsJsonPrimitive().isNumber()) {
            try {
                int number = value.getAsBigDecimal().intValueExact();
                if (number >= min && number <= max) return number;
            } catch (ArithmeticException ignored) {
                throw new IllegalArgumentException(field + " must be an integer from " + min + " to " + max);
            }
        }
        throw new IllegalArgumentException(field + " must be an integer from " + min + " to " + max);
    }

    public JsonObject json() {
        var json = new JsonObject();
        json.addProperty("budget", budget);
        if (!sections.isEmpty()) {
            var tabs = new JsonArray();
            for (var section : sections) {
                var value = new JsonObject();
                value.addProperty("id", section.id());
                value.addProperty("name", section.name());
                value.addProperty("icon", section.icon().toString());
                tabs.add(value);
            }
            json.add("sections", tabs);
        }
        var stock = new JsonArray();
        for (var offer : offers) {
            var value = new JsonObject();
            value.addProperty("cost", offer.cost());
            if (offer.limit() != 1) value.addProperty("limit", offer.limit());
            if (!offer.section().isEmpty()) value.addProperty("section", offer.section());
            value.add("item", offer.item().deepCopy());
            stock.add(value);
        }
        json.add("offers", stock);
        return json;
    }

    public int cost(List<Pick> picks) {
        if (picks.size() > MAX_PICKS) throw new HeritageException("shop_picks", "Too many starter kit offers selected");
        int[] counts = new int[offers.size()];
        int total = 0;
        for (var pick : picks) {
            int index = pick.offer();
            if (index < 0 || index >= offers.size()) {
                throw new HeritageException("shop_offer", "Unknown starter kit offer");
            }
            var offer = offers.get(index);
            if (++counts[index] > offer.limit()) {
                throw new HeritageException("shop_limit", "You have reached the purchase limit for this offer");
            }
            total += offer.cost();
        }
        if (total > budget) throw new HeritageException("shop_budget", "This kit costs %s points but has a budget of %s", total, budget);
        return total;
    }

    public List<KitDefinition.StackEntry> loadout(Player player, InventoryPolicy policy, List<KitDefinition.StackEntry> fixed,
                                                   List<ItemStack> stock, List<Pick> picks) {
        cost(picks);
        if (picks.isEmpty()) return fixed;
        if (policy == InventoryPolicy.PRESERVE) {
            throw new HeritageException("shop_preserve", "This start keeps your existing equipment");
        }
        long occupied = occupiedSlots(player, policy, fixed, List.of());
        var entries = new ArrayList<KitDefinition.StackEntry>(fixed.size() + picks.size());
        for (var pick : picks) {
            int slot = pick.slot();
            var stack = stock.get(pick.offer());
            if (slot < 0 || slot >= MAX_PICKS || slot >= 36 && slot != equipmentSlot(player, stack)) {
                throw new HeritageException("shop_slot", "This stack does not fit in the selected slot");
            }
            long bit = 1L << slot;
            if ((occupied & bit) != 0) throw new HeritageException("shop_occupied", "A starter kit slot is already occupied");
            occupied |= bit;
            entries.add(new KitDefinition.StackEntry("player", "", slot, false, stack));
        }
        entries.addAll(fixed);
        return List.copyOf(entries);
    }

    public static int nextSlot(Player player, InventoryPolicy policy, List<KitDefinition.StackEntry> fixed,
                               List<Pick> picks, ItemStack stack) {
        return nextSlot(player, occupiedSlots(player, policy, fixed, picks), stack);
    }

    public static int nextSlot(Player player, long occupied, ItemStack stack) {
        int equipment = equipmentSlot(player, stack);
        if (equipment >= 0 && (occupied & (1L << equipment)) == 0) return equipment;
        int slot = Long.numberOfTrailingZeros(~occupied);
        return slot < 36 ? slot : -1;
    }

    public static long occupiedSlots(Player player, InventoryPolicy policy, List<KitDefinition.StackEntry> fixed,
                                     List<Pick> picks) {
        long occupied = 0;
        if (policy == InventoryPolicy.MERGE) {
            for (int index = 0; index < MAX_PICKS; index++) {
                if (!player.getInventory().getItem(index).isEmpty()) occupied |= 1L << index;
            }
        }
        for (var entry : fixed) if (entry.inventory().equals("player")) occupied |= 1L << entry.index();
        for (var pick : picks) occupied |= 1L << pick.slot();
        return occupied;
    }

    private static int equipmentSlot(Player player, ItemStack stack) {
        if (stack.is(Items.SHIELD)) return 40;
        return switch (player.getEquipmentSlotForItem(stack)) {
            case FEET -> 36;
            case LEGS -> 37;
            case CHEST -> 38;
            case HEAD -> 39;
            case OFFHAND -> 40;
            default -> -1;
        };
    }
}

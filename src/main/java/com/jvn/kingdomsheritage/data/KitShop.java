package com.jvn.kingdomsheritage.data;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.jvn.kingdomsheritage.HeritageConfig.InventoryPolicy;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.util.GsonHelper;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

public record KitShop(int budget, List<Offer> offers) {
    public static final int MAX_OFFERS = 256;
    public static final int MAX_PICKS = 41;
    private static final int MAX_POINTS = 1_000_000;

    public record Offer(JsonObject item, int cost, int limit) {}
    public record Pick(int offer, int slot) {}

    static KitShop parse(JsonObject json) {
        int budget = integer(json.get("budget"), "budget", 0, MAX_POINTS);
        JsonArray stock = GsonHelper.getAsJsonArray(json, "offers");
        if (stock.isEmpty() || stock.size() > MAX_OFFERS) {
            throw new IllegalArgumentException("A kit shop requires between 1 and " + MAX_OFFERS + " offers");
        }
        var offers = new ArrayList<Offer>();
        for (var value : stock) {
            var offer = GsonHelper.convertToJsonObject(value, "offer");
            offers.add(new Offer(GsonHelper.getAsJsonObject(offer, "item").deepCopy(),
                    integer(offer.get("cost"), "cost", 0, MAX_POINTS),
                    offer.has("limit") ? integer(offer.get("limit"), "limit", 1, MAX_PICKS) : 1));
        }
        return new KitShop(budget, List.copyOf(offers));
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
        var stock = new JsonArray();
        for (var offer : offers) {
            var value = new JsonObject();
            value.addProperty("cost", offer.cost());
            if (offer.limit() != 1) value.addProperty("limit", offer.limit());
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
        var occupied = occupiedSlots(player, policy, fixed);
        var entries = new ArrayList<KitDefinition.StackEntry>(fixed.size() + picks.size());
        for (var pick : picks) {
            int slot = pick.slot();
            var stack = stock.get(pick.offer());
            if (slot < 0 || slot >= MAX_PICKS || slot >= 36 && slot != equipmentSlot(player, stack)) {
                throw new HeritageException("shop_slot", "This stack does not fit in the selected slot");
            }
            if (occupied[slot]) throw new HeritageException("shop_occupied", "A starter kit slot is already occupied");
            occupied[slot] = true;
            entries.add(new KitDefinition.StackEntry("player", "", slot, false, stack));
        }
        entries.addAll(fixed);
        return List.copyOf(entries);
    }

    public static int nextSlot(Player player, InventoryPolicy policy, List<KitDefinition.StackEntry> fixed,
                               List<Pick> picks, ItemStack stack) {
        var occupied = occupiedSlots(player, policy, fixed);
        for (var pick : picks) occupied[pick.slot()] = true;
        int equipment = equipmentSlot(player, stack);
        if (equipment >= 0 && !occupied[equipment]) return equipment;
        for (int slot = 0; slot < 36; slot++) if (!occupied[slot]) return slot;
        return -1;
    }

    private static boolean[] occupiedSlots(Player player, InventoryPolicy policy, List<KitDefinition.StackEntry> fixed) {
        var occupied = new boolean[MAX_PICKS];
        if (policy == InventoryPolicy.MERGE) {
            for (int index = 0; index < occupied.length; index++) occupied[index] = !player.getInventory().getItem(index).isEmpty();
        }
        for (var entry : fixed) if (entry.inventory().equals("player")) occupied[entry.index()] = true;
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

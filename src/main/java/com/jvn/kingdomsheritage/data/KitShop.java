package com.jvn.kingdomsheritage.data;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.jvn.kingdomsheritage.HeritageConfig.InventoryPolicy;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import net.minecraft.util.GsonHelper;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

public record KitShop(int budget, List<Offer> offers) {
    public static final int MAX_OFFERS = 256;
    public static final int MAX_PICKS = 41;
    private static final int MAX_POINTS = 1_000_000;

    public record Offer(JsonObject item, int cost) {}
    public record Purchase(int offer, KitDefinition.StackEntry entry) {}

    static KitShop parse(JsonObject json) {
        int budget = integer(json.get("budget"), "budget", MAX_POINTS);
        JsonArray stock = GsonHelper.getAsJsonArray(json, "offers");
        if (stock.isEmpty() || stock.size() > MAX_OFFERS) {
            throw new IllegalArgumentException("A kit shop requires between 1 and " + MAX_OFFERS + " offers");
        }
        var offers = new ArrayList<Offer>();
        for (var value : stock) {
            var offer = GsonHelper.convertToJsonObject(value, "offer");
            offers.add(new Offer(GsonHelper.getAsJsonObject(offer, "item").deepCopy(),
                    integer(offer.get("cost"), "cost", MAX_POINTS)));
        }
        return new KitShop(budget, List.copyOf(offers));
    }

    private static int integer(JsonElement value, String field, int max) {
        if (value != null && value.isJsonPrimitive() && value.getAsJsonPrimitive().isNumber()) {
            try {
                int number = value.getAsBigDecimal().intValueExact();
                if (number >= 0 && number <= max) return number;
            } catch (ArithmeticException ignored) {
                throw new IllegalArgumentException(field + " must be an integer from 0 to " + max);
            }
        }
        throw new IllegalArgumentException(field + " must be an integer from 0 to " + max);
    }

    public JsonObject json() {
        var json = new JsonObject();
        json.addProperty("budget", budget);
        var stock = new JsonArray();
        for (var offer : offers) {
            var value = new JsonObject();
            value.addProperty("cost", offer.cost());
            value.add("item", offer.item().deepCopy());
            stock.add(value);
        }
        json.add("offers", stock);
        return json;
    }

    public int cost(List<Integer> picks) {
        if (picks.size() > MAX_PICKS) throw new HeritageException("shop_picks", "Too many starter kit offers selected");
        var seen = new HashSet<Integer>();
        int total = 0;
        for (int index : picks) {
            if (index < 0 || index >= offers.size() || !seen.add(index)) {
                throw new HeritageException("shop_offer", "Unknown or duplicate starter kit offer");
            }
            total += offers.get(index).cost();
        }
        if (total > budget) throw new HeritageException("shop_budget", "This kit costs %s points but has a budget of %s", total, budget);
        return total;
    }

    public List<Purchase> place(Player player, InventoryPolicy policy, List<KitDefinition.StackEntry> fixed,
                                List<ItemStack> stock, List<Integer> picks) {
        cost(picks);
        if (picks.isEmpty()) return List.of();
        if (policy == InventoryPolicy.PRESERVE) {
            throw new HeritageException("shop_preserve", "This start keeps your existing equipment");
        }
        boolean[] occupied = new boolean[MAX_PICKS];
        if (policy == InventoryPolicy.MERGE) {
            for (int index = 0; index < occupied.length; index++) occupied[index] = !player.getInventory().getItem(index).isEmpty();
        }
        for (var entry : fixed) if (entry.inventory().equals("player")) occupied[entry.index()] = true;
        var purchases = new ArrayList<Purchase>();
        for (int offer : picks) {
            ItemStack stack = stock.get(offer);
            int slot = stack.is(Items.SHIELD) ? 40 : switch (player.getEquipmentSlotForItem(stack)) {
                case FEET -> 36;
                case LEGS -> 37;
                case CHEST -> 38;
                case HEAD -> 39;
                case OFFHAND -> 40;
                default -> 0;
            };
            if (occupied[slot]) {
                slot = 0;
                while (slot < 36 && occupied[slot]) slot++;
                if (slot == 36) throw new HeritageException("shop_space", "There is no inventory slot available for another stack");
            }
            occupied[slot] = true;
            purchases.add(new Purchase(offer, new KitDefinition.StackEntry("player", "", slot, false, stack)));
        }
        return List.copyOf(purchases);
    }

    public static List<KitDefinition.StackEntry> combine(List<KitDefinition.StackEntry> fixed, List<Purchase> purchases) {
        if (purchases.isEmpty()) return fixed;
        var entries = new ArrayList<KitDefinition.StackEntry>(fixed.size() + purchases.size());
        for (var purchase : purchases) entries.add(purchase.entry());
        entries.addAll(fixed);
        return entries;
    }
}

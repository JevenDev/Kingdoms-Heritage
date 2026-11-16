package com.jvn.kingdomsheritage.data;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.mojang.serialization.JsonOps;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import net.minecraft.core.Holder;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.GsonHelper;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.AttributeInstance;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.player.Player;

public record KitStats(List<Bonus> attributes, Float startingHealth, Integer startingHunger, long purse) {
    public static final KitStats EMPTY = new KitStats(List.of(), null, null, 0);
    public static final ResourceLocation MODIFIER_ID = ResourceLocation.fromNamespaceAndPath("kingdomsheritage", "starting_kit");
    private static final String PURSE = "numismaticoverhaul:purse";
    private static final List<EquipmentSlot> PLAYER_SLOTS = List.of(EquipmentSlot.MAINHAND, EquipmentSlot.OFFHAND,
            EquipmentSlot.FEET, EquipmentSlot.LEGS, EquipmentSlot.CHEST, EquipmentSlot.HEAD);

    public record Bonus(ResourceLocation attribute, double amount, AttributeModifier.Operation operation) {
        public AttributeModifier modifier() {
            return new AttributeModifier(MODIFIER_ID, amount, operation);
        }
    }

    public record Preview(int armor, float health, float maxHealth, int hunger, KitStats bonuses) {}

    static KitStats parse(JsonObject json) {
        var attributes = new ArrayList<Bonus>();
        var seen = new HashSet<ResourceLocation>();
        if (json.has("attributes")) {
            var entries = GsonHelper.getAsJsonArray(json, "attributes");
            if (entries.size() > 32) throw new IllegalArgumentException("A kit may contain at most 32 attribute bonuses");
            for (var element : entries) {
                var entry = GsonHelper.convertToJsonObject(element, "attribute bonus");
                var id = ResourceLocation.parse(GsonHelper.getAsString(entry, "attribute"));
                if (!seen.add(id)) throw new IllegalArgumentException("Duplicate kit attribute: " + id);
                double amount = number(entry, "amount");
                var operation = entry.has("operation") ? AttributeModifier.Operation.CODEC.parse(JsonOps.INSTANCE, entry.get("operation"))
                        .getOrThrow(IllegalArgumentException::new) : AttributeModifier.Operation.ADD_VALUE;
                attributes.add(new Bonus(id, amount, operation));
            }
        }
        Float health = null;
        if (json.has("starting_health")) {
            double value = number(json, "starting_health");
            if (value < 1 || value > Float.MAX_VALUE) throw new IllegalArgumentException("starting_health must be at least 1 health point and fit in a float");
            health = (float) value;
        }
        Integer hunger = null;
        if (json.has("starting_hunger")) {
            hunger = DefinitionJson.integer(json, "starting_hunger");
            if (hunger < 0 || hunger > 20) throw new IllegalArgumentException("starting_hunger must be 0 to 20");
        }
        long purse = 0;
        if (json.has("starting_resources")) {
            for (var entry : GsonHelper.getAsJsonObject(json, "starting_resources").entrySet()) {
                if (!entry.getKey().equals(PURSE)) throw new IllegalArgumentException("Unknown starting resource: " + entry.getKey());
                purse = parsePurse(entry.getValue());
            }
        }
        return new KitStats(List.copyOf(attributes), health, hunger, purse);
    }

    private static long parsePurse(JsonElement value) {
        if (!value.isJsonObject()) return purseAmount(value, PURSE);
        long total = 0;
        try {
            for (var entry : value.getAsJsonObject().entrySet()) {
                long coinValue = switch (entry.getKey()) {
                    case "gold" -> 10_000;
                    case "silver" -> 100;
                    case "bronze" -> 1;
                    default -> throw new IllegalArgumentException(PURSE + " has an unknown denomination: " + entry.getKey());
                };
                long amount = purseAmount(entry.getValue(), PURSE + "." + entry.getKey());
                total = Math.addExact(total, Math.multiplyExact(amount, coinValue));
            }
        } catch (ArithmeticException error) {
            throw new IllegalArgumentException(PURSE + " total must be a non-negative 64-bit integer", error);
        }
        return total;
    }

    private static long purseAmount(JsonElement value, String field) {
        if (!value.isJsonPrimitive() || !value.getAsJsonPrimitive().isNumber()) {
            throw new IllegalArgumentException(field + " must be a non-negative integer");
        }
        long amount;
        try {
            amount = value.getAsBigDecimal().longValueExact();
        } catch (ArithmeticException | NumberFormatException error) {
            throw new IllegalArgumentException(field + " must be a non-negative 64-bit integer", error);
        }
        if (amount < 0) throw new IllegalArgumentException(field + " must be a non-negative integer");
        return amount;
    }

    private static double number(JsonObject json, String key) {
        var value = json.get(key);
        if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isNumber() || !Double.isFinite(value.getAsDouble())) {
            throw new IllegalArgumentException(key + " must be a finite number");
        }
        return value.getAsDouble();
    }

    public void write(JsonObject json) {
        if (!attributes.isEmpty()) {
            var entries = new JsonArray();
            for (var bonus : attributes) {
                var entry = new JsonObject();
                entry.addProperty("attribute", bonus.attribute().toString());
                entry.addProperty("amount", bonus.amount());
                entry.addProperty("operation", bonus.operation().getSerializedName());
                entries.add(entry);
            }
            json.add("attributes", entries);
        }
        if (startingHealth != null) json.addProperty("starting_health", startingHealth);
        if (startingHunger != null) json.addProperty("starting_hunger", startingHunger);
        if (purse != 0) {
            var resources = new JsonObject();
            resources.addProperty(PURSE, purse);
            json.add("starting_resources", resources);
        }
    }

    public static AttributeInstance attribute(Player player, ResourceLocation id) {
        return BuiltInRegistries.ATTRIBUTE.getHolder(id).map(player::getAttribute).orElse(null);
    }

    public boolean changesHealth() {
        var id = Attributes.MAX_HEALTH.unwrapKey().orElseThrow().location();
        return startingHealth != null || attributes.stream().anyMatch(bonus -> bonus.attribute().equals(id));
    }

    public Preview preview(Player player, KitLoadout.Snapshot original, KitLoadout.Snapshot loadout) {
        float maxHealth = (float) project(player, Attributes.MAX_HEALTH, original, loadout);
        float health = Math.min(maxHealth, startingHealth == null ? player.getHealth() : startingHealth);
        int hunger = startingHunger == null ? player.getFoodData().getFoodLevel() : startingHunger;
        return new Preview((int) Math.floor(project(player, Attributes.ARMOR, original, loadout)), health, maxHealth, hunger, this);
    }

    private double project(Player player, Holder<Attribute> type, KitLoadout.Snapshot original, KitLoadout.Snapshot loadout) {
        var actual = player.getAttribute(type);
        if (actual == null) return type.value().getDefaultValue();
        var projected = new AttributeInstance(type, unused -> {});
        projected.replaceFrom(actual);
        if (loadout != null) {
            for (var slot : PLAYER_SLOTS) {
                original.equipped(slot).forEachModifier(slot, (attribute, modifier) -> {
                    if (attribute.equals(type)) projected.removeModifier(modifier);
                });
            }
            for (var slot : PLAYER_SLOTS) {
                loadout.equipped(slot).forEachModifier(slot, (attribute, modifier) -> {
                    if (attribute.equals(type)) {
                        projected.removeModifier(modifier);
                        projected.addTransientModifier(modifier);
                    }
                });
            }
        }
        var id = type.unwrapKey().orElseThrow().location();
        for (var bonus : attributes) {
            if (id.equals(bonus.attribute())) projected.addOrReplacePermanentModifier(bonus.modifier());
        }
        return projected.getValue();
    }
}

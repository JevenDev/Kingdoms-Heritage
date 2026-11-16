package com.jvn.kingdomsheritage.data;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.jvn.kingdomsheritage.compat.IronsSpellsCompat;
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

public record KitStats(List<Bonus> attributes, Float startingHealth, Integer startingHunger, long purse, Mana mana) {
    public static final KitStats EMPTY = new KitStats(List.of(), null, null, 0, null);
    public static final ResourceLocation MODIFIER_ID = ResourceLocation.fromNamespaceAndPath("kingdomsheritage", "starting_kit");
    public static final ResourceLocation MAX_MANA = ResourceLocation.fromNamespaceAndPath("irons_spellbooks", "max_mana");
    private static final String MANA = "irons_spellbooks:mana";
    private static final String PURSE = "numismaticoverhaul:purse";
    private static final List<EquipmentSlot> PLAYER_SLOTS = List.of(EquipmentSlot.MAINHAND, EquipmentSlot.OFFHAND,
            EquipmentSlot.FEET, EquipmentSlot.LEGS, EquipmentSlot.CHEST, EquipmentSlot.HEAD);

    public KitStats(List<Bonus> attributes, Float startingHealth, Integer startingHunger, long purse) {
        this(attributes, startingHealth, startingHunger, purse, null);
    }

    public record Bonus(ResourceLocation attribute, double amount, AttributeModifier.Operation operation) {
        public AttributeModifier modifier() {
            return new AttributeModifier(MODIFIER_ID, amount, operation);
        }
    }

    public record Mana(Float amount, Double capacity) {
        public AttributeModifier modifier(double base) {
            return new AttributeModifier(MODIFIER_ID, capacity - base, AttributeModifier.Operation.ADD_VALUE);
        }
    }

    public record ManaPreview(float amount, double capacity) {}

    public record Preview(int armor, float health, float maxHealth, int hunger, KitStats bonuses, ManaPreview mana) {
        public Preview(int armor, float health, float maxHealth, int hunger, KitStats bonuses) {
            this(armor, health, maxHealth, hunger, bonuses, null);
        }
    }

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
        Mana mana = null;
        if (json.has("starting_resources")) {
            for (var entry : GsonHelper.getAsJsonObject(json, "starting_resources").entrySet()) {
                switch (entry.getKey()) {
                    case PURSE -> purse = parsePurse(entry.getValue());
                    case MANA -> mana = parseMana(entry.getValue());
                    default -> throw new IllegalArgumentException("Unknown starting resource: " + entry.getKey());
                }
            }
        }
        if (mana != null && mana.capacity() != null && seen.contains(MAX_MANA)) {
            throw new IllegalArgumentException("Use either a mana capacity or a max_mana attribute bonus, not both");
        }
        return new KitStats(List.copyOf(attributes), health, hunger, purse, mana);
    }

    private static Mana parseMana(JsonElement value) {
        if (!value.isJsonObject()) throw new IllegalArgumentException("Mana settings must be an object");
        var json = value.getAsJsonObject();
        for (var key : json.keySet()) {
            if (!key.equals("amount") && !key.equals("capacity")) throw new IllegalArgumentException("Unknown mana setting: " + key);
        }
        Float amount = json.has("amount") ? (float) manaNumber(json, "amount") : null;
        Double capacity = json.has("capacity") ? manaNumber(json, "capacity") : null;
        return amount == null && capacity == null ? null : new Mana(amount, capacity);
    }

    private static double manaNumber(JsonObject json, String key) {
        double value = number(json, key);
        if (value < 0 || value > 1_000_000) throw new IllegalArgumentException("Mana " + key + " must be from 0 to 1000000");
        return value;
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
        if (purse != 0 || mana != null) {
            var resources = new JsonObject();
            if (purse != 0) resources.addProperty(PURSE, purse);
            if (mana != null) {
                var values = new JsonObject();
                if (mana.amount() != null) values.addProperty("amount", mana.amount());
                if (mana.capacity() != null) values.addProperty("capacity", mana.capacity());
                resources.add(MANA, values);
            }
            json.add("starting_resources", resources);
        }
    }

    public static AttributeInstance attribute(Player player, ResourceLocation id) {
        return BuiltInRegistries.ATTRIBUTE.getHolder(id).map(player::getAttribute).orElse(null);
    }

    public boolean changesMana() {
        return mana != null || attributes.stream().anyMatch(bonus -> bonus.attribute().equals(MAX_MANA));
    }

    public boolean changesHealth() {
        var id = Attributes.MAX_HEALTH.unwrapKey().orElseThrow().location();
        return startingHealth != null || attributes.stream().anyMatch(bonus -> bonus.attribute().equals(id));
    }

    public Preview preview(Player player, KitLoadout.Snapshot original, KitLoadout.Snapshot loadout) {
        float maxHealth = (float) project(player, Attributes.MAX_HEALTH, original, loadout);
        float health = Math.min(maxHealth, startingHealth == null ? player.getHealth() : startingHealth);
        int hunger = startingHunger == null ? player.getFoodData().getFoodLevel() : startingHunger;
        ManaPreview manaPreview = null;
        if (IronsSpellsCompat.available()) {
            var type = BuiltInRegistries.ATTRIBUTE.getHolder(MAX_MANA).orElse(null);
            if (type != null && player.getAttribute(type) != null) {
                double capacity = project(player, type, original, loadout);
                float amount = mana != null && mana.amount() != null ? mana.amount() : IronsSpellsCompat.mana(player);
                manaPreview = new ManaPreview(Math.max(0, Math.min(amount, (float) capacity)), capacity);
            }
        }
        return new Preview((int) Math.floor(project(player, Attributes.ARMOR, original, loadout)), health, maxHealth, hunger, this, manaPreview);
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
        if (id.equals(MAX_MANA) && mana != null && mana.capacity() != null) {
            projected.addOrReplacePermanentModifier(mana.modifier(projected.getBaseValue()));
        }
        return projected.getValue();
    }
}

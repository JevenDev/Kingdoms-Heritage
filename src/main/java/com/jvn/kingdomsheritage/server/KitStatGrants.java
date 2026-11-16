package com.jvn.kingdomsheritage.server;

import com.jvn.kingdomsheritage.compat.NumismaticCompat;
import com.jvn.kingdomsheritage.data.HeritageException;
import com.jvn.kingdomsheritage.data.KitStats;
import java.util.function.Consumer;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.ai.attributes.AttributeInstance;
import net.neoforged.neoforge.event.entity.player.PlayerEvent;

final class KitStatGrants {
    private KitStatGrants() {}

    static void validate(ServerPlayer player, KitStats stats) {
        for (var bonus : stats.attributes()) {
            var type = BuiltInRegistries.ATTRIBUTE.getHolder(bonus.attribute()).orElse(null);
            if (type == null) throw new HeritageException("kit_attribute", "Unknown kit attribute: %s", bonus.attribute());
            if (player == null) continue;
            var current = player.getAttribute(type);
            if (current == null) throw new HeritageException("kit_player_attribute", "The player does not have the kit attribute: %s", bonus.attribute());
            var projected = new AttributeInstance(type, unused -> {});
            projected.replaceFrom(current);
            projected.addOrReplacePermanentModifier(bonus.modifier());
            if (!Double.isFinite(projected.getValue())) {
                throw new HeritageException("kit_attribute_value", "The kit bonus exceeds the range of the attribute: %s", bonus.attribute());
            }
        }
        if (stats.purse() > 0) {
            NumismaticCompat.requirePurse();
            if (player != null) deposit(NumismaticCompat.balance(player), stats.purse());
        }
    }

    private static long deposit(long balance, long amount) {
        if (balance > Long.MAX_VALUE - amount) {
            throw new HeritageException("numismatic_purse_full", "The starting currency would overflow the player's purse");
        }
        return balance + amount;
    }

    static void apply(ServerPlayer player, KitStats stats, Consumer<Runnable> rollback) {
        validate(player, stats);
        for (var bonus : stats.attributes()) {
            var attribute = KitStats.attribute(player, bonus.attribute());
            var previous = attribute.getModifier(KitStats.MODIFIER_ID);
            rollback.accept(() -> {
                attribute.removeModifier(KitStats.MODIFIER_ID);
                if (previous != null) attribute.addPermanentModifier(previous);
            });
            attribute.addOrReplacePermanentModifier(bonus.modifier());
        }
        if (stats.changesHealth()) {
            float health = stats.startingHealth() == null ? player.getHealth() : stats.startingHealth();
            player.setHealth(Math.min(health, player.getMaxHealth()));
        }
        if (stats.startingHunger() != null) {
            var food = player.getFoodData();
            int level = food.getFoodLevel();
            float saturation = food.getSaturationLevel();
            rollback.accept(() -> {
                food.setFoodLevel(level);
                food.setSaturation(saturation);
            });
            food.setFoodLevel(stats.startingHunger());
            food.setSaturation(Math.min(saturation, stats.startingHunger()));
        }
        if (stats.purse() > 0) {
            long balance = NumismaticCompat.balance(player);
            long next = deposit(balance, stats.purse());
            rollback.accept(() -> NumismaticCompat.setBalance(player, balance));
            NumismaticCompat.setBalance(player, next);
        }
    }

    static void clonePlayer(PlayerEvent.Clone event) {
        if (!(event.getEntity() instanceof ServerPlayer player) || !(event.getOriginal() instanceof ServerPlayer original)) return;
        boolean full = event.isWasDeath() && player.getHealth() >= player.getMaxHealth();
        float previousMax = player.getMaxHealth();
        BuiltInRegistries.ATTRIBUTE.holders().forEach(type -> {
            if (!original.getAttributes().hasAttribute(type) || !player.getAttributes().hasAttribute(type)) return;
            var modifier = original.getAttribute(type).getModifier(KitStats.MODIFIER_ID);
            if (modifier != null) player.getAttribute(type).addOrReplacePermanentModifier(modifier);
        });
        if (player.getMaxHealth() != previousMax) {
            player.setHealth(full ? player.getMaxHealth() : Math.min(original.getHealth(), player.getMaxHealth()));
        }
    }
}

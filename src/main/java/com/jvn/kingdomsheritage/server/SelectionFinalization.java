package com.jvn.kingdomsheritage.server;

import com.google.gson.JsonObject;
import com.jvn.kingdomsheritage.HeritageConfig;
import com.jvn.kingdomsheritage.KingdomsHeritage;
import com.jvn.kingdomsheritage.compat.IronsSpellsCompat;
import com.jvn.kingdomsheritage.data.HeritageCatalog;
import com.jvn.kingdomsheritage.data.HeritageException;
import com.jvn.kingdomsheritage.data.IntroDefinition;
import com.jvn.kingdomsheritage.data.KitDefinition;
import com.jvn.kingdomsheritage.data.KitLoadout;
import com.jvn.kingdomsheritage.data.KitStats;
import com.jvn.kingdomsheritage.data.SpawnDefinition;
import com.jvn.kingdomsheritage.mixin.KitEquipmentUpdates;
import java.util.ArrayDeque;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.level.GameType;

final class SelectionFinalization {
    record Member(ServerPlayer player, SpawnDefinition spawn, KitDefinition kit,
                  List<KitDefinition.StackEntry> entries, HeritageConfig.InventoryPolicy policy, KitStats stats,
                  KitLoadout.Snapshot inventory, KitLoadout.Snapshot planned,
                  Map<ResourceLocation, JsonObject> decisions, SpawnResolver.Destination arrival, IntroDefinition arrivalIntro, JsonObject intro) {}

    private SelectionFinalization() {}

    static Member plan(ServerPlayer player, SpawnDefinition spawn, KitDefinition kit,
                       List<KitDefinition.StackEntry> entries, HeritageConfig.InventoryPolicy policy,
                       SpawnDefinition arrivalDefinition, SpawnResolver.Destination arrival) {
        var inventory = kit == null ? null : KitLoadout.capture(player, true);
        var planned = kit == null ? null : KitLoadout.plan(inventory, player.getInventory().items.size(), kit, entries, policy);
        var stats = kit == null ? KitStats.EMPTY : SelectionManager.kitStats(player, kit);
        KitStatGrants.validate(player, stats);
        var arrivalIntro = HeritageCatalog.arrivalIntro(arrivalDefinition, kit);
        var intro = SpawnIntro.prepare(arrivalDefinition, arrival, arrivalIntro);
        intro.add("dialogue_context", DialogueContexts.create(player, spawn, kit, policy, !entries.isEmpty()).json());
        intro.addProperty("outcome", "completed");
        intro.addProperty("session", SelectionLifecycle.state(player).sessionId().toString());
        return new Member(player, spawn, kit, entries, policy, stats, inventory, planned,
                SelectionSteps.decisions(player, spawn.id().toString(), kit == null ? "" : kit.id().toString()), arrival, arrivalIntro, intro);
    }

    static void apply(List<Member> members, SpawnResolver.Destination destination) {
        var first = members.getFirst();
        var usage = SpawnUsage.of(first.player());
        usage.requireAvailable(first.spawn(), SelectionParty.size(first.player()));
        run(rollback -> {
            for (var member : members) {
                var player = member.player();
                rollback.accept(() -> SelectionManager.hold(player));
                SelectionManager.teleport(player, member.arrival(), SelectionManager.state(player).getFloat("yaw"));
            }
            for (var member : members) {
                if (member.kit() == null) continue;
                var player = member.player();
                var backup = member.inventory();
                var planned = member.planned();
                if (!backup.matches(player)) {
                    backup = KitLoadout.capture(player, true);
                    planned = KitLoadout.plan(backup, player.getInventory().items.size(), member.kit(), member.entries(), member.policy());
                }
                var original = backup;
                var stats = member.stats();
                boolean updateHealth = stats.changesHealth();
                boolean updateMana = stats.changesMana();
                if (updateMana) {
                    float mana = IronsSpellsCompat.mana(player);
                    rollback.accept(() -> IronsSpellsCompat.setMana(player, mana));
                }
                if (updateHealth) {
                    float health = player.getHealth();
                    rollback.accept(() -> player.setHealth(health));
                }
                rollback.accept(() -> {
                    write(player, original);
                    if (updateHealth || updateMana) ((KitEquipmentUpdates) player).heritage$refreshEquipment();
                });
                write(player, planned);
                if (updateHealth || updateMana) ((KitEquipmentUpdates) player).heritage$refreshEquipment();
                KitStatGrants.apply(player, stats, rollback);
                dropOverflow(player, planned, rollback);
            }
            for (var member : members) {
                var player = member.player();
                var state = SelectionManager.state(player);
                markComplete(state, rollback);
                state.putString("spawn_choice", member.spawn().id().toString());
                if (member.kit() == null) state.remove("kit_choice");
                else state.putString("kit_choice", member.kit().id().toString());
                state.putString("homeland_dimension", destination.level().dimension().location().toString());
                state.putLong("homeland", destination.position().asLong());
                if (HeritageConfig.HOMELAND_RESPAWN.get()) {
                    var dimension = player.getRespawnDimension();
                    var position = player.getRespawnPosition();
                    var angle = player.getRespawnAngle();
                    var forced = player.isRespawnForced();
                    rollback.accept(() -> player.setRespawnPosition(dimension, position, angle, forced, false));
                    player.setRespawnPosition(destination.level().dimension(), destination.position(), state.getFloat("yaw"), true, false);
                }
                restorePlayer(player, state);
            }
            usage.consume(first.spawn(), members.size());
        });
        for (var member : members) SelectionSteps.complete(member.player(), member.decisions());
    }

    private static void dropOverflow(ServerPlayer player, KitLoadout.Snapshot loadout, Consumer<Runnable> rollback) {
        var level = player.serverLevel();
        for (var stack : loadout.overflow()) {
            var drop = new ItemEntity(level, player.getX(), player.getY(), player.getZ(), stack, 0, 0, 0);
            drop.setTarget(player.getUUID());
            drop.setDefaultPickUpDelay();
            rollback.accept(drop::discard);
            if (!level.addFreshEntity(drop)) {
                throw new HeritageException("kit_drop", "Could not drop the extra kit items at the destination. Please try again");
            }
        }
    }

    static void markComplete(CompoundTag state, Consumer<Runnable> rollback) {
        var original = state.copy();
        rollback.accept(() -> restore(state, original));
        state.putBoolean("complete", true);
        state.remove("reset");
        // the game mode guard blocks changes while selection is pending
        state.putBoolean("pending", false);
    }

    static void restorePlayer(ServerPlayer player, CompoundTag state) {
        var mode = GameType.byId(state.getInt("mode"));
        if (player.gameMode.getGameModeForPlayer() != mode && !player.setGameMode(mode)) {
            throw new HeritageException("restore_mode", "The original game mode could not be restored");
        }
        player.getAbilities().loadSaveData(state);
        player.onUpdateAbilities();
        player.setNoGravity(state.getBoolean("no_gravity"));
    }

    static void run(Consumer<Consumer<Runnable>> changes) {
        var undo = new ArrayDeque<Runnable>();
        try {
            changes.accept(undo::push);
        } catch (RuntimeException failure) {
            while (!undo.isEmpty()) {
                try {
                    undo.pop().run();
                } catch (RuntimeException rollbackFailure) {
                    if (failure != rollbackFailure) failure.addSuppressed(rollbackFailure);
                }
            }
            throw failure;
        }
    }

    private static void restore(CompoundTag target, CompoundTag source) {
        for (var key : List.copyOf(target.getAllKeys())) target.remove(key);
        target.merge(source);
    }

    private static void write(ServerPlayer player, KitLoadout.Snapshot snapshot) {
        try {
            snapshot.write(player, true);
        } finally {
            player.getInventory().setChanged();
            player.inventoryMenu.sendAllDataToRemote();
        }
    }

    static void arrive(Member member) {
        var player = member.player();
        try {
            player.closeContainer();
            player.fallDistance = 0;
            player.invulnerableTime = 100;
            SpawnIntro.begin(player, member.arrivalIntro(), member.intro());
            player.inventoryMenu.sendAllDataToRemote();
        } catch (RuntimeException error) {
            KingdomsHeritage.LOGGER.error("Could not send Heritage arrival to {}", player.getGameProfile().getName(), error);
            try {
                SpawnIntro.release(player);
                member.intro().remove("intro");
                SpawnIntro.begin(player, null, member.intro());
            } catch (RuntimeException recovery) {
                KingdomsHeritage.LOGGER.error("Could not recover Heritage arrival for {}", player.getGameProfile().getName(), recovery);
            }
        }
    }
}

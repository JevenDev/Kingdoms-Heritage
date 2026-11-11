package com.jvn.kingdomsheritage.server;

import com.google.gson.JsonObject;
import com.jvn.kingdomsheritage.HeritageConfig;
import com.jvn.kingdomsheritage.KingdomsHeritage;
import com.jvn.kingdomsheritage.data.HeritageException;
import com.jvn.kingdomsheritage.data.KitDefinition;
import com.jvn.kingdomsheritage.data.KitLoadout;
import com.jvn.kingdomsheritage.data.SpawnDefinition;
import java.util.ArrayDeque;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.level.GameType;

final class SelectionFinalization {
    record Member(ServerPlayer player, SpawnDefinition spawn, KitDefinition kit,
                  List<KitDefinition.StackEntry> entries, HeritageConfig.InventoryPolicy policy,
                  KitLoadout.Snapshot inventory, KitLoadout.Snapshot planned,
                  Map<ResourceLocation, JsonObject> decisions, JsonObject intro) {}

    private SelectionFinalization() {}

    static Member plan(ServerPlayer player, SpawnDefinition spawn, KitDefinition kit,
                       List<KitDefinition.StackEntry> entries, HeritageConfig.InventoryPolicy policy,
                       SpawnResolver.Search search) {
        var inventory = policy == HeritageConfig.InventoryPolicy.PRESERVE ? null : KitLoadout.capture(player, true);
        var planned = inventory == null ? null : KitLoadout.plan(inventory, player.getInventory().items.size(), kit, entries, policy);
        var intro = SpawnIntro.prepare(search.definition(), search.destination());
        intro.add("dialogue_context", DialogueContexts.create(player, spawn, kit, policy, !entries.isEmpty()).json());
        intro.addProperty("outcome", "completed");
        intro.addProperty("session", SelectionLifecycle.state(player).sessionId().toString());
        return new Member(player, spawn, kit, entries, policy, inventory, planned,
                SelectionSteps.decisions(player, spawn.id().toString(), kit.id().toString()), intro);
    }

    static void apply(List<Member> members, SpawnResolver.Destination destination) {
        run(rollback -> {
            for (var member : members) {
                var player = member.player();
                rollback.accept(() -> SelectionManager.hold(player));
                SelectionManager.teleport(player, destination, SelectionManager.state(player).getFloat("yaw"));
            }
            for (var member : members) {
                if (member.planned() == null) continue;
                var player = member.player();
                var backup = member.inventory();
                var planned = member.planned();
                if (!backup.matches(player)) {
                    backup = KitLoadout.capture(player, true);
                    planned = KitLoadout.plan(backup, player.getInventory().items.size(), member.kit(), member.entries(), member.policy());
                }
                var original = backup;
                rollback.accept(() -> write(player, original));
                write(player, planned);
            }
            for (var member : members) {
                var player = member.player();
                var state = SelectionManager.state(player);
                var original = state.copy();
                rollback.accept(() -> restore(state, original));
                state.putBoolean("complete", true);
                state.putBoolean("pending", false);
                state.putString("spawn_choice", member.spawn().id().toString());
                state.putString("kit_choice", member.kit().id().toString());
                state.putString("homeland_dimension", destination.level().dimension().location().toString());
                state.putLong("homeland", destination.position().asLong());
                state.remove("reset");
                if (HeritageConfig.HOMELAND_RESPAWN.get()) {
                    var dimension = player.getRespawnDimension();
                    var position = player.getRespawnPosition();
                    var angle = player.getRespawnAngle();
                    var forced = player.isRespawnForced();
                    rollback.accept(() -> player.setRespawnPosition(dimension, position, angle, forced, false));
                    player.setRespawnPosition(destination.level().dimension(), destination.position(), state.getFloat("yaw"), true, false);
                }
                var mode = GameType.byId(state.getInt("mode"));
                if (player.gameMode.getGameModeForPlayer() != mode && !player.setGameMode(mode)) {
                    throw new HeritageException("restore_mode", "The original game mode could not be restored");
                }
                player.getAbilities().loadSaveData(state);
                player.onUpdateAbilities();
                player.setNoGravity(state.getBoolean("no_gravity"));
            }
        });
        for (var member : members) SelectionSteps.complete(member.player(), member.decisions());
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

    static void arrive(Member member, SpawnDefinition arrival) {
        var player = member.player();
        try {
            player.closeContainer();
            player.fallDistance = 0;
            player.invulnerableTime = 100;
            SpawnIntro.begin(player, arrival.intro(), member.intro());
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

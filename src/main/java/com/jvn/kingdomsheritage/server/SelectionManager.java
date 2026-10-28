package com.jvn.kingdomsheritage.server;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.jvn.kingdomsheritage.KingdomsHeritage;
import com.jvn.kingdomsheritage.HeritageConfig;
import net.minecraft.stats.Stats;
import com.jvn.kingdomsheritage.compat.EquipmentCompat;
import com.jvn.kingdomsheritage.data.HeritageCatalog;
import com.jvn.kingdomsheritage.network.HeritageNetwork;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import net.minecraft.core.BlockPos;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.GameType;
import net.minecraft.world.phys.Vec3;
import net.neoforged.bus.api.ICancellableEvent;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.neoforge.event.entity.living.LivingIncomingDamageEvent;
import net.neoforged.neoforge.event.entity.player.AttackEntityEvent;
import net.neoforged.neoforge.event.entity.player.PlayerEvent;
import net.neoforged.neoforge.event.entity.player.PlayerInteractEvent;
import net.neoforged.neoforge.event.server.ServerStoppedEvent;
import net.neoforged.neoforge.event.tick.PlayerTickEvent;
import net.neoforged.neoforge.network.PacketDistributor;

public final class SelectionManager {
    private static final String KEY = KingdomsHeritage.MOD_ID;
    private static final Map<UUID, Long> LAST_REQUEST = new HashMap<>();
    private static final Map<UUID, Long> SENT_REVISION = new HashMap<>();

    private SelectionManager() {}

    private static CompoundTag state(Player player) {
        CompoundTag persistent = player.getPersistentData();
        if (!persistent.contains(Player.PERSISTED_NBT_TAG)) persistent.put(Player.PERSISTED_NBT_TAG, new CompoundTag());
        CompoundTag retained = persistent.getCompound(Player.PERSISTED_NBT_TAG);
        if (!retained.contains(KEY)) retained.put(KEY, new CompoundTag());
        return retained.getCompound(KEY);
    }

    public static boolean pending(Player player) {
        return state(player).getBoolean("pending");
    }

    @SubscribeEvent
    public static void login(PlayerEvent.PlayerLoggedInEvent event) {
        if (!(event.getEntity() instanceof ServerPlayer player)) return;
        CompoundTag state = state(player);
        if (state.getBoolean("complete")) return;
        if (!state.getBoolean("pending") && !state.getBoolean("reset") && HeritageConfig.EXEMPT_EXISTING_PLAYERS.get()
                && player.getStats().getValue(Stats.CUSTOM.get(Stats.PLAY_TIME)) > 0) {
            state.putBoolean("complete", true);
            return;
        }
        if (!state.getBoolean("pending")) {
            state.putBoolean("pending", true);
            state.putInt("mode", player.gameMode.getGameModeForPlayer().getId());
            player.getAbilities().addSaveData(state);
            state.putBoolean("no_gravity", player.isNoGravity());
            state.putLong("spawn", player.blockPosition().asLong());
            state.putString("original_dimension", player.level().dimension().location().toString());
            state.putFloat("yaw", player.getYRot());
        }
        hold(player);
    }

    private static void hold(ServerPlayer player) {
        var level = player.server.overworld();
        BlockPos spawn = level.getSharedSpawnPos();
        double y = level.getMaxBuildHeight() + 1000;
        player.setCamera(player);
        player.stopRiding();
        if (player.gameMode.getGameModeForPlayer() != GameType.ADVENTURE) player.setGameMode(GameType.ADVENTURE);
        var abilities = player.getAbilities();
        if (!abilities.invulnerable || !abilities.flying || !abilities.mayfly) {
            abilities.invulnerable = true;
            abilities.flying = true;
            abilities.mayfly = true;
            player.onUpdateAbilities();
        }
        player.setNoGravity(true);
        if (player.level() != level || player.distanceToSqr(spawn.getX() + 0.5, y, spawn.getZ() + 0.5) > 0.0001) {
            player.teleportTo(level, spawn.getX() + 0.5, y, spawn.getZ() + 0.5, player.getYRot(), player.getXRot());
        }
        player.setDeltaMovement(Vec3.ZERO);
        player.fallDistance = 0;
        player.clearFire();
        player.setAirSupply(player.getMaxAirSupply());
    }

    @SubscribeEvent
    public static void tick(PlayerTickEvent.Post event) {
        if (!(event.getEntity() instanceof ServerPlayer player) || !pending(player)) return;
        hold(player);
        if (player.tickCount >= 20 && (SENT_REVISION.getOrDefault(player.getUUID(), -1L) != HeritageCatalog.revision())) {
            sendChoices(player, "");
        }
    }

    public static void choose(ServerPlayer player, HeritageNetwork.Choose request) {
        if (!pending(player)) return;
        long now = player.server.overworld().getGameTime();
        if (now - LAST_REQUEST.getOrDefault(player.getUUID(), -100L) < 20) return;
        LAST_REQUEST.put(player.getUUID(), now);
        if (request.revision() != HeritageCatalog.revision()) {
            sendChoices(player, "The datapack changed. Please review your choices again");
            return;
        }
        var spawnId = ResourceLocation.tryParse(request.spawn());
        var kitId = ResourceLocation.tryParse(request.kit());
        var spawn = spawnId == null ? null : HeritageCatalog.spawns().get(spawnId);
        var kit = kitId == null ? null : HeritageCatalog.kits().get(kitId);
        if (spawn == null || kit == null) {
            sendChoices(player, "Choose an available location and kit");
            return;
        }
        try {
            var stacks = kit.decode(player.registryAccess());
            EquipmentCompat.validate(player, stacks);
            var destination = SpawnResolver.resolve(player, spawn, BlockPos.of(state(player).getLong("spawn")));
            KitService.apply(player, kit, stacks, state(player).getBoolean("reset")
                    ? HeritageConfig.InventoryPolicy.PRESERVE : HeritageConfig.INVENTORY_POLICY.get());
            CompoundTag state = state(player);
            player.teleportTo(destination.level(), destination.position().getX() + 0.5,
                    destination.position().getY(), destination.position().getZ() + 0.5, java.util.Set.of(), state.getFloat("yaw"), 0);
            state.putBoolean("complete", true);
            state.putBoolean("pending", false);
            state.putString("spawn_choice", spawn.id().toString());
            state.putString("kit_choice", kit.id().toString());
            state.putString("homeland_dimension", destination.level().dimension().location().toString());
            state.putLong("homeland", destination.position().asLong());
            if (HeritageConfig.HOMELAND_RESPAWN.get()) {
                player.setRespawnPosition(destination.level().dimension(), destination.position(), state.getFloat("yaw"), true, false);
            }
            state.remove("reset");
            player.setGameMode(GameType.byId(state.getInt("mode")));
            player.getAbilities().loadSaveData(state);
            player.onUpdateAbilities();
            player.setNoGravity(state.getBoolean("no_gravity"));
            player.closeContainer();
            player.fallDistance = 0;
            player.invulnerableTime = 100;
            PacketDistributor.sendToPlayer(player, new HeritageNetwork.Catalog("{}"));
            player.inventoryMenu.sendAllDataToRemote();
        } catch (IllegalArgumentException error) {
            sendChoices(player, error.getMessage());
        }
    }

    public static CompoundTag inspect(ServerPlayer player) {
        return state(player).copy();
    }

    public static void reset(ServerPlayer player) {
        if (pending(player)) throw new IllegalArgumentException("Recover the pending selection before resetting it");
        state(player).putBoolean("complete", false);
        state(player).putBoolean("reset", true);
        LAST_REQUEST.remove(player.getUUID());
        SENT_REVISION.remove(player.getUUID());
        login(new PlayerEvent.PlayerLoggedInEvent(player));
    }

    public static void recover(ServerPlayer player) {
        if (!pending(player)) throw new IllegalArgumentException("This player has no pending selection");
        CompoundTag state = state(player);
        var id = ResourceLocation.tryParse(state.getString("original_dimension"));
        var level = id == null ? player.server.overworld() : player.server.getLevel(
                net.minecraft.resources.ResourceKey.create(net.minecraft.core.registries.Registries.DIMENSION, id));
        if (level == null) throw new IllegalArgumentException("The original dimension is unavailable");
        BlockPos original = BlockPos.of(state.getLong("spawn"));
        BlockPos position = SpawnResolver.safe(level, original) ? original : SpawnResolver.nearby(level, original, 32, null)
                .orElseThrow(() -> new IllegalArgumentException("No safe ground near the original position"));
        player.teleportTo(level, position.getX() + 0.5, position.getY(), position.getZ() + 0.5, state.getFloat("yaw"), 0);
        state.putBoolean("pending", false);
        state.putBoolean("complete", true);
        state.remove("reset");
        player.setGameMode(GameType.byId(state.getInt("mode")));
        player.getAbilities().loadSaveData(state);
        player.onUpdateAbilities();
        player.setNoGravity(state.getBoolean("no_gravity"));
        player.fallDistance = 0;
        LAST_REQUEST.remove(player.getUUID());
        SENT_REVISION.remove(player.getUUID());
        PacketDistributor.sendToPlayer(player, new HeritageNetwork.Catalog("{}"));
        player.inventoryMenu.sendAllDataToRemote();
    }

    private static void sendChoices(ServerPlayer player, String error) {
        JsonObject json = new JsonObject();
        json.addProperty("revision", HeritageCatalog.revision());
        json.addProperty("error", error);
        json.addProperty("inventory_policy", state(player).getBoolean("reset") ? "PRESERVE" : HeritageConfig.INVENTORY_POLICY.get().name());
        JsonArray spawns = new JsonArray();
        for (var spawn : HeritageCatalog.spawns().values()) {
            JsonObject choice = new JsonObject();
            choice.addProperty("id", spawn.id().toString());
            choice.addProperty("title", spawn.title());
            choice.addProperty("description", spawn.description());
            choice.addProperty("image", spawn.image().toString());
            spawns.add(choice);
        }
        json.add("spawns", spawns);
        JsonArray kits = new JsonArray();
        for (var kit : HeritageCatalog.kits().values()) {
            JsonObject choice = new JsonObject();
            choice.addProperty("id", kit.id().toString());
            choice.addProperty("title", kit.title());
            choice.addProperty("description", kit.description());
            choice.addProperty("selected_slot", kit.selectedSlot());
            JsonArray items = new JsonArray();
            for (var entry : kit.entries()) {
                JsonObject item = new JsonObject();
                item.addProperty("inventory", entry.inventory());
                item.addProperty("slot", entry.slot());
                item.addProperty("index", entry.index());
                item.addProperty("cosmetic", entry.cosmetic());
                item.add("item", entry.item());
                items.add(item);
            }
            choice.add("items", items);
            try {
                EquipmentCompat.validate(player, kit.decode(player.registryAccess()));
                choice.addProperty("problem", "");
            } catch (IllegalArgumentException failure) {
                choice.addProperty("problem", failure.getMessage());
            }
            kits.add(choice);
        }
        json.add("kits", kits);
        String payload = json.toString();
        if (payload.getBytes(StandardCharsets.UTF_8).length > 900000) {
            player.connection.disconnect(net.minecraft.network.chat.Component.literal("Heritage definitions exceed the 900 KB catalog limit. Contact the pack creator"));
            return;
        }
        PacketDistributor.sendToPlayer(player, new HeritageNetwork.Catalog(payload));
        SENT_REVISION.put(player.getUUID(), HeritageCatalog.revision());
    }

    @SubscribeEvent
    public static void damage(LivingIncomingDamageEvent event) {
        if (event.getEntity() instanceof ServerPlayer player && pending(player)) event.setCanceled(true);
    }

    @SubscribeEvent
    public static void useBlock(PlayerInteractEvent.RightClickBlock event) { interact(event); }

    @SubscribeEvent
    public static void useItem(PlayerInteractEvent.RightClickItem event) { interact(event); }

    @SubscribeEvent
    public static void useEntity(PlayerInteractEvent.EntityInteract event) { interact(event); }

    @SubscribeEvent
    public static void useEntityPart(PlayerInteractEvent.EntityInteractSpecific event) { interact(event); }

    @SubscribeEvent
    public static void breakBlock(PlayerInteractEvent.LeftClickBlock event) { interact(event); }

    private static void interact(PlayerInteractEvent event) {
        if (event.getEntity() instanceof ServerPlayer player && pending(player) && event instanceof ICancellableEvent cancellable) {
            cancellable.setCanceled(true);
        }
    }

    @SubscribeEvent
    public static void attack(AttackEntityEvent event) {
        if (pending(event.getEntity())) event.setCanceled(true);
    }

    @SubscribeEvent
    public static void mode(PlayerEvent.PlayerChangeGameModeEvent event) {
        if (pending(event.getEntity()) && event.getNewGameMode() != GameType.ADVENTURE) event.setCanceled(true);
    }

    @SubscribeEvent
    public static void logout(PlayerEvent.PlayerLoggedOutEvent event) {
        LAST_REQUEST.remove(event.getEntity().getUUID());
        SENT_REVISION.remove(event.getEntity().getUUID());
    }

    @SubscribeEvent
    public static void respawn(PlayerEvent.PlayerRespawnEvent event) {
        if (event.getEntity() instanceof ServerPlayer player && pending(player)) {
            hold(player);
            SENT_REVISION.remove(player.getUUID());
        }
    }

    @SubscribeEvent
    public static void stop(ServerStoppedEvent event) {
        LAST_REQUEST.clear();
        SENT_REVISION.clear();
    }
}

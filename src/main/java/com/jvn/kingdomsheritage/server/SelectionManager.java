package com.jvn.kingdomsheritage.server;

import com.google.gson.JsonObject;
import com.jvn.kingdomsheritage.HeritageConfig;
import com.jvn.kingdomsheritage.KingdomsHeritage;
import com.jvn.kingdomsheritage.compat.EquipmentCompat;
import com.jvn.kingdomsheritage.data.CatalogPayload;
import com.jvn.kingdomsheritage.data.HeritageCatalog;
import com.jvn.kingdomsheritage.data.HeritageException;
import com.jvn.kingdomsheritage.network.HeritageNetwork;
import java.util.ArrayList;
import java.util.UUID;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceKey;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.stats.Stats;
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
import net.neoforged.neoforge.event.tick.ServerTickEvent;
import net.neoforged.neoforge.network.PacketDistributor;
import net.neoforged.neoforge.network.registration.NetworkRegistry;

public final class SelectionManager {
    private static final String KEY = KingdomsHeritage.MOD_ID;

    private SelectionManager() {}

    static CompoundTag state(Player player) {
        CompoundTag persistent = player.getPersistentData();
        if (!persistent.contains(Player.PERSISTED_NBT_TAG)) persistent.put(Player.PERSISTED_NBT_TAG, new CompoundTag());
        CompoundTag retained = persistent.getCompound(Player.PERSISTED_NBT_TAG);
        if (!retained.contains(KEY)) retained.put(KEY, new CompoundTag());
        return retained.getCompound(KEY);
    }

    public static boolean pending(Player player) {
        return state(player).getBoolean("pending");
    }

    public static boolean blocked(Player player) {
        return pending(player) || SpawnIntro.locked(player);
    }

    @SubscribeEvent
    public static void login(PlayerEvent.PlayerLoggedInEvent event) {
        if (!(event.getEntity() instanceof ServerPlayer player)) return;
        SpawnIntro.release(player);
        CompoundTag state = state(player);
        defaultSpawn(player);
        if (state.getBoolean("complete")) {
            sendJoinState(player, false);
            return;
        }
        if (!state.getBoolean("pending") && !state.getBoolean("reset") && HeritageConfig.EXEMPT_EXISTING_PLAYERS.get()
                && player.getStats().getValue(Stats.CUSTOM.get(Stats.PLAY_TIME)) > 0) {
            state.putBoolean("complete", true);
            sendJoinState(player, false);
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
        SelectionParty.register(player);
        SelectionParty.stage(player, 2);
        SelectionLifecycle.start(player);
        sendJoinState(player, true);
    }

    static BlockPos defaultSpawn(ServerPlayer player) {
        CompoundTag state = state(player);
        if (!state.contains("default_spawn")) {
            BlockPos position = player.server.overworld().getSharedSpawnPos();
            if (state.contains("spawn") && state.getString("original_dimension").equals("minecraft:overworld")) {
                position = BlockPos.of(state.getLong("spawn"));
            } else if (!state.contains("spawn") && player.level() == player.server.overworld()) {
                position = player.blockPosition();
            }
            state.putLong("default_spawn", position.asLong());
        }
        return BlockPos.of(state.getLong("default_spawn"));
    }

    private static void sendJoinState(ServerPlayer player, boolean pending) {
        if (NetworkRegistry.hasChannel(player.connection, HeritageNetwork.JoinState.TYPE.id())) {
            PacketDistributor.sendToPlayer(player, new HeritageNetwork.JoinState(pending));
        }
    }

    static void hold(ServerPlayer player) {
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
        if (!(event.getEntity() instanceof ServerPlayer player)) return;
        SpawnIntro.tick(player);
        if (!pending(player)) return;
        if (!player.isAlive()) {
            SelectionParty.leave(player);
            cancelPreparation(player);
            SelectionLifecycle.cancel(player, com.jvn.kingdomsheritage.api.SelectionEvent.Reason.DEATH);
            return;
        }
        hold(player);
        var session = SelectionSession.of(player);
        if (player.tickCount >= 20 && session.sentRevision != HeritageCatalog.revision()
                && (session.sentRevision == -1 || !SelectionParty.grouped(player))) {
            cancelPreparation(player);
            sendChoices(player, session.sentRevision != -1
                    ? Component.translatable("error.kingdomsheritage.reloaded") : Component.empty());
        } else if (session.expired(player.server.overworld().getGameTime())) {
            var expired = Component.translatableWithFallback("error.kingdomsheritage.review_expired",
                    "The review expired. Review your choices again.");
            if (SelectionParty.grouped(player)) SelectionParty.refresh(player, expired);
            else {
                cancelPreparation(player);
                sendChoices(player, expired);
            }
        }
    }

    public static void reviewDecision(ServerPlayer player, HeritageNetwork.ReviewDecision decision) {
        var session = SelectionSession.find(player.getUUID());
        if (session == null || !session.accepts(decision.token()) || !player.isAlive() || !pending(player)) return;
        if (!decision.accepted()) {
            cancelPreparation(player);
            SelectionParty.stage(player, 1);
            return;
        }
        if (SelectionParty.grouped(player)) {
            if (SelectionParty.isReady(player)) return;
            if (!SelectionParty.ready(player)) {
                sendProgress(player, "party_waiting");
                return;
            }
        }
        session.commit();
        sendProgress(player, "queued");
    }

    static void startDebugPlayer(ServerPlayer player) {
        state(player).putBoolean("pending", true);
        state(player).putLong("default_spawn", player.server.overworld().getSharedSpawnPos().asLong());
        SelectionParty.register(player);
        SelectionParty.stage(player, 0);
        SelectionLifecycle.start(player);
    }

    static void stopDebugPlayer(ServerPlayer player) {
        SelectionParty.disconnect(player);
        SelectionSteps.remove(player);
        SelectionLifecycle.cancel(player, com.jvn.kingdomsheritage.api.SelectionEvent.Reason.DISCONNECTED);
        SelectionSession.remove(player.getUUID());
        state(player).putBoolean("pending", false);
    }

    static void readyDebugPlayer(ServerPlayer player) {
        if (SelectionParty.isReady(player) || !SelectionParty.ready(player)) return;
        for (var member : SelectionParty.members(player)) {
            var session = SelectionSession.find(member.getUUID());
            if (session != null && session.phase() == SelectionSession.Phase.REVIEWING) {
                session.commit();
                sendProgress(member, "queued");
                return;
            }
        }
    }

    public static void review(ServerPlayer player, HeritageNetwork.Review request) {
        if (!player.isAlive() || !pending(player) || busy(player)) return;
        var session = SelectionSession.of(player);
        long now = player.server.overworld().getGameTime();
        if (now - session.lastRequest < 20) {
            sendProgress(player, "retry");
            return;
        }
        session.lastRequest = now;
        if (request.revision() != HeritageCatalog.revision()) {
            sendChoices(player, Component.translatable("error.kingdomsheritage.reloaded"));
            return;
        }
        if (!SelectionParty.allows(player, request.spawn())) {
            sendChoices(player, Component.translatable("error.kingdomsheritage.party_spawn"));
            return;
        }
        var spawnId = ResourceLocation.tryParse(request.spawn());
        var kitId = ResourceLocation.tryParse(request.kit());
        var spawn = spawnId == null ? null : HeritageCatalog.spawns().get(spawnId);
        var kit = kitId == null ? null : HeritageCatalog.kits().get(kitId);
        if (spawn == null || kit == null || !spawn.allows(kit)) {
            sendChoices(player, Component.translatable("error.kingdomsheritage.choice"));
            return;
        }
        try {
            SelectionSteps.requireComplete(player, request.spawn(), request.kit());
            var stacks = kit.loadout(player, inventoryPolicy(player), request.offers());
            if (inventoryPolicy(player) != HeritageConfig.InventoryPolicy.PRESERVE) EquipmentCompat.validate(player, stacks);
            SelectionLifecycle.choices(player, spawnId, kitId);
            session.begin(player, request, SelectionParty.search(player, spawn));
            sendProgress(player, "queued");
        } catch (IllegalArgumentException error) {
            cancelPreparation(player);
            sendChoices(player, HeritageException.component(error));
        }
    }

    @SubscribeEvent
    public static void prepare(ServerTickEvent.Post event) {
        SelectionParty.tick();
        SelectionDebug.tick(event.getServer());
        var session = SelectionSession.poll();
        if (session != null) processPreparation(session);
    }

    private static void processPreparation(SelectionSession session) {
        var player = session.player();
        var request = session.request();
        var search = session.resolver();
        if (!player.isAlive() || !pending(player)) {
            cancelPreparation(player);
            return;
        }
        if (request.revision() != HeritageCatalog.revision()) {
            cancelPreparation(player);
            sendChoices(player, Component.translatable("error.kingdomsheritage.reloaded"));
            return;
        }
        try {
            sendProgress(player, search.stage());
            if (!search.step()) {
                session.requeue();
                return;
            }
            var destination = search.destination();
            if (!SpawnResolver.safe(destination.level(), destination.position())) {
                throw new HeritageException("changed", "The destination changed during preparation. Please try again");
            }
            if (session.phase() == SelectionSession.Phase.SEARCHING) {
                UUID token = session.review(player.server.overworld().getGameTime());
                JsonObject review = new JsonObject();
                review.addProperty("token", token.toString());
                review.addProperty("spawn", request.spawn());
                review.addProperty("kit", request.kit());
                review.addProperty("revision", request.revision());
                review.add("companions", SelectionParty.companions(player));
                SelectionParty.stage(player, 3);
                review.add("locations", SpawnIntro.locations(search.definition(), destination));
                var kit = HeritageCatalog.kits().get(ResourceLocation.parse(request.kit()));
                review.add("dialogue_context", DialogueContexts.create(player,
                        HeritageCatalog.spawns().get(ResourceLocation.parse(request.spawn())), kit, inventoryPolicy(player),
                        !kit.entries().isEmpty() || !request.offers().isEmpty()).json());
                JsonObject message = new JsonObject();
                message.add("review", review);
                PacketDistributor.sendToPlayer(player, new HeritageNetwork.Catalog(message.toString()));
                return;
            }
            if (SelectionParty.grouped(player) && !SelectionParty.allReady(player)) {
                session.waitForParty();
                sendProgress(player, "party_waiting");
                return;
            }
            var members = SelectionParty.members(player);
            var deliveries = new ArrayList<SelectionFinalization.Member>();
            var assigned = new ArrayList<BlockPos>();
            for (var member : members) {
                if (SelectionDebug.isBot(member)) continue;
                var memberSession = SelectionSession.find(member.getUUID());
                var reviewed = memberSession == null || !memberSession.reviewed() ? null : memberSession.request();
                if (reviewed == null || !member.isAlive() || !pending(member) || reviewed.revision() != HeritageCatalog.revision()
                        || !SelectionParty.allows(member, reviewed.spawn())) {
                    throw new HeritageException("party_changed", "The party changed. Please review your choices again");
                }
                SelectionSteps.requireComplete(member, reviewed.spawn(), reviewed.kit());
                var spawn = HeritageCatalog.spawns().get(ResourceLocation.parse(reviewed.spawn()));
                var kit = HeritageCatalog.kits().get(ResourceLocation.parse(reviewed.kit()));
                var policy = inventoryPolicy(member);
                var arrival = SpawnResolver.partyArrival(destination, search.definition(), assigned);
                assigned.add(arrival.position());
                deliveries.add(SelectionFinalization.plan(member, spawn, kit, kit.loadout(member, policy, reviewed.offers()),
                        policy, search.definition(), arrival));
            }
            KingdomsHeritage.LOGGER.debug("Prepared Heritage location {} in {} ms of server work",
                    request.spawn(), search.workMillis());
            for (var delivery : deliveries) sendProgress(delivery.player(), "applying");
            SelectionFinalization.apply(deliveries, destination);
            SelectionParty.finished(player);
            for (var member : members) {
                if (SelectionDebug.isBot(member)) state(member).putBoolean("pending", false);
                cancelPreparation(member);
                SelectionParty.remove(member);
            }
            for (var delivery : deliveries) SelectionFinalization.arrive(delivery, search.definition());
            for (var member : members) {
                try {
                    SelectionLifecycle.complete(member);
                } catch (RuntimeException error) {
                    KingdomsHeritage.LOGGER.error("A Heritage completion listener failed for {}", member.getGameProfile().getName(), error);
                }
            }
        } catch (RuntimeException error) {
            if (!(error instanceof IllegalArgumentException) || error.getSuppressed().length > 0) {
                KingdomsHeritage.LOGGER.error("Heritage could not prepare a selection for {}", player.getGameProfile().getName(), error);
            }
            var message = error instanceof IllegalArgumentException invalid ? HeritageException.component(invalid)
                    : Component.translatableWithFallback("error.kingdomsheritage.preparation_failed",
                            "The selection could not be prepared. Try again or contact an administrator.");
            try {
                if (SelectionParty.grouped(player)) SelectionParty.refresh(player, message);
                else {
                    cancelPreparation(player);
                    if (pending(player)) sendChoices(player, message);
                }
            } catch (RuntimeException recovery) {
                KingdomsHeritage.LOGGER.error("Could not refresh Heritage selection after a failure", recovery);
            }
        }
    }

    static boolean busy(ServerPlayer player) {
        var session = SelectionSession.find(player.getUUID());
        return session != null && session.phase() != null;
    }

    static void refresh(ServerPlayer player, Component error) {
        if (!SelectionDebug.isBot(player) && player.isAlive() && player.connection.isAcceptingMessages() && pending(player)) {
            sendChoices(player, error);
        }
    }

    static void cancelPreparation(ServerPlayer player) {
        var session = SelectionSession.find(player.getUUID());
        if (session != null) session.cancel();
        SelectionParty.unready(player);
    }

    static void teleport(ServerPlayer player, SpawnResolver.Destination destination, float yaw) {
        BlockPos position = destination.position();
        player.teleportTo(destination.level(), position.getX() + 0.5, position.getY(), position.getZ() + 0.5,
                java.util.Set.of(), yaw, 0);
        player.connection.resetPosition();
        // dimension travel can be cancelled even when teleportTo returns true
        if (player.level() != destination.level()
                || player.distanceToSqr(position.getX() + 0.5, position.getY(), position.getZ() + 0.5) > 0.0001) {
            throw new HeritageException("travel", "Travel to the destination was blocked. Choose another location or contact an administrator");
        }
    }

    private static HeritageConfig.InventoryPolicy inventoryPolicy(ServerPlayer player) {
        return state(player).getBoolean("reset") ? HeritageConfig.InventoryPolicy.PRESERVE : HeritageConfig.INVENTORY_POLICY.get();
    }

    private static void sendProgress(ServerPlayer player, String stage) {
        if (!stage.equals("retry") && !SelectionSession.of(player).progressChanged(stage)) return;
        if (!SelectionParty.isReady(player)) SelectionParty.stage(player, 2);
        JsonObject json = new JsonObject();
        json.addProperty("progress", stage);
        PacketDistributor.sendToPlayer(player, new HeritageNetwork.Catalog(json.toString()));
    }

    public static CompoundTag inspect(ServerPlayer player) {
        return state(player).copy();
    }

    public static void reset(ServerPlayer player) {
        SpawnIntro.release(player);
        if (pending(player)) throw new HeritageException("pending", "Recover the pending selection before resetting it");
        SelectionSteps.remove(player);
        SelectionLifecycle.reset(player);
        state(player).putBoolean("complete", false);
        state(player).putBoolean("reset", true);
        SelectionSession.remove(player.getUUID());
        login(new PlayerEvent.PlayerLoggedInEvent(player));
    }

    public static void recover(ServerPlayer player) {
        if (!pending(player)) throw new HeritageException("not_pending", "This player has no pending selection");
        CompoundTag state = state(player);
        var id = ResourceLocation.tryParse(state.getString("original_dimension"));
        var level = id == null ? player.server.overworld() : player.server.getLevel(
                ResourceKey.create(Registries.DIMENSION, id));
        if (level == null) throw new HeritageException("original_dimension", "The original dimension is unavailable");
        BlockPos original = BlockPos.of(state.getLong("spawn"));
        BlockPos position = SpawnResolver.safe(level, original) ? original : SpawnResolver.nearby(level, original, 32, null)
                .orElseThrow(() -> new HeritageException("original_ground", "No safe ground near the original position"));
        teleport(player, new SpawnResolver.Destination(level, position), state.getFloat("yaw"));
        cancelPreparation(player);
        SelectionParty.remove(player);
        state.putBoolean("pending", false);
        state.putBoolean("complete", true);
        state.remove("reset");
        player.setGameMode(GameType.byId(state.getInt("mode")));
        player.getAbilities().loadSaveData(state);
        player.onUpdateAbilities();
        player.setNoGravity(state.getBoolean("no_gravity"));
        player.fallDistance = 0;
        SelectionSteps.remove(player);
        SelectionLifecycle.cancel(player, com.jvn.kingdomsheritage.api.SelectionEvent.Reason.RECOVERED);
        SelectionSession.remove(player.getUUID());
        PacketDistributor.sendToPlayer(player, new HeritageNetwork.Catalog("{\"outcome\":\"recovered\"}"));
        player.inventoryMenu.sendAllDataToRemote();
    }

    private static void sendChoices(ServerPlayer player, Component error) {
        SelectionParty.register(player);
        SelectionParty.stage(player, 2);
        JsonObject json = new JsonObject();
        var lifecycle = SelectionLifecycle.state(player);
        var selectedSpawn = lifecycle.spawnId().map(HeritageCatalog.spawns()::get).orElse(null);
        var selectedKit = lifecycle.kitId().map(HeritageCatalog.kits()::get).filter(value -> selectedSpawn != null && selectedSpawn.allows(value)).orElse(null);
        SelectionLifecycle.choices(player, selectedSpawn == null ? null : selectedSpawn.id(), selectedKit == null ? null : selectedKit.id());
        json.add("flow", SelectionSteps.manifest(player));
        json.addProperty("session", lifecycle.sessionId().toString());
        json.addProperty("reset", state(player).getBoolean("reset"));
        json.addProperty("revision", HeritageCatalog.revision());
        json.addProperty("error", error.getString());
        json.addProperty("error_component", Component.Serializer.toJson(error, player.registryAccess()));
        json.addProperty("inventory_policy", inventoryPolicy(player).name());
        HeritageCatalog.payload().entrySet().forEach(entry -> json.add(entry.getKey(), entry.getValue()));
        var kits = json.getAsJsonArray("kits");
        var policy = inventoryPolicy(player);
        for (var element : kits) {
            var choice = element.getAsJsonObject();
            var kit = HeritageCatalog.kits().get(ResourceLocation.parse(choice.get("id").getAsString()));
            try {
                var decoded = kit.decode(player.registryAccess());
                kit.decodeOffers(player.registryAccess());
                if (policy != HeritageConfig.InventoryPolicy.PRESERVE) EquipmentCompat.validate(player, decoded);
                choice.addProperty("problem", "");
            } catch (IllegalArgumentException failure) {
                choice.addProperty("problem", failure.getMessage());
                choice.addProperty("problem_component", Component.Serializer.toJson(
                        HeritageException.component(failure), player.registryAccess()));
            }
        }
        String payload = json.toString();
        if (CatalogPayload.size(payload) > CatalogPayload.MAX_BYTES) {
            json.remove("error_component");
            if (!error.getString().isEmpty()) json.addProperty("error", "Selection could not be prepared. Check the server log.");
            for (var element : kits) {
                var kit = element.getAsJsonObject();
                kit.remove("problem_component");
                if (!kit.get("problem").getAsString().isEmpty()) kit.addProperty("problem", "Invalid kit or unavailable equipment.");
            }
            payload = json.toString();
        }
        if (CatalogPayload.size(payload) > CatalogPayload.MAX_BYTES) {
            player.connection.disconnect(Component.translatable("error.kingdomsheritage.catalog_limit"));
            return;
        }
        PacketDistributor.sendToPlayer(player, new HeritageNetwork.Catalog(payload));
        SelectionSession.of(player).sentRevision = HeritageCatalog.revision();
    }

    @SubscribeEvent
    public static void damage(LivingIncomingDamageEvent event) {
        if (event.getEntity() instanceof ServerPlayer player && blocked(player)) event.setCanceled(true);
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
        if (event.getEntity() instanceof ServerPlayer player && blocked(player) && event instanceof ICancellableEvent cancellable) {
            cancellable.setCanceled(true);
        }
    }

    @SubscribeEvent
    public static void attack(AttackEntityEvent event) {
        if (blocked(event.getEntity())) event.setCanceled(true);
    }

    @SubscribeEvent
    public static void mode(PlayerEvent.PlayerChangeGameModeEvent event) {
        if (pending(event.getEntity()) && event.getNewGameMode() != GameType.ADVENTURE) event.setCanceled(true);
    }

    @SubscribeEvent
    public static void logout(PlayerEvent.PlayerLoggedOutEvent event) {
        if (!(event.getEntity() instanceof ServerPlayer player)) return;
        try {
            SelectionParty.disconnect(player);
        } finally {
            try {
                SpawnIntro.release(player);
                SelectionSteps.remove(player);
                SelectionLifecycle.cancel(player, com.jvn.kingdomsheritage.api.SelectionEvent.Reason.DISCONNECTED);
            } finally {
                SelectionSession.remove(player.getUUID());
            }
        }
    }

    @SubscribeEvent
    public static void respawn(PlayerEvent.PlayerRespawnEvent event) {
        if (event.getEntity() instanceof ServerPlayer player) SpawnIntro.release(player);
        if (event.getEntity() instanceof ServerPlayer player && pending(player)) {
            SelectionParty.remove(player);
            SelectionSteps.remove(player);
            SelectionSession.remove(player.getUUID());
            hold(player);
        }
    }

    @SubscribeEvent
    public static void stop(ServerStoppedEvent event) {
        SelectionSession.clear();
        SelectionParty.clear();
        SelectionDebug.clear();
        SelectionSteps.clear();
        com.jvn.kingdomsheritage.api.HeritageFlow.stopped();
        SpawnIntro.clear();
        SpawnResolver.clearCache();
    }
}

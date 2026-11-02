package com.jvn.kingdomsheritage.server;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.jvn.kingdomsheritage.HeritageConfig;
import com.jvn.kingdomsheritage.KingdomsHeritage;
import com.jvn.kingdomsheritage.compat.EquipmentCompat;
import com.jvn.kingdomsheritage.data.HeritageCatalog;
import com.jvn.kingdomsheritage.data.HeritageException;
import com.jvn.kingdomsheritage.network.HeritageNetwork;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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
import net.minecraft.world.item.ItemStack;
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
    private record Preparation(ServerPlayer player, HeritageNetwork.Choose request, SpawnResolver.Search search, boolean review) {}
    private record Review(UUID token, Preparation preparation) {}
    private record InventoryBackup(ServerPlayer player, List<ItemStack> items, int selected,
                                   List<EquipmentCompat.Slot> slots, List<ItemStack> equipment) {
        static InventoryBackup capture(ServerPlayer player) {
            var inventory = player.getInventory();
            var slots = EquipmentCompat.slots(player);
            return new InventoryBackup(player, java.util.stream.IntStream.range(0, inventory.getContainerSize())
                    .mapToObj(index -> inventory.getItem(index).copy()).toList(), inventory.selected,
                    slots, slots.stream().map(slot -> slot.get().get().copy()).toList());
        }

        void restore() {
            for (int index = 0; index < items.size(); index++) player.getInventory().setItem(index, items.get(index));
            player.getInventory().selected = selected;
            for (int index = 0; index < slots.size(); index++) slots.get(index).set().accept(equipment.get(index));
            player.getInventory().setChanged();
            player.inventoryMenu.sendAllDataToRemote();
        }
    }
    private static final Map<UUID, Preparation> PREPARATIONS = new LinkedHashMap<>();
    private static final Map<UUID, Review> REVIEWS = new HashMap<>();
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
        if (!(event.getEntity() instanceof ServerPlayer player)) return;
        SpawnIntro.tick(player);
        if (!pending(player)) return;
        if (!player.isAlive()) {
            SelectionParty.leave(player);
            cancelPreparation(player.getUUID());
            SelectionLifecycle.cancel(player, com.jvn.kingdomsheritage.api.SelectionEvent.Reason.DEATH);
            return;
        }
        hold(player);
        if (player.tickCount >= 20 && (SENT_REVISION.getOrDefault(player.getUUID(), -1L) != HeritageCatalog.revision())) {
            cancelPreparation(player.getUUID());
            sendChoices(player, SENT_REVISION.containsKey(player.getUUID())
                    ? Component.translatable("error.kingdomsheritage.reloaded") : Component.empty());
        }
    }

    public static void choose(ServerPlayer player, HeritageNetwork.Choose request) {
        prepare(player, request, false);
    }

    public static void review(ServerPlayer player, HeritageNetwork.Choose request) {
        prepare(player, request, true);
    }

    public static void reviewDecision(ServerPlayer player, HeritageNetwork.ReviewDecision decision) {
        var review = REVIEWS.get(player.getUUID());
        if (review == null || !player.isAlive() || !pending(player) || !review.token().equals(decision.token())) return;
        if (!decision.accepted()) {
            REVIEWS.remove(player.getUUID());
            SelectionParty.unready(player);
            SelectionParty.stage(player, 1);
            SelectionParty.release(review.preparation().search());
            return;
        }
        if (SelectionParty.grouped(player)) {
            if (SelectionParty.isReady(player)) return;
            if (!SelectionParty.ready(player)) {
                sendProgress(player, "party_waiting");
                return;
            }
        } else REVIEWS.remove(player.getUUID());
        var preparation = review.preparation();
        PREPARATIONS.put(player.getUUID(), new Preparation(player, preparation.request(), preparation.search(), false));
        sendProgress(player, "queued");
    }

    private static void prepare(ServerPlayer player, HeritageNetwork.Choose request, boolean review) {
        if (!player.isAlive() || !pending(player) || PREPARATIONS.containsKey(player.getUUID()) || REVIEWS.containsKey(player.getUUID())) return;
        long now = player.server.overworld().getGameTime();
        if (now - LAST_REQUEST.getOrDefault(player.getUUID(), -100L) < 20) {
            sendProgress(player, "retry");
            return;
        }
        LAST_REQUEST.put(player.getUUID(), now);
        if (request.revision() != HeritageCatalog.revision()) {
            sendChoices(player, Component.translatable("error.kingdomsheritage.reloaded"));
            return;
        }
        if (!SelectionParty.allows(player, request.spawn()) || SelectionParty.grouped(player) && !review) {
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
            var stacks = kit.decode(player.registryAccess());
            if (inventoryPolicy(player) != HeritageConfig.InventoryPolicy.PRESERVE) EquipmentCompat.validate(player, stacks);
            SelectionLifecycle.choices(player, spawnId, kitId);
            var search = SelectionParty.search(player, spawn);
            PREPARATIONS.put(player.getUUID(), new Preparation(player, request, search, review));
            sendProgress(player, "queued");
        } catch (IllegalArgumentException error) {
            sendChoices(player, HeritageException.component(error));
        }
    }

    @SubscribeEvent
    public static void prepare(ServerTickEvent.Post event) {
        SelectionParty.tick();
        if (PREPARATIONS.isEmpty()) return;
        var preparation = PREPARATIONS.values().iterator().next();
        processPreparation(preparation.player());
    }

    static void processPreparation(ServerPlayer player) {
        var preparation = PREPARATIONS.remove(player.getUUID());
        if (preparation == null) return;
        if (!player.isAlive() || !pending(player)) {
            SelectionParty.release(preparation.search());
            return;
        }
        if (preparation.request().revision() != HeritageCatalog.revision()) {
            SelectionParty.release(preparation.search());
            sendChoices(player, Component.translatable("error.kingdomsheritage.reloaded"));
            return;
        }
        try {
            sendProgress(player, preparation.search().stage());
            if (!preparation.search().step()) {
                PREPARATIONS.put(player.getUUID(), preparation);
                return;
            }
            var destination = preparation.search().destination();
            if (!SpawnResolver.safe(destination.level(), destination.position())) {
                throw new HeritageException("changed", "The destination changed during preparation. Please try again");
            }
            if (preparation.review()) {
                UUID token = UUID.randomUUID();
                JsonObject review = new JsonObject();
                review.addProperty("token", token.toString());
                review.addProperty("spawn", preparation.request().spawn());
                review.addProperty("kit", preparation.request().kit());
                review.addProperty("revision", preparation.request().revision());
                review.add("companions", SelectionParty.companions(player));
                SelectionParty.stage(player, 3);
                review.add("locations", SpawnIntro.locations(preparation.search().definition(), destination));
                JsonObject message = new JsonObject();
                message.add("review", review);
                REVIEWS.put(player.getUUID(), new Review(token, preparation));
                PacketDistributor.sendToPlayer(player, new HeritageNetwork.Catalog(message.toString()));
                return;
            }
            if (SelectionParty.grouped(player) && !SelectionParty.allReady(player)) {
                sendProgress(player, "party_waiting");
                return;
            }
            var members = SelectionParty.members(player);
            var requests = new LinkedHashMap<ServerPlayer, HeritageNetwork.Choose>();
            for (var member : members) {
                var request = SelectionParty.grouped(player) ? REVIEWS.get(member.getUUID()).preparation().request() : preparation.request();
                if (!member.isAlive() || !pending(member) || request.revision() != HeritageCatalog.revision()) {
                    throw new HeritageException("party_changed", "The party changed. Please review your choices again");
                }
                SelectionSteps.requireComplete(member, request.spawn(), request.kit());
                var kit = HeritageCatalog.kits().get(ResourceLocation.parse(request.kit()));
                var stacks = kit.decode(member.registryAccess());
                if (inventoryPolicy(member) != HeritageConfig.InventoryPolicy.PRESERVE) EquipmentCompat.validate(member, stacks);
                requests.put(member, request);
            }
            KingdomsHeritage.LOGGER.debug("Prepared Heritage location {} in {} ms of server work",
                    preparation.request().spawn(), preparation.search().workMillis());
            try {
                for (var member : members) teleport(member, destination, state(member).getFloat("yaw"));
            } catch (IllegalArgumentException error) {
                for (var member : members) hold(member);
                throw error;
            }
            var backups = members.size() > 1 ? members.stream().map(InventoryBackup::capture).toList() : List.<InventoryBackup>of();
            var intros = new LinkedHashMap<ServerPlayer, JsonObject>();
            try {
                for (var entry : requests.entrySet()) {
                    var member = entry.getKey();
                    intros.put(member, SpawnIntro.prepare(preparation.search().definition(), destination));
                    var kit = HeritageCatalog.kits().get(ResourceLocation.parse(entry.getValue().kit()));
                    KitService.apply(member, kit, kit.decode(member.registryAccess()), inventoryPolicy(member));
                }
            } catch (RuntimeException error) {
                backups.forEach(InventoryBackup::restore);
                members.forEach(SelectionManager::hold);
                throw error;
            }
            for (var entry : requests.entrySet()) SelectionSteps.capture(entry.getKey(), entry.getValue().spawn(), entry.getValue().kit());
            for (var entry : requests.entrySet()) apply(entry.getKey(), entry.getValue(), preparation.search(), intros.get(entry.getKey()));
            SelectionParty.finished(player);
            for (var member : members) {
                REVIEWS.remove(member.getUUID());
                SelectionParty.remove(member);
            }
            for (var member : members) SelectionLifecycle.complete(member);
        } catch (IllegalArgumentException error) {
            if (SelectionParty.grouped(player)) {
                SelectionParty.refresh(player);
                for (var member : SelectionParty.members(player)) sendChoices(member, HeritageException.component(error));
            } else {
                hold(player);
                sendChoices(player, HeritageException.component(error));
            }
        } finally {
            if (!PREPARATIONS.containsKey(player.getUUID()) && !REVIEWS.containsKey(player.getUUID())) SelectionParty.release(preparation.search());
        }
    }

    private static void apply(ServerPlayer player, HeritageNetwork.Choose request, SpawnResolver.Search search, JsonObject intro) {
        var spawn = HeritageCatalog.spawns().get(ResourceLocation.parse(request.spawn()));
        var kit = HeritageCatalog.kits().get(ResourceLocation.parse(request.kit()));
        var destination = search.destination();
        var arrival = search.definition();
        sendProgress(player, "applying");
        CompoundTag state = state(player);
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
        intro.addProperty("outcome", "completed");
        intro.addProperty("session", SelectionLifecycle.state(player).sessionId().toString());
        SpawnIntro.begin(player, arrival.intro(), intro);
        player.inventoryMenu.sendAllDataToRemote();
    }

    static boolean busy(ServerPlayer player) {
        return PREPARATIONS.containsKey(player.getUUID()) || REVIEWS.containsKey(player.getUUID());
    }

    static void refresh(ServerPlayer player) {
        cancelPreparation(player.getUUID());
        if (player.connection.isAcceptingMessages() && pending(player)) sendChoices(player, Component.empty());
    }

    static void cancelPreparation(UUID player) {
        var preparation = PREPARATIONS.remove(player);
        if (preparation != null) SelectionParty.release(preparation.search());
        var review = REVIEWS.remove(player);
        if (review != null) SelectionParty.release(review.preparation().search());
    }

    private static void teleport(ServerPlayer player, SpawnResolver.Destination destination, float yaw) {
        BlockPos position = destination.position();
        player.teleportTo(destination.level(), position.getX() + 0.5, position.getY(), position.getZ() + 0.5,
                java.util.Set.of(), yaw, 0);
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
        SelectionParty.stage(player, 2);
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
        LAST_REQUEST.remove(player.getUUID());
        SENT_REVISION.remove(player.getUUID());
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
        cancelPreparation(player.getUUID());
        SelectionParty.remove(player);
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
        SelectionSteps.remove(player);
        SelectionLifecycle.cancel(player, com.jvn.kingdomsheritage.api.SelectionEvent.Reason.RECOVERED);
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
        if (HeritageCatalog.guiScale() > 0) json.addProperty("gui_scale", HeritageCatalog.guiScale());
        JsonArray spawns = new JsonArray();
        for (var spawn : HeritageCatalog.spawns().values()) {
            JsonObject choice = new JsonObject();
            choice.addProperty("id", spawn.id().toString());
            choice.addProperty("title", spawn.title());
            choice.addProperty("subtitle", spawn.subtitle());
            choice.addProperty("outline", spawn.outline());
            choice.addProperty("description", spawn.description());
            choice.addProperty("image", spawn.image().toString());
            choice.addProperty("title_key", spawn.titleKey());
            choice.addProperty("subtitle_key", spawn.subtitleKey());
            choice.addProperty("description_key", spawn.descriptionKey());
            JsonArray allowed = new JsonArray();
            HeritageCatalog.kits().values().stream().filter(spawn::allows).forEach(kit -> allowed.add(kit.id().toString()));
            choice.add("kits", allowed);
            spawns.add(choice);
        }
        json.add("spawns", spawns);
        JsonArray kits = new JsonArray();
        for (var kit : HeritageCatalog.kits().values()) {
            JsonObject choice = new JsonObject();
            choice.addProperty("id", kit.id().toString());
            choice.addProperty("title", kit.title());
            choice.addProperty("description", kit.description());
            choice.addProperty("title_key", kit.titleKey());
            choice.addProperty("description_key", kit.descriptionKey());
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
                var decoded = kit.decode(player.registryAccess());
                if (inventoryPolicy(player) != HeritageConfig.InventoryPolicy.PRESERVE) EquipmentCompat.validate(player, decoded);
                choice.addProperty("problem", "");
            } catch (IllegalArgumentException failure) {
                choice.addProperty("problem", failure.getMessage());
                choice.addProperty("problem_component", Component.Serializer.toJson(
                        HeritageException.component(failure), player.registryAccess()));
            }
            kits.add(choice);
        }
        json.add("kits", kits);
        String payload = json.toString();
        if (payload.getBytes(StandardCharsets.UTF_8).length > 900000) {
            player.connection.disconnect(Component.translatable("error.kingdomsheritage.catalog_limit"));
            return;
        }
        PacketDistributor.sendToPlayer(player, new HeritageNetwork.Catalog(payload));
        SENT_REVISION.put(player.getUUID(), HeritageCatalog.revision());
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
        if (event.getEntity() instanceof ServerPlayer player) {
            SelectionParty.remove(player);
            SpawnIntro.release(player);
            SelectionSteps.remove(player);
            SelectionLifecycle.cancel(player, com.jvn.kingdomsheritage.api.SelectionEvent.Reason.DISCONNECTED);
        }
        cancelPreparation(event.getEntity().getUUID());
        LAST_REQUEST.remove(event.getEntity().getUUID());
        SENT_REVISION.remove(event.getEntity().getUUID());
    }

    @SubscribeEvent
    public static void respawn(PlayerEvent.PlayerRespawnEvent event) {
        if (event.getEntity() instanceof ServerPlayer player) SpawnIntro.release(player);
        if (event.getEntity() instanceof ServerPlayer player && pending(player)) {
            SelectionParty.leave(player);
            cancelPreparation(player.getUUID());
            hold(player);
            SENT_REVISION.remove(player.getUUID());
        }
    }

    @SubscribeEvent
    public static void stop(ServerStoppedEvent event) {
        PREPARATIONS.values().forEach(preparation -> preparation.search().close());
        REVIEWS.values().forEach(review -> review.preparation().search().close());
        PREPARATIONS.clear();
        REVIEWS.clear();
        SelectionParty.clear();
        SelectionLifecycle.clear();
        SelectionSteps.clear();
        com.jvn.kingdomsheritage.api.HeritageFlow.stopped();
        SpawnIntro.clear();
        SpawnResolver.clearCache();
        LAST_REQUEST.clear();
        SENT_REVISION.clear();
    }
}

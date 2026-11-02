package com.jvn.kingdomsheritage.server;

import com.google.gson.JsonObject;
import com.jvn.kingdomsheritage.api.DialogueContext;
import com.jvn.kingdomsheritage.api.HeritageDialogue;
import com.jvn.kingdomsheritage.data.HeritageCatalog;
import com.jvn.kingdomsheritage.data.IntroDefinition;
import com.jvn.kingdomsheritage.data.SpawnDefinition;
import com.jvn.kingdomsheritage.network.HeritageNetwork;
import java.util.Comparator;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.phys.Vec3;
import net.neoforged.neoforge.network.PacketDistributor;

public final class SpawnIntro {
    private record Hold(UUID token, Vec3 position, ResourceLocation dimension, float yaw, float pitch,
                        boolean noGravity, long deadline, int maximumDuration, boolean ready, boolean locked, boolean standalone) {}
    private static final String GRAVITY_KEY = "kingdomsheritage_intro_no_gravity";
    private static final Map<UUID, Hold> HOLDS = new HashMap<>();

    private SpawnIntro() {}

    static JsonObject prepare(SpawnDefinition spawn, SpawnResolver.Destination destination) {
        JsonObject message = new JsonObject();
        if (HeritageCatalog.guiScale() > 0) message.addProperty("gui_scale", HeritageCatalog.guiScale());
        JsonObject arrival = new JsonObject();
        arrival.addProperty("dimension", destination.level().dimension().location().toString());
        arrival.addProperty("x", destination.position().getX());
        arrival.addProperty("y", destination.position().getY());
        arrival.addProperty("z", destination.position().getZ());
        message.add("arrival", arrival);
        if (spawn.intro() == null) return message;
        message.add("intro", spawn.intro().json(destination.level().registryAccess()));
        message.addProperty("token", UUID.randomUUID().toString());
        message.add("locations", locations(spawn, destination));
        return message;
    }

    static JsonObject locations(SpawnDefinition spawn, SpawnResolver.Destination destination) {
        return locations(spawn, destination.level(), destination.position());
    }

    private static JsonObject locations(SpawnDefinition spawn, net.minecraft.server.level.ServerLevel level,
                                        net.minecraft.core.BlockPos position) {
        JsonObject locations = new JsonObject();
        level.getBiome(position).unwrapKey().ifPresent(key -> locations.addProperty("biome", key.location().toString()));
        locations.addProperty("dimension", level.dimension().location().toString());
        var registry = level.registryAccess().registryOrThrow(Registries.STRUCTURE);
        level.structureManager().startsForStructure(new ChunkPos(position), structure -> true).stream()
                .filter(start -> start.isValid() && start.getPieces().stream().anyMatch(piece ->
                        piece.getBoundingBox().isInside(position) || (piece.getBoundingBox().getYSpan() <= 2
                                && piece.getBoundingBox().isInside(position.below()))))
                .map(start -> registry.getKey(start.getStructure())).filter(java.util.Objects::nonNull)
                .sorted(Comparator.comparing((ResourceLocation id) -> spawn == null || !matchesStructure(spawn, id, registry))
                        .thenComparing(ResourceLocation::toString))
                .findFirst().ifPresent(id -> locations.addProperty("structure", id.toString()));
        return locations;
    }

    private static boolean matchesStructure(SpawnDefinition spawn, ResourceLocation id,
            net.minecraft.core.Registry<net.minecraft.world.level.levelgen.structure.Structure> registry) {
        if (spawn.kind() != SpawnDefinition.Kind.STRUCTURE) return false;
        if (!spawn.targetTag()) return id.equals(spawn.target());
        return registry.getHolder(net.minecraft.resources.ResourceKey.create(Registries.STRUCTURE, id))
                .map(holder -> holder.is(net.minecraft.tags.TagKey.create(Registries.STRUCTURE, spawn.target()))).orElse(false);
    }

    public static boolean play(ServerPlayer player, IntroDefinition intro, DialogueContext context) {
        requireServerThread(player);
        if (!player.isAlive() || !player.connection.isAcceptingMessages() || SelectionManager.pending(player) || playing(player)) return false;
        JsonObject definition = intro.json(player.registryAccess());
        IntroDefinition validated = IntroDefinition.parse(definition);
        var base = context.with("player", player.getName(), player.getGameProfile().getName());
        var dialogue = HeritageDialogue.context(player, SelectionLifecycle.snapshot(player), base);
        JsonObject message = new JsonObject();
        message.addProperty("cinematic", true);
        message.add("intro", definition);
        message.addProperty("token", UUID.randomUUID().toString());
        message.add("locations", locations(null, player.serverLevel(), player.blockPosition()));
        message.add("dialogue_context", dialogue.json());
        player.closeContainer();
        begin(player, validated, message);
        return true;
    }

    public static boolean playing(ServerPlayer player) {
        requireServerThread(player);
        return HOLDS.containsKey(player.getUUID());
    }

    public static boolean stop(ServerPlayer player) {
        requireServerThread(player);
        Hold hold = HOLDS.get(player.getUUID());
        if (hold == null || !hold.standalone) return false;
        release(player);
        PacketDistributor.sendToPlayer(player, new HeritageNetwork.Catalog("{\"cinematic\":true}"));
        return true;
    }

    private static void requireServerThread(ServerPlayer player) {
        if (!player.server.isSameThread()) throw new IllegalStateException("Cinematic playback must run on the server thread");
    }

    static void begin(ServerPlayer player, IntroDefinition intro, JsonObject message) {
        release(player);
        if (intro != null) {
            boolean locked = intro.control() == IntroDefinition.Control.AFTER_TITLE;
            HOLDS.put(player.getUUID(), new Hold(UUID.fromString(message.get("token").getAsString()),
                    player.position(), player.level().dimension().location(), player.getYRot(), player.getXRot(),
                    player.isNoGravity(), player.server.overworld().getGameTime() + intro.durationTicks() + 600,
                    intro.maximumDurationTicks(), false, locked, message.has("cinematic")));
            if (locked) {
                player.getPersistentData().putBoolean(GRAVITY_KEY, player.isNoGravity());
                player.setNoGravity(true);
                player.setDeltaMovement(Vec3.ZERO);
            }
        }
        PacketDistributor.sendToPlayer(player, new HeritageNetwork.Catalog(message.toString()));
    }

    public static void ready(ServerPlayer player, UUID token, int durationTicks) {
        var hold = HOLDS.get(player.getUUID());
        if (hold == null || hold.ready || !hold.token.equals(token) || durationTicks < 0 || durationTicks > hold.maximumDuration) return;
        HOLDS.put(player.getUUID(), new Hold(hold.token, hold.position, hold.dimension, hold.yaw, hold.pitch, hold.noGravity,
                player.server.overworld().getGameTime() + durationTicks + 600, hold.maximumDuration, true, hold.locked, hold.standalone));
    }

    public static boolean locked(Player player) {
        Hold hold = HOLDS.get(player.getUUID());
        return hold != null && hold.locked;
    }

    static void tick(ServerPlayer player) {
        Hold hold = HOLDS.get(player.getUUID());
        if (hold == null) return;
        if (!player.isAlive() || !hold.dimension.equals(player.level().dimension().location())
                || player.server.overworld().getGameTime() >= hold.deadline) {
            release(player);
            PacketDistributor.sendToPlayer(player, new HeritageNetwork.Catalog(hold.standalone ? "{\"cinematic\":true}" : "{}"));
            return;
        }
        if (!hold.locked) return;
        player.stopRiding();
        if (player.position().distanceToSqr(hold.position) > 0.0001) {
            player.teleportTo(player.serverLevel(), hold.position.x, hold.position.y, hold.position.z, hold.yaw, hold.pitch);
            // vanilla restores its saved connection position after player ticks
            player.connection.resetPosition();
        }
        player.setDeltaMovement(Vec3.ZERO);
        player.fallDistance = 0;
        player.clearFire();
        player.setAirSupply(player.getMaxAirSupply());
    }

    public static void finish(ServerPlayer player, UUID token) {
        Hold hold = HOLDS.get(player.getUUID());
        if (hold != null && hold.token.equals(token)) release(player);
    }

    static void release(ServerPlayer player) {
        Hold hold = HOLDS.remove(player.getUUID());
        if (player.getPersistentData().contains(GRAVITY_KEY)) {
            player.setNoGravity(player.getPersistentData().getBoolean(GRAVITY_KEY));
            player.getPersistentData().remove(GRAVITY_KEY);
        } else if (hold != null && hold.locked) {
            player.setNoGravity(hold.noGravity);
        }
        if (hold != null && hold.locked) {
            player.setDeltaMovement(Vec3.ZERO);
            player.fallDistance = 0;
        }
    }

    static void clear() { HOLDS.clear(); }
}

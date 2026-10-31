package com.jvn.kingdomsheritage.server;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.jvn.kingdomsheritage.data.HeritageCatalog;
import com.jvn.kingdomsheritage.data.SpawnDefinition;
import com.jvn.kingdomsheritage.network.HeritageNetwork;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import net.minecraft.server.level.ServerPlayer;
import net.neoforged.neoforge.network.PacketDistributor;

public final class SelectionParty {
    private record Invite(UUID sender, UUID recipient, long expires) {}
    private static final class Participant {
        final ServerPlayer player;
        int stage;
        long lastAction = -100;
        long lastCursor = -100;
        long lastStage = -100;
        HeritageNetwork.Cursor cursor;
        Participant(ServerPlayer player) { this.player = player; }
    }
    private static final class Party {
        final UUID leader;
        final Set<UUID> members = new LinkedHashSet<>();
        final Set<UUID> ready = new LinkedHashSet<>();
        long generation;
        String spawn = "";
        SpawnResolver.Search search;
        Party(UUID leader) { this.leader = leader; members.add(leader); }
    }
    private static final Map<UUID, Participant> PLAYERS = new LinkedHashMap<>();
    private static final Map<UUID, Party> PARTIES = new HashMap<>();
    private static final List<Invite> INVITES = new ArrayList<>();
    private static boolean dirty;
    private static long revision = -1;

    private SelectionParty() {}

    static void register(ServerPlayer player) {
        PLAYERS.computeIfAbsent(player.getUUID(), id -> new Participant(player));
        dirty = true;
    }

    static void stage(ServerPlayer player, int stage) {
        var participant = PLAYERS.get(player.getUUID());
        if (stage != 0 && (stage != 2 || SelectionManager.busy(player))) {
            if (INVITES.removeIf(invite -> invite.sender().equals(player.getUUID()) || invite.recipient().equals(player.getUUID()))) dirty = true;
        }
        if (participant != null && participant.stage != stage) {
            participant.stage = stage;
            participant.cursor = null;
            dirty = true;
        }
    }

    static boolean grouped(ServerPlayer player) { return PARTIES.containsKey(player.getUUID()); }

    static boolean allows(ServerPlayer player, String spawn) {
        var party = PARTIES.get(player.getUUID());
        return party == null || !party.spawn.isEmpty() && party.spawn.equals(spawn);
    }

    static SpawnResolver.Search search(ServerPlayer player, SpawnDefinition spawn) {
        var party = PARTIES.get(player.getUUID());
        if (party == null) return new SpawnResolver.Search(player, spawn, SelectionManager.defaultSpawn(player));
        if (party.search == null) {
            var leader = PLAYERS.get(party.leader).player;
            party.search = new SpawnResolver.Search(leader, spawn, SelectionManager.defaultSpawn(leader));
        }
        return party.search;
    }

    static void release(SpawnResolver.Search search) {
        if (PARTIES.values().stream().noneMatch(party -> party.search == search)) search.close();
    }

    static List<ServerPlayer> members(ServerPlayer player) {
        var party = PARTIES.get(player.getUUID());
        return party == null ? List.of(player) : party.members.stream().map(id -> PLAYERS.get(id).player).toList();
    }

    static JsonArray companions(ServerPlayer player) {
        var names = new JsonArray();
        for (var member : members(player)) if (member != player) names.add(member.getGameProfile().getName());
        return names;
    }

    static boolean ready(ServerPlayer player) {
        var party = PARTIES.get(player.getUUID());
        if (party == null) return true;
        party.ready.add(player.getUUID());
        stage(player, 4);
        return party.ready.size() == party.members.size();
    }

    static boolean allReady(ServerPlayer player) {
        var party = PARTIES.get(player.getUUID());
        return party != null && party.ready.size() == party.members.size();
    }

    static boolean isReady(ServerPlayer player) {
        var party = PARTIES.get(player.getUUID());
        return party != null && party.ready.contains(player.getUUID());
    }

    static void unready(ServerPlayer player) {
        var party = PARTIES.get(player.getUUID());
        if (party != null) party.ready.remove(player.getUUID());
    }

    static void refresh(ServerPlayer player) {
        var party = PARTIES.get(player.getUUID());
        var members = members(player);
        if (party != null) {
            party.generation++;
            party.ready.clear();
            for (var member : members) SelectionManager.cancelPreparation(member.getUUID());
            if (party.search != null) party.search.close();
            party.search = null;
        }
        for (var member : members) SelectionManager.refresh(member);
        dirty = true;
    }

    public static void action(ServerPlayer player, HeritageNetwork.PartyAction request) {
        var self = PLAYERS.get(player.getUUID());
        if (self == null || !player.isAlive() || !SelectionManager.pending(player)) return;
        int action = request.action();
        if (action == HeritageNetwork.PartyAction.LEAVE) {
            leave(player);
            return;
        }
        if (action == HeritageNetwork.PartyAction.STAGE) {
            long stageTick = player.server.overworld().getGameTime();
            if (stageTick - self.lastStage < 5) return;
            self.lastStage = stageTick;
            if (request.spawn().equals("loading") && !SelectionManager.busy(player)) stage(player, 2);
            else if (request.spawn().equals("kit") && !SelectionManager.busy(player)) stage(player, 1);
            else if (request.spawn().equals("spawn") && !SelectionManager.busy(player)) stage(player, 0);
            return;
        }
        long tick = player.server.overworld().getGameTime();
        if (action != HeritageNetwork.PartyAction.ACCEPT && action != HeritageNetwork.PartyAction.DECLINE) {
            if (tick - self.lastAction < 5) return;
            self.lastAction = tick;
        }
        if (request.revision() != HeritageCatalog.revision()) return;
        var party = PARTIES.get(player.getUUID());
        if (action == HeritageNetwork.PartyAction.SELECT || action == HeritageNetwork.PartyAction.SUGGEST) {
            var id = net.minecraft.resources.ResourceLocation.tryParse(request.spawn());
            if (id == null || !HeritageCatalog.spawns().containsKey(id) || SelectionManager.busy(player)) return;
            if (action == HeritageNetwork.PartyAction.SUGGEST) {
                if (party == null || party.leader.equals(player.getUUID()) || !party.spawn.isEmpty()) return;
                var message = new JsonObject();
                message.addProperty("suggestion", request.spawn());
                message.addProperty("sender", player.getGameProfile().getName());
                PacketDistributor.sendToPlayer(PLAYERS.get(party.leader).player, new HeritageNetwork.Catalog(message.toString()));
            } else if (party != null && party.leader.equals(player.getUUID())) {
                if (party.spawn.equals(request.spawn())) return;
                party.spawn = request.spawn();
                INVITES.removeIf(invite -> party.members.contains(invite.sender()));
                refresh(player);
            }
            return;
        }
        var target = PLAYERS.get(request.target());
        if (target == null || target == self || !target.player.isAlive() || !SelectionManager.pending(target.player)) return;
        long now = System.nanoTime();
        if (action == HeritageNetwork.PartyAction.INVITE) {
            if (self.stage != 0 || target.stage != 0 || SelectionManager.busy(player) || SelectionManager.busy(target.player)
                    || PARTIES.containsKey(request.target()) || party != null && (!party.leader.equals(player.getUUID())
                    || !party.spawn.isEmpty() || party.members.size() >= 8)) return;
            if (INVITES.stream().filter(invite -> invite.sender().equals(player.getUUID())).count() >= 7
                    || INVITES.stream().filter(invite -> invite.recipient().equals(request.target())).count() >= 16
                    || INVITES.stream().anyMatch(invite -> invite.sender().equals(player.getUUID()) && invite.recipient().equals(request.target()))) return;
            INVITES.add(new Invite(player.getUUID(), request.target(), now + 30_000_000_000L));
            dirty = true;
        } else {
            var invite = INVITES.stream().filter(value -> value.sender().equals(request.target())
                    && value.recipient().equals(player.getUUID()) && value.expires() > now).findFirst().orElse(null);
            if (invite == null) return;
            if (action == HeritageNetwork.PartyAction.DECLINE) {
                INVITES.remove(invite);
                dirty = true;
            } else if (action == HeritageNetwork.PartyAction.ACCEPT) {
                var destination = PARTIES.get(request.target());
                if (party != null || self.stage != 0 || target.stage != 0 || SelectionManager.busy(player)
                        || SelectionManager.busy(target.player) || destination != null && (!destination.leader.equals(request.target())
                        || !destination.spawn.isEmpty() || destination.members.size() >= 8)) return;
                if (destination == null) destination = new Party(request.target());
                destination.members.add(player.getUUID());
                for (var member : destination.members) PARTIES.put(member, destination);
                UUID inviter = destination.leader;
                boolean full = destination.members.size() == 8;
                INVITES.removeIf(value -> value.recipient().equals(player.getUUID()) || value.sender().equals(player.getUUID())
                        || full && value.sender().equals(inviter));
                refresh(player);
            }
        }
    }

    public static void cursor(ServerPlayer player, HeritageNetwork.Cursor cursor) {
        var self = PLAYERS.get(player.getUUID());
        if (self == null || self.stage != 0 || !player.isAlive() || !SelectionManager.pending(player)) return;
        int pages = (HeritageCatalog.spawns().size() + 9) / 10;
        if (cursor.page() < 0 || cursor.page() >= pages) return;
        long tick = player.server.overworld().getGameTime();
        if (tick - self.lastCursor < 2) return;
        self.lastCursor = tick;
        self.cursor = new HeritageNetwork.Cursor(player.getUUID(), cursor.x(), cursor.y(), cursor.page());
        for (var other : PLAYERS.values()) {
            if (other != self && other.stage == 0 && other.cursor != null && other.cursor.page() == cursor.page()) {
                PacketDistributor.sendToPlayer(other.player, self.cursor);
            }
        }
    }

    static void leave(ServerPlayer player) {
        var party = PARTIES.get(player.getUUID());
        if (party == null) return;
        var members = members(player);
        INVITES.removeIf(invite -> invite.sender().equals(party.leader));
        for (var member : members) SelectionManager.cancelPreparation(member.getUUID());
        if (party.search != null) party.search.close();
        party.search = null;
        party.ready.clear();
        party.generation++;
        PARTIES.remove(player.getUUID());
        party.members.remove(player.getUUID());
        if (party.leader.equals(player.getUUID()) || party.members.size() == 1) {
            for (var id : party.members) PARTIES.remove(id);
        }
        for (var member : members) SelectionManager.refresh(member);
        dirty = true;
    }

    static void finished(ServerPlayer player) {
        var party = PARTIES.get(player.getUUID());
        if (party == null) return;
        for (var member : party.members) PARTIES.remove(member);
        if (party.search != null) party.search.close();
        dirty = true;
    }

    static void remove(ServerPlayer player) {
        leave(player);
        PLAYERS.remove(player.getUUID());
        INVITES.removeIf(invite -> invite.sender().equals(player.getUUID()) || invite.recipient().equals(player.getUUID()));
        dirty = true;
    }

    static void tick() {
        long now = System.nanoTime();
        if (INVITES.removeIf(invite -> invite.expires() <= now)) dirty = true;
        if (revision != HeritageCatalog.revision()) {
            revision = HeritageCatalog.revision();
            INVITES.clear();
            for (var party : Set.copyOf(PARTIES.values())) {
                party.spawn = "";
                refresh(PLAYERS.get(party.leader).player);
            }
            dirty = true;
        }
        if (!dirty) return;
        dirty = false;
        var roster = new JsonArray();
        for (var participant : PLAYERS.values()) {
            var entry = new JsonObject();
            entry.addProperty("id", participant.player.getUUID().toString());
            entry.addProperty("name", participant.player.getGameProfile().getName());
            entry.addProperty("stage", participant.stage);
            entry.addProperty("available", participant.stage == 0 && !PARTIES.containsKey(participant.player.getUUID())
                    && !SelectionManager.busy(participant.player));
            roster.add(entry);
        }
        for (var participant : PLAYERS.values()) {
            var player = participant.player;
            var party = PARTIES.get(player.getUUID());
            var state = new JsonObject();
            state.add("players", roster);
            state.addProperty("generation", party == null ? -1 : party.generation);
            state.addProperty("leader", party == null ? "" : party.leader.toString());
            state.addProperty("spawn", party == null ? "" : party.spawn);
            var members = new JsonArray();
            if (party != null) for (var id : party.members) members.add(id.toString());
            state.add("members", members);
            var invites = new JsonArray();
            var outgoing = new JsonArray();
            for (var invite : INVITES) {
                if (invite.recipient().equals(player.getUUID())) {
                    var entry = new JsonObject();
                    entry.addProperty("sender", invite.sender().toString());
                    entry.addProperty("remaining", Math.max(0, (invite.expires() - now) / 1_000_000));
                    invites.add(entry);
                }
                if (invite.sender().equals(player.getUUID())) outgoing.add(invite.recipient().toString());
            }
            state.add("invites", invites);
            state.add("outgoing", outgoing);
            var message = new JsonObject();
            message.add("party", state);
            PacketDistributor.sendToPlayer(player, new HeritageNetwork.Catalog(message.toString()));
        }
    }

    static void clear() {
        for (var party : Set.copyOf(PARTIES.values())) if (party.search != null) party.search.close();
        PLAYERS.clear();
        PARTIES.clear();
        INVITES.clear();
        revision = -1;
        dirty = false;
    }
}

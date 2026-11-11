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
        long lastKit = -100;
        String kit = "";
        HeritageNetwork.Cursor cursor;
        final JsonArray feedback = new JsonArray();
        Participant(ServerPlayer player) { this.player = player; }
    }
    private static final class Party {
        final UUID leader;
        final Set<UUID> members = new LinkedHashSet<>();
        final Set<UUID> ready = new LinkedHashSet<>();
        final Map<UUID, String> suggestions = new LinkedHashMap<>();
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
            removeInvites(invite -> invite.sender().equals(player.getUUID()) || invite.recipient().equals(player.getUUID()));
        }
        if (participant != null && participant.stage != stage) {
            if (stage == 0) participant.kit = "";
            participant.stage = stage;
            participant.cursor = null;
            dirty = true;
        }
    }

    static UUID leader(ServerPlayer player) {
        var party = PARTIES.get(player.getUUID());
        return party == null ? null : party.leader;
    }

    static Set<UUID> memberIds(ServerPlayer player) {
        var party = PARTIES.get(player.getUUID());
        return party == null ? Set.of() : Set.copyOf(party.members);
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

    static void choices(ServerPlayer player, net.minecraft.resources.ResourceLocation spawn, net.minecraft.resources.ResourceLocation kit) {
        var participant = PLAYERS.get(player.getUUID());
        var party = PARTIES.get(player.getUUID());
        if (participant == null || party == null) return;
        String selected = spawn != null && party.spawn.equals(spawn.toString()) && kit != null ? kit.toString() : "";
        if (!participant.kit.equals(selected)) {
            participant.kit = selected;
            dirty = true;
        }
    }

    static void refresh(ServerPlayer player) {
        refresh(player, com.jvn.kingdomsheritage.api.ScreenStep.Placement.BEFORE_SPAWN);
    }

    static void refresh(ServerPlayer player, com.jvn.kingdomsheritage.api.ScreenStep.Placement from) {
        var party = PARTIES.get(player.getUUID());
        var members = members(player);
        if (party != null) {
            party.generation++;
            party.ready.clear();
            for (var member : members) {
                if (from.compareTo(com.jvn.kingdomsheritage.api.ScreenStep.Placement.BEFORE_KIT) <= 0) PLAYERS.get(member.getUUID()).kit = "";
                SelectionManager.cancelPreparation(member.getUUID());
            }
            if (party.search != null) party.search.close();
            party.search = null;
        }
        SelectionSteps.invalidate(members, from, null, false);
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
        if (action == HeritageNetwork.PartyAction.KIT) {
            long kitTick = player.server.overworld().getGameTime();
            var party = PARTIES.get(player.getUUID());
            if (party == null || party.spawn.isEmpty() || request.revision() != HeritageCatalog.revision()
                    || kitTick - self.lastKit < 2 || SelectionManager.busy(player)) return;
            self.lastKit = kitTick;
            var spawn = HeritageCatalog.spawns().get(net.minecraft.resources.ResourceLocation.tryParse(party.spawn));
            var id = net.minecraft.resources.ResourceLocation.tryParse(request.spawn());
            var kit = id == null ? null : HeritageCatalog.kits().get(id);
            if (!request.spawn().isEmpty() && (spawn == null || kit == null || !spawn.allows(kit))) return;
            if (!self.kit.equals(request.spawn())) {
                self.kit = request.spawn();
                dirty = true;
            }
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
                boolean added = suggest(party.suggestions, player.getUUID(), request.spawn());
                dirty = true;
                if (added) {
                    var message = new JsonObject();
                    message.addProperty("suggestion", request.spawn());
                    message.addProperty("sender", player.getGameProfile().getName());
                    PacketDistributor.sendToPlayer(PLAYERS.get(party.leader).player, new HeritageNetwork.Catalog(message.toString()));
                }
            } else if (party != null && party.leader.equals(player.getUUID())) {
                if (party.spawn.equals(request.spawn())) return;
                party.spawn = request.spawn();
                for (var suggestion : party.suggestions.entrySet()) {
                    if (!suggestion.getValue().equals(party.spawn)) continue;
                    feedback(player.getUUID(), suggestion.getKey(), "suggestion_followed");
                    feedback(suggestion.getKey(), player.getUUID(), "suggestion_selected");
                }
                party.suggestions.clear();
                removeInvites(invite -> party.members.contains(invite.sender()));
                for (var member : members(player)) SelectionLifecycle.choices(member, id, null);
                refresh(player, com.jvn.kingdomsheritage.api.ScreenStep.Placement.AFTER_SPAWN);
            }
            return;
        }
        var target = PLAYERS.get(request.target());
        if (target == null || target == self || !target.player.isAlive() || !SelectionManager.pending(target.player)) return;
        long now = System.nanoTime();
        if (action == HeritageNetwork.PartyAction.INVITE) {
            if (self.stage != 0 || target.stage != 0 || SelectionManager.busy(player) || SelectionManager.busy(target.player)
                    || PARTIES.containsKey(request.target()) || party != null && (!party.leader.equals(player.getUUID())
                    || !party.spawn.isEmpty() || party.members.size() >= HeritageNetwork.MAX_PARTY_SIZE)) return;
            if (INVITES.stream().filter(invite -> invite.sender().equals(player.getUUID())).count() >= 7
                    || INVITES.stream().filter(invite -> invite.recipient().equals(request.target())).count() >= 16
                    || INVITES.stream().anyMatch(invite -> invite.sender().equals(player.getUUID()) && invite.recipient().equals(request.target()))) return;
            INVITES.add(new Invite(player.getUUID(), request.target(), now + 30_000_000_000L));
            feedback(player.getUUID(), request.target(), "sent");
            dirty = true;
        } else {
            var invite = INVITES.stream().filter(value -> value.sender().equals(request.target())
                    && value.recipient().equals(player.getUUID()) && value.expires() > now).findFirst().orElse(null);
            if (invite == null) return;
            if (action == HeritageNetwork.PartyAction.DECLINE) {
                feedback(invite.sender(), invite.recipient(), "declined");
                INVITES.remove(invite);
                dirty = true;
            } else if (action == HeritageNetwork.PartyAction.ACCEPT) {
                var destination = PARTIES.get(request.target());
                if (party != null || self.stage != 0 || target.stage != 0 || SelectionManager.busy(player)
                        || SelectionManager.busy(target.player) || destination != null && (!destination.leader.equals(request.target())
                        || !destination.spawn.isEmpty() || destination.members.size() >= HeritageNetwork.MAX_PARTY_SIZE)) return;
                feedback(invite.sender(), invite.recipient(), "accepted");
                if (destination == null) destination = new Party(request.target());
                destination.members.add(player.getUUID());
                for (var member : destination.members) PARTIES.put(member, destination);
                UUID inviter = destination.leader;
                boolean full = destination.members.size() == HeritageNetwork.MAX_PARTY_SIZE;
                INVITES.remove(invite);
                removeInvites(value -> value.recipient().equals(player.getUUID()) || value.sender().equals(player.getUUID())
                        || full && value.sender().equals(inviter));
                refresh(player);
            }
        }
    }

    static boolean suggest(Map<UUID, String> suggestions, UUID player, String spawn) {
        if (spawn.equals(suggestions.remove(player))) return false;
        suggestions.put(player, spawn);
        return true;
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

    static void leave(ServerPlayer player) { leave(player, false); }

    private static void leave(ServerPlayer player, boolean disconnected) {
        var party = PARTIES.get(player.getUUID());
        if (party == null) return;
        var members = members(player);
        for (var notice : departureNotices(party.members, party.leader, player.getUUID(), disconnected).entrySet()) {
            var participant = PLAYERS.get(notice.getKey());
            if (participant == null) continue;
            var feedback = new JsonObject();
            feedback.addProperty("player", player.getUUID().toString());
            feedback.addProperty("name", player.getGameProfile().getName());
            feedback.addProperty("result", notice.getValue());
            participant.feedback.add(feedback);
        }
        removeInvites(invite -> invite.sender().equals(party.leader));
        for (var member : members) {
            PLAYERS.get(member.getUUID()).kit = "";
            SelectionManager.cancelPreparation(member.getUUID());
        }
        if (party.search != null) party.search.close();
        party.search = null;
        party.ready.clear();
        party.suggestions.remove(player.getUUID());
        party.generation++;
        PARTIES.remove(player.getUUID());
        party.members.remove(player.getUUID());
        if (party.leader.equals(player.getUUID()) || party.members.size() == 1) {
            for (var id : party.members) PARTIES.remove(id);
        }
        SelectionSteps.invalidate(members, com.jvn.kingdomsheritage.api.ScreenStep.Placement.BEFORE_SPAWN, null, false);
        for (var member : members) SelectionManager.refresh(member);
        dirty = true;
    }

    static Map<UUID, String> departureNotices(Set<UUID> members, UUID leader, UUID departing, boolean disconnected) {
        if (!members.contains(departing)) return Map.of();
        var notices = new LinkedHashMap<UUID, String>();
        boolean disbanded = members.size() <= 2;
        String result = (departing.equals(leader) ? "leader_" : "member_") + (disconnected ? "disconnected" : "left");
        if (!departing.equals(leader) && disbanded) result += "_disbanded";
        for (var member : members) {
            if (!member.equals(departing)) notices.put(member, result);
            else if (!disconnected) notices.put(member, "left_party");
        }
        return notices;
    }

    static void finished(ServerPlayer player) {
        var party = PARTIES.get(player.getUUID());
        if (party == null) return;
        for (var member : party.members) PARTIES.remove(member);
        if (party.search != null) party.search.close();
        dirty = true;
    }

    static void remove(ServerPlayer player) { remove(player, false); }

    static void disconnect(ServerPlayer player) { remove(player, true); }

    private static void remove(ServerPlayer player, boolean disconnected) {
        leave(player, disconnected);
        removeInvites(invite -> invite.sender().equals(player.getUUID()) || invite.recipient().equals(player.getUUID()));
        PLAYERS.remove(player.getUUID());
        dirty = true;
    }

    private static void removeInvites(java.util.function.Predicate<Invite> predicate) {
        if (INVITES.removeIf(invite -> {
            if (!predicate.test(invite)) return false;
            feedback(invite.sender(), invite.recipient(), "cancelled");
            return true;
        })) dirty = true;
    }

    private static void feedback(UUID sender, UUID recipient, String result) {
        var participant = PLAYERS.get(sender);
        var target = PLAYERS.get(recipient);
        if (participant == null || target == null) return;
        var entry = new JsonObject();
        entry.addProperty("player", recipient.toString());
        entry.addProperty("name", target.player.getGameProfile().getName());
        entry.addProperty("result", result);
        participant.feedback.add(entry);
        dirty = true;
    }

    static void tick() {
        long now = System.nanoTime();
        if (INVITES.removeIf(invite -> {
            if (invite.expires() > now) return false;
            feedback(invite.sender(), invite.recipient(), "expired");
            return true;
        })) dirty = true;
        if (revision != HeritageCatalog.revision()) {
            revision = HeritageCatalog.revision();
            INVITES.clear();
            for (var party : Set.copyOf(PARTIES.values())) {
                party.spawn = "";
                party.suggestions.values().removeIf(id -> !HeritageCatalog.spawns().containsKey(net.minecraft.resources.ResourceLocation.parse(id)));
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
            SelectionLifecycle.party(player);
            var party = PARTIES.get(player.getUUID());
            var state = new JsonObject();
            state.add("players", roster);
            state.addProperty("generation", party == null ? -1 : party.generation);
            state.addProperty("leader", party == null ? "" : party.leader.toString());
            state.addProperty("spawn", party == null ? "" : party.spawn);
            var members = new JsonArray();
            if (party != null) for (var id : party.members) members.add(id.toString());
            state.add("members", members);
            var choices = new JsonArray();
            if (party != null) for (var id : party.members) {
                var member = PLAYERS.get(id);
                var kitId = net.minecraft.resources.ResourceLocation.tryParse(member.kit);
                var kit = kitId == null ? null : HeritageCatalog.kits().get(kitId);
                var choice = new JsonObject();
                choice.addProperty("id", id.toString());
                choice.addProperty("kit", kit == null ? "" : kit.id().toString());
                if (kit != null) {
                    choice.addProperty("title", kit.title());
                    choice.addProperty("title_key", kit.titleKey());
                }
                choices.add(choice);
            }
            state.add("choices", choices);
            var suggestions = new JsonArray();
            if (party != null) for (var vote : party.suggestions.entrySet()) {
                var suggestion = new JsonObject();
                suggestion.addProperty("player", vote.getKey().toString());
                suggestion.addProperty("spawn", vote.getValue());
                suggestions.add(suggestion);
            }
            state.add("suggestions", suggestions);
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
            state.add("feedback", participant.feedback.deepCopy());
            participant.feedback.asList().clear();
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

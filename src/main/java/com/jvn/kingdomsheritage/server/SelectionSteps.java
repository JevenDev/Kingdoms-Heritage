package com.jvn.kingdomsheritage.server;

import com.google.gson.JsonObject;
import com.google.gson.JsonParseException;
import com.google.gson.JsonParser;
import com.jvn.kingdomsheritage.api.HeritageFlow;
import com.jvn.kingdomsheritage.api.ScreenStep;
import com.jvn.kingdomsheritage.data.HeritageCatalog;
import com.jvn.kingdomsheritage.network.HeritageNetwork;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.neoforged.neoforge.network.PacketDistributor;

public final class SelectionSteps {
    private record Scope(ResourceLocation step, UUID owner, long revision, String spawn, String kit) {}
    private static final class Progress {
        final Map<UUID, JsonObject> values = new HashMap<>();
        final Set<UUID> ready = new HashSet<>();
        long version;
    }
    private static final class Session {
        final UUID selection;
        UUID token = UUID.randomUUID();
        Scope entered;
        long revision = HeritageCatalog.revision();
        String spawn = "", kit = "";
        ScreenStep.Placement resetFrom;
        long bucket;
        int packets;
        Session(UUID selection) { this.selection = selection; }
    }
    private static final Map<UUID, Session> SESSIONS = new HashMap<>();
    private static final Map<Scope, Progress> PROGRESS = new HashMap<>();
    private static final Map<UUID, Map<ResourceLocation, JsonObject>> COMPLETED = new HashMap<>();

    private SelectionSteps() {}

    private static Session session(ServerPlayer player) {
        UUID selection = SelectionLifecycle.state(player).sessionId();
        var previous = SESSIONS.get(player.getUUID());
        if (previous == null || !previous.selection.equals(selection)) {
            PROGRESS.keySet().removeIf(key -> key.owner().equals(player.getUUID()));
            previous = new Session(selection);
            SESSIONS.put(player.getUUID(), previous);
            COMPLETED.remove(player.getUUID());
        }
        return previous;
    }

    static JsonObject manifest(ServerPlayer player) {
        var result = HeritageFlow.manifest();
        var state = session(player);
        if (state.revision != HeritageCatalog.revision()) {
            state.revision = HeritageCatalog.revision();
            state.token = UUID.randomUUID();
            state.entered = null;
            state.resetFrom = ScreenStep.Placement.BEFORE_SPAWN;
            PROGRESS.keySet().removeIf(key -> key.owner().equals(player.getUUID()));
        }
        result.addProperty("token", state.token.toString());
        if (state.resetFrom != null) result.addProperty("reset_from", state.resetFrom.name());
        return result;
    }

    private static List<ServerPlayer> members(ServerPlayer player) {
        return SelectionParty.members(player).stream().filter(member -> !SelectionDebug.isBot(member)).toList();
    }
    private static UUID leader(ServerPlayer player) {
        UUID leader = SelectionParty.leader(player);
        if (leader == null) return player.getUUID();
        return SelectionDebug.isBot(leader) ? members(player).getFirst().getUUID() : leader;
    }
    private static ScreenStep step(ResourceLocation id) {
        return HeritageFlow.steps().stream().filter(value -> value.id().equals(id)).findFirst().orElseThrow(() ->
                new IllegalArgumentException("This Heritage screen is unavailable: " + id));
    }

    private static Scope scope(ServerPlayer player, ScreenStep step, String spawn, String kit) {
        boolean grouped = step.partyPolicy() != ScreenStep.PartyPolicy.PER_PLAYER;
        return new Scope(step.id(), grouped ? leader(player) : player.getUUID(), HeritageCatalog.revision(),
                step.placement() == ScreenStep.Placement.BEFORE_SPAWN ? "" : spawn,
                grouped || step.placement() != ScreenStep.Placement.AFTER_KIT ? "" : kit);
    }

    private static boolean complete(ServerPlayer player, ScreenStep step, Progress state) {
        if (state == null) return false;
        if (step.partyPolicy().leaderDecides() && !state.values.containsKey(leader(player))) return false;
        if (step.partyPolicy().everyoneConfirms()) return members(player).stream().allMatch(member -> state.ready.contains(member.getUUID()));
        return step.partyPolicy().leaderDecides() || state.ready.contains(player.getUUID());
    }

    private static void validateChoices(String spawn, String kit) {
        var spawnId = ResourceLocation.tryParse(spawn);
        var definition = spawnId == null ? null : HeritageCatalog.spawns().get(spawnId);
        if (!spawn.isEmpty() && definition == null) throw new IllegalArgumentException("The chosen homeland is unavailable");
        var kitId = ResourceLocation.tryParse(kit);
        var equipment = kitId == null ? null : HeritageCatalog.kits().get(kitId);
        if (!kit.isEmpty() && (definition == null || equipment == null || !definition.allows(equipment))) {
            throw new IllegalArgumentException("The chosen kit is unavailable for this homeland");
        }
    }

    private static void prerequisites(ServerPlayer player, ScreenStep target, String spawn, String kit) {
        for (var previous : HeritageFlow.steps()) {
            if (previous.id().equals(target.id())) return;
            if (!previous.optional() && !complete(player, previous, PROGRESS.get(scope(player, previous, spawn, kit)))) {
                throw new IllegalArgumentException("Complete the required Heritage screen first: " + previous.id());
            }
        }
    }

    public static void action(ServerPlayer player, HeritageNetwork.FlowAction request) {
        if (!player.isAlive() || !SelectionManager.pending(player)) return;
        var session = session(player);
        if (!request.session().equals(session.selection) || !request.token().equals(session.token)
                || request.revision() != HeritageCatalog.revision()) return;
        long bucket = player.server.overworld().getGameTime() / 20;
        if (session.bucket != bucket) { session.bucket = bucket; session.packets = 0; }
        if (++session.packets > 30) {
            if (request.action() == HeritageNetwork.FlowAction.ENTER || request.action() == HeritageNetwork.FlowAction.SUBMIT
                    || request.action() == HeritageNetwork.FlowAction.SKIP) sendError(player, request.step(), "Too many selection updates. Please try again");
            return;
        }
        try {
            validateChoices(request.spawn(), request.kit());
            if (request.action() == HeritageNetwork.FlowAction.NAVIGATE) {
                if (Objects.equals(session.spawn, request.spawn()) && Objects.equals(session.kit, request.kit())) return;
                var from = session.spawn.equals(request.spawn()) ? ScreenStep.Placement.AFTER_KIT : ScreenStep.Placement.AFTER_SPAWN;
                session.spawn = request.spawn();
                session.kit = request.kit();
                SelectionLifecycle.choices(player, ResourceLocation.tryParse(session.spawn), ResourceLocation.tryParse(session.kit));
                boolean shared = HeritageFlow.steps().stream().anyMatch(step -> step.placement().compareTo(from) >= 0
                        && step.partyPolicy() != ScreenStep.PartyPolicy.PER_PLAYER);
                invalidate(shared ? members(player) : List.of(player), from, player.getUUID(), true);
                return;
            }
            var step = step(request.step());
            if (step.placement() != ScreenStep.Placement.BEFORE_SPAWN
                    && (request.spawn().isEmpty() || !SelectionParty.allows(player, request.spawn()))) {
                throw new IllegalArgumentException("Confirm the current party homeland before opening this screen");
            }
            if (step.placement() == ScreenStep.Placement.AFTER_KIT && request.kit().isEmpty()) {
                throw new IllegalArgumentException("Confirm a kit before opening this screen");
            }
            var scope = scope(player, step, request.spawn(), request.kit());
            if (request.action() == HeritageNetwork.FlowAction.BACK) {
                boolean shared = HeritageFlow.steps().stream().anyMatch(value -> value.placement().compareTo(step.placement()) >= 0
                        && value.partyPolicy() != ScreenStep.PartyPolicy.PER_PLAYER);
                invalidate(shared ? members(player) : List.of(player), step.placement(), player.getUUID(), true, step.id());
                return;
            }
            if (request.action() == HeritageNetwork.FlowAction.ENTER) {
                boolean spawnChanged = step.placement() != ScreenStep.Placement.BEFORE_SPAWN && !session.spawn.equals(request.spawn());
                boolean kitChanged = step.placement() == ScreenStep.Placement.AFTER_KIT && !session.kit.equals(request.kit());
                if (spawnChanged || kitChanged) {
                    var from = spawnChanged ? ScreenStep.Placement.AFTER_SPAWN : ScreenStep.Placement.AFTER_KIT;
                    session.spawn = request.spawn();
                    session.kit = step.placement() == ScreenStep.Placement.AFTER_KIT ? request.kit() : spawnChanged ? "" : session.kit;
                    SelectionLifecycle.choices(player, ResourceLocation.tryParse(session.spawn), ResourceLocation.tryParse(session.kit));
                    boolean shared = HeritageFlow.steps().stream().anyMatch(value -> value.placement().compareTo(from) >= 0
                            && value.partyPolicy() != ScreenStep.PartyPolicy.PER_PLAYER);
                    invalidate(shared ? members(player) : List.of(player), from, player.getUUID(), true);
                    return;
                }
            }
            prerequisites(player, step, request.spawn(), request.kit());
            var progress = PROGRESS.computeIfAbsent(scope, ignored -> new Progress());
            if (request.action() == HeritageNetwork.FlowAction.ENTER) {
                session.entered = scope;
                send(player, step, progress);
                return;
            }
            if (!scope.equals(session.entered)) throw new IllegalArgumentException("Reopen the Heritage screen before submitting");
            if (request.action() == HeritageNetwork.FlowAction.SKIP) {
                if (!step.optional()) throw new IllegalArgumentException("A required Heritage screen cannot be skipped");
                if (step.partyPolicy().leaderDecides() && !leader(player).equals(player.getUUID())) {
                    throw new IllegalArgumentException("Only the party leader can skip this screen");
                }
                progress.values.put(player.getUUID(), new JsonObject());
                if (step.partyPolicy().leaderDecides()) members(player).forEach(member -> progress.ready.add(member.getUUID()));
                else progress.ready.add(player.getUUID());
            } else if (request.action() == HeritageNetwork.FlowAction.SUBMIT) {
                if (request.version() != progress.version) throw new IllegalArgumentException("The shared decision changed. Please confirm the latest version");
                JsonObject value = parse(request.value());
                boolean decides = !step.partyPolicy().leaderDecides() || leader(player).equals(player.getUUID());
                if (!decides && (!progress.values.containsKey(leader(player)) || !progress.values.get(leader(player)).equals(value))) {
                    throw new IllegalArgumentException("Only the party leader can change this decision");
                }
                var selection = SelectionLifecycle.state(player).choices(HeritageCatalog.revision(),
                        ResourceLocation.tryParse(request.spawn()), ResourceLocation.tryParse(request.kit()));
                JsonObject accepted = HeritageFlow.validate(step.id(), player, selection, value);
                if (complete(player, step, progress) && !accepted.equals(progress.values.get(
                        step.partyPolicy().leaderDecides() ? leader(player) : player.getUUID()))) {
                    throw new IllegalArgumentException("Go back before changing a completed Heritage decision");
                }
                if (!decides && !accepted.equals(progress.values.get(leader(player)))) throw new IllegalArgumentException("This shared choice is not valid for this player");
                if (step.partyPolicy().leaderDecides() && decides && !accepted.equals(progress.values.get(player.getUUID()))) {
                    progress.values.clear();
                    progress.ready.clear();
                    progress.version++;
                }
                progress.values.put(player.getUUID(), accepted);
                progress.ready.add(player.getUUID());
            } else throw new IllegalArgumentException("Unknown Heritage flow action");
            for (var member : members(player)) {
                var recipient = SESSIONS.get(member.getUUID());
                if (recipient != null && scope.equals(recipient.entered)) send(member, step, progress);
            }
        } catch (IllegalArgumentException error) {
            sendError(player, request.step(), error.getMessage() == null ? "Invalid Heritage decision" : error.getMessage());
        }
    }

    private static JsonObject parse(String value) {
        try {
            var parsed = JsonParser.parseString(value);
            if (!parsed.isJsonObject()) throw new IllegalArgumentException("A Heritage decision must be a JSON object");
            return parsed.getAsJsonObject();
        } catch (JsonParseException error) {
            throw new IllegalArgumentException("Invalid Heritage decision JSON", error);
        }
    }

    private static void sendError(ServerPlayer player, ResourceLocation step, String error) {
        var state = new JsonObject();
        state.addProperty("id", step.toString());
        state.addProperty("token", session(player).token.toString());
        state.addProperty("session", session(player).selection.toString());
        state.addProperty("error", error);
        var message = new JsonObject();
        message.add("flow_update", state);
        PacketDistributor.sendToPlayer(player, new HeritageNetwork.Catalog(message.toString()));
    }

    private static void send(ServerPlayer player, ScreenStep step, Progress progress) {
        var result = new JsonObject();
        result.addProperty("id", step.id().toString());
        result.addProperty("token", session(player).token.toString());
        result.addProperty("session", session(player).selection.toString());
        result.addProperty("version", progress.version);
        boolean decides = !step.partyPolicy().leaderDecides() || leader(player).equals(player.getUUID());
        UUID owner = step.partyPolicy().leaderDecides() ? leader(player) : player.getUUID();
        JsonObject value = progress.values.get(owner);
        result.add("value", value == null ? new JsonObject() : value.deepCopy());
        result.addProperty("decided", value != null);
        result.addProperty("can_decide", decides);
        result.addProperty("ready", progress.ready.contains(player.getUUID()));
        result.addProperty("ready_count", members(player).stream().filter(member -> progress.ready.contains(member.getUUID())).count());
        result.addProperty("members", members(player).size());
        result.addProperty("complete", complete(player, step, progress));
        result.addProperty("error", "");
        var message = new JsonObject();
        message.add("flow_update", result);
        PacketDistributor.sendToPlayer(player, new HeritageNetwork.Catalog(message.toString()));
    }

    static void requireComplete(ServerPlayer player, String spawn, String kit) {
        for (var step : HeritageFlow.steps()) {
            if (!step.optional() && !complete(player, step, PROGRESS.get(scope(player, step, spawn, kit)))) {
                throw new IllegalArgumentException("Complete the required Heritage screen before final review: " + step.id());
            }
        }
    }

    static Map<ResourceLocation, JsonObject> decisions(ServerPlayer player, String spawn, String kit) {
        var decisions = new LinkedHashMap<ResourceLocation, JsonObject>();
        for (var step : HeritageFlow.steps()) {
            var progress = PROGRESS.get(scope(player, step, spawn, kit));
            UUID owner = step.partyPolicy().leaderDecides() ? leader(player) : player.getUUID();
            if (complete(player, step, progress) && progress.values.containsKey(owner)) decisions.put(step.id(), progress.values.get(owner).deepCopy());
        }
        return Map.copyOf(decisions);
    }

    static void complete(ServerPlayer player, Map<ResourceLocation, JsonObject> decisions) {
        COMPLETED.put(player.getUUID(), decisions);
    }

    public static java.util.Optional<JsonObject> decision(ServerPlayer player, ResourceLocation id) {
        var complete = COMPLETED.get(player.getUUID());
        if (complete != null) return java.util.Optional.ofNullable(complete.get(id)).map(JsonObject::deepCopy);
        var session = SESSIONS.get(player.getUUID());
        if (session == null) return java.util.Optional.empty();
        var step = step(id);
        var progress = PROGRESS.get(scope(player, step, session.spawn, session.kit));
        return progress == null ? java.util.Optional.empty() : java.util.Optional.ofNullable(
                progress.values.get(step.partyPolicy().leaderDecides() ? leader(player) : player.getUUID())).map(JsonObject::deepCopy);
    }

    static void invalidate(List<ServerPlayer> players, ScreenStep.Placement from, UUID source, boolean notify) {
        invalidate(players, from, source, notify, null);
    }

    private static void invalidate(List<ServerPlayer> players, ScreenStep.Placement from, UUID source, boolean notify, ResourceLocation first) {
        int cutoff = first == null ? -1 : java.util.stream.IntStream.range(0, HeritageFlow.steps().size())
                .filter(index -> HeritageFlow.steps().get(index).id().equals(first)).findFirst().orElseThrow();
        Set<UUID> owners = new HashSet<>();
        for (var player : players) {
            if (SelectionDebug.isBot(player)) continue;
            owners.add(player.getUUID());
            owners.add(leader(player));
        }
        PROGRESS.keySet().removeIf(key -> owners.contains(key.owner()) && (first == null
                ? step(key.step()).placement().compareTo(from) >= 0 : HeritageFlow.steps().indexOf(step(key.step())) >= cutoff));
        for (var player : players) {
            if (SelectionDebug.isBot(player)) continue;
            var state = session(player);
            state.token = UUID.randomUUID();
            state.entered = null;
            state.resetFrom = from;
            COMPLETED.remove(player.getUUID());
            SelectionManager.cancelPreparation(player.getUUID());
            SelectionParty.unready(player);
            if (notify) {
                var reset = new JsonObject();
                reset.addProperty("token", state.token.toString());
                reset.addProperty("session", state.selection.toString());
                reset.addProperty("from", from.name());
                reset.addProperty("source", source == null ? "" : source.toString());
                reset.addProperty("request_step", first == null ? "" : first.toString());
                var message = new JsonObject();
                message.add("flow_reset", reset);
                PacketDistributor.sendToPlayer(player, new HeritageNetwork.Catalog(message.toString()));
            }
        }
    }

    static void remove(ServerPlayer player) {
        SESSIONS.remove(player.getUUID());
        COMPLETED.remove(player.getUUID());
        PROGRESS.keySet().removeIf(key -> key.owner().equals(player.getUUID()));
    }

    static void clear() { SESSIONS.clear(); PROGRESS.clear(); COMPLETED.clear(); }
}

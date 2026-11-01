package com.jvn.kingdomsheritage.client;

import com.google.gson.JsonObject;
import com.jvn.kingdomsheritage.api.ScreenStep;
import com.jvn.kingdomsheritage.network.HeritageNetwork;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import net.minecraft.client.Minecraft;
import net.minecraft.resources.ResourceLocation;
import net.neoforged.neoforge.network.PacketDistributor;

final class ClientSteps {
    private static final Map<ResourceLocation, ScreenStep> STEPS = new LinkedHashMap<>();
    private static Set<ResourceLocation> disabled = Set.of();
    private static UUID session;
    private static UUID token;
    private static String selectedSpawn = "", selectedKit = "";
    private static Entry entry;
    private static ResourceLocation invalidating;
    private static long invalidatedAt;

    private static final class Entry {
        final HeritageScreens.Context context;
        boolean entered, sentEnter, sentSubmit, skip, decided, ready, complete;
        boolean canDecide = true;
        int readyCount, members = 1;
        long version;
        long enteredAt;
        String error = "";
        JsonObject value = new JsonObject();
        JsonObject submitting;
        Entry(HeritageScreens.Context context) { this.context = context; }
    }

    private ClientSteps() {}

    static ScreenStep.Placement catalog(JsonObject catalog) {
        if (!catalog.has("flow")) { clear(); return null; }
        var flow = catalog.getAsJsonObject("flow");
        UUID nextSession = UUID.fromString(catalog.get("session").getAsString());
        UUID nextToken = UUID.fromString(flow.get("token").getAsString());
        boolean changed = token != null && !token.equals(nextToken) && nextSession.equals(session);
        if (session == null || !session.equals(nextSession)) {
            selectedSpawn = selectedKit = "";
            entry = null;
            invalidating = null;
        }
        if (changed) { entry = null; invalidating = null; }
        session = nextSession;
        token = nextToken;
        STEPS.clear();
        for (var value : flow.getAsJsonArray("steps")) {
            var step = value.getAsJsonObject();
            var definition = new ScreenStep(ResourceLocation.parse(step.get("id").getAsString()),
                    ScreenStep.Placement.valueOf(step.get("placement").getAsString()), step.get("order").getAsInt(),
                    step.get("optional").getAsBoolean(), ScreenStep.PartyPolicy.valueOf(step.get("party_policy").getAsString()),
                    ids(step, "before"), ids(step, "after"));
            STEPS.put(definition.id(), definition);
        }
        disabled = ids(flow, "disabled");
        return changed && flow.has("reset_from") ? ScreenStep.Placement.valueOf(flow.get("reset_from").getAsString()) : null;
    }

    private static Set<ResourceLocation> ids(JsonObject data, String key) {
        return data.getAsJsonArray(key).asList().stream().map(value -> ResourceLocation.parse(value.getAsString()))
                .collect(java.util.stream.Collectors.toUnmodifiableSet());
    }

    static List<ScreenStep> definitions() { return List.copyOf(STEPS.values()); }
    static boolean disabled(ResourceLocation id) { return disabled.contains(id); }
    static boolean managed(ResourceLocation id) { return STEPS.containsKey(id); }
    static ScreenStep definition(ResourceLocation id) { return STEPS.get(id); }

    static void activate(HeritageScreens.Context context) {
        if (!managed(context.id())) return;
        if (entry == null || entry.context != context) entry = new Entry(context);
        pump();
    }

    static void pump() {
        if (token == null) return;
        long now = net.minecraft.Util.getMillis();
        if (invalidating != null) {
            if (now - invalidatedAt >= 1000) sendInvalidation();
            return;
        }
        if (entry == null || !entry.context.active() || !entry.error.isEmpty()) return;
        if (entry.sentEnter && !entry.entered && now - entry.enteredAt >= 1000) entry.sentEnter = false;
        if (!entry.sentEnter) {
            entry.sentEnter = true;
            entry.enteredAt = now;
            send(entry.context, entry.context.id(), HeritageNetwork.FlowAction.ENTER, new JsonObject(), 0);
        } else if (entry.entered && !entry.sentSubmit && (entry.submitting != null || entry.skip)) {
            entry.sentSubmit = true;
            send(entry.context, entry.context.id(), entry.skip ? HeritageNetwork.FlowAction.SKIP : HeritageNetwork.FlowAction.SUBMIT,
                    entry.submitting == null ? new JsonObject() : entry.submitting, entry.version);
        }
    }

    static void receive(JsonObject update) {
        if (entry == null || !entry.context.active() || !matches(update)
                || !entry.context.id().toString().equals(update.get("id").getAsString())) return;
        entry.error = update.get("error").getAsString();
        if (!entry.error.isEmpty()) {
            entry.submitting = null;
            entry.sentSubmit = false;
            entry.skip = false;
            return;
        }
        entry.entered = true;
        entry.version = update.get("version").getAsLong();
        entry.value = update.getAsJsonObject("value").deepCopy();
        entry.decided = update.get("decided").getAsBoolean();
        entry.canDecide = update.get("can_decide").getAsBoolean();
        entry.ready = update.get("ready").getAsBoolean();
        entry.complete = update.get("complete").getAsBoolean();
        entry.readyCount = update.get("ready_count").getAsInt();
        entry.members = update.get("members").getAsInt();
        if (entry.ready) { entry.submitting = null; entry.skip = false; entry.sentSubmit = false; }
        pump();
    }

    private static boolean matches(JsonObject data) {
        return token != null && token.toString().equals(data.get("token").getAsString())
                && session.toString().equals(data.get("session").getAsString());
    }

    static void reset(JsonObject reset) {
        if (session == null || !session.toString().equals(reset.get("session").getAsString())) return;
        token = UUID.fromString(reset.get("token").getAsString());
        entry = null;
        String source = reset.get("source").getAsString();
        if (!Minecraft.getInstance().player.getUUID().toString().equals(source)) {
            invalidating = null;
            ClientSelection.resetExtensions(ScreenStep.Placement.valueOf(reset.get("from").getAsString()));
        } else if (invalidating != null) {
            if (reset.has("request_step") && reset.get("request_step").getAsString().equals(invalidating.toString())) invalidating = null;
            else sendInvalidation();
        }
    }

    static HeritageScreens.StepStatus status(HeritageScreens.Context context) {
        boolean managed = managed(context.id());
        if (!managed || entry == null || entry.context != context) {
            return new HeritageScreens.StepStatus(managed, !managed, false, false, false, 0, 1, Optional.empty());
        }
        return new HeritageScreens.StepStatus(true, entry.canDecide, entry.decided, entry.ready, entry.complete,
                entry.readyCount, entry.members, entry.error.isEmpty() ? Optional.empty() : Optional.of(entry.error));
    }

    static boolean waiting(HeritageScreens.Context context) {
        if (!managed(context.id())) return false;
        return entry == null || entry.context != context || !entry.entered || entry.complete || !entry.error.isEmpty()
                || !entry.canDecide && !entry.decided || entry.ready || entry.sentSubmit;
    }

    static JsonObject value(HeritageScreens.Context context) {
        return entry == null || entry.context != context ? new JsonObject() : entry.value.deepCopy();
    }

    static void submit(HeritageScreens.Context context, JsonObject value, boolean skip) {
        activate(context);
        if (entry == null || entry.context != context || entry.ready || entry.complete || entry.sentSubmit) return;
        entry.submitting = !entry.canDecide && entry.decided ? entry.value.deepCopy() : value.deepCopy();
        entry.skip = skip;
        pump();
    }

    private static void send(HeritageScreens.Context context, ResourceLocation id, int action, JsonObject value, long version) {
        PacketDistributor.sendToServer(new HeritageNetwork.FlowAction(session, token, ClientSelection.revision(), id, action,
                context.spawnId().map(ResourceLocation::toString).orElse(""),
                context.kitId().map(ResourceLocation::toString).orElse(""), value.toString(), version));
    }

    static void back(HeritageScreens.Context context, ResourceLocation target) {
        if (token != null && managed(target)) {
            invalidating = target;
            sendInvalidation();
        }
        entry = null;
    }

    static void invalidate(ScreenStep.Placement from) {
        if (token == null) return;
        var first = STEPS.values().stream().filter(step -> step.placement().compareTo(from) >= 0).findFirst();
        if (first.isPresent()) {
            invalidating = first.get().id();
            sendInvalidation();
            entry = null;
        }
    }

    private static void sendInvalidation() {
        invalidatedAt = net.minecraft.Util.getMillis();
        var state = ClientSelectionEvents.state();
        PacketDistributor.sendToServer(new HeritageNetwork.FlowAction(session, token, ClientSelection.revision(), invalidating,
                HeritageNetwork.FlowAction.BACK, state.spawnId().map(ResourceLocation::toString).orElse(""),
                state.kitId().map(ResourceLocation::toString).orElse(""), "{}", 0));
    }

    static void navigate(String spawn, String kit) {
        spawn = spawn == null ? "" : spawn;
        kit = kit == null ? "" : kit;
        if (token == null || STEPS.isEmpty() || selectedSpawn.equals(spawn) && selectedKit.equals(kit)) return;
        selectedSpawn = spawn;
        selectedKit = kit;
        PacketDistributor.sendToServer(new HeritageNetwork.FlowAction(session, token, ClientSelection.revision(),
                ResourceLocation.fromNamespaceAndPath("kingdomsheritage", "navigation"), HeritageNetwork.FlowAction.NAVIGATE,
                spawn, kit, "{}", 0));
    }

    static void leave() { entry = null; }
    static void clear() { STEPS.clear(); disabled = Set.of(); session = token = null; entry = null; invalidating = null; selectedSpawn = selectedKit = ""; }
}

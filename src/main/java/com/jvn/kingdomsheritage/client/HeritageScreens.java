package com.jvn.kingdomsheritage.client;

import com.google.gson.JsonObject;
import com.jvn.kingdomsheritage.api.HeritageFlow;
import com.jvn.kingdomsheritage.api.ScreenStep;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.resources.ResourceLocation;

public final class HeritageScreens {
    public enum Placement { BEFORE_SPAWN, AFTER_SPAWN, BEFORE_KIT, AFTER_KIT }

    private record Registration(ResourceLocation id, Placement placement, int order, Function<Context, Screen> factory) {}
    private static final Map<ResourceLocation, Registration> REGISTRATIONS = new LinkedHashMap<>();
    private static List<Registration> session = List.of();
    private static List<Registration> steps = List.of();
    private static final List<Integer> visited = new ArrayList<>();
    private record DraftKey(ResourceLocation id, String spawn, String kit) {}
    private static final Map<DraftKey, JsonObject> drafts = new HashMap<>();
    private static int index;
    private static Screen screen;
    private static Screen waiting;
    private static boolean factoryAttempted;
    private static boolean skipped;
    private static String waitingProblem;
    private static Context context;
    private static String spawn;
    private static String kit;
    private static Runnable continuation;
    private static boolean completionRequested;
    private static boolean backRequested;

    public record StepStatus(boolean managed, boolean canDecide, boolean decided, boolean ready, boolean complete,
                             int readyCount, int members, Optional<String> error) {}

    private HeritageScreens() {}

    public static void register(ResourceLocation id, Function<Context, Screen> factory) {
        var step = HeritageFlow.definition(id).orElseThrow(() -> new IllegalArgumentException("Declare the common Heritage flow step first: " + id));
        register(id, Placement.valueOf(step.placement().name()), step.order(), factory);
    }

    public static void register(ResourceLocation id, int order, Function<Context, Screen> factory) {
        register(id, Placement.BEFORE_SPAWN, order, factory);
    }

    public static synchronized void register(ResourceLocation id, Placement placement, int order, Function<Context, Screen> factory) {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(placement, "placement");
        Objects.requireNonNull(factory, "factory");
        if (REGISTRATIONS.containsKey(id)) throw new IllegalArgumentException("Duplicate Heritage screen: " + id);
        REGISTRATIONS.put(id, new Registration(id, placement, order, factory));
    }

    public static final class Context {
        private final ResourceLocation id;
        private final UUID selectionSession;
        private final Placement placement;
        private final String selectedSpawn;
        private final String selectedKit;

        private Context(Registration registration) {
            id = registration.id();
            selectionSession = ClientSelectionEvents.state().sessionId();
            placement = registration.placement();
            selectedSpawn = spawn;
            selectedKit = placement == Placement.AFTER_KIT ? kit : null;
        }

        public ResourceLocation id() { return id; }
        public Placement placement() { return placement; }
        public com.jvn.kingdomsheritage.api.SelectionState state() {
            if (!active()) throw new IllegalStateException("Heritage screen context is no longer active");
            return ClientSelectionEvents.state();
        }
        public com.jvn.kingdomsheritage.api.SelectionCatalog choices() {
            if (!active()) throw new IllegalStateException("Heritage screen context is no longer active");
            return ClientSelectionEvents.catalog();
        }
        public Optional<com.jvn.kingdomsheritage.api.SelectionCatalog.SpawnChoice> spawn() {
            return spawnId().flatMap(choices()::spawn);
        }
        public Optional<com.jvn.kingdomsheritage.api.SelectionCatalog.KitChoice> kit() {
            return kitId().flatMap(choices()::kit);
        }

        public Optional<ResourceLocation> spawnId() { return Optional.ofNullable(selectedSpawn).map(ResourceLocation::parse); }

        public Optional<ResourceLocation> kitId() { return Optional.ofNullable(selectedKit).map(ResourceLocation::parse); }

        public boolean active() { return context == this && ClientSelection.selecting() && ClientSelectionEvents.matches(selectionSession); }

        public StepStatus status() { return ClientSteps.status(this); }
        public JsonObject value() { return ClientSteps.value(this); }
        public ScreenStep.PartyPolicy partyPolicy() {
            var step = ClientSteps.definition(id);
            return step == null ? ScreenStep.PartyPolicy.PER_PLAYER : step.partyPolicy();
        }

        public void submit(JsonObject value) {
            JsonObject copy = Objects.requireNonNull(value, "value").deepCopy();
            if (copy.toString().length() > 16384) throw new IllegalArgumentException("Heritage decision exceeds 16384 characters");
            Minecraft.getInstance().execute(() -> {
                if (!active() || backRequested) return;
                draft(copy);
                if (ClientSteps.managed(id)) ClientSteps.submit(this, copy, false);
                else completionRequested = true;
            });
        }

        public boolean canGoBack() { return active() && (visited.size() > 1 || placement != Placement.BEFORE_SPAWN); }

        public JsonObject draft() {
            if (!active()) throw new IllegalStateException("Heritage screen context is no longer active");
            return drafts.getOrDefault(new DraftKey(id, selectedSpawn, selectedKit), new JsonObject()).deepCopy();
        }

        public void draft(JsonObject value) {
            if (!active()) throw new IllegalStateException("Heritage screen context is no longer active");
            drafts.put(new DraftKey(id, selectedSpawn, selectedKit), Objects.requireNonNull(value, "value").deepCopy());
        }

        public void back() {
            Minecraft.getInstance().execute(() -> {
                if (canGoBack()) {
                    backRequested = true;
                    completionRequested = false;
                    int target = visited.size() > 1 ? visited.get(visited.size() - 2) : 0;
                    ResourceLocation invalidate = id;
                    for (int candidate = target; candidate <= index; candidate++) {
                        if (ClientSteps.managed(steps.get(candidate).id())) { invalidate = steps.get(candidate).id(); break; }
                    }
                    ClientSteps.back(invalidate);
                }
            });
        }

        public JsonObject catalog() {
            if (!active()) throw new IllegalStateException("Heritage screen context is no longer active");
            return ClientSelection.catalogCopy();
        }

        public void complete() {
            Minecraft.getInstance().execute(() -> {
                if (active() && !backRequested) {
                    if (ClientSteps.managed(id)) ClientSteps.submit(this, new JsonObject(), false);
                    else completionRequested = true;
                }
            });
        }
    }

    static synchronized void begin() {
        clear();
        var registrations = new LinkedHashMap<ResourceLocation, Registration>(REGISTRATIONS);
        var definitions = new LinkedHashMap<ResourceLocation, ScreenStep>();
        for (var value : registrations.values()) {
            if (!ClientSteps.disabled(value.id())) definitions.put(value.id(),
                    new ScreenStep(value.id(), ScreenStep.Placement.valueOf(value.placement().name()), value.order()));
        }
        for (var step : ClientSteps.definitions()) {
            definitions.put(step.id(), step);
            registrations.putIfAbsent(step.id(), new Registration(step.id(), Placement.valueOf(step.placement().name()), step.order(), ignored -> null));
        }
        session = ScreenStep.sorted(definitions.values()).stream().map(step -> {
            var registration = registrations.get(step.id());
            if (!registration.placement().name().equals(step.placement().name())) throw new IllegalArgumentException("Client/server Heritage placement mismatch: " + step.id());
            return new Registration(step.id(), registration.placement(), step.order(), registration.factory());
        }).toList();
        prepare(Placement.BEFORE_SPAWN, Placement.BEFORE_SPAWN, null, null, ClientSelection::showSelection);
    }

    private static void prepare(Placement first, Placement last, String selectedSpawn, String selectedKit, Runnable onComplete) {
        cancel();
        steps = session.stream().filter(value -> value.placement().compareTo(first) >= 0
                && value.placement().compareTo(last) <= 0).toList();
        spawn = selectedSpawn;
        kit = selectedKit;
        continuation = onComplete;
    }

    static void open(Placement first, Placement last, String selectedSpawn, String selectedKit, Runnable onComplete) {
        prepare(first, last, selectedSpawn, selectedKit, onComplete);
        showNext();
    }

    static boolean finished() { return continuation == null; }
    static boolean owns(Screen candidate) { return candidate != null && (screen == candidate || waiting == candidate); }
    static Placement placement() {
        return context != null ? context.placement() : index < steps.size() ? steps.get(index).placement() : null;
    }

    static boolean valid(JsonObject catalog) {
        if (spawn == null) return true;
        boolean hasSpawn = catalog.getAsJsonArray("spawns").asList().stream()
                .anyMatch(value -> value.getAsJsonObject().get("id").getAsString().equals(spawn));
        if (!hasSpawn) return false;
        var allowed = ClientSelection.allowedKits(catalog, spawn);
        return !allowed.isEmpty() && (kit == null || allowed.stream().anyMatch(value -> value.get("id").getAsString().equals(kit)));
    }

    static Screen current() {
        while (index < steps.size()) {
            if (context == null) context = new Context(steps.get(index));
            ClientSteps.activate(context);
            if (context.status().complete() && !factoryAttempted) {
                skipped = true;
                if (!visited.isEmpty() && visited.getLast() == index) visited.removeLast();
            }
            if (ClientSteps.waiting(context)) return waiting("");
            if (!factoryAttempted) {
                factoryAttempted = true;
                screen = steps.get(index).factory().apply(context);
            }
            if (screen != null) {
                if (visited.isEmpty() || visited.getLast() != index) visited.add(index);
                waiting = null;
                return screen;
            }
            var definition = ClientSteps.definition(context.id());
            if (definition != null) {
                if (!definition.optional()) return waiting("Required selection screen is unavailable: " + context.id() + ". Check that the matching client mod is installed.");
                skipped = true;
                if (!visited.isEmpty() && visited.getLast() == index) visited.removeLast();
                ClientSteps.submit(context, new JsonObject(), true);
                return waiting("");
            }
            resetScreen();
            index++;
        }
        return null;
    }

    private static Screen waiting(String problem) {
        if (waiting == null || !Objects.equals(waitingProblem, problem)) {
            waiting = new ExtensionWaitingScreen(context, problem);
            waitingProblem = problem;
        }
        if (!skipped && (visited.isEmpty() || visited.getLast() != index)) visited.add(index);
        return waiting;
    }

    private static void resetScreen() {
        screen = waiting = null;
        context = null;
        factoryAttempted = false;
        skipped = false;
        waitingProblem = null;
        completionRequested = false;
        ClientSteps.leave();
    }

    static void retry(Context previous) {
        if (!previous.active()) return;
        resetScreen();
        showNext();
    }

    static void restart() {
        prepare(Placement.BEFORE_SPAWN, Placement.BEFORE_SPAWN, null, null, ClientSelection::showSelection);
        showNext();
    }

    static void showNext() {
        Screen next = current();
        if (next != null) {
            Minecraft.getInstance().setScreen(next);
            SelectionTransition.reveal();
        } else if (continuation != null) {
            Runnable action = continuation;
            cancel();
            action.run();
        }
    }

    static void tick() {
        ClientSteps.pump();
        if (context != null && ClientSteps.managed(context.id()) && context.status().complete()) completionRequested = true;
        if ((!completionRequested && !backRequested) || context == null || !context.active() || SelectionTransition.active()) return;
        SelectionTransition.fadeOut(() -> {
            if (backRequested) {
                Placement previousPlacement = context.placement();
                if (visited.size() <= 1) {
                    ClientSelection.backFromExtension(previousPlacement);
                    return;
                }
                visited.removeLast();
                index = visited.removeLast();
            } else index++;
            backRequested = false;
            resetScreen();
            showNext();
        });
    }

    static void cancel() {
        steps = List.of();
        visited.clear();
        index = 0;
        resetScreen();
        spawn = null;
        kit = null;
        continuation = null;
        completionRequested = false;
        backRequested = false;
    }

    static void clear() {
        cancel();
        session = List.of();
        drafts.clear();
    }
}

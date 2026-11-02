package com.jvn.kingdomsheritage.data;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.Map;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.packs.resources.ResourceManager;
import net.minecraft.server.packs.resources.SimplePreparableReloadListener;
import net.minecraft.util.GsonHelper;
import net.minecraft.util.profiling.ProfilerFiller;
import net.neoforged.neoforge.event.AddReloadListenerEvent;

public final class HeritageCatalog {
    record Snapshot(Map<ResourceLocation, SpawnDefinition> spawns,
                    Map<ResourceLocation, KitDefinition> kits, Map<ResourceLocation, IntroDefinition> cinematics,
                    SelectionSettings selection) {}
    private static final ResourceLocation SELECTION = ResourceLocation.fromNamespaceAndPath("kingdomsheritage", "selection");
    private static Snapshot current = new Snapshot(Map.of(), Map.of(), Map.of(), SelectionSettings.DEFAULT);
    private static long revision;

    private HeritageCatalog() {}

    public static Map<ResourceLocation, SpawnDefinition> spawns() { return current.spawns; }
    public static Map<ResourceLocation, KitDefinition> kits() { return current.kits; }
    public static Map<ResourceLocation, IntroDefinition> cinematics() { return current.cinematics; }
    public static long revision() { return revision; }
    public static int guiScale() { return current.selection.guiScale(); }

    public static void register(AddReloadListenerEvent event) {
        event.addListener(new Loader());
    }

    static Snapshot parse(Map<ResourceLocation, JsonElement> resources) {
        SelectionSettings selection = resources.containsKey(SELECTION)
                ? SelectionSettings.parse(GsonHelper.convertToJsonObject(resources.get(SELECTION), "kingdomsheritage:selection"))
                : SelectionSettings.DEFAULT;
        Map<ResourceLocation, SpawnDefinition> spawns = new LinkedHashMap<>();
        Map<ResourceLocation, KitDefinition> kits = new LinkedHashMap<>();
        Map<ResourceLocation, IntroDefinition> cinematics = new LinkedHashMap<>();
        resources.entrySet().stream().sorted(Map.Entry.comparingByKey()).forEach(entry -> {
            if (entry.getKey().equals(SELECTION)) return;
            try {
                String path = entry.getKey().getPath();
                JsonObject json = entry.getValue().getAsJsonObject();
                if (!GsonHelper.getAsBoolean(json, "enabled", true)) return;
                if (path.startsWith("spawns/")) {
                    ResourceLocation id = ResourceLocation.fromNamespaceAndPath(entry.getKey().getNamespace(), path.substring(7));
                    spawns.put(id, SpawnDefinition.parse(id, json));
                } else if (path.startsWith("kits/")) {
                    ResourceLocation id = ResourceLocation.fromNamespaceAndPath(entry.getKey().getNamespace(), path.substring(5));
                    kits.put(id, KitDefinition.parse(id, json));
                } else if (path.startsWith("cinematics/")) {
                    ResourceLocation id = ResourceLocation.fromNamespaceAndPath(entry.getKey().getNamespace(), path.substring(11));
                    cinematics.put(id, IntroDefinition.parse(json));
                }
            } catch (RuntimeException error) {
                throw new IllegalArgumentException("Invalid Heritage definition " + entry.getKey() + ": " + error.getMessage(), error);
            }
        });
        if (spawns.isEmpty() || spawns.size() > 50) {
            throw new IllegalArgumentException("Heritage requires between 1 and 50 enabled spawn locations");
        }
        if (kits.isEmpty() || kits.size() > 128) {
            throw new IllegalArgumentException("Heritage requires between 1 and 128 enabled kits");
        }
        for (var spawn : spawns.values()) {
            for (String selector : spawn.kits()) {
                boolean found = selector.startsWith("#") ? kits.values().stream().anyMatch(kit -> kit.tags().contains(selector.substring(1)))
                        : kits.containsKey(ResourceLocation.parse(selector));
                if (!found) throw new IllegalArgumentException("Unknown or empty kit selector " + selector + " in " + spawn.id());
            }
            if (kits.values().stream().noneMatch(spawn::allows)) throw new IllegalArgumentException("No allowed kits for " + spawn.id());
        }
        Map<ResourceLocation, SpawnDefinition> sortedSpawns = new LinkedHashMap<>();
        spawns.values().stream().sorted(Comparator.comparingInt(SpawnDefinition::order).thenComparing(SpawnDefinition::id))
                .forEach(value -> sortedSpawns.put(value.id(), value));
        Map<ResourceLocation, KitDefinition> sortedKits = new LinkedHashMap<>();
        kits.values().stream().sorted(Comparator.comparingInt(KitDefinition::order).thenComparing(KitDefinition::id))
                .forEach(value -> sortedKits.put(value.id(), value));
        return new Snapshot(java.util.Collections.unmodifiableMap(sortedSpawns), java.util.Collections.unmodifiableMap(sortedKits),
                java.util.Collections.unmodifiableMap(cinematics), selection);
    }

    private static final class Loader extends SimplePreparableReloadListener<Snapshot> {
        @Override
        protected Snapshot prepare(ResourceManager manager, ProfilerFiller profiler) {
            Map<ResourceLocation, JsonElement> resources = new LinkedHashMap<>();
            manager.listResources("heritage", id -> id.getPath().endsWith(".json")
                    && (id.getPath().startsWith("heritage/spawns/") || id.getPath().startsWith("heritage/kits/")
                    || id.getPath().startsWith("heritage/cinematics/")
                    || id.equals(SELECTION.withPath("heritage/selection.json"))))
                    .forEach((id, resource) -> {
                        try (var reader = resource.openAsReader()) {
                            String path = id.getPath();
                            resources.put(ResourceLocation.fromNamespaceAndPath(id.getNamespace(),
                                    path.substring("heritage/".length(), path.length() - ".json".length())), JsonParser.parseReader(reader));
                        } catch (IOException | com.google.gson.JsonParseException error) {
                            throw new IllegalArgumentException("Cannot read Heritage definition " + id, error);
                        }
                    });
            return parse(resources);
        }

        @Override
        protected void apply(Snapshot snapshot, ResourceManager manager, ProfilerFiller profiler) {
            current = snapshot;
            revision++;
        }
    }
}

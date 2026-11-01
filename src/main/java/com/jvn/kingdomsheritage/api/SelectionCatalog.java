package com.jvn.kingdomsheritage.api;

import com.google.gson.JsonObject;
import com.jvn.kingdomsheritage.data.DefinitionJson;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;

public final class SelectionCatalog {
    public static final class SpawnChoice {
        private final JsonObject data;

        private SpawnChoice(JsonObject data) { this.data = data.deepCopy(); }
        public ResourceLocation id() { return ResourceLocation.parse(data.get("id").getAsString()); }
        public Component title() { return DefinitionJson.component(data, "title"); }
        public Component subtitle() { return DefinitionJson.component(data, "subtitle"); }
        public Component description() { return DefinitionJson.component(data, "description"); }
        public ResourceLocation image() { return ResourceLocation.parse(data.get("image").getAsString()); }
        public List<ResourceLocation> allowedKitIds() {
            return data.getAsJsonArray("kits").asList().stream().map(value -> ResourceLocation.parse(value.getAsString())).toList();
        }
    }

    public static final class PreviewItem {
        private final JsonObject data;

        private PreviewItem(JsonObject data) { this.data = data.deepCopy(); }
        public String inventory() { return data.get("inventory").getAsString(); }
        public String slot() { return data.get("slot").getAsString(); }
        public int index() { return data.get("index").getAsInt(); }
        public boolean cosmetic() { return data.get("cosmetic").getAsBoolean(); }
        public JsonObject item() { return data.getAsJsonObject("item").deepCopy(); }
    }

    public static final class KitChoice {
        private final JsonObject data;
        private final List<PreviewItem> items;

        private KitChoice(JsonObject data) {
            this.data = data.deepCopy();
            items = data.getAsJsonArray("items").asList().stream().map(value -> new PreviewItem(value.getAsJsonObject())).toList();
        }

        public ResourceLocation id() { return ResourceLocation.parse(data.get("id").getAsString()); }
        public Component title() { return DefinitionJson.component(data, "title"); }
        public Component description() { return DefinitionJson.component(data, "description"); }
        public List<PreviewItem> items() { return items; }
        public int selectedSlot() { return data.get("selected_slot").getAsInt(); }
        public Optional<String> problem() {
            String problem = data.get("problem").getAsString();
            return problem.isEmpty() ? Optional.empty() : Optional.of(problem);
        }
    }

    private final long revision;
    private final Map<ResourceLocation, SpawnChoice> spawns;
    private final Map<ResourceLocation, KitChoice> kits;

    public SelectionCatalog(JsonObject catalog) {
        revision = catalog.get("revision").getAsLong();
        var spawnChoices = new LinkedHashMap<ResourceLocation, SpawnChoice>();
        for (var value : catalog.getAsJsonArray("spawns")) {
            var choice = new SpawnChoice(value.getAsJsonObject());
            spawnChoices.put(choice.id(), choice);
        }
        var kitChoices = new LinkedHashMap<ResourceLocation, KitChoice>();
        for (var value : catalog.getAsJsonArray("kits")) {
            var choice = new KitChoice(value.getAsJsonObject());
            kitChoices.put(choice.id(), choice);
        }
        spawns = Collections.unmodifiableMap(spawnChoices);
        kits = Collections.unmodifiableMap(kitChoices);
    }

    public long revision() { return revision; }
    public Map<ResourceLocation, SpawnChoice> spawns() { return spawns; }
    public Map<ResourceLocation, KitChoice> kits() { return kits; }
    public Optional<SpawnChoice> spawn(ResourceLocation id) { return Optional.ofNullable(spawns.get(id)); }
    public Optional<KitChoice> kit(ResourceLocation id) { return Optional.ofNullable(kits.get(id)); }
    public List<KitChoice> allowedKits(ResourceLocation spawn) {
        var choice = spawns.get(spawn);
        return choice == null ? List.of() : choice.allowedKitIds().stream().map(kits::get).filter(java.util.Objects::nonNull).toList();
    }
}

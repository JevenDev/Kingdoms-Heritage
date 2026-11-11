package com.jvn.kingdomsheritage.data;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Map;
import net.minecraft.resources.ResourceLocation;

public final class CatalogPayload {
    public static final int MAX_BYTES = 900_000;
    private static final int MAX_DEFINITION_BYTES = 800_000;

    private CatalogPayload() {}

    static JsonObject definitions(Map<ResourceLocation, SpawnDefinition> definitions,
                                  Map<ResourceLocation, KitDefinition> equipment, SelectionSettings selection) {
        var json = new JsonObject();
        if (selection.guiScale() > 0) json.addProperty("gui_scale", selection.guiScale());
        json.addProperty("kit_preview", selection.kitPreview().name().toLowerCase(Locale.ROOT));
        JsonArray spawns = new JsonArray();
        for (var spawn : definitions.values()) {
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
            equipment.values().stream().filter(spawn::allows).forEach(kit -> allowed.add(kit.id().toString()));
            choice.add("kits", allowed);
            spawns.add(choice);
        }
        json.add("spawns", spawns);
        JsonArray kits = new JsonArray();
        for (var kit : equipment.values()) {
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
            if (kit.shop() != null) choice.add("shop", kit.shop().json());
            kits.add(choice);
        }
        json.add("kits", kits);
        return json;
    }

    static void validate(JsonObject definitions) {
        int size = size(definitions.toString());
        if (size > MAX_DEFINITION_BYTES) {
            throw new IllegalArgumentException("Heritage spawn and kit definitions use " + size
                    + " UTF-8 bytes. The maximum is " + MAX_DEFINITION_BYTES
                    + " bytes, leaving space for player and selection flow data. Reduce the number or size of the definitions.");
        }
    }

    public static int size(String json) {
        return json.getBytes(StandardCharsets.UTF_8).length;
    }
}

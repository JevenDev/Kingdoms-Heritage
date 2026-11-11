package com.jvn.kingdomsheritage.data;

import com.google.gson.JsonElement;
import com.google.gson.JsonParser;
import java.util.LinkedHashMap;
import java.util.Map;
import net.minecraft.resources.ResourceLocation;

public final class CatalogRegression {
    private CatalogRegression() {}

    public static void run() {
        Map<ResourceLocation, JsonElement> resources = new LinkedHashMap<>();
        resources.put(ResourceLocation.parse("test:spawns/default"), JsonParser.parseString("""
                {"title":"Default","type":"default"}
                """));
        var kit = JsonParser.parseString("""
                {"title":"Starter","shop":{"budget":10,"offers":[]}}
                """).getAsJsonObject();
        var offers = kit.getAsJsonObject("shop").getAsJsonArray("offers");
        var offer = JsonParser.parseString("""
                {"item":{"id":"minecraft:bread","count":1},"cost":1}
                """);
        for (int index = 0; index < KitShop.MAX_OFFERS; index++) offers.add(offer);
        resources.put(ResourceLocation.parse("test:kits/starter"), kit);
        HeritageCatalog.parse(resources);

        for (int index = 1; index < 110; index++) resources.put(ResourceLocation.parse("test:kits/starter_" + index), kit);
        try {
            HeritageCatalog.parse(resources);
        } catch (IllegalArgumentException error) {
            if (error.getMessage().contains("UTF-8 bytes")) return;
            throw new AssertionError("Catalog rejected the pack for the wrong reason", error);
        }
        throw new AssertionError("Catalog accepted a pack too large to send to players");
    }
}

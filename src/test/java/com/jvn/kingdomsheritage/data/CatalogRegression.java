package com.jvn.kingdomsheritage.data;

import com.google.gson.JsonElement;
import com.google.gson.JsonParser;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.SharedConstants;
import net.minecraft.core.component.DataComponents;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.Bootstrap;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.neoforged.fml.loading.LoadingModList;

public final class CatalogRegression {
    private CatalogRegression() {}

    public static void run() {
        shopLayoutsKeepGapsAndOfferIds();
        purchasesStackWithoutOverfilling();
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

    private static void purchasesStackWithoutOverfilling() {
        SharedConstants.tryDetectVersion();
        LoadingModList.of(List.of(), List.of(), List.of(), List.of(), Map.of());
        Bootstrap.bootStrap();

        var bread = new ItemStack(Items.BREAD, 4);
        var namedBread = new ItemStack(Items.BREAD, 63);
        namedBread.set(DataComponents.CUSTOM_NAME, Component.literal("Saved bread"));
        var inventory = new ArrayList<>(List.of(new ItemStack(Items.BREAD, 62), namedBread, ItemStack.EMPTY));
        int slot = KitLoadout.purchaseSlot(inventory::get, inventory.size(), -1, bread);
        if (slot != 0) throw new AssertionError("Shop did not choose the matching stack first");
        KitLoadout.placePurchase(inventory, inventory.size(), slot, bread.copy());
        if (inventory.get(0).getCount() != 64 || inventory.get(1).getCount() != 63
                || inventory.get(2).getCount() != 2 || bread.getCount() != 4) {
            throw new AssertionError("Shop overflow changed stock, ignored components or overfilled a stack");
        }

        inventory.set(1, new ItemStack(Items.BREAD, 62));
        inventory.set(2, new ItemStack(Items.BREAD, 62));
        slot = KitLoadout.purchaseSlot(inventory::get, inventory.size(), -1, bread);
        if (slot != 1) throw new AssertionError("Shop rejected a purchase that fits across existing stacks");
        KitLoadout.placePurchase(inventory, inventory.size(), slot, bread.copy());
        if (inventory.stream().anyMatch(stack -> stack.getCount() != 64)
                || KitLoadout.purchaseSlot(inventory::get, inventory.size(), -1, bread) != -1) {
            throw new AssertionError("Shop capacity disagreed with the delivered stacks");
        }
    }

    private static void shopLayoutsKeepGapsAndOfferIds() {
        var definition = JsonParser.parseString("""
                {
                  "budget": 10,
                  "sections": [{"id":"tools","name":"Tools","icon":"minecraft:iron_axe"}],
                  "offers": [
                    {"section":"tools","position":{"row":3,"column":5},"cost":1,"item":{"id":"minecraft:torch"}},
                    {"section":"tools","position":{"row":1,"column":1},"cost":2,"item":{"id":"minecraft:iron_axe"}},
                    {"section":"tools","cost":3,"item":{"id":"minecraft:shield"}}
                  ]
                }
                """).getAsJsonObject();
        var shop = KitShop.parse(KitShop.parse(definition).json());
        var tools = shop.layout("tools");
        if (tools.columns() != 3 || tools.offerAt(0, 0) != 1 || tools.offerAt(1, 0) != -1
                || tools.offerAt(2, 1) != 0 || tools.offerAt(0, 2) != 2 || tools.offerAt(0, 3) != -1) {
            throw new AssertionError("Shop layout lost authored slots or scrolled into empty columns");
        }
        var all = shop.layout("");
        if (all.offerAt(0, 0) != 0 || all.offerAt(0, 1) != 1 || all.offerAt(0, 2) != 2) {
            throw new AssertionError("The All tab should keep named sections in offer order");
        }
        var compact = new KitShop(10, java.util.Collections.nCopies(33, shop.offers().get(2))).layout("");
        if (compact.columns() != 5 || compact.offerAt(0, 3) != 3 || compact.offerAt(1, 1) != 6
                || compact.offerAt(6, 2) != 32 || compact.offerAt(6, 3) != -1) {
            throw new AssertionError("Compact shop layout lost offers across columns");
        }

        var offers = definition.getAsJsonArray("offers");
        offers.add(offers.get(0).deepCopy());
        try {
            KitShop.parse(definition);
        } catch (IllegalArgumentException error) {
            if (error.getMessage().equals("Duplicate shop offer position")) return;
            throw error;
        }
        throw new AssertionError("Shop accepted two offers in the same slot");
    }
}

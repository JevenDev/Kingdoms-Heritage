package com.jvn.kingdomsheritage.client;

import com.google.gson.JsonObject;
import com.jvn.kingdomsheritage.HeritageConfig;
import com.jvn.kingdomsheritage.data.DefinitionJson;
import com.jvn.kingdomsheritage.data.HeritageException;
import com.jvn.kingdomsheritage.data.KitDefinition;
import com.jvn.kingdomsheritage.data.SelectionSettings;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.inventory.InventoryScreen;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.player.Player;

public final class KitSelection {
    private final JsonObject catalog;
    private final String spawn;
    private final List<JsonObject> choices;
    private final Player player;
    private final KitPreview inventoryPreview;
    private final Map<Integer, NeighborPreview> neighborPreviews = new HashMap<>();
    private final boolean modelPreview;
    private final HeritageConfig.InventoryPolicy inventoryPolicy;
    private KitDefinition kit;
    private final boolean recipeBookOpen;
    private List<KitDefinition.StackEntry> stacks = List.of();
    private int index;
    private boolean submitted;
    private boolean shopOpen;
    private KitShopScreen shop;
    private Component definitionProblem = Component.empty();
    private Component problem = Component.empty();
    private final KitSelectionView view = new KitSelectionView(this);

    KitSelection(JsonObject catalog, String spawn) {
        this.catalog = catalog;
        this.spawn = spawn;
        choices = ClientSelection.allowedKits(catalog, spawn);
        player = Minecraft.getInstance().player;
        modelPreview = SelectionSettings.parseKitPreview(catalog) == SelectionSettings.KitPreview.MODEL;
        inventoryPreview = new KitPreview(player);
        inventoryPolicy = catalog.has("inventory_policy") ? HeritageConfig.InventoryPolicy.valueOf(
                catalog.get("inventory_policy").getAsString()) : HeritageConfig.InventoryPolicy.REPLACE;
        recipeBookOpen = Minecraft.getInstance().player.getRecipeBook().isOpen(net.minecraft.world.inventory.RecipeBookType.CRAFTING);
        select(0);
    }

    void retry() {
        submitted = false;
        view.updateButtons();
    }

    Component error() { return DefinitionJson.message(catalog, "error", player.registryAccess()); }

    String spawnId() { return spawn; }

    String kitId() { return choices.get(index).get("id").getAsString(); }

    void restoreSelection(String id) {
        for (int candidate = 0; candidate < choices.size(); candidate++) {
            if (choices.get(candidate).get("id").getAsString().equals(id)) {
                select(candidate);
                return;
            }
        }
    }

    boolean hasScreen(Screen screen) {
        return shopOpen ? screen == shop : isInventory(screen) || isLayoutPicker(screen);
    }

    boolean hasShop() {
        return kit != null && kit.shop() != null && inventoryPolicy != HeritageConfig.InventoryPolicy.PRESERVE;
    }

    void openShop() {
        if (!hasShop()) return;
        if (shop == null) shop = new KitShopScreen(this, kit, stacks, inventoryPolicy);
        shopOpen = true;
        Minecraft.getInstance().setScreen(shop);
    }

    void leaveShop() {
        shopOpen = false;
        openInventory();
    }

    void resumeShop(KitSelection previous) {
        if (!previous.shopOpen || !hasShop() || !kitId().equals(previous.kitId())
                || catalog.get("revision").getAsLong() != previous.catalog.get("revision").getAsLong()
                || !definitionProblem.getString().isEmpty()) return;
        shop = new KitShopScreen(this, kit, stacks, inventoryPolicy);
        shop.restore(previous.shop.picks());
        shopOpen = true;
    }

    void openInventory() {
        if (shopOpen) {
            Minecraft.getInstance().setScreen(shop);
            return;
        }
        Minecraft.getInstance().player.getRecipeBook().setOpen(net.minecraft.world.inventory.RecipeBookType.CRAFTING, false);
        Minecraft.getInstance().setScreen(new InventoryScreen(player));
    }

    void select(int index) {
        this.index = index;
        shop = null;
        shopOpen = false;
        kit = null;
        ClientSelection.choicesChanged(spawn, kitId());
        view.reset();
        problem = DefinitionJson.message(choices.get(index), "problem", player.registryAccess());
        try {
            kit = KitDefinition.parse(ResourceLocation.parse(choices.get(index).get("id").getAsString()), choices.get(index));
            stacks = kit.decode(player.registryAccess());
            if (hasShop()) kit.decodeOffers(player.registryAccess());
        } catch (IllegalArgumentException error) {
            stacks = List.of();
            problem = HeritageException.component(error);
        }
        definitionProblem = problem;
        preview();
        view.updateButtons();
    }

    void tick() {
        preview();
    }

    private void preview() {
        problem = definitionProblem;
        try {
            inventoryPreview.apply(problem.getString().isEmpty() ? kit : null, stacks, inventoryPolicy);
        } catch (IllegalArgumentException error) {
            problem = HeritageException.component(error);
        }
    }

    public static void renderPreview(Screen screen, Runnable draw) {
        var selection = ClientSelection.kits();
        if (selection == null || !isInventory(screen) || Minecraft.getInstance().player != selection.player) {
            draw.run();
            return;
        }
        selection.preview();
        selection.prepareNeighbors();
        selection.inventoryPreview.render(draw);
    }

    private void prepareNeighbors() {
        int first = view.firstPreview();
        int last = view.lastPreview();
        neighborPreviews.keySet().removeIf(index -> index < first || index > last || index == this.index);
        for (int index = first; index <= last; index++) {
            if (index == this.index) continue;
            var preview = neighborPreviews.computeIfAbsent(index, this::neighborPreview);
            try {
                preview.inventory.apply(preview.kit, preview.stacks, inventoryPolicy);
            } catch (IllegalArgumentException error) {
                preview.inventory.apply(null, List.of(), inventoryPolicy);
            }
        }
    }

    private NeighborPreview neighborPreview(int index) {
        KitDefinition definition = null;
        List<KitDefinition.StackEntry> items = List.of();
        try {
            definition = KitDefinition.parse(ResourceLocation.parse(choices.get(index).get("id").getAsString()), choices.get(index));
            items = definition.decode(player.registryAccess());
        } catch (IllegalArgumentException error) {
            definition = null;
        }
        return new NeighborPreview(definition, items, new KitPreview(player));
    }

    void renderNeighbor(int index, Runnable draw) {
        if (index == this.index) draw.run();
        else neighborPreviews.get(index).inventory.render(draw);
    }

    private record NeighborPreview(KitDefinition kit, List<KitDefinition.StackEntry> stacks, KitPreview inventory) {}

    void restore() {
        if (Minecraft.getInstance().player == player) Minecraft.getInstance().player.getRecipeBook().setOpen(net.minecraft.world.inventory.RecipeBookType.CRAFTING, recipeBookOpen);
    }

    KitSelectionView view() { return view; }
    List<JsonObject> choices() { return choices; }
    int index() { return index; }
    boolean modelPreview() { return modelPreview; }
    boolean submitted() { return submitted; }
    Component problem() { return problem; }
    Player player() { return player; }

    Component policyHint() {
        return problem.getString().isEmpty() ? Component.translatable("screen.kingdomsheritage.policy."
                + inventoryPolicy.name().toLowerCase(java.util.Locale.ROOT)) : problem;
    }

    void submit(List<Integer> offers) {
        submitted = true;
        view.updateButtons();
        ClientSelection.review(spawn, kitId(), offers);
    }

    void close() {
        view.close();
        restore();
    }

    static void register() { KitSelectionView.register(); }
    static boolean isInventory(Screen screen) { return KitSelectionView.isInventory(screen); }
    static boolean isLayoutPicker(Screen screen) { return KitSelectionView.isLayoutPicker(screen); }
    static boolean capturingPreview() { return KitSelectionView.capturingPreview(); }

    public static float previewAngle(net.minecraft.world.entity.LivingEntity entity, float angle, float center, boolean horizontal) {
        return KitSelectionView.previewAngle(entity, angle, center, horizontal);
    }
}

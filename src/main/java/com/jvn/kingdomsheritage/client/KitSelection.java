package com.jvn.kingdomsheritage.client;

import com.google.gson.JsonObject;
import com.jvn.kingdomsheritage.HeritageConfig;
import com.jvn.kingdomsheritage.data.DefinitionJson;
import com.jvn.kingdomsheritage.data.HeritageException;
import com.jvn.kingdomsheritage.data.KitDefinition;
import java.util.List;
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
    private final HeritageConfig.InventoryPolicy inventoryPolicy;
    private KitDefinition kit;
    private final boolean recipeBookOpen;
    private List<KitDefinition.StackEntry> stacks = List.of();
    private int index;
    private boolean submitted;
    private Component definitionProblem = Component.empty();
    private Component problem = Component.empty();
    private final KitSelectionView view = new KitSelectionView(this);

    KitSelection(JsonObject catalog, String spawn) {
        this.catalog = catalog;
        this.spawn = spawn;
        choices = ClientSelection.allowedKits(catalog, spawn);
        player = Minecraft.getInstance().player;
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

    void openInventory() {
        Minecraft.getInstance().player.getRecipeBook().setOpen(net.minecraft.world.inventory.RecipeBookType.CRAFTING, false);
        Minecraft.getInstance().setScreen(new InventoryScreen(player));
    }

    void select(int index) {
        this.index = index;
        view.reset();
        problem = DefinitionJson.message(choices.get(index), "problem", player.registryAccess());
        try {
            kit = KitDefinition.parse(ResourceLocation.parse(choices.get(index).get("id").getAsString()), choices.get(index));
            stacks = kit.decode(player.registryAccess());
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
        selection.inventoryPreview.render(draw);
    }

    void restore() {
        if (Minecraft.getInstance().player == player) Minecraft.getInstance().player.getRecipeBook().setOpen(net.minecraft.world.inventory.RecipeBookType.CRAFTING, recipeBookOpen);
    }

    KitSelectionView view() { return view; }
    List<JsonObject> choices() { return choices; }
    int index() { return index; }
    boolean submitted() { return submitted; }
    Component problem() { return problem; }
    Player player() { return player; }

    Component policyHint() {
        return problem.getString().isEmpty() ? Component.translatable("screen.kingdomsheritage.policy."
                + inventoryPolicy.name().toLowerCase(java.util.Locale.ROOT)) : problem;
    }

    void submit() {
        submitted = true;
        view.updateButtons();
        ClientSelection.review(spawn, kitId());
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

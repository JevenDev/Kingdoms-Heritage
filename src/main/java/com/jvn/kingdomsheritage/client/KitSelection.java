package com.jvn.kingdomsheritage.client;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.jvn.kingdomsheritage.HeritageConfig;
import com.jvn.kingdomsheritage.data.DefinitionJson;
import com.jvn.kingdomsheritage.data.HeritageException;
import com.jvn.kingdomsheritage.data.KitDefinition;
import com.jvn.kingdomsheritage.data.KitShop;
import com.jvn.kingdomsheritage.data.KitStats;
import com.jvn.kingdomsheritage.data.SelectionSettings;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.inventory.InventoryScreen;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.inventory.CraftingContainer;
import net.minecraft.world.inventory.ResultContainer;
import net.minecraft.world.inventory.Slot;

public final class KitSelection {
    private final JsonObject catalog;
    private final String spawn;
    private final List<JsonObject> choices;
    private final Player player;
    private final KitPreview inventoryPreview;
    private final Map<Integer, NeighborPreview> neighborPreviews = new HashMap<>();
    private final boolean modelPreview;
    private final int shopTabHeight;
    private final HeritageConfig.InventoryPolicy inventoryPolicy;
    private KitDefinition kit;
    private KitShopTabs.Preview shopTabs = KitShopTabs.Preview.EMPTY;
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
        inventoryPreview = new KitPreview(player, grantsStarterStats());
        inventoryPolicy = catalog.has("inventory_policy") ? HeritageConfig.InventoryPolicy.valueOf(
                catalog.get("inventory_policy").getAsString()) : HeritageConfig.InventoryPolicy.PRESERVE;
        shopTabHeight = modelPreview ? 0
                : choices.stream().mapToInt(choice -> choice.get("shop") instanceof JsonObject shop
                        && shop.get("sections") instanceof JsonArray sections ? KitShopTabs.previewHeight(sections.size()) : 0)
                        .max().orElse(0);
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
        return hasShop(kit);
    }

    private boolean hasShop(KitDefinition definition) {
        return definition != null && definition.shop() != null;
    }

    Component shopBudgetLabel(int index) {
        var neighbor = neighborPreviews.get(index);
        var definition = index == this.index ? kit : neighbor == null ? null : neighbor.kit();
        if (!hasShop(definition)) return null;
        int points = definition.shop().budget();
        return Component.translatable(points == 1 ? "screen.kingdomsheritage.shop.kit_budget_one"
                : "screen.kingdomsheritage.shop.kit_budget", points);
    }

    KitShopTabs.Preview shopTabs(int index) {
        if (modelPreview) return KitShopTabs.Preview.EMPTY;
        if (index == this.index) return shopTabs;
        var neighbor = neighborPreviews.get(index);
        return neighbor == null ? KitShopTabs.Preview.EMPTY : neighbor.shopTabs();
    }

    private KitShopTabs.Preview shopTabs(KitDefinition definition) {
        return KitShopTabs.preview(hasShop(definition) ? definition.shop() : null);
    }

    int shopTabHeight() { return shopTabHeight; }

    boolean hasIncludedGear() { return !stacks.isEmpty(); }

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
        shopTabs = shopTabs(kit);
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

    public static boolean renderPreview(Screen screen, GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
        if (!isPreviewInventory(screen)) return false;
        var selection = ClientSelection.kits();
        selection.preview();
        selection.prepareNeighbors();
        selection.inventoryPreview.render(() -> selection.view.render(screen, graphics, mouseX, mouseY, partialTick));
        return true;
    }

    public static boolean isPreviewInventory(Screen screen) {
        var selection = ClientSelection.kits();
        var minecraft = Minecraft.getInstance();
        return selection != null && screen == minecraft.screen && minecraft.player == selection.player && isInventory(screen);
    }

    public static boolean showsEquipmentControls() {
        var selection = ClientSelection.kits();
        return selection != null && !selection.modelPreview;
    }

    public static boolean isEquipmentClass(Class<?> type) {
        String name = type.getNestHost().getPackageName();
        return name.startsWith("top.theillusivec4.curios.") || name.startsWith("io.wispforest.accessories.");
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
        return new NeighborPreview(definition, items, new KitPreview(player, grantsStarterStats()), shopTabs(definition));
    }

    void renderNeighbor(int index, Runnable draw) {
        if (index == this.index) draw.run();
        else neighborPreviews.get(index).inventory.render(draw);
    }

    private record NeighborPreview(KitDefinition kit, List<KitDefinition.StackEntry> stacks,
                                   KitPreview inventory, KitShopTabs.Preview shopTabs) {}

    KitStats.Preview previewStats() { return inventoryPreview.stats(); }
    long purseGrant() { return inventoryPreview.purseGrant(); }
    KitSelectionView view() { return view; }
    List<JsonObject> choices() { return choices; }
    int index() { return index; }
    boolean modelPreview() { return modelPreview; }
    boolean showsCosmeticArmor() { return inventoryPreview.showsCosmeticArmor(); }
    boolean submitted() { return submitted; }
    Component problem() { return problem; }
    Player player() { return player; }

    boolean grantsStarterStats() {
        return !catalog.has("reset") || !catalog.get("reset").getAsBoolean();
    }

    Component policyNotice() {
        if (!grantsStarterStats()) {
            return Component.translatable(inventoryPolicy == HeritageConfig.InventoryPolicy.REPLACE
                    ? "screen.kingdomsheritage.policy.replace_reset" : "screen.kingdomsheritage.policy.preserve_reset");
        }
        return inventoryPolicy == HeritageConfig.InventoryPolicy.PRESERVE
                ? Component.translatable("screen.kingdomsheritage.policy.preserve_notice") : Component.empty();
    }

    Component policyHint() {
        return problem.getString().isEmpty() ? Component.translatable("screen.kingdomsheritage.policy."
                + inventoryPolicy.name().toLowerCase(java.util.Locale.ROOT)) : problem;
    }

    void submit(List<KitShop.Pick> offers) {
        submitted = true;
        view.updateButtons();
        ClientSelection.review(spawn, kitId(), offers);
    }

    void close() {
        view.close();
    }

    static void register() { KitSelectionView.register(); }
    static boolean isInventory(Screen screen) { return KitSelectionView.isInventory(screen); }
    static boolean isLayoutPicker(Screen screen) { return KitSelectionView.isLayoutPicker(screen); }
    public static boolean capturingPreview() { return KitSelectionView.capturingPreview(); }

    public static boolean isCraftingSlot(Slot slot) {
        return slot.container instanceof CraftingContainer || slot.container instanceof ResultContainer;
    }

    public static net.minecraft.world.entity.Entity previewEntity(net.minecraft.world.entity.Entity entity) {
        return KitPreview.renderEntity(entity);
    }

    public static float previewAngle(net.minecraft.world.entity.LivingEntity entity, float angle, float center, boolean horizontal) {
        return KitSelectionView.previewAngle(entity, angle, center, horizontal);
    }
}

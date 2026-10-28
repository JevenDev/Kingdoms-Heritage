package com.jvn.kingdomsheritage.client;

import com.google.gson.JsonObject;
import com.jvn.kingdomsheritage.compat.EquipmentCompat;
import com.jvn.kingdomsheritage.data.KitDefinition;
import com.jvn.kingdomsheritage.network.HeritageNetwork;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.Tooltip;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.inventory.AbstractContainerScreen;
import net.minecraft.client.gui.screens.inventory.InventoryScreen;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.neoforged.bus.api.EventPriority;
import net.neoforged.neoforge.client.event.ScreenEvent;
import net.neoforged.neoforge.common.NeoForge;
import net.neoforged.neoforge.network.PacketDistributor;
import org.lwjgl.glfw.GLFW;

public final class KitSelection {
    private final JsonObject catalog;
    private final String spawn;
    private final List<JsonObject> choices;
    private final Player player;
    private final List<ItemStack> original = new ArrayList<>();
    private final List<EquipmentCompat.Slot> equipment;
    private final List<ItemStack> originalEquipment;
    private final int originalSelected;
    private final boolean recipeBookOpen;
    private List<KitDefinition.StackEntry> stacks = List.of();
    private int index;
    private boolean submitted;
    private long submittedAt;
    private String problem = "";
    private Button previous;
    private Button next;
    private Button confirm;
    private Button back;
    private net.minecraft.client.renderer.Rect2i bounds;
    private int descriptionY;

    KitSelection(JsonObject catalog, String spawn) {
        this.catalog = catalog;
        this.spawn = spawn;
        choices = catalog.getAsJsonArray("kits").asList().stream().map(value -> value.getAsJsonObject()).toList();
        player = Minecraft.getInstance().player;
        for (int slot = 0; slot < player.getInventory().getContainerSize(); slot++) original.add(player.getInventory().getItem(slot).copy());
        originalSelected = player.getInventory().selected;
        recipeBookOpen = Minecraft.getInstance().player.getRecipeBook().isOpen(net.minecraft.world.inventory.RecipeBookType.CRAFTING);
        equipment = EquipmentCompat.slots(player);
        originalEquipment = equipment.stream().map(slot -> slot.get().get().copy()).toList();
        select(0);
    }

    static void register() {
        NeoForge.EVENT_BUS.addListener(EventPriority.LOWEST, KitSelection::init);
        NeoForge.EVENT_BUS.addListener(KitSelection::render);
        NeoForge.EVENT_BUS.addListener(KitSelection::layout);
        NeoForge.EVENT_BUS.addListener(KitSelection::hideCrafting);
        NeoForge.EVENT_BUS.addListener(EventPriority.HIGHEST, KitSelection::mouse);
        NeoForge.EVENT_BUS.addListener(EventPriority.HIGHEST, KitSelection::key);
    }

    static boolean isInventory(Screen screen) {
        if (screen instanceof InventoryScreen) return true;
        if (!(screen instanceof AbstractContainerScreen<?>)) return false;
        String name = screen.getClass().getName();
        return name.startsWith("top.theillusivec4.curios.") || name.startsWith("io.wispforest.accessories.");
    }

    static boolean isLayoutPicker(Screen screen) {
        return screen != null && screen.getClass().getName().equals("io.wispforest.accessories.client.gui.ScreenVariantSelectionScreen");
    }

    void openInventory() {
        Minecraft.getInstance().player.getRecipeBook().setOpen(net.minecraft.world.inventory.RecipeBookType.CRAFTING, false);
        Minecraft.getInstance().setScreen(new InventoryScreen(player));
    }

    private void select(int index) {
        this.index = index;
        problem = choices.get(index).get("problem").getAsString();
        try {
            var kit = KitDefinition.parse(ResourceLocation.parse(choices.get(index).get("id").getAsString()), choices.get(index));
            stacks = kit.decode(player.registryAccess());
        } catch (IllegalArgumentException error) {
            stacks = List.of();
            problem = error.getMessage();
        }
        preview();
        updateButtons();
    }

    void tick() {
        if (submitted && net.minecraft.Util.getMillis() - submittedAt > 10000) submitted = false;
        preview();
        updateButtons();
    }

    private void preview() {
        player.getInventory().clearContent();
        var slots = EquipmentCompat.slots(player);
        slots.forEach(slot -> slot.set().accept(ItemStack.EMPTY));
        for (var entry : stacks) {
            if (entry.inventory().equals("player")) player.getInventory().setItem(entry.index(), entry.stack().copy());
            else slots.stream().filter(slot -> slot.matches(entry)).findFirst().ifPresent(slot -> slot.set().accept(entry.stack().copy()));
        }
        player.getInventory().selected = choices.get(index).get("selected_slot").getAsInt();
    }

    void restore() {
        for (int slot = 0; slot < original.size(); slot++) player.getInventory().setItem(slot, original.get(slot));
        for (var current : EquipmentCompat.slots(player)) {
            ItemStack restored = ItemStack.EMPTY;
            for (int slot = 0; slot < equipment.size(); slot++) {
                var previous = equipment.get(slot);
                if (current.inventory().equals(previous.inventory()) && current.name().equals(previous.name())
                        && current.index() == previous.index() && current.cosmetic() == previous.cosmetic()) {
                    restored = originalEquipment.get(slot);
                    break;
                }
            }
            current.set().accept(restored.copy());
        }
        player.getInventory().selected = originalSelected;
        if (Minecraft.getInstance().player == player) Minecraft.getInstance().player.getRecipeBook().setOpen(net.minecraft.world.inventory.RecipeBookType.CRAFTING, recipeBookOpen);
    }

    private void updateButtons() {
        if (confirm == null) return;
        previous.active = index > 0 && !submitted;
        next.active = index + 1 < choices.size() && !submitted;
        back.active = !submitted;
        confirm.active = !submitted && problem.isEmpty();
        confirm.setMessage(Component.translatable(submitted ? "screen.kingdomsheritage.wait" : "screen.kingdomsheritage.begin"));
        confirm.setTooltip(problem.isEmpty() ? null : Tooltip.create(Component.literal(problem)));
    }

    private static void init(ScreenEvent.Init.Post event) {
        KitSelection selection = ClientSelection.kits();
        if (selection == null || !isInventory(event.getScreen())) return;
        Screen screen = event.getScreen();
        if (net.neoforged.fml.ModList.get().isLoaded("accessories")) AccessoriesControls.hideCrafting(screen);
        var container = (AbstractContainerScreen<?>) screen;
        for (var child : List.copyOf(screen.children())) {
            if (child instanceof net.minecraft.client.gui.components.ImageButton button
                    && button.getX() == container.getGuiLeft() + 104) event.removeListener(child);
        }
        selection.previous = Button.builder(Component.literal("<"), button -> selection.select(selection.index - 1))
                .bounds(8, 8, 20, 20).build();
        selection.next = Button.builder(Component.literal(">"), button -> selection.select(selection.index + 1))
                .bounds(screen.width - 28, 8, 20, 20).build();
        selection.back = Button.builder(Component.translatable("gui.back"), button -> ClientSelection.back())
                .bounds(8, screen.height - 27, 70, 20).build();
        selection.confirm = Button.builder(Component.translatable("screen.kingdomsheritage.begin"), button -> {
            selection.submitted = true;
            selection.submittedAt = net.minecraft.Util.getMillis();
            selection.updateButtons();
            PacketDistributor.sendToServer(new HeritageNetwork.Choose(selection.spawn,
                    selection.choices.get(selection.index).get("id").getAsString(), selection.catalog.get("revision").getAsLong()));
        }).bounds(screen.width - 108, screen.height - 27, 100, 20).build();
        event.addListener(selection.previous);
        event.addListener(selection.next);
        event.addListener(selection.back);
        event.addListener(selection.confirm);
        selection.updateButtons();
        selection.positionControls(screen);
    }

    private static void layout(ScreenEvent.Render.Pre event) {
        KitSelection selection = ClientSelection.kits();
        if (selection != null && isInventory(event.getScreen())) selection.positionControls(event.getScreen());
    }

    private void positionControls(Screen screen) {
        var container = (AbstractContainerScreen<?>) screen;
        bounds = net.neoforged.fml.ModList.get().isLoaded("accessories") ? AccessoriesControls.inventoryBounds(screen) : null;
        if (bounds == null) {
            int left = container.getGuiLeft();
            int right = left + container.getXSize();
            for (var slot : container.getMenu().slots) {
                if (slot.isActive()) {
                    left = Math.min(left, container.getGuiLeft() + slot.x - 8);
                    right = Math.max(right, container.getGuiLeft() + slot.x + 24);
                }
            }
            bounds = new net.minecraft.client.renderer.Rect2i(left, container.getGuiTop(), right - left, container.getYSize());
        }
        int middle = bounds.getY() + (bounds.getHeight() - 20) / 2;
        previous.setPosition(Math.max(4, bounds.getX() - 30), middle);
        next.setPosition(Math.min(screen.width - 24, bounds.getX() + bounds.getWidth() + 10), middle);
        int center = bounds.getX() + bounds.getWidth() / 2;
        int bottom = Math.min(screen.height - 24, bounds.getY() + bounds.getHeight() + 6);
        back.setPosition(center - 86, bottom);
        confirm.setPosition(center - 12, bottom);
        descriptionY = bottom + 25;
    }

    private static void render(ScreenEvent.Render.Post event) {
        KitSelection selection = ClientSelection.kits();
        if (selection == null || !isInventory(event.getScreen())) return;
        var graphics = event.getGuiGraphics();
        Screen screen = event.getScreen();
        var font = Minecraft.getInstance().font;
        int center = selection.bounds.getX() + selection.bounds.getWidth() / 2;
        int titleY = Math.max(2, selection.bounds.getY() - 13);
        graphics.pose().pushPose();
        graphics.pose().translate(0, 0, 500);
        if (titleY >= 16) graphics.drawCenteredString(font, Component.translatable("screen.kingdomsheritage.kit"), center, titleY - 12, 0xffffff);
        JsonObject choice = selection.choices.get(selection.index);
        var title = Component.literal(choice.get("title").getAsString()
                + " (" + (selection.index + 1) + "/" + selection.choices.size() + ")");
        graphics.drawCenteredString(font, font.plainSubstrByWidth(title.getString(), Math.min(screen.width - 24, selection.bounds.getWidth() + 60)), center, titleY, 0xffffff);
        String description = selection.problem.isEmpty() ? choice.get("description").getAsString() : selection.problem;
        var lines = font.split(Component.literal(description), screen.width - 16);
        boolean showDescription = selection.descriptionY + font.lineHeight < screen.height;
        if (showDescription && !lines.isEmpty()) graphics.drawCenteredString(font, lines.getFirst(), center,
                selection.descriptionY, selection.problem.isEmpty() ? 0xffcccccc : 0xffffaaaa);
        boolean overTitle = event.getMouseY() >= titleY && event.getMouseY() < titleY + font.lineHeight;
        boolean overDescription = showDescription && event.getMouseY() >= selection.descriptionY
                && event.getMouseY() < selection.descriptionY + font.lineHeight;
        if ((overTitle || overDescription) && !description.isEmpty()) {
            graphics.renderTooltip(font, font.split(Component.literal(description), Math.min(300, screen.width - 20)),
                    event.getMouseX(), event.getMouseY());
        }
        graphics.pose().popPose();
    }

    private static void hideCrafting(net.neoforged.neoforge.client.event.ContainerScreenEvent.Render.Foreground event) {
        if (ClientSelection.kits() == null || !isInventory(event.getContainerScreen())
                || event.getContainerScreen().getClass().getName().startsWith("io.wispforest.accessories.")) return;
        boolean crafting = event.getContainerScreen().getMenu().slots.stream().anyMatch(slot ->
                slot.container instanceof net.minecraft.world.inventory.CraftingContainer
                        || slot.container instanceof net.minecraft.world.inventory.ResultContainer);
        if (crafting) event.getGuiGraphics().fill(95, 4, 173, 78, 0xffc6c6c6);
    }

    private static void mouse(ScreenEvent.MouseButtonPressed.Pre event) {
        if (ClientSelection.kits() == null || !isInventory(event.getScreen())) return;
        boolean overControl = event.getScreen().children().stream().anyMatch(child ->
                child instanceof AbstractWidget widget && widget.active && widget.visible
                        && widget.isMouseOver(event.getMouseX(), event.getMouseY()));
        if (!overControl && net.neoforged.fml.ModList.get().isLoaded("accessories")) {
            overControl = AccessoriesControls.isControl(event.getScreen(), event.getMouseX(), event.getMouseY());
        }
        if (!overControl || event.getButton() != 0) event.setCanceled(true);
    }

    private static void key(ScreenEvent.KeyPressed.Pre event) {
        if (ClientSelection.kits() == null || !isInventory(event.getScreen())) return;
        int key = event.getKeyCode();
        if (key == GLFW.GLFW_KEY_ESCAPE || Minecraft.getInstance().options.keyInventory.matches(key, event.getScanCode())) {
            ClientSelection.back();
            event.setCanceled(true);
        } else if (key != GLFW.GLFW_KEY_TAB && key != GLFW.GLFW_KEY_ENTER && key != GLFW.GLFW_KEY_SPACE
                && key != GLFW.GLFW_KEY_LEFT && key != GLFW.GLFW_KEY_RIGHT && key != GLFW.GLFW_KEY_UP && key != GLFW.GLFW_KEY_DOWN) {
            event.setCanceled(true);
        }
    }
}

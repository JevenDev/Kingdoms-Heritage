package com.jvn.kingdomsheritage.client;

import com.google.gson.JsonObject;
import com.jvn.kingdomsheritage.HeritageConfig;
import com.jvn.kingdomsheritage.compat.EquipmentCompat;
import com.jvn.kingdomsheritage.data.DefinitionJson;
import com.jvn.kingdomsheritage.data.HeritageException;
import com.jvn.kingdomsheritage.data.KitDefinition;
import com.jvn.kingdomsheritage.data.KitLoadout;
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
import net.minecraft.util.Mth;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.neoforged.bus.api.EventPriority;
import net.neoforged.neoforge.client.event.ScreenEvent;
import net.neoforged.neoforge.common.NeoForge;
import net.neoforged.neoforge.network.PacketDistributor;
import org.lwjgl.glfw.GLFW;

public final class KitSelection {
    private static final int CONFIRMATION_DURATION = 550;
    private final KitConfirmationPreview confirmationPreview = new KitConfirmationPreview();
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
    private boolean confirming;
    private float confirmationFrom;
    private long confirmationStarted;
    private boolean capturingPreview;
    private Component problem = Component.empty();
    private Button previous;
    private Button next;
    private Button confirm;
    private Button back;
    private Button disconnect;
    private net.minecraft.client.renderer.Rect2i bounds;
    private int descriptionY;

    KitSelection(JsonObject catalog, String spawn) {
        this.catalog = catalog;
        this.spawn = spawn;
        choices = ClientSelection.allowedKits(catalog, spawn);
        player = Minecraft.getInstance().player;
        for (int slot = 0; slot < player.getInventory().getContainerSize(); slot++) original.add(player.getInventory().getItem(slot).copy());
        originalSelected = player.getInventory().selected;
        recipeBookOpen = Minecraft.getInstance().player.getRecipeBook().isOpen(net.minecraft.world.inventory.RecipeBookType.CRAFTING);
        equipment = EquipmentCompat.slots(player);
        originalEquipment = equipment.stream().map(slot -> slot.get().get().copy()).toList();
        select(0);
    }

    void retry() {
        submitted = false;
        updateButtons();
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
        confirming = false;
        confirmationFrom = 0;
        problem = DefinitionJson.message(choices.get(index), "problem", player.registryAccess());
        try {
            var kit = KitDefinition.parse(ResourceLocation.parse(choices.get(index).get("id").getAsString()), choices.get(index));
            stacks = kit.decode(player.registryAccess());
        } catch (IllegalArgumentException error) {
            stacks = List.of();
            problem = HeritageException.component(error);
        }
        preview();
        updateButtons();
    }

    void tick() {
        preview();
        updateButtons();
    }

    private void preview() {
        restore();
        if (!problem.getString().isEmpty()) return;
        var choice = choices.get(index);
        var policy = catalog.has("inventory_policy") ? HeritageConfig.InventoryPolicy.valueOf(
                catalog.get("inventory_policy").getAsString()) : HeritageConfig.InventoryPolicy.REPLACE;
        try {
            var kit = KitDefinition.parse(ResourceLocation.parse(choice.get("id").getAsString()), choice);
            KitLoadout.apply(player, kit, stacks, policy);
        } catch (IllegalArgumentException error) {
            problem = HeritageException.component(error);
        }
    }

    void close() {
        confirmationPreview.close();
        restore();
    }

    static boolean capturingPreview() {
        return ClientSelection.kits() != null && ClientSelection.kits().capturingPreview;
    }

    void restore() {
        for (int slot = 0; slot < original.size(); slot++) player.getInventory().setItem(slot, original.get(slot).copy());
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
        float progress = confirmationProgress();
        boolean reviewing = confirming || progress > 0;
        previous.visible = next.visible = !reviewing;
        previous.active = index > 0 && !submitted && !reviewing;
        next.active = index + 1 < choices.size() && !submitted && !reviewing;
        back.active = !submitted && (confirming ? progress > 0.65F : progress == 0);
        back.setMessage(Component.translatable(reviewing ? "screen.kingdomsheritage.choose_another" : "gui.back"));
        confirm.active = !submitted && problem.getString().isEmpty() && (confirming ? progress == 1 : progress == 0);
        confirm.setMessage(submitted ? ClientSelection.progress() : Component.translatable(
                reviewing ? "screen.kingdomsheritage.confirm_begin" : "screen.kingdomsheritage.next"));
        confirm.setTooltip(Tooltip.create(problem.getString().isEmpty() ? Component.translatable("screen.kingdomsheritage.policy."
                + (catalog.has("inventory_policy") ? catalog.get("inventory_policy").getAsString().toLowerCase(java.util.Locale.ROOT) : "replace"))
                : problem));
    }

    private void confirm() {
        if (submitted || !confirm.active || !problem.getString().isEmpty() || SelectionTransition.active()) return;
        if (!confirming) {
            confirmationFrom = confirmationProgress();
            confirmationStarted = net.minecraft.Util.getMillis();
            confirming = true;
            updateButtons();
            Minecraft.getInstance().screen.setFocused(confirm);
            return;
        }
        submitted = true;
        updateButtons();
        var request = new HeritageNetwork.Choose(spawn, kitId(), catalog.get("revision").getAsLong());
        SelectionTransition.fadeOut(() -> PacketDistributor.sendToServer(request));
    }

    private void back() {
        if (submitted || SelectionTransition.active()) return;
        if (!confirming) {
            if (confirmationProgress() == 0) ClientSelection.back();
            return;
        }
        confirmationFrom = confirmationProgress();
        confirmationStarted = net.minecraft.Util.getMillis();
        confirming = false;
        updateButtons();
        Minecraft.getInstance().screen.setFocused(confirm);
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
        selection.previous = SelectionControls.arrow(8, 8, false, Component.translatable("screen.kingdomsheritage.previous_kit"),
                button -> selection.select(selection.index - 1));
        selection.next = SelectionControls.arrow(screen.width - 28, 8, true, Component.translatable("screen.kingdomsheritage.next_kit"),
                button -> selection.select(selection.index + 1));
        selection.back = new SelectionControls.SoundButton(8, screen.height - 27, 70, 20,
                Component.translatable("gui.back"), button -> selection.back());
        selection.confirm = new SelectionControls.SoundButton(screen.width - 108, screen.height - 27, 100, 20,
                Component.translatable("screen.kingdomsheritage.next"), button -> selection.confirm());
        selection.disconnect = SelectionControls.disconnect(screen.height);
        event.addListener(selection.disconnect);
        event.addListener(selection.previous);
        event.addListener(selection.next);
        event.addListener(selection.back);
        event.addListener(selection.confirm);
        selection.updateButtons();
        selection.positionControls(screen);
    }

    private static void layout(ScreenEvent.Render.Pre event) {
        KitSelection selection = ClientSelection.kits();
        if (selection == null || !isInventory(event.getScreen())) return;
        selection.positionControls(event.getScreen());
        if (selection.confirming || selection.confirmationProgress() > 0) {
            selection.renderConfirmation(event);
            event.setCanceled(true);
        }
    }

    private void positionControls(Screen screen) {
        var container = (AbstractContainerScreen<?>) screen;
        bounds = net.neoforged.fml.ModList.get().isLoaded("accessories") ? AccessoriesControls.inventoryBounds(screen) : null;
        if (bounds == null) {
            int left = container.getGuiLeft();
            int right = left + container.getXSize();
            for (var slot : container.getMenu().slots) {
                if (slot.isActive() && !(slot.container instanceof net.minecraft.world.inventory.CraftingContainer)
                        && !(slot.container instanceof net.minecraft.world.inventory.ResultContainer)) {
                    left = Math.min(left, container.getGuiLeft() + slot.x - 8);
                    right = Math.max(right, container.getGuiLeft() + slot.x + 24);
                }
            }
            bounds = new net.minecraft.client.renderer.Rect2i(left, container.getGuiTop(), right - left, container.getYSize());
        }
        int middle = bounds.getY() + (bounds.getHeight() - previous.getHeight()) / 2;
        previous.setPosition(Math.max(4, bounds.getX() - previous.getWidth() - 10), middle);
        next.setPosition(Math.min(screen.width - next.getWidth() - 4, bounds.getX() + bounds.getWidth() + 10), middle);
        int center = bounds.getX() + bounds.getWidth() / 2;
        int bottom = Math.min(screen.height - 24, bounds.getY() + bounds.getHeight() + 6);
        int buttonWidth = Math.min(100, (bounds.getWidth() - 4) / 2);
        back.setWidth(buttonWidth);
        confirm.setWidth(buttonWidth);
        back.setPosition(center - buttonWidth - 2, bottom);
        confirm.setPosition(center + 2, bottom);
        descriptionY = bottom + 25;
        float progress = confirmationProgress();
        if (confirming || progress > 0) {
            int x = confirmationLeft(screen) + Math.round((1 - progress) * 12);
            int textHeight = confirmationTextHeight(screen);
            int y = (screen.height - textHeight - 64) / 2 + textHeight + 18;
            buttonWidth = Math.min(150, confirmationTextWidth(screen));
            confirm.setWidth(buttonWidth);
            back.setWidth(buttonWidth);
            confirm.setPosition(x, y);
            back.setPosition(x, y + 24);
            float alpha = Mth.clamp((progress - 0.3F) / 0.7F, 0, 1);
            confirm.setAlpha(alpha);
            back.setAlpha(alpha);
        } else {
            confirm.setAlpha(1);
            back.setAlpha(1);
        }
    }

    private float confirmationProgress() {
        float elapsed = Mth.clamp((net.minecraft.Util.getMillis() - confirmationStarted) / (float) CONFIRMATION_DURATION, 0, 1);
        float eased = 1 - (1 - elapsed) * (1 - elapsed) * (1 - elapsed);
        return Mth.lerp(eased, confirmationFrom, confirming ? 1 : 0);
    }

    private float confirmationScale(Screen screen) {
        return Math.max(0.1F, Math.min(1, Math.min((screen.width - 32F) / (bounds.getWidth() + 216),
                (screen.height - 96F) / bounds.getHeight())));
    }

    private int confirmationLeft(Screen screen) {
        float scale = confirmationScale(screen);
        return Math.round((screen.width - (bounds.getWidth() + 216) * scale) / 2 + (bounds.getWidth() + 24) * scale);
    }

    private int confirmationTextWidth(Screen screen) {
        return Math.max(1, Math.round(192 * confirmationScale(screen)));
    }

    private int confirmationTextHeight(Screen screen) {
        var font = Minecraft.getInstance().font;
        int width = confirmationTextWidth(screen);
        return (font.split(Component.translatable("screen.kingdomsheritage.confirm_choice"), width).size()
                + Math.min(2, font.split(DefinitionJson.component(choices.get(index), "title"), width).size())) * font.lineHeight;
    }

    private void renderConfirmation(ScreenEvent.Render.Pre event) {
        var graphics = event.getGuiGraphics();
        Screen screen = event.getScreen();
        var font = Minecraft.getInstance().font;
        long now = net.minecraft.Util.getMillis();
        float progress = confirmationProgress();
        SelectionBackground.render(graphics, screen.width, screen.height);
        float targetScale = confirmationScale(screen);
        float scale = Mth.lerp(progress, 1, targetScale);
        float phase = (now % 20000L) / 20000F * Mth.TWO_PI;
        float left = (screen.width - (bounds.getWidth() + 216) * targetScale) / 2;
        float x = Mth.lerp(progress, bounds.getX(), left);
        float y = Mth.lerp(progress, bounds.getY(), (screen.height - bounds.getHeight() * targetScale) / 2)
                - Mth.sin(phase * 5) * 2.5F * progress * scale;
        float tilt = Mth.sin(phase * 4) * 0.35F * progress;
        confirmationPreview.render(graphics, bounds, x, y, scale, tilt, () -> {
            List<Button> buttons = List.of(previous, next, back, confirm, disconnect);
            var visible = buttons.stream().map(button -> button.visible).toList();
            capturingPreview = true;
            try {
                for (Button button : buttons) button.visible = false;
                screen.render(graphics, bounds.getX() + 50, bounds.getY() + 43, event.getPartialTick());
            } finally {
                capturingPreview = false;
                for (int i = 0; i < buttons.size(); i++) buttons.get(i).visible = visible.get(i);
            }
        });
        graphics.pose().pushPose();
        graphics.pose().translate(0, 0, 500);
        if (progress < 1) {
            int opacity = Math.max(4, Math.round((1 - progress) * 255)) << 24;
            int center = bounds.getX() + bounds.getWidth() / 2;
            int titleY = Math.max(2, bounds.getY() - 13);
            if (titleY >= 16) graphics.drawCenteredString(font, Component.translatable("screen.kingdomsheritage.kit"), center, titleY - 12, opacity | 0xffffff);
            var title = DefinitionJson.component(choices.get(index), "title").copy();
            title.append(" (" + (index + 1) + "/" + choices.size() + ")");
            graphics.drawCenteredString(font, font.plainSubstrByWidth(title.getString(), Math.min(screen.width - 24, bounds.getWidth() + 60)),
                    center, titleY, opacity | 0xffffff);
        }
        float alpha = Mth.clamp((progress - 0.3F) / 0.7F, 0, 1);
        if (alpha > 0) {
            int textX = confirmationLeft(screen) + Math.round((1 - progress) * 12);
            int textY = (screen.height - confirmationTextHeight(screen) - 64) / 2;
            int opacity = Math.max(4, Math.round(alpha * 255)) << 24;
            for (var line : font.split(Component.translatable("screen.kingdomsheritage.confirm_choice"), confirmationTextWidth(screen))) {
                graphics.drawString(font, line, textX, textY, opacity | 0xffffff);
                textY += font.lineHeight;
            }
            textY += 6;
            var names = font.split(DefinitionJson.component(choices.get(index), "title"), confirmationTextWidth(screen));
            for (var line : names.subList(0, Math.min(2, names.size()))) {
                graphics.drawString(font, line, textX, textY, opacity | 0xf2cd83);
                textY += font.lineHeight;
            }
        }
        confirm.render(graphics, event.getMouseX(), event.getMouseY(), event.getPartialTick());
        back.render(graphics, event.getMouseX(), event.getMouseY(), event.getPartialTick());
        disconnect.render(graphics, event.getMouseX(), event.getMouseY(), event.getPartialTick());
        if (!error().getString().isEmpty()) {
            var lines = font.split(error(), screen.width - 20);
            for (int i = 0; i < Math.min(2, lines.size()); i++) {
                graphics.drawCenteredString(font, lines.get(i), screen.width / 2, screen.height - 51 + i * font.lineHeight, 0xffaaaa);
            }
        }
        boolean keyboard = Minecraft.getInstance().getLastInputType().isKeyboard();
        if (disconnect.isHovered() || keyboard && disconnect.isFocused()) {
            graphics.renderTooltip(font, disconnect.getMessage(), disconnect.isHovered() ? event.getMouseX() : disconnect.getX() + disconnect.getWidth() / 2,
                    disconnect.isHovered() ? event.getMouseY() : disconnect.getY() + disconnect.getHeight());
        }
        if (confirm.isHovered() || keyboard && confirm.isFocused()) {
            var message = problem.getString().isEmpty() ? Component.translatable("screen.kingdomsheritage.policy."
                    + (catalog.has("inventory_policy") ? catalog.get("inventory_policy").getAsString().toLowerCase(java.util.Locale.ROOT) : "replace")) : problem;
            graphics.renderTooltip(font, font.split(message, Math.min(300, screen.width - 20)),
                    confirm.isHovered() ? event.getMouseX() : confirm.getX() + confirm.getWidth() / 2,
                    confirm.isHovered() ? event.getMouseY() : confirm.getY() + confirm.getHeight());
        }
        graphics.flush();
        graphics.pose().popPose();
    }

    private static void render(ScreenEvent.Render.Post event) {
        KitSelection selection = ClientSelection.kits();
        if (selection == null || !isInventory(event.getScreen()) || selection.confirming || selection.confirmationProgress() > 0) return;
        var graphics = event.getGuiGraphics();
        Screen screen = event.getScreen();
        var font = Minecraft.getInstance().font;
        int center = selection.bounds.getX() + selection.bounds.getWidth() / 2;
        int titleY = Math.max(2, selection.bounds.getY() - 13);
        graphics.pose().pushPose();
        graphics.pose().translate(0, 0, 500);
        if (titleY >= 16) graphics.drawCenteredString(font, Component.translatable("screen.kingdomsheritage.kit"), center, titleY - 12, 0xffffff);
        JsonObject choice = selection.choices.get(selection.index);
        var title = DefinitionJson.component(choice, "title").copy();
        title.append(" (" + (selection.index + 1) + "/" + selection.choices.size() + ")");
        graphics.drawCenteredString(font, font.plainSubstrByWidth(title.getString(), Math.min(screen.width - 24, selection.bounds.getWidth() + 60)), center, titleY, 0xffffff);
        boolean hasError = !selection.problem.getString().isEmpty() || !selection.error().getString().isEmpty();
        Component detail = !selection.problem.getString().isEmpty() ? selection.problem
                : !selection.error().getString().isEmpty()
                ? selection.error()
                : DefinitionJson.component(choice, "description");
        String description = detail.getString();
        var lines = font.split(Component.literal(description), screen.width - 16);
        boolean showDescription = selection.descriptionY + font.lineHeight < screen.height;
        if (showDescription && !lines.isEmpty()) graphics.drawCenteredString(font, lines.getFirst(), center,
                selection.descriptionY, hasError ? 0xffffaaaa : 0xffcccccc);
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
        if (SelectionTransition.active()) return;
        if (ClientSelection.kits() == null || !isInventory(event.getScreen())) return;
        KitSelection selection = ClientSelection.kits();
        if (selection.confirming || selection.confirmationProgress() > 0) {
            boolean overControl = List.of(selection.confirm, selection.back, selection.disconnect).stream().anyMatch(button ->
                    button.active && button.visible && button.isMouseOver(event.getMouseX(), event.getMouseY()));
            if (!overControl || event.getButton() != 0) event.setCanceled(true);
            return;
        }
        boolean overControl = event.getScreen().children().stream().anyMatch(child ->
                child instanceof AbstractWidget widget && widget.active && widget.visible
                        && widget.isMouseOver(event.getMouseX(), event.getMouseY()));
        if (!overControl && net.neoforged.fml.ModList.get().isLoaded("accessories")) {
            overControl = AccessoriesControls.isControl(event.getScreen(), event.getMouseX(), event.getMouseY());
        }
        if (!overControl || event.getButton() != 0) event.setCanceled(true);
    }

    private static void key(ScreenEvent.KeyPressed.Pre event) {
        if (SelectionTransition.active()) return;
        if (ClientSelection.kits() == null || !isInventory(event.getScreen())) return;
        int key = event.getKeyCode();
        if (key == GLFW.GLFW_KEY_ESCAPE || Minecraft.getInstance().options.keyInventory.matches(key, event.getScanCode())) {
            if (!ClientSelection.kits().submitted) {
                SelectionSounds.CLICK.play();
                ClientSelection.kits().back();
            }
            event.setCanceled(true);
        } else if (ClientSelection.kits().confirming || ClientSelection.kits().confirmationProgress() > 0) {
            KitSelection selection = ClientSelection.kits();
            if (selection.confirming && selection.confirmationProgress() == 1) {
                var buttons = List.of(selection.confirm, selection.back, selection.disconnect);
                if (key == GLFW.GLFW_KEY_TAB || key == GLFW.GLFW_KEY_LEFT || key == GLFW.GLFW_KEY_RIGHT
                        || key == GLFW.GLFW_KEY_UP || key == GLFW.GLFW_KEY_DOWN) {
                    int direction = key == GLFW.GLFW_KEY_LEFT || key == GLFW.GLFW_KEY_UP
                            || key == GLFW.GLFW_KEY_TAB && (event.getModifiers() & GLFW.GLFW_MOD_SHIFT) != 0 ? -1 : 1;
                    int current = buttons.indexOf(event.getScreen().getFocused());
                    event.getScreen().setFocused(buttons.get(Math.floorMod(current + direction, buttons.size())));
                } else if (key == GLFW.GLFW_KEY_ENTER || key == GLFW.GLFW_KEY_SPACE) {
                    for (Button button : buttons) if (event.getScreen().getFocused() == button && button.active) {
                        button.keyPressed(key, event.getScanCode(), event.getModifiers());
                        break;
                    }
                }
            }
            event.setCanceled(true);
        } else if (key != GLFW.GLFW_KEY_TAB && key != GLFW.GLFW_KEY_ENTER && key != GLFW.GLFW_KEY_SPACE
                && key != GLFW.GLFW_KEY_LEFT && key != GLFW.GLFW_KEY_RIGHT && key != GLFW.GLFW_KEY_UP && key != GLFW.GLFW_KEY_DOWN) {
            event.setCanceled(true);
        }
    }
}

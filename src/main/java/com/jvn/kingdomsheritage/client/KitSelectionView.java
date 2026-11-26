package com.jvn.kingdomsheritage.client;

import com.google.gson.JsonObject;
import com.jvn.kingdomsheritage.compat.EquipmentCompat;
import com.jvn.kingdomsheritage.data.DefinitionJson;
import com.jvn.kingdomsheritage.data.KitStats;
import com.jvn.kingdomsheritage.mixin.InventoryButtonAction;
import com.jvn.kingdomsheritage.mixin.InventoryButtonSprites;
import java.util.List;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.ImageButton;
import net.minecraft.client.gui.components.Tooltip;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.inventory.AbstractContainerScreen;
import net.minecraft.client.gui.screens.inventory.InventoryScreen;
import net.minecraft.client.gui.screens.recipebook.RecipeBookComponent;
import net.minecraft.client.renderer.Rect2i;
import net.minecraft.network.chat.Component;
import net.minecraft.util.Mth;
import net.neoforged.bus.api.EventPriority;
import net.neoforged.fml.ModList;
import net.neoforged.neoforge.client.event.ScreenEvent;
import net.neoforged.neoforge.common.NeoForge;
import org.lwjgl.glfw.GLFW;

final class KitSelectionView {
    private static final int CONFIRMATION_DURATION = 550;
    private static final int STAT_CLEARANCE = KitStatPanel.HEIGHT + 3;
    private final KitSelection model;
    private final KitConfirmationPreview confirmationPreview = new KitConfirmationPreview();
    private final KitCarousel carousel = new KitCarousel();
    private boolean confirming;
    private float confirmationFrom;
    private long confirmationStarted;
    private float frameConfirmation;
    private boolean capturingPreview;
    private float previewLook = 1;
    private float previewYaw = Float.NaN;
    private float previewPitch = Float.NaN;
    private float previewYawFrom;
    private float previewPitchFrom;
    private float previewMouseX;
    private float previewMouseY;
    private float previewResponse;
    private long previewRenderedAt;
    private Button previous;
    private Button next;
    private Button confirm;
    private Button back;
    private Button disconnect;
    private Button cosmeticSwitch;
    private AbstractContainerScreen<?> cosmeticInventory;
    private boolean cosmeticLayout = true;
    private Rect2i bounds;
    private Rect2i purseBounds;
    private int descriptionY;
    private KitStats.Preview stats;
    private int statsX;
    private int statsY;

    KitSelectionView(KitSelection model) {
        this.model = model;
    }

    private static KitSelectionView current() {
        var selection = ClientSelection.kits();
        return selection == null ? null : selection.view();
    }

    void reset() {
        confirming = false;
        confirmationFrom = 0;
        carousel.select(model.index(), net.minecraft.Util.getMillis());
    }

    void close() {
        confirmationPreview.close();
        carousel.close();
    }

    static void register() {
        NeoForge.EVENT_BUS.addListener(EventPriority.LOWEST, KitSelectionView::init);
        NeoForge.EVENT_BUS.addListener(EventPriority.HIGHEST, KitSelectionView::mouse);
        NeoForge.EVENT_BUS.addListener(EventPriority.HIGHEST, KitSelectionView::key);
        NeoForge.EVENT_BUS.addListener(EventPriority.HIGHEST, KitSelectionView::scroll);
    }

    static boolean isInventory(Screen screen) {
        if (screen instanceof InventoryScreen) return true;
        if (!(screen instanceof AbstractContainerScreen<?>)) return false;
        return KitSelection.isEquipmentClass(screen.getClass());
    }

    static boolean isLayoutPicker(Screen screen) {
        return screen != null && screen.getClass().getName().equals("io.wispforest.accessories.client.gui.ScreenVariantSelectionScreen");
    }

    static boolean capturingPreview() {
        return current() != null && current().capturingPreview;
    }

    static float previewAngle(net.minecraft.world.entity.LivingEntity entity, float angle, float center, boolean horizontal) {
        KitSelectionView view = current();
        if (view == null || entity != view.model.player() || !isInventory(Minecraft.getInstance().screen)) return angle;
        if (view.previewLook == 0) return 0;
        float mouse = horizontal ? view.previewMouseX : view.previewMouseY;
        float target = (float) Math.atan((center - mouse) / 40);
        if (view.capturingPreview) target *= 1 - view.frameConfirmation;
        float previous = horizontal ? view.previewYawFrom : view.previewPitchFrom;
        float current = Float.isNaN(previous) ? target : Mth.lerp(view.previewResponse, previous, target);
        if (horizontal) view.previewYaw = current;
        else view.previewPitch = current;
        return current * view.previewLook;
    }

    void updateButtons() {
        updateButtons(confirmationProgress());
    }

    private void updateButtons(float progress) {
        if (confirm == null) return;
        boolean reviewing = confirming || progress > 0;
        previous.visible = next.visible = progress < 1;
        previous.active = !reviewing && canSelectKit(model.index() - 1);
        next.active = !reviewing && canSelectKit(model.index() + 1);
        previous.setAlpha(1 - progress);
        next.setAlpha(1 - progress);
        back.active = !model.submitted() && (confirming ? progress > 0.65F : progress == 0);
        back.setMessage(Component.translatable(reviewing ? "screen.kingdomsheritage.choose_another" : "gui.back"));
        confirm.active = !model.submitted() && model.problem().getString().isEmpty()
                && !carousel.moving(net.minecraft.Util.getMillis()) && (confirming ? progress == 1 : progress == 0);
        String confirmKey = reviewing ? "screen.kingdomsheritage.confirm_begin"
                : model.hasShop() ? "screen.kingdomsheritage.shop.open" : "screen.kingdomsheritage.next";
        confirm.setMessage(model.submitted() ? ClientSelection.progress() : Component.translatable(confirmKey));
        confirm.setTooltip(Tooltip.create(model.policyHint()));
        if (cosmeticSwitch != null) {
            cosmeticSwitch.visible = model.showsCosmeticArmor() && !reviewing;
            cosmeticSwitch.active = cosmeticSwitch.visible && !model.submitted() && !carousel.moving(net.minecraft.Util.getMillis());
            var screen = Minecraft.getInstance().screen;
            if (!cosmeticSwitch.visible && screen != null && screen.getFocused() == cosmeticSwitch) screen.setFocused(null);
        }
    }

    private boolean canSelectKit(int index) {
        return !model.submitted() && index >= 0 && index < model.choices().size();
    }

    private void confirm() {
        if (model.submitted() || !confirm.active || !model.problem().getString().isEmpty() || SelectionTransition.active()) return;
        if (!confirming) {
            if (model.hasShop()) {
                model.openShop();
                return;
            }
            confirmationFrom = confirmationProgress();
            confirmationStarted = net.minecraft.Util.getMillis();
            confirming = true;
            updateButtons();
            Minecraft.getInstance().screen.setFocused(confirm);
            return;
        }
        model.submit(List.of());
    }

    private void back() {
        if (model.submitted() || SelectionTransition.active()) return;
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
        Screen screen = event.getScreen();
        if (!KitSelection.isPreviewInventory(screen)) return;
        KitSelectionView view = current();
        view.carousel.close();
        view.cosmeticInventory = null;
        view.cosmeticSwitch = null;
        boolean equipment = !view.model.modelPreview();
        boolean accessories = equipment && ModList.get().isLoaded("accessories");
        for (var child : List.copyOf(screen.children())) {
            if (!equipment || !isEquipmentControl(screen, child, accessories)) {
                if (screen.getFocused() == child) screen.setFocused(null);
                event.removeListener(child);
            }
        }
        screen.renderables.removeIf(renderable -> !equipment || !isEquipmentControl(screen, renderable, accessories));
        if (accessories) AccessoriesControls.hideCrafting(screen);
        view.previous = SelectionControls.arrow(8, 8, false, Component.translatable("screen.kingdomsheritage.previous_kit"),
                button -> view.model.select(view.model.index() - 1), () -> view.canSelectKit(view.model.index() - 1));
        view.next = SelectionControls.arrow(screen.width - 28, 8, true, Component.translatable("screen.kingdomsheritage.next_kit"),
                button -> view.model.select(view.model.index() + 1), () -> view.canSelectKit(view.model.index() + 1));
        view.back = new SelectionControls.SoundButton(8, screen.height - 27, 70, 20,
                Component.translatable("gui.back"), button -> view.back());
        view.confirm = new SelectionControls.SoundButton(screen.width - 108, screen.height - 27, 100, 20,
                Component.translatable("screen.kingdomsheritage.next"), button -> view.confirm());
        view.disconnect = SelectionControls.disconnect(screen.height);
        event.addListener(view.disconnect);
        event.addListener(view.previous);
        event.addListener(view.next);
        event.addListener(view.back);
        event.addListener(view.confirm);
        if (equipment && screen instanceof InventoryScreen inventory && ModList.get().isLoaded(EquipmentCompat.COSMETIC_ARMOR)) {
            view.cosmeticSwitch = CosmeticArmorKitPreview.switchButton(inventory, view.cosmeticLayout, button -> {
                view.cosmeticLayout = !view.cosmeticLayout;
                button.setMessage(CosmeticArmorKitPreview.switchLabel(view.cosmeticLayout));
                view.carousel.close();
            });
            if (view.cosmeticSwitch != null) event.addListener(view.cosmeticSwitch);
        }
        view.updateButtons();
        view.stats = view.model.previewStats();
        view.positionControls(screen, view.confirmationProgress());
    }

    private static boolean isEquipmentControl(Screen screen, Object control, boolean accessories) {
        if (control instanceof RecipeBookComponent || control instanceof ImageButton button
                && ((InventoryButtonSprites) button).heritage$getSprites().equals(RecipeBookComponent.RECIPE_BUTTON_SPRITES)) return false;
        if (KitSelection.isEquipmentClass(control.getClass())) return true;
        // the original Accessories screen builds vanilla buttons with mod-owned actions
        if (control instanceof Button button) {
            var action = ((InventoryButtonAction) button).heritage$getOnPress();
            if (action != null && KitSelection.isEquipmentClass(action.getClass())) return true;
        }
        return accessories && AccessoriesControls.isScreenAdapter(screen, control);
    }

    void render(Screen screen, GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
        long now = net.minecraft.Util.getMillis();
        float delta = Mth.clamp((now - previewRenderedAt) / 1000F, 0, 0.05F);
        previewRenderedAt = now;
        previewYawFrom = previewYaw;
        previewPitchFrom = previewPitch;
        previewResponse = 1 - (float) Math.exp(-delta * 12);
        previewMouseX = mouseX;
        previewMouseY = mouseY;
        frameConfirmation = confirmationProgress();
        updateButtons(frameConfirmation);
        stats = model.previewStats();
        positionControls(screen, frameConfirmation);
        boolean blocksHover = ClientParty.blocksHover(mouseX, mouseY);
        int hoverX = blocksHover ? -10000 : mouseX;
        int hoverY = blocksHover ? -10000 : mouseY;
        if (confirming || frameConfirmation > 0) {
            renderConfirmation(screen, graphics, hoverX, hoverY, partialTick, frameConfirmation);
        } else {
            renderCarousel(screen, graphics, hoverX, hoverY, partialTick);
            renderDetails(screen, graphics, mouseX, mouseY);
        }
        boolean moving = carousel.moving(now);
        KitStatPanel.render(graphics, Minecraft.getInstance().font, stats, statsX, statsY,
                moving ? -10000 : hoverX, moving ? -10000 : hoverY);
        SelectionTransition.render(graphics);
        ClientParty.renderScreen(screen, graphics, mouseX, mouseY);
    }

    int firstPreview() {
        return carousel.first(net.minecraft.Util.getMillis(), model.choices().size());
    }

    int lastPreview() {
        return carousel.last(net.minecraft.Util.getMillis(), model.choices().size());
    }

    private void renderPreview(Screen screen, GuiGraphics graphics, int index, float look,
                               int mouseX, int mouseY, float partialTick, boolean tooltips) {
        capturingPreview = true;
        previewLook = look;
        try {
            model.renderNeighbor(index, () -> {
                try {
                    if (model.modelPreview()) {
                        InventoryScreen.renderEntityInInventoryFollowsAngle(graphics, bounds.getX(), bounds.getY(),
                                bounds.getX() + bounds.getWidth(), bounds.getY() + bounds.getHeight(),
                                modelSize(), 0.0625F, 0, 0, model.player());
                    } else {
                        renderInventory(screen, graphics, mouseX, mouseY, partialTick, tooltips, index == model.index());
                    }
                } finally {
                    graphics.flush();
                }
            });
        } finally {
            capturingPreview = false;
            previewLook = 1;
        }
    }

    private void renderInventory(Screen screen, GuiGraphics graphics, int mouseX, int mouseY, float partialTick,
                                 boolean tooltips, boolean selected) {
        List<Button> buttons = List.of(previous, next, back, confirm, disconnect);
        var visible = buttons.stream().map(button -> button.visible).toList();
        boolean showSwitch = cosmeticSwitch != null && cosmeticSwitch.visible;
        try {
            for (Button button : buttons) button.visible = false;
            if (cosmeticSwitch != null) cosmeticSwitch.visible = showSwitch && selected;
            var cosmeticArmor = KitPreview.cosmeticArmor();
            if (cosmeticLayout && cosmeticArmor != null && screen instanceof InventoryScreen inventory) {
                if (cosmeticInventory == null) cosmeticInventory = CosmeticArmorKitPreview.create(inventory, model.player());
                CosmeticArmorKitPreview.render(cosmeticInventory, graphics, cosmeticArmor, mouseX, mouseY, partialTick);
                for (var widget : screen.renderables) widget.render(graphics, mouseX, mouseY, partialTick);
            } else if (tooltips) screen.renderWithTooltip(graphics, mouseX, mouseY, partialTick);
            else screen.render(graphics, mouseX, mouseY, partialTick);
            if (net.neoforged.fml.ModList.get().isLoaded("accessories")) {
                AccessoriesControls.renderLayers(screen, graphics, tooltips ? mouseX : -10000, tooltips ? mouseY : -10000, partialTick);
            }
            if (purseBounds != null) {
                NumismaticKitPreview.render(graphics, Minecraft.getInstance().font, purseBounds, model.player(),
                        model.purseGrant(), tooltips ? mouseX : -10000, tooltips ? mouseY : -10000);
            }
        } finally {
            for (int i = 0; i < buttons.size(); i++) buttons.get(i).visible = visible.get(i);
            if (cosmeticSwitch != null) cosmeticSwitch.visible = showSwitch;
        }
    }

    private static void renderControlWithoutTooltip(Button button, net.minecraft.client.gui.GuiGraphics graphics,
                                                    int mouseX, int mouseY, float partialTick) {
        Tooltip tooltip = button.getTooltip();
        button.setTooltip(null);
        try {
            button.render(graphics, mouseX, mouseY, partialTick);
        } finally {
            button.setTooltip(tooltip);
        }
    }

    private void renderCarousel(Screen screen, GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
        SelectionBackground.render(graphics, screen.width, screen.height);
        long now = net.minecraft.Util.getMillis();
        boolean moving = carousel.moving(now);
        carousel.render(graphics, bounds, screen.width, model, mouseX, mouseY, now, 1, true,
                (index, look) -> renderPreview(screen, graphics, index, look,
                        index == model.index() && !moving ? mouseX : -10000,
                        index == model.index() && !moving ? mouseY : -10000, partialTick, true));
        for (Button button : List.of(previous, next, back, confirm, disconnect)) {
            if (button.visible) renderControlWithoutTooltip(button, graphics, mouseX, mouseY, partialTick);
        }
        boolean keyboard = Minecraft.getInstance().getLastInputType().isKeyboard();
        for (Button button : List.of(previous, next, back, confirm, disconnect)) {
            if (!ClientParty.blocksInput() && button.visible && (button.isHovered() || keyboard && button.isFocused())) {
                Component message = button == confirm ? model.policyHint() : button.getMessage();
                graphics.renderTooltip(Minecraft.getInstance().font,
                        Minecraft.getInstance().font.split(message, Math.min(300, screen.width - 20)),
                        button.isHovered() ? mouseX : button.getX() + button.getWidth() / 2,
                        button.isHovered() ? mouseY : button.getY() + button.getHeight());
                break;
            }
        }
    }

    private void positionControls(Screen screen, float progress) {
        var container = (AbstractContainerScreen<?>) screen;
        bounds = net.neoforged.fml.ModList.get().isLoaded("accessories") ? AccessoriesControls.inventoryBounds(screen) : null;
        if (bounds == null) {
            int left = container.getGuiLeft();
            int right = left + container.getXSize();
            for (var slot : container.getMenu().slots) {
                if (slot.isActive() && !KitSelection.isCraftingSlot(slot)) {
                    left = Math.min(left, container.getGuiLeft() + slot.x - 8);
                    right = Math.max(right, container.getGuiLeft() + slot.x + 24);
                }
            }
            bounds = new Rect2i(left, container.getGuiTop(), right - left, container.getYSize());
        }
        purseBounds = model.modelPreview() ? null : NumismaticKitPreview.bounds(screen);
        if (purseBounds != null) {
            int left = Math.min(bounds.getX(), Math.max(0, purseBounds.getX()));
            int top = Math.min(bounds.getY(), Math.max(0, purseBounds.getY()));
            int right = Math.max(bounds.getX() + bounds.getWidth(), Math.min(screen.width, purseBounds.getX() + purseBounds.getWidth()));
            int bottom = Math.max(bounds.getY() + bounds.getHeight(), Math.min(screen.height, purseBounds.getY() + purseBounds.getHeight()));
            bounds = new Rect2i(left, top, right - left, bottom - top);
        }
        int middle = bounds.getY() + (bounds.getHeight() - previous.getHeight()) / 2;
        int previousX = bounds.getX() - previous.getWidth() - 10;
        int previousY = middle;
        int tabBottom = bounds.getY() + model.shopTabHeight();
        if (bounds.getX() >= KitShopTabs.WIDTH && tabBottom > middle) {
            if (previousX - KitShopTabs.WIDTH >= 4) previousX -= KitShopTabs.WIDTH;
            else previousY = tabBottom + 4;
        }
        previous.setPosition(Math.max(4, previousX), previousY);
        positionStats(container, progress);
        next.setPosition(Math.min(screen.width - next.getWidth() - 4, bounds.getX() + bounds.getWidth() + 10), middle);
        int center = bounds.getX() + bounds.getWidth() / 2;
        int bottom = Math.min(screen.height - 24, bounds.getY() + bounds.getHeight() + 6);
        int buttonWidth = Math.min(100, (bounds.getWidth() - 4) / 2);
        back.setWidth(buttonWidth);
        confirm.setWidth(buttonWidth);
        back.setPosition(center - buttonWidth - 2, bottom);
        confirm.setPosition(center + 2, bottom);
        descriptionY = bottom + 25;
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

    private void positionStats(Screen screen, float progress) {
        float scale = Mth.lerp(progress, 1, confirmationScale(screen));
        float x = previewX(screen, progress);
        float y = previewY(screen, progress, scale);
        int width = KitStatPanel.width(Minecraft.getInstance().font, stats);
        statsX = Math.round(x + (bounds.getWidth() * scale - width) / 2F);
        statsY = Math.round(y) - STAT_CLEARANCE;
    }

    private float confirmationProgress() {
        float elapsed = Mth.clamp((net.minecraft.Util.getMillis() - confirmationStarted) / (float) CONFIRMATION_DURATION, 0, 1);
        float eased = 1 - (1 - elapsed) * (1 - elapsed) * (1 - elapsed);
        return Mth.lerp(eased, confirmationFrom, confirming ? 1 : 0);
    }

    private int modelSize() {
        return Math.max(1, bounds.getHeight() / 2);
    }

    private float confirmationScale(Screen screen) {
        return Math.max(0.1F, Math.min(1, Math.min((screen.width - 32F) / (bounds.getWidth() + 216),
                (screen.height - 96F) / bounds.getHeight())));
    }

    private float confirmationKitLeft(Screen screen, float scale) {
        return (screen.width - (bounds.getWidth() + 216) * scale) / 2;
    }

    private float previewX(Screen screen, float progress) {
        return Mth.lerp(progress, bounds.getX(), confirmationKitLeft(screen, confirmationScale(screen)));
    }

    private float previewY(Screen screen, float progress, float scale) {
        float phase = (net.minecraft.Util.getMillis() % 20000L) / 20000F * Mth.TWO_PI;
        return Mth.lerp(progress, bounds.getY(), (screen.height - bounds.getHeight() * confirmationScale(screen)) / 2)
                - Mth.sin(phase * 5) * 2.5F * progress * scale;
    }

    private int confirmationLeft(Screen screen) {
        float scale = confirmationScale(screen);
        return Math.round(confirmationKitLeft(screen, scale) + (bounds.getWidth() + 24) * scale);
    }

    private int confirmationTextWidth(Screen screen) {
        return Math.max(1, Math.round(192 * confirmationScale(screen)));
    }

    private int confirmationTextHeight(Screen screen) {
        var font = Minecraft.getInstance().font;
        int width = confirmationTextWidth(screen);
        return (font.split(Component.translatable("screen.kingdomsheritage.confirm_choice"), width).size()
                + Math.min(2, font.split(DefinitionJson.component(model.choices().get(model.index()), "title"), width).size())) * font.lineHeight;
    }

    private void renderConfirmation(Screen screen, GuiGraphics graphics, int mouseX, int mouseY, float partialTick, float progress) {
        var font = Minecraft.getInstance().font;
        long now = net.minecraft.Util.getMillis();
        SelectionBackground.render(graphics, screen.width, screen.height);
        carousel.render(graphics, bounds, screen.width, model, -10000, -10000, now, 1 - progress, false,
                (index, look) -> renderPreview(screen, graphics, index, look, -10000, -10000, partialTick, true));
        float targetScale = confirmationScale(screen);
        float scale = Mth.lerp(progress, 1, targetScale);
        float phase = (now % 20000L) / 20000F * Mth.TWO_PI;
        float x = previewX(screen, progress);
        float y = previewY(screen, progress, scale);
        float tilt = Mth.sin(phase * 4) * 0.35F * progress;
        confirmationPreview.render(graphics, bounds, x, y, scale, tilt,
                () -> renderPreview(screen, graphics, model.index(), 1, bounds.getX() + 50, bounds.getY() + 43, partialTick, false));
        graphics.pose().pushPose();
        graphics.pose().translate(0, 0, 500);
        if (progress < 1) {
            int opacity = Math.max(4, Math.round((1 - progress) * 255)) << 24;
            renderHeading(screen, graphics, opacity);
            renderControlWithoutTooltip(previous, graphics, -10000, -10000, partialTick);
            renderControlWithoutTooltip(next, graphics, -10000, -10000, partialTick);
        }
        float alpha = Mth.clamp((progress - 0.3F) / 0.7F, 0, 1);
        if (alpha > 0) {
            int textX = confirmationLeft(screen) + Math.round((1 - progress) * 12);
            int textY = (screen.height - confirmationTextHeight(screen) - 64) / 2;
            int opacity = Math.max(4, Math.round(alpha * 255)) << 24;
            for (var line : font.split(Component.translatable("screen.kingdomsheritage.confirm_choice"), confirmationTextWidth(screen))) {
                SelectionText.draw(graphics, font, line, textX, textY, opacity | 0xffffff);
                textY += font.lineHeight;
            }
            textY += 6;
            var names = font.split(DefinitionJson.component(model.choices().get(model.index()), "title"), confirmationTextWidth(screen));
            for (var line : names.subList(0, Math.min(2, names.size()))) {
                SelectionText.draw(graphics, font, line, textX, textY, opacity | 0xf2cd83);
                textY += font.lineHeight;
            }
        }
        renderControlWithoutTooltip(confirm, graphics, mouseX, mouseY, partialTick);
        renderControlWithoutTooltip(back, graphics, mouseX, mouseY, partialTick);
        renderControlWithoutTooltip(disconnect, graphics, mouseX, mouseY, partialTick);
        if (!model.error().getString().isEmpty()) {
            var lines = font.split(model.error(), screen.width - 20);
            for (int i = 0; i < Math.min(2, lines.size()); i++) {
                SelectionText.centered(graphics, font, lines.get(i), screen.width / 2, screen.height - 51 + i * font.lineHeight, 0xffaaaa);
            }
        }
        boolean keyboard = Minecraft.getInstance().getLastInputType().isKeyboard();
        if (!ClientParty.blocksInput() && (disconnect.isHovered() || keyboard && disconnect.isFocused())) {
            graphics.renderTooltip(font, disconnect.getMessage(), disconnect.isHovered() ? mouseX : disconnect.getX() + disconnect.getWidth() / 2,
                    disconnect.isHovered() ? mouseY : disconnect.getY() + disconnect.getHeight());
        }
        if (!ClientParty.blocksInput() && (confirm.isHovered() || keyboard && confirm.isFocused())) {
            var message = model.policyHint();
            graphics.renderTooltip(font, font.split(message, Math.min(300, screen.width - 20)),
                    confirm.isHovered() ? mouseX : confirm.getX() + confirm.getWidth() / 2,
                    confirm.isHovered() ? mouseY : confirm.getY() + confirm.getHeight());
        }
        graphics.flush();
        graphics.pose().popPose();
    }

    private int renderHeading(Screen screen, GuiGraphics graphics, int opacity) {
        var font = Minecraft.getInstance().font;
        int center = bounds.getX() + bounds.getWidth() / 2;
        var budget = model.shopBudgetLabel(model.index());
        var notice = model.policyNotice();
        boolean showNotice = !notice.getString().isEmpty();
        int noticeY = Math.max(2, bounds.getY() - STAT_CLEARANCE - font.lineHeight - 2);
        int titleY = showNotice ? Math.max(2, noticeY - font.lineHeight - 2) : noticeY;
        int budgetY = titleY - 11;
        int headingY = (budget == null ? titleY : budgetY) - 12;
        if (headingY >= 0) SelectionText.centered(graphics, font, Component.translatable("screen.kingdomsheritage.kit"), center, headingY, opacity | 0xffffff);
        var title = DefinitionJson.component(model.choices().get(model.index()), "title").copy();
        title.append(" (" + (model.index() + 1) + "/" + model.choices().size() + ")");
        SelectionText.centered(graphics, font, font.plainSubstrByWidth(title.getString(), Math.min(screen.width - 24, bounds.getWidth() + 60)),
                center, titleY, opacity | 0xffffff);
        if (showNotice) {
            int available = Math.max(1, 2 * Math.min(center, screen.width - center) - 16);
            float scale = Math.min(1F, (float) available / Math.max(1, font.width(notice)));
            graphics.pose().pushPose();
            graphics.pose().translate(center, Math.max(titleY + font.lineHeight, noticeY), 0);
            graphics.pose().scale(scale, scale, 1);
            SelectionText.centered(graphics, font, notice, 0, 0, opacity | 0xf2cd83);
            graphics.pose().popPose();
        }
        if (budget != null && budgetY >= 0) {
            var summary = budget.copy().withStyle(style -> style.withColor(0xf2cd83));
            if (model.hasIncludedGear()) {
                summary.append(Component.literal("  ·  ").withStyle(style -> style.withColor(0xcccccc)));
                summary.append(Component.translatable("screen.kingdomsheritage.shop.included_gear")
                        .withStyle(style -> style.withColor(0xcccccc)));
            }
            var summaryLines = font.split(summary, Math.max(1, screen.width - 16));
            if (!summaryLines.isEmpty()) {
                SelectionText.centered(graphics, font, summaryLines.getFirst(), center, budgetY, opacity | 0xffffff);
            }
        }
        return titleY;
    }

    private void renderDetails(Screen screen, GuiGraphics graphics, int mouseX, int mouseY) {
        var font = Minecraft.getInstance().font;
        int center = bounds.getX() + bounds.getWidth() / 2;
        graphics.pose().pushPose();
        graphics.pose().translate(0, 0, 500);
        int titleY = renderHeading(screen, graphics, 0xff000000);
        JsonObject choice = model.choices().get(model.index());
        boolean hasError = !model.problem().getString().isEmpty() || !model.error().getString().isEmpty();
        Component detail = !model.problem().getString().isEmpty() ? model.problem()
                : !model.error().getString().isEmpty()
                ? model.error()
                : DefinitionJson.component(choice, "description");
        String description = detail.getString();
        var lines = font.split(Component.literal(description), screen.width - 16);
        boolean showDescription = descriptionY + font.lineHeight < screen.height;
        if (showDescription && !lines.isEmpty()) SelectionText.centered(graphics, font, lines.getFirst(), center,
                descriptionY, hasError ? 0xffffaaaa : 0xffcccccc);
        boolean overTitle = mouseY >= titleY && mouseY < titleY + font.lineHeight;
        boolean overDescription = showDescription && mouseY >= descriptionY && mouseY < descriptionY + font.lineHeight;
        if (!ClientParty.blocksInput() && (overTitle || overDescription) && !description.isEmpty()) {
            graphics.renderTooltip(font, font.split(Component.literal(description), Math.min(300, screen.width - 20)),
                    mouseX, mouseY);
        }
        graphics.pose().popPose();
    }

    private static void mouse(ScreenEvent.MouseButtonPressed.Pre event) {
        if (SelectionTransition.active()) return;
        if (current() == null || !isInventory(event.getScreen())) return;
        if (ClientParty.blocksInput()) { event.setCanceled(true); return; }
        KitSelectionView view = current();
        boolean overNavigation = List.of(view.previous, view.next, view.confirm, view.back, view.disconnect).stream()
                .anyMatch(button -> button.active && button.visible && button.isMouseOver(event.getMouseX(), event.getMouseY()));
        if (!overNavigation && view.stats != null && event.getMouseX() >= view.statsX && event.getMouseY() >= view.statsY
                && event.getMouseX() < view.statsX + KitStatPanel.width(Minecraft.getInstance().font, view.stats)
                && event.getMouseY() < view.statsY + KitStatPanel.HEIGHT) {
            event.setCanceled(true);
            return;
        }
        if (!view.confirming && view.frameConfirmation == 0 && !view.model.submitted() && !overNavigation && event.getButton() == 0) {
            int index = view.carousel.hit(view.bounds, event.getScreen().width, view.model.choices().size(),
                    event.getMouseX(), event.getMouseY(), net.minecraft.Util.getMillis());
            if (index >= 0) {
                SelectionSounds.CLICK.play();
                view.model.select(index);
                event.setCanceled(true);
                return;
            }
        }
        if (view.confirming || view.frameConfirmation > 0 || view.carousel.moving(net.minecraft.Util.getMillis())) {
            var controls = view.confirming || view.frameConfirmation > 0 ? List.of(view.confirm, view.back, view.disconnect)
                    : List.of(view.previous, view.next, view.confirm, view.back, view.disconnect);
            boolean overControl = controls.stream().anyMatch(button ->
                    button.active && button.visible && button.isMouseOver(event.getMouseX(), event.getMouseY()));
            if (!overControl || event.getButton() != 0) event.setCanceled(true);
            return;
        }
        if (view.model.modelPreview()) {
            if (!overNavigation || event.getButton() != 0) event.setCanceled(true);
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

    private static void scroll(ScreenEvent.MouseScrolled.Pre event) {
        KitSelectionView view = current();
        if (view == null || !isInventory(event.getScreen()) || event.getScrollDeltaY() == 0) return;
        event.setCanceled(true);
        if (ClientParty.blocksInput()) return;
        if (SelectionTransition.active() || view.model.submitted() || view.confirming || view.frameConfirmation > 0) return;
        int index = view.carousel.scroll(event.getScrollDeltaY(), view.model.choices().size());
        if (index != view.model.index()) {
            SelectionSounds.CLICK.play();
            view.model.select(index);
        }
    }

    private static void key(ScreenEvent.KeyPressed.Pre event) {
        if (SelectionTransition.active()) return;
        if (current() == null || !isInventory(event.getScreen())) return;
        if (ClientParty.blocksInput()) { event.setCanceled(true); return; }
        int key = event.getKeyCode();
        if (key == GLFW.GLFW_KEY_ESCAPE || Minecraft.getInstance().options.keyInventory.matches(key, event.getScanCode())) {
            if (!current().model.submitted()) {
                SelectionSounds.CLICK.play();
                current().back();
            }
            event.setCanceled(true);
        } else if (!current().confirming && current().frameConfirmation == 0
                && (key == GLFW.GLFW_KEY_LEFT || key == GLFW.GLFW_KEY_RIGHT)) {
            KitSelectionView view = current();
            int index = view.model.index() + (key == GLFW.GLFW_KEY_LEFT ? -1 : 1);
            if (!view.model.submitted() && index >= 0 && index < view.model.choices().size()) {
                SelectionSounds.CLICK.play();
                view.model.select(index);
            }
            event.setCanceled(true);
        } else if (current().confirming || current().frameConfirmation > 0) {
            KitSelectionView view = current();
            if (view.confirming && view.frameConfirmation == 1) {
                var buttons = List.of(view.confirm, view.back, view.disconnect);
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
        } else if (current().carousel.moving(net.minecraft.Util.getMillis())
                && (key == GLFW.GLFW_KEY_ENTER || key == GLFW.GLFW_KEY_SPACE)) {
            KitSelectionView view = current();
            for (Button button : List.of(view.previous, view.next, view.confirm, view.back, view.disconnect)) {
                if (event.getScreen().getFocused() == button && button.active) {
                    button.keyPressed(key, event.getScanCode(), event.getModifiers());
                    break;
                }
            }
            event.setCanceled(true);
        } else if (key != GLFW.GLFW_KEY_TAB && key != GLFW.GLFW_KEY_ENTER && key != GLFW.GLFW_KEY_SPACE
                && key != GLFW.GLFW_KEY_LEFT && key != GLFW.GLFW_KEY_RIGHT && key != GLFW.GLFW_KEY_UP && key != GLFW.GLFW_KEY_DOWN) {
            event.setCanceled(true);
        }
    }
}

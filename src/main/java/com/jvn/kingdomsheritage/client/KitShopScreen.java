package com.jvn.kingdomsheritage.client;

import com.jvn.kingdomsheritage.HeritageConfig.InventoryPolicy;
import com.jvn.kingdomsheritage.data.DefinitionJson;
import com.jvn.kingdomsheritage.data.HeritageException;
import com.jvn.kingdomsheritage.data.KitDefinition;
import com.jvn.kingdomsheritage.data.KitShop;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.Util;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.inventory.InventoryScreen;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;
import net.minecraft.world.inventory.InventoryMenu;
import net.minecraft.world.item.ItemStack;

final class KitShopScreen extends Screen {
    private static final int SHOP_WIDTH = 68, INVENTORY_WIDTH = 176, PANEL_HEIGHT = 166;
    private static final int COLUMNS = 3, PAGE_SIZE = 24, SLOT_PITCH = 18, BAR_WIDTH = 182;
    private static final int EFFECT_DURATION = 270;
    private static final ResourceLocation SHOP = ResourceLocation.fromNamespaceAndPath(
            "kingdomsheritage", "textures/gui/selection/kit_shop.png");
    private static final ResourceLocation INVENTORY = ResourceLocation.withDefaultNamespace("textures/gui/container/inventory.png");
    private static final ResourceLocation BAR = ResourceLocation.withDefaultNamespace("hud/experience_bar_background");
    private static final ResourceLocation FILL = ResourceLocation.withDefaultNamespace("hud/experience_bar_progress");
    private static final List<ResourceLocation> EMPTY_EQUIPMENT = List.of(
            InventoryMenu.EMPTY_ARMOR_SLOT_BOOTS, InventoryMenu.EMPTY_ARMOR_SLOT_LEGGINGS,
            InventoryMenu.EMPTY_ARMOR_SLOT_CHESTPLATE, InventoryMenu.EMPTY_ARMOR_SLOT_HELMET,
            InventoryMenu.EMPTY_ARMOR_SLOT_SHIELD);

    private final KitSelection selection;
    private final Component kitName;
    private final KitDefinition kit;
    private final KitShop shop;
    private final InventoryPolicy policy;
    private final List<KitDefinition.StackEntry> fixed;
    private final List<ItemStack> stock;
    private final KitPreview preview;
    private final List<SlotButton> offers = new ArrayList<>();
    private final List<SlotButton> inventory = new ArrayList<>();
    private List<Integer> picks = List.of();
    private List<KitShop.Purchase> purchases = List.of();
    private List<KitDefinition.StackEntry> loadout;
    private Component problem = Component.empty();
    private Button previous, next, back, review, reset;
    private int left, top, page, spent;
    private Trade trade;

    KitShopScreen(KitSelection selection, KitDefinition kit, List<KitDefinition.StackEntry> fixed, InventoryPolicy policy) {
        super(text("title"));
        this.selection = selection;
        kitName = DefinitionJson.component(selection.choices().get(selection.index()), "title");
        this.kit = kit;
        this.shop = kit.shop();
        this.policy = policy;
        this.fixed = fixed;
        this.loadout = fixed;
        stock = kit.decodeOffers(selection.player().registryAccess());
        preview = new KitPreview(selection.player());
    }

    List<Integer> picks() { return picks; }

    void restore(List<Integer> picks) { choose(picks); }

    @Override
    protected void init() {
        left = (width - SHOP_WIDTH - INVENTORY_WIDTH) / 2;
        top = (height - PANEL_HEIGHT) / 2;
        offers.clear();
        inventory.clear();
        for (int cell = 0; cell < PAGE_SIZE; cell++) {
            int index = cell;
            offers.add(addWidget(new SlotButton(left + 8 + cell % COLUMNS * SLOT_PITCH, top + 12 + cell / COLUMNS * SLOT_PITCH,
                    () -> toggle(page * PAGE_SIZE + index))));
        }
        for (int slot = 0; slot < KitShop.MAX_PICKS; slot++) {
            int index = slot;
            inventory.add(addWidget(new SlotButton(slotX(slot), slotY(slot), () -> {
                var purchase = purchaseInSlot(index);
                if (purchase != null) toggle(purchase.offer());
            })));
        }
        int bottom = top + PANEL_HEIGHT + 4;
        previous = addRenderableWidget(SelectionControls.arrow(left + 3, bottom + 2, false, text("previous_page"), button -> page(-1)));
        next = addRenderableWidget(SelectionControls.arrow(left + SHOP_WIDTH - 19, bottom + 2, true, text("next_page"), button -> page(1)));
        previous.setWidth(16);
        previous.setHeight(16);
        next.setWidth(16);
        next.setHeight(16);
        int inv = left + SHOP_WIDTH;
        back = addRenderableWidget(new SelectionControls.SoundButton(inv + 3, bottom, 46, 20,
                Component.translatable("gui.back"), button -> onClose()));
        reset = addRenderableWidget(new SelectionControls.SoundButton(inv + 53, bottom, 44, 20, text("reset"),
                button -> resetPicks()));
        review = addRenderableWidget(new SelectionControls.SoundButton(inv + 101, bottom, 72, 20, text("review"), button -> {
            if (!busy() && choose(picks)) selection.submit(picks);
        }));
        addRenderableWidget(SelectionControls.disconnect(height));
        updateControls();
    }

    private int slotX(int slot) {
        return left + SHOP_WIDTH + (slot == 40 ? 77 : slot >= 36 ? 8 : 8 + slot % 9 * SLOT_PITCH);
    }

    private int slotY(int slot) {
        if (slot == 40) return top + 62;
        if (slot >= 36) return top + 8 + (39 - slot) * SLOT_PITCH;
        return top + (slot < 9 ? 142 : 84 + (slot / 9 - 1) * SLOT_PITCH);
    }

    private int pages() { return (stock.size() + PAGE_SIZE - 1) / PAGE_SIZE; }

    private void page(int delta) {
        if (busy()) return;
        page = Mth.clamp(page + delta, 0, pages() - 1);
        updateControls();
    }

    private boolean busy() { return selection.submitted() || SelectionTransition.active() || ClientParty.blocksInput(); }

    private KitShop.Purchase purchaseInSlot(int slot) {
        for (var purchase : purchases) if (purchase.entry().index() == slot) return purchase;
        return null;
    }

    private boolean choose(List<Integer> requested) {
        try {
            int cost = shop.cost(requested);
            var nextPurchases = shop.place(selection.player(), policy, fixed, stock, requested);
            var entries = KitShop.combine(fixed, nextPurchases);
            preview.apply(kit, entries, policy);
            picks = List.copyOf(requested);
            purchases = nextPurchases;
            loadout = entries;
            spent = cost;
            problem = Component.empty();
            return true;
        } catch (IllegalArgumentException error) {
            problem = HeritageException.component(error);
            return false;
        }
    }

    private void resetPicks() {
        if (busy()) return;
        if (choose(List.of())) trade = null;
        else SelectionSounds.ERROR.play();
        updateControls();
    }

    private void toggle(int offer) {
        if (busy() || offer >= stock.size()) return;
        var requested = new ArrayList<>(picks);
        boolean buying = !requested.remove(Integer.valueOf(offer));
        var before = purchases.stream().filter(purchase -> purchase.offer() == offer).findFirst().orElse(null);
        if (buying) requested.add(offer);
        if (choose(requested)) {
            var changed = buying ? purchases.stream().filter(purchase -> purchase.offer() == offer).findFirst().orElseThrow() : before;
            trade = new Trade(offer, changed.entry().index(), buying, Util.getMillis());
            SelectionSounds.DISSOLVE.play(0.5F);
        } else SelectionSounds.ERROR.play();
        updateControls();
    }

    private void updateControls() {
        boolean available = !busy();
        previous.visible = next.visible = pages() > 1;
        previous.active = available && page > 0;
        next.active = available && page + 1 < pages();
        back.active = review.active = available;
        review.setMessage(selection.submitted() ? ClientSelection.progress() : text("review"));
        reset.active = available && !picks.isEmpty();
        for (int cell = 0; cell < PAGE_SIZE; cell++) {
            int offer = page * PAGE_SIZE + cell;
            var button = offers.get(cell);
            button.visible = offer < stock.size();
            button.active = button.visible && available;
            if (button.visible) button.setMessage(text(picks.contains(offer) ? "sell" : "buy", stock.get(offer).getHoverName(), shop.offers().get(offer).cost()));
        }
        for (int slot = 0; slot < inventory.size(); slot++) {
            var purchase = purchaseInSlot(slot);
            var button = inventory.get(slot);
            button.visible = purchase != null;
            button.active = button.visible && available;
            if (purchase != null) button.setMessage(text("sell", stock.get(purchase.offer()).getHoverName(), shop.offers().get(purchase.offer()).cost()));
        }
    }

    @Override
    public void onClose() {
        if (!busy()) selection.leaveShop();
    }

    @Override
    public void removed() {
        SelectionDissolve.close();
    }

    @Override
    public void renderBackground(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {}

    @Override
    public boolean isPauseScreen() { return false; }

    @Override
    public void render(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
        if (ClientParty.blocksHover(mouseX, mouseY)) mouseX = mouseY = -10000;
        updateControls();
        SelectionBackground.render(graphics, width, height);
        SelectionText.centered(graphics, font, title, width / 2, top - 32, 0xffffffff);
        int hoveredOffer = -1;
        for (int cell = 0; cell < PAGE_SIZE; cell++) {
            var button = offers.get(cell);
            if (button.visible && hovered(button, mouseX, mouseY)) hoveredOffer = page * PAGE_SIZE + cell;
        }
        renderBudget(graphics, hoveredOffer);
        graphics.blit(SHOP, left, top, 0, 0, SHOP_WIDTH, PANEL_HEIGHT, SHOP_WIDTH, PANEL_HEIGHT);
        int inv = left + SHOP_WIDTH;
        graphics.blit(INVENTORY, inv, top, 0, 0, INVENTORY_WIDTH, PANEL_HEIGHT);
        graphics.fill(inv + 95, top + 4, inv + 173, top + 78, 0xffc6c6c6);
        String name = font.plainSubstrByWidth(kitName.getString(), 75);
        graphics.drawString(font, name, inv + 133 - font.width(name) / 2, top + 10, 0xff404040, false);

        float elapsed = trade == null ? 1 : Mth.clamp((Util.getMillis() - trade.started()) / (float) EFFECT_DURATION, 0, 1);
        if (elapsed >= 1) trade = null;
        int shake = trade == null ? 0 : Math.round(Mth.sin(elapsed * 19) * 2.5F * (1 - elapsed));
        for (int cell = 0; cell < PAGE_SIZE; cell++) {
            var button = offers.get(cell);
            if (!button.visible) continue;
            int offer = page * PAGE_SIZE + cell;
            var stack = stock.get(offer);
            boolean picked = picks.contains(offer);
            int x = button.getX(), y = button.getY();
            graphics.renderItem(stack, x + (trade != null && trade.offer() == offer ? -shake : 0), y);
            graphics.renderItemDecorations(font, stack, x, y);
            if (!picked && shop.offers().get(offer).cost() > shop.budget() - spent) graphics.fill(x, y, x + 16, y + 16, 0x66000000);
            if (picked || hoveredOffer == offer) graphics.renderOutline(x - 1, y - 1, 18, 18, picked ? 0xff7bdb48 : 0xffffe4a1);
            graphics.pose().pushPose();
            graphics.pose().translate(x, y, 220);
            graphics.pose().scale(0.65F, 0.65F, 1);
            graphics.drawString(font, Integer.toString(shop.offers().get(offer).cost()), 0, 0, 0xffffc45b);
            graphics.pose().popPose();
        }

        try {
            preview.apply(kit, loadout, policy);
        } catch (IllegalArgumentException error) {
            problem = HeritageException.component(error);
        }
        int aimX = mouseX, aimY = mouseY;
        var shown = new ArrayList<ItemStack>(KitShop.MAX_PICKS);
        preview.render(() -> {
            InventoryScreen.renderEntityInInventoryFollowsMouse(graphics, inv + 26, top + 8, inv + 75, top + 78,
                    30, 0.0625F, aimX, aimY, selection.player());
            for (int slot = 0; slot < KitShop.MAX_PICKS; slot++) shown.add(selection.player().getInventory().getItem(slot).copy());
            graphics.flush();
        });
        int hoveredSlot = -1;
        for (int slot = 0; slot < shown.size(); slot++) {
            int x = slotX(slot), y = slotY(slot);
            var stack = shown.get(slot);
            if (stack.isEmpty() && slot >= 36) {
                var sprite = minecraft.getTextureAtlas(InventoryMenu.BLOCK_ATLAS).apply(EMPTY_EQUIPMENT.get(slot - 36));
                graphics.blit(x, y, 0, 16, 16, sprite);
            } else if (!stack.isEmpty() && (trade == null || !trade.buying() || trade.slot() != slot)) {
                graphics.renderItem(stack, x, y);
                graphics.renderItemDecorations(font, stack, x, y);
            }
            if (hovered(inventory.get(slot), mouseX, mouseY)) {
                hoveredSlot = slot;
                if (inventory.get(slot).visible) graphics.renderOutline(x - 1, y - 1, 18, 18, 0xffffe4a1);
            }
        }
        if (trade != null) {
            int x = slotX(trade.slot()) + shake, y = slotY(trade.slot());
            var stack = trade.buying() ? shown.get(trade.slot()) : stock.get(trade.offer());
            SelectionDissolve.white(graphics, trade.buying() ? 1 - elapsed : elapsed, () -> graphics.renderItem(stack, x, y));
        }
        if (pages() > 1) SelectionText.centered(graphics, font, text("page", page + 1, pages()), left + SHOP_WIDTH / 2,
                top + PANEL_HEIGHT + 10, 0xffffffff);
        var issue = problem.getString().isEmpty() ? selection.error() : problem;
        if (!issue.getString().isEmpty()) {
            var line = font.plainSubstrByWidth(issue.getString(), width - 92);
            SelectionText.centered(graphics, font, Component.literal(line), width / 2, top + PANEL_HEIGHT + 27, 0xffffaaaa);
        }
        super.render(graphics, mouseX, mouseY, partialTick);
        if (hoveredOffer >= 0) renderOfferTooltip(graphics, hoveredOffer, mouseX, mouseY);
        else if (hoveredSlot >= 0 && !shown.get(hoveredSlot).isEmpty()) {
            var purchase = purchaseInSlot(hoveredSlot);
            if (purchase != null) renderOfferTooltip(graphics, purchase.offer(), mouseX, mouseY);
            else graphics.renderTooltip(font, shown.get(hoveredSlot), mouseX, mouseY);
        }
    }

    private void renderBudget(GuiGraphics graphics, int hovered) {
        int x = (width - BAR_WIDTH) / 2, y = top - 7;
        SelectionText.centered(graphics, font, text("budget", spent, shop.budget(), shop.budget() - spent), width / 2,
                top - 19, 0xffffffff);
        graphics.blitSprite(BAR, x, y, BAR_WIDTH, 5);
        int used = fillWidth(spent);
        if (hovered >= 0 && !picks.contains(hovered)) {
            int potential = fillWidth(Math.min(shop.budget(), spent + shop.offers().get(hovered).cost()));
            if (potential > used) {
                drawFill(graphics, x, y, potential);
                graphics.fill(x + used, y + 1, x + potential, y + 4, 0x60ffffff);
            }
        }
        drawFill(graphics, x, y, used);
    }

    private int fillWidth(int points) {
        return shop.budget() == 0 ? 0 : Math.round(BAR_WIDTH * (points / (float) shop.budget()));
    }

    private static void drawFill(GuiGraphics graphics, int x, int y, int pixels) {
        if (pixels > 0) graphics.blitSprite(FILL, BAR_WIDTH, 5, 0, 0, x, y, pixels, 5);
    }

    private void renderOfferTooltip(GuiGraphics graphics, int offer, int x, int y) {
        var stack = stock.get(offer);
        var lines = new ArrayList<>(getTooltipFromItem(minecraft, stack));
        int cost = shop.offers().get(offer).cost();
        lines.add(text("stack", stack.getCount(), cost));
        if (picks.contains(offer)) lines.add(text("refund", cost));
        else if (spent + cost > shop.budget()) lines.add(text("short", spent + cost - shop.budget()));
        graphics.renderTooltip(font, lines, stack.getTooltipImage(), stack, x, y);
    }

    private boolean hovered(SlotButton button, int mouseX, int mouseY) {
        return mouseX >= button.getX() && mouseX < button.getX() + 16
                && mouseY >= button.getY() && mouseY < button.getY() + 16
                || mouseX != -10000 && minecraft.getLastInputType().isKeyboard() && button.isFocused();
    }

    private static Component text(String key, Object... values) {
        return Component.translatable("screen.kingdomsheritage.shop." + key, values);
    }

    private static final class SlotButton extends Button {
        SlotButton(int x, int y, Runnable click) {
            super(x, y, 16, 16, Component.empty(), button -> click.run(), DEFAULT_NARRATION);
        }

        @Override
        public void playDownSound(net.minecraft.client.sounds.SoundManager soundManager) {}
    }

    private record Trade(int offer, int slot, boolean buying, long started) {}
}

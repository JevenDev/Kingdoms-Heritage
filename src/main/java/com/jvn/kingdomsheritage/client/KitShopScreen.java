package com.jvn.kingdomsheritage.client;

import com.jvn.kingdomsheritage.HeritageConfig.InventoryPolicy;
import com.jvn.kingdomsheritage.data.DefinitionJson;
import com.jvn.kingdomsheritage.data.HeritageException;
import com.jvn.kingdomsheritage.data.KitDefinition;
import com.jvn.kingdomsheritage.data.KitLoadout;
import com.jvn.kingdomsheritage.data.KitShop;
import com.mojang.math.Axis;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.stream.IntStream;
import net.minecraft.Util;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.Tooltip;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.inventory.InventoryScreen;
import net.minecraft.locale.Language;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.FormattedText;
import net.minecraft.network.chat.Style;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;
import net.minecraft.world.inventory.InventoryMenu;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

final class KitShopScreen extends Screen {
    private static final int COLUMNS = KitShop.VISIBLE_COLUMNS, PAGE_SIZE = COLUMNS * KitShop.ROWS, SLOT_PITCH = 18, BAR_WIDTH = 182;
    private static final int SHOP_WIDTH = 14 + COLUMNS * SLOT_PITCH, INVENTORY_WIDTH = 176, PANEL_HEIGHT = 166;
    private static final int EFFECT_DURATION = 270;
    private static final int TAB_HEIGHT = 26, TAB_PITCH = 27, TAB_WIDTH = 28, TAB_SPRITE_WIDTH = 32, TAB_ROWS = 6;
    private static final int DETAIL_WIDTH = 68, NAME_LINES = 2;
    private static final int CHEST_SLOT = 38, OFFHAND_SLOT = 40;
    private static final int DETAIL_INK = 0xff404040, DETAIL_MUTED = 0xff545454;
    private static final int DETAIL_GAIN = 0xff385023, DETAIL_BLOCKED = 0xff812c23;
    private static final ResourceLocation SHOP = ResourceLocation.fromNamespaceAndPath(
            "kingdomsheritage", "textures/gui/selection/kit_shop.png");
    private static final ResourceLocation INVENTORY = ResourceLocation.withDefaultNamespace("textures/gui/container/inventory.png");
    private static final ResourceLocation BAR = ResourceLocation.withDefaultNamespace("hud/experience_bar_background");
    private static final ResourceLocation FILL = ResourceLocation.withDefaultNamespace("hud/experience_bar_progress");
    private static final ResourceLocation TAB_SELECTED = ResourceLocation.withDefaultNamespace("textures/gui/sprites/container/creative_inventory/tab_top_selected_1.png");
    private static final ResourceLocation TAB_SELECTED_MIDDLE = ResourceLocation.withDefaultNamespace("textures/gui/sprites/container/creative_inventory/tab_top_selected_2.png");
    private static final ResourceLocation TAB_UNSELECTED = ResourceLocation.withDefaultNamespace("textures/gui/sprites/container/creative_inventory/tab_top_unselected_1.png");
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
    private final List<ItemStack> sectionIcons;
    private final List<TabButton> tabs = new ArrayList<>();
    private KitShop.Layout layout;
    private final KitPreview preview;
    private final List<SlotButton> offers = new ArrayList<>();
    private final List<SlotButton> inventory = new ArrayList<>();
    private final int[] bought;
    private List<KitShop.Pick> picks = List.of();
    private List<KitDefinition.StackEntry> loadout;
    private Component problem = Component.empty();
    private Button previous, next, back, review, reset, previousSections, nextSections;
    private int left, top, page, spent, section, sectionPage;
    private double scrollRemainder;
    private Trade trade;
    private boolean controlsDirty = true;
    private final OfferStatus[] offerStatuses = new OfferStatus[PAGE_SIZE];
    private final int[] offerSlots = new int[PAGE_SIZE];

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
        sectionIcons = shop.sections().stream()
                .map(tab -> BuiltInRegistries.ITEM.getOptional(tab.icon()).orElse(Items.PAPER).getDefaultInstance()).toList();
        layout = shop.layout("");
        bought = new int[stock.size()];
        preview = new KitPreview(selection.player());
    }

    List<KitShop.Pick> picks() { return picks; }

    void restore(List<KitShop.Pick> picks) { choose(picks); }

    @Override
    protected void init() {
        left = (width - SHOP_WIDTH - INVENTORY_WIDTH) / 2;
        top = (height - PANEL_HEIGHT) / 2;
        offers.clear();
        inventory.clear();
        tabs.clear();
        controlsDirty = true;
        previousSections = nextSections = null;
        if (!sectionIcons.isEmpty()) {
            int x = left - TAB_WIDTH;
            boolean paged = sectionIcons.size() + 1 > TAB_ROWS;
            int y = top + (paged ? 16 : 4);
            for (int row = 0; row < Math.min(tabRows(), sectionIcons.size() + 1); row++) {
                int index = row;
                tabs.add(addWidget(new TabButton(x, y + row * TAB_PITCH, () -> selectSection(sectionPage * tabRows() + index))));
            }
            if (paged) {
                previousSections = addRenderableWidget(SelectionControls.arrow(x + 6, top, false, text("previous_sections"), button -> pageSections(-1)));
                nextSections = addRenderableWidget(SelectionControls.arrow(x + 6, top + 150, true, text("next_sections"), button -> pageSections(1)));
                previousSections.setWidth(16);
                previousSections.setHeight(16);
                nextSections.setWidth(16);
                nextSections.setHeight(16);
            }
        }
        for (int cell = 0; cell < PAGE_SIZE; cell++) {
            int index = cell;
            offers.add(addWidget(new SlotButton(left + 8 + cell % COLUMNS * SLOT_PITCH, top + 12 + cell / COLUMNS * SLOT_PITCH,
                    () -> buy(index))));
        }
        for (int slot = 0; slot < KitShop.MAX_PICKS; slot++) {
            int index = slot;
            inventory.add(addWidget(new SlotButton(slotX(slot), slotY(slot), () -> refund(index))));
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
        return left + SHOP_WIDTH + (slot == OFFHAND_SLOT ? 77 : slot >= 36 ? 8 : 8 + slot % 9 * SLOT_PITCH);
    }

    private int slotY(int slot) {
        if (slot == OFFHAND_SLOT) return top + 62;
        if (slot >= 36) return top + 8 + (39 - slot) * SLOT_PITCH;
        return top + (slot < 9 ? 142 : 84 + (slot / 9 - 1) * SLOT_PITCH);
    }

    private int pages() { return Math.max(1, layout.columns() - COLUMNS + 1); }

    private int offerIndex(int cell) {
        return layout.offerAt(cell / COLUMNS, page + cell % COLUMNS);
    }

    private int tabRows() { return sectionIcons.size() + 1 > TAB_ROWS ? TAB_ROWS - 1 : TAB_ROWS; }

    private void pageSections(int delta) {
        if (busy()) return;
        sectionPage = Mth.clamp(sectionPage + delta, 0, sectionIcons.size() / tabRows());
        controlsDirty = true;
        updateControls();
    }

    private void selectSection(int index) {
        if (busy() || index == section || index > sectionIcons.size()) return;
        section = index;
        page = 0;
        scrollRemainder = 0;
        controlsDirty = true;
        String id = section == 0 ? "" : shop.sections().get(section - 1).id();
        layout = shop.layout(id);
        if (getFocused() instanceof SlotButton) setFocused(null);
        updateControls();
    }

    private boolean page(int delta) {
        if (busy()) return false;
        int nextPage = Mth.clamp(page + delta, 0, pages() - 1);
        if (nextPage == page) return false;
        page = nextPage;
        if (offers.contains(getFocused())) setFocused(null);
        controlsDirty = true;
        updateControls();
        return true;
    }

    @Override
    public boolean mouseScrolled(double mouseX, double mouseY, double horizontal, double vertical) {
        double delta = horizontal != 0 ? horizontal : -vertical;
        if (delta == 0 || mouseX < left || mouseX >= left + SHOP_WIDTH || mouseY < top || mouseY >= top + PANEL_HEIGHT) {
            return super.mouseScrolled(mouseX, mouseY, horizontal, vertical);
        }
        if (!busy() && pages() > 1) {
            if (Math.signum(delta) != Math.signum(scrollRemainder)) scrollRemainder = 0;
            scrollRemainder += delta;
            int steps = (int) scrollRemainder;
            scrollRemainder -= steps;
            if (steps != 0 && page(steps)) SelectionSounds.HOVER.play();
        }
        return true;
    }

    private boolean busy() { return selection.submitted() || SelectionTransition.active() || ClientParty.blocksInput(); }

    private KitShop.Pick purchaseInSlot(int slot) {
        for (int i = picks.size() - 1; i >= 0; i--) {
            var pick = picks.get(i);
            if (pick.slot() == slot) return pick;
        }
        return null;
    }

    private boolean choose(List<KitShop.Pick> requested) {
        try {
            var entries = shop.loadout(selection.player(), policy, fixed, stock, requested);
            preview.apply(kit, entries, policy);
            picks = List.copyOf(requested);
            controlsDirty = true;
            loadout = entries;
            Arrays.fill(bought, 0);
            spent = 0;
            for (var pick : picks) {
                bought[pick.offer()]++;
                spent += shop.offers().get(pick.offer()).cost();
            }
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

    private void buy(int cell) {
        int offer = offerIndex(cell);
        if (busy() || offer < 0) return;
        updateControls();
        int slot = offerStatuses[cell] == OfferStatus.AVAILABLE ? offerSlots[cell] : -1;
        if (slot < 0) {
            SelectionSounds.ERROR.play();
            return;
        }
        var pick = new KitShop.Pick(offer, slot);
        var requested = new ArrayList<>(picks);
        requested.add(pick);
        trade(requested, pick, true);
    }

    private void refund(int slot) {
        if (busy()) return;
        var pick = purchaseInSlot(slot);
        if (pick == null) return;
        var requested = new ArrayList<>(picks);
        requested.remove(requested.lastIndexOf(pick));
        trade(requested, pick, false);
    }

    private boolean reflowAfterRefund(List<KitShop.Pick> requested) {
        var player = selection.player();
        var original = KitLoadout.capture(player, false);
        int mainSize = player.getInventory().items.size();
        var placed = new ArrayList<KitShop.Pick>();
        var entries = fixed;
        try {
            for (var pick : requested) {
                var planned = KitLoadout.plan(original, mainSize, kit, entries, policy);
                int slot = KitShop.nextSlot(player, planned::item, stock.get(pick.offer()));
                if (slot < 0) return false;
                placed.add(new KitShop.Pick(pick.offer(), slot));
                entries = shop.loadout(player, policy, fixed, stock, placed);
            }
            return choose(placed);
        } catch (IllegalArgumentException error) {
            problem = HeritageException.component(error);
            return false;
        }
    }

    private void trade(List<KitShop.Pick> requested, KitShop.Pick pick, boolean buying) {
        if (choose(requested) || !buying && reflowAfterRefund(requested)) {
            trade = new Trade(pick.offer(), pick.slot(), buying, Util.getMillis());
            SelectionSounds.DISSOLVE.play(0.5F);
        } else SelectionSounds.ERROR.play();
        updateControls();
    }

    private OfferStatus purchaseStatus(int index, int slot) {
        var offer = shop.offers().get(index);
        if (bought[index] >= offer.limit()) return OfferStatus.LIMIT;
        if (picks.size() >= KitShop.MAX_PICKS) return OfferStatus.SPACE;
        if (offer.cost() > shop.budget() - spent) return OfferStatus.POINTS;
        return slot < 0 ? OfferStatus.SPACE : OfferStatus.AVAILABLE;
    }

    private Component purchaseProblem(int index, OfferStatus status) {
        return switch (status) {
            case LIMIT -> text("limit_reached");
            case SPACE -> text("no_space");
            case POINTS -> {
                int shortfall = shop.offers().get(index).cost() - (shop.budget() - spent);
                yield shortfall == 1 ? text("short_one") : text("short", shortfall);
            }
            case AVAILABLE -> null;
        };
    }

    private void updateControls() {
        boolean refresh = controlsDirty;
        boolean canBuy = policy != InventoryPolicy.PRESERVE;
        try {
            refresh |= preview.apply(kit, loadout, policy);
        } catch (IllegalArgumentException error) {
            problem = HeritageException.component(error);
            refresh = true;
            canBuy = false;
        }
        controlsDirty = false;
        boolean available = !busy();
        previous.visible = next.visible = pages() > 1;
        previous.active = available && page > 0;
        next.active = available && page + 1 < pages();
        back.active = review.active = available;
        review.setMessage(selection.submitted() ? ClientSelection.progress() : text("review"));
        reset.active = available && !picks.isEmpty();
        if (previousSections != null) {
            previousSections.active = available && sectionPage > 0;
            nextSections.active = available && (sectionPage + 1) * tabRows() <= sectionIcons.size();
        }
        for (int row = 0; row < tabs.size(); row++) {
            var tab = tabs.get(row);
            int index = sectionPage * tabRows() + row;
            tab.visible = index <= sectionIcons.size();
            tab.active = tab.visible && available;
            if (!tab.visible || !refresh) continue;
            tab.index = index;
            Component name = index == 0 ? text("all_sections") : Component.literal(shop.sections().get(index - 1).name());
            if (!name.equals(tab.getMessage())) {
                tab.setMessage(name);
                tab.setTooltip(Tooltip.create(name));
            }
        }
        for (int cell = 0; cell < PAGE_SIZE; cell++) {
            int offer = offerIndex(cell);
            var button = offers.get(cell);
            button.visible = offer >= 0;
            button.active = button.visible && available;
            if (refresh && button.visible) {
                offerSlots[cell] = canBuy ? KitShop.nextSlot(selection.player(), preview::item, stock.get(offer)) : -1;
                offerStatuses[cell] = purchaseStatus(offer, offerSlots[cell]);
                var message = text("buy", stock.get(offer).getHoverName(), shop.offers().get(offer).cost()).copy();
                Component blocked = purchaseProblem(offer, offerStatuses[cell]);
                if (blocked != null) message.append(". ").append(blocked);
                if (bought[offer] >= shop.offers().get(offer).limit()) {
                    message.append(". ").append(text("bought", bought[offer], shop.offers().get(offer).limit()));
                }
                button.setMessage(message);
            }
        }
        for (int slot = 0; slot < inventory.size(); slot++) {
            var button = inventory.get(slot);
            if (refresh) {
                var purchase = purchaseInSlot(slot);
                button.visible = purchase != null;
                if (purchase != null) button.setMessage(text("sell", stock.get(purchase.offer()).getHoverName(), shop.offers().get(purchase.offer()).cost()));
            }
            button.active = button.visible && available;
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
        OfferStatus hoveredStatus = OfferStatus.AVAILABLE;
        for (int cell = 0; cell < PAGE_SIZE; cell++) {
            var button = offers.get(cell);
            if (button.visible && hovered(button, mouseX, mouseY)) {
                hoveredOffer = offerIndex(cell);
                hoveredStatus = offerStatuses[cell];
            }
        }
        int hoveredSlot = -1;
        for (int slot = 0; slot < inventory.size(); slot++) {
            var button = inventory.get(slot);
            if (hovered(button, mouseX, mouseY)) hoveredSlot = slot;
        }
        var refund = purchaseInSlot(hoveredSlot);
        Component blocked = hoveredOffer < 0 ? null : purchaseProblem(hoveredOffer, hoveredStatus);
        renderBudget(graphics, hoveredOffer, hoveredStatus, refund);
        for (var tab : tabs) if (tab.index != section) tab.render(graphics, mouseX, mouseY, partialTick);
        graphics.blit(SHOP, left, top, 0, 0, SHOP_WIDTH, PANEL_HEIGHT, SHOP_WIDTH, PANEL_HEIGHT);
        for (var tab : tabs) if (tab.index == section) tab.render(graphics, mouseX, mouseY, partialTick);
        int inv = left + SHOP_WIDTH;
        graphics.blit(INVENTORY, inv, top, 0, 0, INVENTORY_WIDTH, PANEL_HEIGHT);
        graphics.fill(inv + 95, top + 4, inv + 173, top + 78, 0xffc6c6c6);
        renderDetails(graphics, inv, hoveredOffer, refund, blocked);

        float elapsed = trade == null ? 1 : Mth.clamp((Util.getMillis() - trade.started()) / (float) EFFECT_DURATION, 0, 1);
        if (elapsed >= 1) trade = null;
        int shake = trade == null ? 0 : Math.round(Mth.sin(elapsed * 19) * 2.5F * (1 - elapsed));
        for (int cell = 0; cell < PAGE_SIZE; cell++) {
            var button = offers.get(cell);
            if (!button.visible) continue;
            int offer = offerIndex(cell);
            var stack = stock.get(offer);
            var entry = shop.offers().get(offer);
            OfferStatus status = offerStatuses[cell];
            int x = button.getX() + 1, y = button.getY() + 1;
            graphics.renderItem(stack, x + (trade != null && trade.offer() == offer ? -shake : 0), y);
            graphics.renderItemDecorations(font, stack, x, y);
            graphics.pose().pushPose();
            graphics.pose().translate(0, 0, 220);
            if (status == OfferStatus.POINTS) graphics.fill(x, y, x + 16, y + 16, 0x66000000);
            if (status == OfferStatus.LIMIT) graphics.fill(x, y, x + 16, y + 16, 0x26000000);
            if (status == OfferStatus.SPACE) {
                graphics.fill(x, y + 10, x + 6, y + 16, 0xff343434);
                graphics.renderOutline(x, y + 10, 6, 6, 0xffe4e4e4);
            }
            if (hoveredOffer == offer || bought[offer] > 0 && status != OfferStatus.LIMIT) {
                graphics.renderOutline(x - 1, y - 1, 18, 18, hoveredOffer == offer ? 0xffffe4a1 : 0xff629d42);
            }
            graphics.pose().translate(x, y, 0);
            graphics.pose().scale(0.65F, 0.65F, 1);
            graphics.drawString(font, Integer.toString(entry.cost()), 0, 0, status == OfferStatus.POINTS ? 0xffff7777 : 0xffffc45b);
            graphics.pose().popPose();
        }

        int aimX = mouseX, aimY = mouseY;
        preview.render(() -> {
            InventoryScreen.renderEntityInInventoryFollowsMouse(graphics, inv + 26, top + 8, inv + 75, top + 78,
                    30, 0.0625F, aimX, aimY, selection.player());
            graphics.flush();
        });
        var shown = IntStream.range(0, KitShop.MAX_PICKS).mapToObj(preview::item).toList();
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
            if (slot == hoveredSlot && refund != null) graphics.renderOutline(x - 1, y - 1, 18, 18, 0xffffe4a1);
        }
        if (trade != null) {
            int x = slotX(trade.slot()) + shake, y = slotY(trade.slot());
            var stack = trade.buying() ? shown.get(trade.slot()) : stock.get(trade.offer());
            SelectionDissolve.white(graphics, trade.buying() ? 1 - elapsed : elapsed, () -> graphics.renderItem(stack, x, y));
        }
        if (pages() > 1) SelectionText.centered(graphics, font, text("page", page + 1, pages()), left + SHOP_WIDTH / 2,
                top + PANEL_HEIGHT + 10, 0xffffffff);
        if (layout.columns() == 0) {
            int y = top + 18;
            for (var line : font.split(text("empty_section"), SHOP_WIDTH - 12)) {
                graphics.drawCenteredString(font, line, left + SHOP_WIDTH / 2, y, 0xffffffff);
                y += font.lineHeight;
            }
        }
        var issue = problem.getString().isEmpty() ? selection.error() : problem;
        if (!issue.getString().isEmpty()) {
            var line = font.plainSubstrByWidth(issue.getString(), width - 92);
            SelectionText.centered(graphics, font, Component.literal(line), width / 2, top + PANEL_HEIGHT + 27, 0xffffaaaa);
        }
        super.render(graphics, mouseX, mouseY, partialTick);
        if (hoveredOffer >= 0) renderOfferTooltip(graphics, hoveredOffer, mouseX, mouseY);
        else if (refund != null) renderOfferTooltip(graphics, refund.offer(), mouseX, mouseY);
        else if (hoveredSlot >= 0 && !shown.get(hoveredSlot).isEmpty()) {
            graphics.renderTooltip(font, shown.get(hoveredSlot), mouseX, mouseY);
        }
    }

    private void renderDetails(GuiGraphics graphics, int inv, int hovered, KitShop.Pick refund, Component blocked) {
        int x = inv + 100;
        String name = font.plainSubstrByWidth(kitName.getString(), DETAIL_WIDTH);
        graphics.drawString(font, name, inv + 134 - font.width(name) / 2, top + 10, DETAIL_INK, false);
        graphics.fill(x, top + 21, x + DETAIL_WIDTH, top + 22, 0xffa2a2a2);
        if (hovered < 0 && refund == null) {
            detailLines(graphics, text("add_hint"), x, top + 29, 2, DETAIL_MUTED);
            detailLines(graphics, text("refund_hint"), x, top + 52, 2, DETAIL_MUTED);
            return;
        }
        boolean selling = hovered < 0;
        int index = selling ? refund.offer() : hovered;
        var entry = shop.offers().get(index);
        var stack = stock.get(index);
        graphics.renderItem(stack, slotX(OFFHAND_SLOT), slotY(CHEST_SLOT));
        renderItemName(graphics, stack, x);
        detailLines(graphics, text("stack_price", stack.getCount(), points(entry.cost())), x, top + 46, 1, DETAIL_MUTED);
        var status = selling ? text("refund_points", points(entry.cost())) : blocked != null ? blocked
                : text("after_purchase", points(shop.budget() - spent - entry.cost()));
        detailLines(graphics, status, x, top + 56, 2, blocked != null ? DETAIL_BLOCKED : DETAIL_GAIN);
        if ((entry.limit() > 1 || bought[index] >= entry.limit()) && font.split(status, DETAIL_WIDTH).size() == 1) {
            detailLines(graphics, text("bought", bought[index], entry.limit()), x, top + 67, 1, DETAIL_MUTED);
        }
    }

    private List<FormattedText> itemNameLines(ItemStack stack) {
        return font.getSplitter().splitLines(stack.getHoverName().getString(), DETAIL_WIDTH, Style.EMPTY);
    }

    private void renderItemName(GuiGraphics graphics, ItemStack stack, int x) {
        var lines = itemNameLines(stack);
        for (int index = 0; index < Math.min(NAME_LINES, lines.size()); index++) {
            var line = lines.get(index);
            if (index == NAME_LINES - 1 && lines.size() > NAME_LINES) {
                String ellipsis = "…";
                String prefix = font.plainSubstrByWidth(line.getString(), DETAIL_WIDTH - font.width(ellipsis)).stripTrailing();
                line = FormattedText.of(prefix + ellipsis);
            }
            graphics.drawString(font, Language.getInstance().getVisualOrder(line), x, top + 27 + index * font.lineHeight, DETAIL_INK, false);
        }
    }

    private void detailLines(GuiGraphics graphics, Component value, int x, int y, int maxLines, int color) {
        var lines = font.split(value, DETAIL_WIDTH);
        for (int index = 0; index < Math.min(maxLines, lines.size()); index++) {
            graphics.drawString(font, lines.get(index), x, y + index * font.lineHeight, color, false);
        }
    }

    private void renderBudget(GuiGraphics graphics, int hovered, OfferStatus status, KitShop.Pick refund) {
        int x = (width - BAR_WIDTH) / 2, y = top - 7;
        SelectionText.centered(graphics, font, text("budget", spent, shop.budget(), shop.budget() - spent), width / 2,
                top - 19, 0xffffffff);
        graphics.blitSprite(BAR, x, y, BAR_WIDTH, 5);
        int used = fillWidth(spent);
        if (hovered >= 0 && status == OfferStatus.AVAILABLE) {
            int potential = fillWidth(Math.min(shop.budget(), spent + shop.offers().get(hovered).cost()));
            if (potential > used) {
                drawFill(graphics, x, y, potential);
                graphics.fill(x + used, y + 1, x + potential, y + 4, 0x60ffffff);
            }
        }
        drawFill(graphics, x, y, used);
        if (refund != null) {
            int afterRefund = fillWidth(spent - shop.offers().get(refund.offer()).cost());
            drawRedFill(graphics, x, y, afterRefund, used, 1F);
        } else if (status == OfferStatus.POINTS && used < BAR_WIDTH) {
            drawRedFill(graphics, x, y, used, BAR_WIDTH, 0.85F);
        }
    }

    private static void drawRedFill(GuiGraphics graphics, int x, int y, int start, int end, float alpha) {
        if (end <= start) return;
        graphics.setColor(1.65F, 0.42F, 0.72F, alpha);
        try {
            graphics.blitSprite(FILL, BAR_WIDTH, 5, start, 0, x + start, y, end - start, 5);
        } finally {
            graphics.setColor(1, 1, 1, 1);
        }
    }

    private int fillWidth(int points) {
        return shop.budget() == 0 ? 0 : Math.round(BAR_WIDTH * (points / (float) shop.budget()));
    }

    private static void drawFill(GuiGraphics graphics, int x, int y, int pixels) {
        if (pixels > 0) graphics.blitSprite(FILL, BAR_WIDTH, 5, 0, 0, x, y, pixels, 5);
    }

    private void renderOfferTooltip(GuiGraphics graphics, int offer, int x, int y) {
        var stack = stock.get(offer);
        int tooltipY = itemNameLines(stack).size() > NAME_LINES ? Math.max(y, top + 100) : y;
        graphics.renderTooltip(font, stack, x, tooltipY);
    }

    private boolean hovered(SlotButton button, int mouseX, int mouseY) {
        if (mouseX == -10000) return false;
        if (minecraft.getLastInputType().isKeyboard()) return button.isFocused() && button.visible;
        return button.getRectangle().containsPoint(mouseX, mouseY);
    }

    private static Component points(int value) {
        return text(value == 1 ? "one_point" : "points", value);
    }

    private static Component text(String key, Object... values) {
        return Component.translatable("screen.kingdomsheritage.shop." + key, values);
    }

    private static final class SlotButton extends Button {
        SlotButton(int x, int y, Runnable click) {
            super(x - 1, y - 1, SLOT_PITCH, SLOT_PITCH, Component.empty(), button -> click.run(), DEFAULT_NARRATION);
        }

        @Override
        public void playDownSound(net.minecraft.client.sounds.SoundManager soundManager) {}
    }

    private final class TabButton extends SelectionControls.SoundButton {
        private int index;

        private TabButton(int x, int y, Runnable action) {
            super(x, y, TAB_WIDTH, TAB_HEIGHT, Component.empty(), button -> action.run());
        }

        @Override
        protected void renderWidget(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
            graphics.pose().pushPose();
            graphics.pose().translate(getX(), getY() + TAB_HEIGHT, 0);
            graphics.pose().mulPose(Axis.ZP.rotationDegrees(-90));
            var sprite = index != section ? TAB_UNSELECTED : index % tabRows() == 0 ? TAB_SELECTED : TAB_SELECTED_MIDDLE;
            graphics.blit(sprite, 0, 0, TAB_HEIGHT, TAB_SPRITE_WIDTH, TAB_HEIGHT, 0,
                    -TAB_HEIGHT, TAB_SPRITE_WIDTH, TAB_HEIGHT, TAB_SPRITE_WIDTH);
            graphics.pose().popPose();
            if (index != section && isFocused() && minecraft.getLastInputType().isKeyboard()) {
                graphics.renderOutline(getX() + 1, getY() + 1, TAB_WIDTH - 1, TAB_HEIGHT - 2, 0xffffe4a1);
            }
            var icon = index == 0 ? Items.CHEST.getDefaultInstance() : sectionIcons.get(index - 1);
            graphics.renderItem(icon, getX() + (TAB_SPRITE_WIDTH - 16) / 2, getY() + (TAB_HEIGHT - 16) / 2);
        }
    }

    private enum OfferStatus { AVAILABLE, POINTS, LIMIT, SPACE }

    private record Trade(int offer, int slot, boolean buying, long started) {}
}

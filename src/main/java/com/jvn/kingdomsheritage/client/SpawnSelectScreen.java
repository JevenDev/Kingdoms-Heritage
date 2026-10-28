package com.jvn.kingdomsheritage.client;

import com.google.gson.JsonObject;
import com.jvn.kingdomsheritage.data.DefinitionJson;
import com.jvn.kingdomsheritage.network.HeritageNetwork;
import com.mojang.blaze3d.systems.RenderSystem;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.Tooltip;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.inventory.tooltip.DefaultTooltipPositioner;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.neoforged.neoforge.network.PacketDistributor;
import org.lwjgl.glfw.GLFW;

public final class SpawnSelectScreen extends Screen {
    private static final int CARD_WIDTH = 128;
    private static final int CARD_HEIGHT = 192;
    private static final int EXPANDED_WIDTH = 374;
    private static final int PAGE_SIZE = 10;
    private static final ResourceLocation CARD = texture("campaign_select_screen_card");
    private static final ResourceLocation EXPANDED = texture("campaign_select_screen_card_expanded");
    private static final ResourceLocation CARET = texture("campaign_select_screen_card_caret_expand");
    private static final ResourceLocation COLLAPSE = texture("campaign_select_screen_card_caret_expanded");
    private static final ResourceLocation FALLBACK = texture("campaign_select_screen_card_fallback");
    private final JsonObject catalog;
    private final List<JsonObject> choices;
    private JsonObject automaticKit;
    private JsonObject selected;
    private JsonObject expanded;
    private final List<Card> cards = new ArrayList<>();
    private JsonObject preview;
    private Card hovered;
    private Button description;
    private int page;
    private float scale;
    private int top;
    private Button next;
    private double descriptionScroll;
    private boolean submitted;
    private long renderedAt;

    public SpawnSelectScreen(JsonObject catalog) {
        super(Component.translatable("screen.kingdomsheritage.location"));
        this.catalog = catalog;
        choices = catalog.getAsJsonArray("spawns").asList().stream().map(value -> value.getAsJsonObject()).toList();
    }

    void retry() {
        submitted = false;
        updateNext();
    }

    String selectedId() { return selected == null ? null : selected.get("id").getAsString(); }

    void restoreSelection(String id) {
        selected = choices.stream().filter(choice -> choice.get("id").getAsString().equals(id)).findFirst().orElse(null);
        if (selected != null) page = choices.indexOf(selected) / PAGE_SIZE;
    }

    private static ResourceLocation texture(String name) {
        return ResourceLocation.fromNamespaceAndPath("kingdomsheritage", "textures/gui/campaign_select_screen/" + name + ".png");
    }

    @Override
    protected void init() {
        cards.clear();
        hovered = null;
        renderedAt = net.minecraft.Util.getMillis();
        int count = Math.min(PAGE_SIZE, choices.size() - page * PAGE_SIZE);
        int cardWidth = expanded != null ? EXPANDED_WIDTH : CARD_WIDTH;
        scale = Math.max(0.1F, Math.min(1, Math.min((width - 32F) / cardWidth, (height - 116F) / CARD_HEIGHT)));
        float step = count <= 1 ? 0 : Math.min((CARD_WIDTH + 16) * scale, (width - 32F - CARD_WIDTH * scale) / (count - 1));
        float groupWidth = expanded != null ? EXPANDED_WIDTH * scale : CARD_WIDTH * scale + (count - 1) * step;
        int left = Math.round((width - groupWidth) / 2);
        top = Math.round(40 + (height - 116 - CARD_HEIGHT * scale) / 2);
        List<JsonObject> visible = expanded != null ? List.of(expanded) : choices.subList(page * PAGE_SIZE, page * PAGE_SIZE + count);
        for (int index = 0; index < visible.size(); index++) {
            JsonObject choice = visible.get(index);
            int x = left + Math.round(index * step);
            cards.add(addWidget(new Card(x, choice)));
        }
        preview = expanded != null ? expanded : visible.contains(selected) ? selected : visible.getFirst();
        description = addWidget(new Button(0, 0, Math.max(12, Math.round(19 * scale)), Math.max(18, Math.round(32 * scale)),
                Component.translatable(expanded == null ? "screen.kingdomsheritage.expand" : "screen.kingdomsheritage.collapse"),
                button -> {
                    selected = preview;
                    expanded = expanded == null ? preview : null;
                    descriptionScroll = 0;
                    rebuildWidgets();
                }, message -> message.get()) {
            @Override
            protected void renderWidget(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
                graphics.pose().pushPose();
                graphics.pose().translate(getX(), getY(), 0);
                graphics.pose().scale(scale, scale, 1);
                blit(graphics, expanded == null ? CARET : COLLAPSE, 5, 9, 7, 10);
                graphics.pose().popPose();
            }
        });
        updateDescription();
        int buttonWidth = Math.min(130, (width - 100) / 2);
        addRenderableWidget(Button.builder(Component.translatable("menu.disconnect"), button -> ClientSelection.disconnect())
                .bounds(width / 2 - buttonWidth - 4, height - 28, buttonWidth, 20).build());
        next = addRenderableWidget(Button.builder(Component.empty(), button -> confirm())
                .bounds(width / 2 + 4, height - 28, buttonWidth, 20).build());
        updateNext();
        if (expanded == null && choices.size() > PAGE_SIZE) {
            var previous = addRenderableWidget(Button.builder(Component.literal("<"), button -> { page--; rebuildWidgets(); })
                    .bounds(8, height - 28, 20, 20).build());
            previous.active = page > 0;
            var forward = addRenderableWidget(Button.builder(Component.literal(">"), button -> { page++; rebuildWidgets(); })
                    .bounds(width - 28, height - 28, 20, 20).build());
            forward.active = (page + 1) * PAGE_SIZE < choices.size();
        }
    }

    private void updateDescription() {
        description.visible = expanded != null || !preview.get("description").getAsString().isBlank();
        description.setTooltip(Tooltip.create(description.getMessage()));
        positionDescription();
    }

    private void positionDescription() {
        for (int index = 0; index < cards.size(); index++) {
            Card card = cards.get(index);
            if (card.choice != preview) continue;
            int right = index + 1 < cards.size() ? Math.min(card.getRight(), cards.get(index + 1).getX()) : card.getRight();
            description.setX(card.getX() + Math.min(Math.round(109 * scale), Math.max(0, right - card.getX() - description.getWidth())));
            description.setY(card.getY() + Math.round(80 * scale));
            return;
        }
    }

    private Card cardAt(double mouseX, double mouseY) {
        for (int index = cards.size() - 1; index >= 0; index--) {
            Card card = cards.get(index);
            int right = index + 1 < cards.size() ? Math.min(card.getRight(), cards.get(index + 1).getX()) : card.getRight();
            // fixed strips keep the hovered card from swallowing its neighbours
            if (mouseX >= card.getX() && mouseX < right && mouseY >= top - Math.round(12 * scale)
                    && mouseY < top + card.getHeight()) return card;
        }
        return null;
    }

    @Override
    public boolean mouseClicked(double mouseX, double mouseY, int button) {
        if (description.mouseClicked(mouseX, mouseY, button)) return true;
        Card card = cardAt(mouseX, mouseY);
        if (card != null && card.active && button == 0) {
            card.playDownSound(minecraft.getSoundManager());
            card.onPress();
            setFocused(card);
            setDragging(true);
            return true;
        }
        return super.mouseClicked(mouseX, mouseY, button);
    }

    @Override
    public boolean keyPressed(int keyCode, int scanCode, int modifiers) {
        if (getFocused() instanceof Card card && (keyCode == GLFW.GLFW_KEY_LEFT || keyCode == GLFW.GLFW_KEY_RIGHT)) {
            int index = cards.indexOf(card) + (keyCode == GLFW.GLFW_KEY_LEFT ? -1 : 1);
            if (index >= 0 && index < cards.size()) {
                setFocused(cards.get(index));
                preview = cards.get(index).choice;
                updateDescription();
            }
            return true;
        }
        return super.keyPressed(keyCode, scanCode, modifiers);
    }

    private void confirm() {
        if (selected == null || submitted) return;
        if (automaticKit == null) {
            ClientSelection.openKits(selected.get("id").getAsString());
            return;
        }
        submitted = true;
        updateNext();
        PacketDistributor.sendToServer(new HeritageNetwork.Choose(selected.get("id").getAsString(),
                automaticKit.get("id").getAsString(), catalog.get("revision").getAsLong()));
    }

    private void updateNext() {
        var kits = ClientSelection.allowedKits(catalog, selectedId());
        JsonObject only = kits.size() == 1 ? kits.getFirst() : null;
        automaticKit = only != null && only.getAsJsonArray("items").isEmpty()
                && only.get("problem").getAsString().isEmpty() ? only : null;
        for (Card card : cards) card.active = !submitted;
        description.active = !submitted;
        next.active = selected != null && !kits.isEmpty() && !submitted;
        next.setMessage(submitted ? ClientSelection.progress() : Component.translatable(
                automaticKit == null ? "screen.kingdomsheritage.next" : "screen.kingdomsheritage.begin"));
    }

    @Override
    public void tick() {
        if (submitted) updateNext();
    }

    @Override
    public void render(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
        hovered = cardAt(mouseX, mouseY);
        Card foreground = minecraft.getLastInputType().isKeyboard() && getFocused() instanceof Card focused
                ? focused : hovered;
        if (foreground != null && preview != foreground.choice) {
            preview = foreground.choice;
            updateDescription();
        }
        super.render(graphics, mouseX, mouseY, partialTick);
        graphics.flush();
        if (foreground == null) foreground = cards.stream().filter(card -> card.choice == preview).findFirst().orElse(null);
        long now = net.minecraft.Util.getMillis();
        float blend = 1 - (float) Math.exp(-Math.min(100, now - renderedAt) / 55.0);
        renderedAt = now;
        int layer = 0;
        for (var card : cards) {
            float target = expanded != null ? 0 : card == foreground ? 12 : card.choice == selected ? 4 : 0;
            card.lift += (target - card.lift) * blend;
            card.setY(top - Math.round(card.lift * scale));
            if (card != foreground) card.draw(graphics, mouseX, mouseY, partialTick, layer++ * 10);
        }
        if (foreground != null) foreground.draw(graphics, mouseX, mouseY, partialTick, cards.size() * 10);
        positionDescription();
        graphics.pose().pushPose();
        graphics.pose().translate(0, 0, (cards.size() + 1) * 10);
        description.render(graphics, mouseX, mouseY, partialTick);
        graphics.flush();
        graphics.pose().popPose();
        if (hovered != null && (!description.visible || !description.isHovered())) {
            setTooltipForNextRenderPass(hovered.getTooltip(), DefaultTooltipPositioner.INSTANCE, true);
        }
        if (expanded == null && choices.size() > PAGE_SIZE) {
            graphics.drawCenteredString(font, Component.literal((page + 1) + " / " + ((choices.size() + PAGE_SIZE - 1) / PAGE_SIZE)),
                    width - 18, height - 43, 0xffffff);
        }
        graphics.drawCenteredString(font, title, width / 2, 12, 0xffffff);
        String error = catalog.get("error").getAsString();
        if (!error.isEmpty()) {
            var lines = font.split(DefinitionJson.message(catalog, "error", minecraft.player.registryAccess()), width - 20);
            for (int index = 0; index < Math.min(2, lines.size()); index++) {
                graphics.drawCenteredString(font, lines.get(index), width / 2, height - 51 + index * 9, 0xffaaaa);
            }
        } else if (automaticKit == null) graphics.drawCenteredString(font, Component.translatable("screen.kingdomsheritage.step_location"), width / 2, height - 43, 0xffffff);
    }

    @Override
    public void renderBackground(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
        graphics.fillGradient(0, 0, width, height, 0xff171a20, 0xff08090b);
    }

    @Override
    public boolean mouseScrolled(double mouseX, double mouseY, double horizontal, double vertical) {
        if (expanded != null) {
            descriptionScroll = Math.max(0, descriptionScroll - vertical * 16);
            return true;
        }
        return super.mouseScrolled(mouseX, mouseY, horizontal, vertical);
    }

    @Override public boolean isPauseScreen() { return false; }
    @Override public boolean shouldCloseOnEsc() { return false; }

    private final class Card extends Button {
        private final JsonObject choice;
        private final ResourceLocation cover;
        private float lift;

        private Card(int x, JsonObject choice) {
            super(x, top, Math.round((expanded == null ? CARD_WIDTH : EXPANDED_WIDTH) * scale),
                    Math.round(CARD_HEIGHT * scale), DefinitionJson.component(choice, "title"),
                    button -> { selected = choice; preview = choice; updateNext(); updateDescription(); }, DEFAULT_NARRATION);
            this.choice = choice;
            ResourceLocation requested = ResourceLocation.parse(choice.get("image").getAsString());
            cover = minecraft.getResourceManager().getResource(requested).isPresent() ? requested : FALLBACK;
            setTooltip(Tooltip.create(getMessage()));
        }

        @Override
        public boolean isMouseOver(double mouseX, double mouseY) {
            return cardAt(mouseX, mouseY) == this;
        }

        private void draw(GuiGraphics graphics, int mouseX, int mouseY, float partialTick, int layer) {
            isHovered = this == hovered;
            graphics.pose().pushPose();
            graphics.pose().translate(0, 0, layer);
            renderWidget(graphics, mouseX, mouseY, partialTick);
            graphics.flush();
            graphics.pose().popPose();
        }

        @Override
        protected void renderWidget(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
            graphics.pose().pushPose();
            graphics.pose().translate(getX(), getY(), 0);
            graphics.pose().scale(scale, scale, 1);
            blit(graphics, cover, 0, 0, CARD_WIDTH, CARD_HEIGHT);
            blit(graphics, expanded == null ? CARD : EXPANDED, 0, 0, expanded == null ? CARD_WIDTH : EXPANDED_WIDTH, CARD_HEIGHT);
            if (choice == selected) graphics.renderOutline(2, 2, 124, 188, 0xfff2cd83);
            else if (isHoveredOrFocused()) graphics.renderOutline(2, 2, 124, 188, 0xffeeeeee);
            float titleScale = Math.max(1.5F, Math.min(2, 114F / Math.max(1, font.width(getMessage()))));
            var lines = font.split(getMessage(), (int) (114 / titleScale));
            lines = lines.subList(0, Math.min(3, lines.size()));
            int titleHeight = Math.round(((lines.size() - 1) * font.lineHeight + 8) * titleScale);
            graphics.pose().pushPose();
            graphics.pose().translate(7, CARD_HEIGHT - 18 - titleHeight, 0);
            graphics.pose().scale(titleScale, titleScale, 1);
            for (int index = 0; index < lines.size(); index++) graphics.drawString(font, lines.get(index), 0, index * font.lineHeight, 0xffffff, true);
            graphics.pose().popPose();
            if (expanded != null) {
                var description = font.split(DefinitionJson.component(choice, "description"), 230);
                descriptionScroll = Math.min(descriptionScroll, Math.max(0, description.size() * font.lineHeight - 170));
                graphics.enableScissor(getX() + Math.round(132 * scale), getY() + Math.round(9 * scale),
                        getX() + Math.round(366 * scale), getY() + Math.round(183 * scale));
                for (int index = 0; index < description.size(); index++) {
                    graphics.drawString(font, description.get(index), 134, 10 + index * font.lineHeight - (int) descriptionScroll, 0xffffff, false);
                }
                graphics.disableScissor();
            }
            graphics.pose().popPose();
        }
    }

    private static void blit(GuiGraphics graphics, ResourceLocation texture, int x, int y, int width, int height) {
        RenderSystem.enableBlend();
        RenderSystem.defaultBlendFunc();
        graphics.blit(texture, x, y, 0, 0, width, height, width, height);
        RenderSystem.disableBlend();
    }
}

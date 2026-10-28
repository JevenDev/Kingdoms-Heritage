package com.jvn.kingdomsheritage.client;

import com.google.gson.JsonObject;
import com.jvn.kingdomsheritage.network.HeritageNetwork;
import com.mojang.blaze3d.systems.RenderSystem;
import java.util.List;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.Tooltip;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.inventory.tooltip.DefaultTooltipPositioner;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.neoforged.neoforge.network.PacketDistributor;

public final class SpawnSelectScreen extends Screen {
    private static final int CARD_WIDTH = 128;
    private static final int CARD_HEIGHT = 192;
    private static final int EXPANDED_WIDTH = 374;
    private static final int PAGE_SIZE = 3;
    private static final ResourceLocation CARD = texture("campaign_select_screen_card");
    private static final ResourceLocation EXPANDED = texture("campaign_select_screen_card_expanded");
    private static final ResourceLocation CARET = texture("campaign_select_screen_card_caret_expand");
    private static final ResourceLocation COLLAPSE = texture("campaign_select_screen_card_caret_expanded");
    private static final ResourceLocation FALLBACK = texture("campaign_select_screen_card_fallback");
    private final JsonObject catalog;
    private final List<JsonObject> choices;
    private final JsonObject automaticKit;
    private JsonObject selected;
    private JsonObject expanded;
    private int page;
    private float scale;
    private int top;
    private Button next;
    private double descriptionScroll;
    private boolean submitted;
    private long submittedAt;

    public SpawnSelectScreen(JsonObject catalog) {
        super(Component.translatable("screen.kingdomsheritage.location"));
        this.catalog = catalog;
        var kits = catalog.getAsJsonArray("kits");
        JsonObject onlyKit = kits.size() == 1 ? kits.get(0).getAsJsonObject() : null;
        automaticKit = onlyKit != null && onlyKit.getAsJsonArray("items").isEmpty()
                && onlyKit.get("problem").getAsString().isEmpty() ? onlyKit : null;
        choices = catalog.getAsJsonArray("spawns").asList().stream().map(value -> value.getAsJsonObject()).toList();
    }

    private static ResourceLocation texture(String name) {
        return ResourceLocation.fromNamespaceAndPath("kingdomsheritage", "textures/gui/campaign_select_screen/" + name + ".png");
    }

    @Override
    protected void init() {
        int count = Math.min(PAGE_SIZE, choices.size() - page * PAGE_SIZE);
        int groupWidth = expanded != null ? EXPANDED_WIDTH : count * CARD_WIDTH + (count - 1) * 16;
        scale = Math.max(0.1F, Math.min(1, Math.min((width - 8F) / groupWidth, (height - 85F) / CARD_HEIGHT)));
        int left = Math.round((width - groupWidth * scale) / 2);
        top = Math.round(30 + (height - 85 - CARD_HEIGHT * scale) / 2);
        List<JsonObject> visible = expanded != null ? List.of(expanded) : choices.subList(page * PAGE_SIZE, page * PAGE_SIZE + count);
        for (int index = 0; index < visible.size(); index++) {
            JsonObject choice = visible.get(index);
            int x = left + Math.round(index * (CARD_WIDTH + 16) * scale);
            addRenderableWidget(new Card(x, choice));
            if (!choice.get("description").getAsString().isBlank()) {
                Button caret = new Button(x + Math.round(109 * scale), top + Math.round(80 * scale),
                        Math.max(12, Math.round(19 * scale)), Math.max(18, Math.round(32 * scale)),
                        Component.translatable(expanded == null ? "screen.kingdomsheritage.expand" : "screen.kingdomsheritage.collapse"),
                        button -> {
                            expanded = expanded == null ? choice : null;
                            selected = choice;
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
                };
                addRenderableWidget(caret);
            }
        }
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

    private void confirm() {
        if (selected == null || submitted) return;
        if (automaticKit == null) {
            ClientSelection.openKits(selected.get("id").getAsString());
            return;
        }
        submitted = true;
        submittedAt = net.minecraft.Util.getMillis();
        updateNext();
        PacketDistributor.sendToServer(new HeritageNetwork.Choose(selected.get("id").getAsString(),
                automaticKit.get("id").getAsString(), catalog.get("revision").getAsLong()));
    }

    private void updateNext() {
        next.active = selected != null && !submitted;
        next.setMessage(Component.translatable(submitted ? "screen.kingdomsheritage.wait"
                : automaticKit == null ? "screen.kingdomsheritage.next" : "screen.kingdomsheritage.begin"));
    }

    @Override
    public void tick() {
        if (submitted && net.minecraft.Util.getMillis() - submittedAt > 10000) {
            submitted = false;
            updateNext();
        }
    }

    @Override
    public void render(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
        super.render(graphics, mouseX, mouseY, partialTick);
        for (var child : children()) {
            if (child instanceof Card card && card.isHovered() && card.getTooltip() != null) {
                setTooltipForNextRenderPass(card.getTooltip(), DefaultTooltipPositioner.INSTANCE, true);
            }
        }
        graphics.drawCenteredString(font, title, width / 2, 12, 0xffffff);
        String error = catalog.get("error").getAsString();
        if (!error.isEmpty()) {
            var lines = font.split(Component.literal(error), width - 20);
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

        private Card(int x, JsonObject choice) {
            super(x, top, Math.round((expanded == null ? CARD_WIDTH : EXPANDED_WIDTH) * scale),
                    Math.round(CARD_HEIGHT * scale), Component.literal(choice.get("title").getAsString()),
                    button -> { selected = choice; updateNext(); }, DEFAULT_NARRATION);
            this.choice = choice;
            ResourceLocation requested = ResourceLocation.parse(choice.get("image").getAsString());
            cover = minecraft.getResourceManager().getResource(requested).isPresent() ? requested : FALLBACK;
            setTooltip(Tooltip.create(getMessage()));
        }

        @Override
        public boolean mouseClicked(double mouseX, double mouseY, int button) {
            double localX = (mouseX - getX()) / scale;
            double localY = (mouseY - getY()) / scale;
            if (!choice.get("description").getAsString().isBlank() && localX >= 109 && localX < 130 && localY >= 80 && localY < 112) return false;
            return super.mouseClicked(mouseX, mouseY, button);
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
            var lines = font.split(getMessage(), 57);
            lines = lines.subList(0, Math.min(3, lines.size()));
            int titleHeight = (lines.size() - 1) * font.lineHeight * 2 + 16;
            graphics.pose().pushPose();
            graphics.pose().translate(7, CARD_HEIGHT - 18 - titleHeight, 0);
            graphics.pose().scale(2, 2, 1);
            for (int index = 0; index < lines.size(); index++) graphics.drawString(font, lines.get(index), 0, index * font.lineHeight, 0xffffff, true);
            graphics.pose().popPose();
            if (expanded != null) {
                var description = font.split(Component.literal(choice.get("description").getAsString()), 230);
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

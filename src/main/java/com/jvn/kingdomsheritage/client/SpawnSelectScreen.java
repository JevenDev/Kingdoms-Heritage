package com.jvn.kingdomsheritage.client;

import com.google.gson.JsonObject;
import com.jvn.kingdomsheritage.data.DefinitionJson;
import com.jvn.kingdomsheritage.network.HeritageNetwork;
import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.math.Axis;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.Tooltip;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.inventory.tooltip.DefaultTooltipPositioner;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;
import net.neoforged.neoforge.network.PacketDistributor;
import org.lwjgl.glfw.GLFW;

public final class SpawnSelectScreen extends Screen {
    private static final int CARD_WIDTH = 128;
    private static final int CARD_HEIGHT = 192;
    private static final int EXPANDED_WIDTH = 374;
    private static final int PAGE_SIZE = 10;
    private static final ResourceLocation CARD = texture("campaign_select_screen_card");
    private static final ResourceLocation EXPANDED = texture("campaign_select_screen_card_expanded");
    private static final ResourceLocation FALLBACK = texture("campaign_select_screen_card_fallback");
    private final JsonObject catalog;
    private final List<JsonObject> choices;
    private JsonObject automaticKit;
    private JsonObject selected;
    private JsonObject expanded;
    private final List<Card> cards = new ArrayList<>();
    private final List<Button> pageButtons = new ArrayList<>();
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
        pageButtons.clear();
        hovered = null;
        renderedAt = net.minecraft.Util.getMillis();
        int count = Math.min(PAGE_SIZE, choices.size() - page * PAGE_SIZE);
        List<JsonObject> visible = choices.subList(page * PAGE_SIZE, page * PAGE_SIZE + count);
        for (JsonObject choice : visible) cards.add(addWidget(new Card(choice)));
        layoutCards(false);
        preview = expanded != null ? expanded : visible.contains(selected) ? selected : visible.getFirst();
        description = addWidget(new Button(0, 0, Math.max(12, Math.round(19 * scale)), Math.max(18, Math.round(32 * scale)),
                Component.translatable(expanded == null ? "screen.kingdomsheritage.expand" : "screen.kingdomsheritage.collapse"),
                button -> {
                    selected = preview;
                    expanded = expanded == null ? preview : null;
                    descriptionScroll = 0;
                    layoutCards(true);
                    description.setMessage(Component.translatable(expanded == null
                            ? "screen.kingdomsheritage.expand" : "screen.kingdomsheritage.collapse"));
                    updateDescription();
                    updateNext();
                    setFocused(cards.stream().filter(card -> card.choice == selected).findFirst().orElse(null));
                }, message -> message.get()) {
            @Override
            protected void renderWidget(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
                Card card = cards.stream().filter(candidate -> candidate.choice == preview).findFirst().orElse(null);
                if (card == null) return;
                graphics.pose().pushPose();
                card.applyPose(graphics);
                graphics.pose().translate((getX() - card.layout.x) / card.layout.scale, 80, 0);
                SelectionControls.drawArrow(graphics, expanded == null, active && isHoveredOrFocused(), 1, 4);
                graphics.pose().popPose();
            }
        });
        updateDescription();
        int buttonWidth = Math.min(130, (width - 100) / 2);
        addRenderableWidget(SelectionControls.disconnect(height));
        next = addRenderableWidget(Button.builder(Component.empty(), button -> confirm())
                .bounds((width - buttonWidth) / 2, height - 28, buttonWidth, 20).build());
        updateNext();
        if (choices.size() > PAGE_SIZE) {
            var previous = addRenderableWidget(SelectionControls.arrow((width - buttonWidth) / 2 - 40, height - 34, false,
                    Component.translatable("spectatorMenu.previous_page"), button -> { page--; rebuildWidgets(); }));
            previous.active = page > 0;
            previous.visible = expanded == null;
            pageButtons.add(previous);
            var forward = addRenderableWidget(SelectionControls.arrow((width + buttonWidth) / 2 + 8, height - 34, true,
                    Component.translatable("spectatorMenu.next_page"), button -> { page++; rebuildWidgets(); }));
            forward.active = (page + 1) * PAGE_SIZE < choices.size();
            forward.visible = expanded == null;
            pageButtons.add(forward);
        }
    }

    private void layoutCards(boolean animate) {
        int count = cards.size();
        int cardWidth = expanded != null ? EXPANDED_WIDTH : CARD_WIDTH;
        scale = Math.max(0.1F, Math.min(1, Math.min((width - 32F) / cardWidth, (height - 116F) / CARD_HEIGHT)));
        float step = count <= 1 ? 0 : Math.min((CARD_WIDTH + 16) * scale, (width - 32F - CARD_WIDTH * scale) / (count - 1));
        float groupWidth = expanded != null ? EXPANDED_WIDTH * scale : CARD_WIDTH * scale + (count - 1) * step;
        int left = Math.round((width - groupWidth) / 2);
        top = Math.round(40 + (height - 116 - CARD_HEIGHT * scale) / 2);
        long now = net.minecraft.Util.getMillis();
        for (int index = 0; index < count; index++) {
            Card card = cards.get(index);
            boolean open = card.choice == expanded;
            boolean visible = expanded == null || open;
            Layout target = new Layout(open ? left : left + Math.round(index * step), top, scale,
                    open ? EXPANDED_WIDTH : CARD_WIDTH, visible ? 1 : 0, open ? 1 : 0);
            if (!visible && card.layout != null) {
                target = new Layout(card.layout.x, card.layout.y + 4, card.layout.scale, CARD_WIDTH, 0, 0);
            }
            int delay = expanded == null && card.layout != null && card.layout.opacity < 1 ? index * 25 : 0;
            card.moveTo(target, now, animate, delay);
            card.visible = visible;
        }
        for (Button button : pageButtons) button.visible = expanded == null;
    }

    private void updateDescription() {
        description.visible = expanded != null || !DefinitionJson.component(preview, "description").getString().isBlank();
        description.setTooltip(Tooltip.create(description.getMessage()));
        positionDescription();
    }

    private void positionDescription() {
        for (int index = 0; index < cards.size(); index++) {
            Card card = cards.get(index);
            if (card.choice != preview) continue;
            int right = expanded == null && card.layout.width == CARD_WIDTH && index + 1 < cards.size()
                    ? Math.min(card.getRight(), cards.get(index + 1).getX()) : card.getRight();
            description.setWidth(Math.max(12, Math.round(19 * card.layout.scale)));
            description.setHeight(Math.max(18, Math.round(32 * card.layout.scale)));
            description.setX(card.getX() + Math.min(Math.round(109 * card.layout.scale), Math.max(0, right - card.getX() - description.getWidth())));
            description.setY(card.getY() + Math.round(80 * card.layout.scale));
            return;
        }
    }

    private Card cardAt(double mouseX, double mouseY) {
        for (Card card : cards) {
            if (card.layout.width > CARD_WIDTH && card.visible && contains(card, mouseX, mouseY, card.getRight())) return card;
        }
        for (int index = cards.size() - 1; index >= 0; index--) {
            Card card = cards.get(index);
            if (!card.visible || card.layout.opacity < 0.05F) continue;
            int right = expanded == null && index + 1 < cards.size()
                    ? Math.min(card.getRight(), cards.get(index + 1).getX()) : card.getRight();
            // fixed strips keep the hovered card from swallowing its neighbours
            if (contains(card, mouseX, mouseY, right)) return card;
        }
        return null;
    }

    private boolean contains(Card card, double mouseX, double mouseY, int right) {
        return mouseX >= card.getX() && mouseX < right && mouseY >= card.layout.y - 12 * card.layout.scale
                && mouseY < card.layout.y + CARD_HEIGHT * card.layout.scale;
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
            if (expanded != null) return true;
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
        if (selected == null || submitted || SelectionTransition.active()) return;
        if (automaticKit == null) {
            ClientSelection.openKits(selected.get("id").getAsString());
            return;
        }
        submitted = true;
        updateNext();
        var request = new HeritageNetwork.Choose(selected.get("id").getAsString(),
                automaticKit.get("id").getAsString(), catalog.get("revision").getAsLong());
        SelectionTransition.fadeOut(() -> PacketDistributor.sendToServer(request));
    }

    private void updateNext() {
        var kits = ClientSelection.allowedKits(catalog, selectedId());
        JsonObject only = kits.size() == 1 ? kits.getFirst() : null;
        automaticKit = only != null && only.getAsJsonArray("items").isEmpty()
                && only.get("problem").getAsString().isEmpty() ? only : null;
        for (Card card : cards) card.active = !submitted && card.visible;
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
        long now = net.minecraft.Util.getMillis();
        for (Card card : cards) card.sample(now);
        hovered = cardAt(mouseX, mouseY);
        Card foreground = minecraft.getLastInputType().isKeyboard() && getFocused() instanceof Card focused
                ? focused : hovered;
        Card moving = cards.stream().filter(card -> card.visible && card.layout.width > CARD_WIDTH).findFirst().orElse(null);
        if (moving != null) foreground = moving;
        if (foreground != null && preview != foreground.choice) {
            preview = foreground.choice;
            updateDescription();
        }
        super.render(graphics, mouseX, mouseY, partialTick);
        graphics.flush();
        Card active = foreground;
        if (foreground == null) foreground = cards.stream().filter(card -> card.choice == preview).findFirst().orElse(null);
        float delta = Mth.clamp((now - renderedAt) / 1000F, 0, 0.05F);
        renderedAt = now;
        int layer = 0;
        for (var card : cards) {
            card.animate(delta, card == active, mouseX);
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
            Card last = cards.getLast();
            graphics.drawCenteredString(font, Component.literal((page + 1) + " / " + ((choices.size() + PAGE_SIZE - 1) / PAGE_SIZE)),
                    Math.round(last.layout.x + last.layout.width * last.layout.scale / 2),
                    Math.round(last.layout.y + CARD_HEIGHT * last.layout.scale) + 8, 0xffffff);
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
        SelectionBackground.render(graphics, width, height);
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

    private record Layout(float x, float y, float scale, float width, float opacity, float details) {
        Layout interpolate(Layout target, float progress, float descriptionProgress) {
            return new Layout(Mth.lerp(progress, x, target.x), Mth.lerp(progress, y, target.y),
                    Mth.lerp(progress, scale, target.scale), Mth.lerp(progress, width, target.width),
                    Mth.lerp(progress, opacity, target.opacity), Mth.lerp(descriptionProgress, details, target.details));
        }
    }

    private static float easeOut(float progress) {
        float remaining = 1 - Mth.clamp(progress, 0, 1);
        return 1 - remaining * remaining * remaining;
    }

    private final class Card extends Button {
        private final JsonObject choice;
        private final ResourceLocation cover;
        private float lift;
        private float hover;
        private float selection;
        private float tilt;
        private Layout layout;
        private Layout from;
        private Layout target;
        private long started;
        private int delay;
        private int straightenDelay;
        private float fromTilt;

        private Card(JsonObject choice) {
            super(0, 0, CARD_WIDTH, CARD_HEIGHT, DefinitionJson.component(choice, "title"),
                    button -> { selected = choice; preview = choice; updateNext(); updateDescription(); }, DEFAULT_NARRATION);
            this.choice = choice;
            ResourceLocation requested = ResourceLocation.parse(choice.get("image").getAsString());
            cover = minecraft.getResourceManager().getResource(requested).isPresent() ? requested : FALLBACK;
            setTooltip(Tooltip.create(getMessage()));
        }

        private void moveTo(Layout target, long now, boolean animate, int delay) {
            if (animate) sample(now);
            else layout = target;
            from = layout;
            this.target = target;
            started = now;
            this.delay = delay;
            fromTilt = tilt;
            straightenDelay = target.details == 1 && Math.abs(tilt) > 0.01F ? 60 : 0;
            sample(now);
        }

        private void sample(long now) {
            if (target == null) return;
            float elapsed = now - started - delay;
            if (target.details == 1) tilt = fromTilt * (1 - easeOut(elapsed / 60F));
            elapsed -= straightenDelay;
            float progress = easeOut(elapsed / (target.opacity == 0 ? 140F : 240F));
            float descriptionProgress = easeOut((elapsed - (target.details == 1 ? 100 : 0))
                    / (target.details == 1 ? 140F : 90F));
            layout = from.interpolate(target, progress, descriptionProgress);
            setX(Math.round(layout.x));
            setY(Math.round(layout.y - lift * layout.scale));
            setWidth(Math.round(layout.width * layout.scale));
            setHeight(Math.round(CARD_HEIGHT * layout.scale));
        }

        @Override
        public boolean isMouseOver(double mouseX, double mouseY) {
            return cardAt(mouseX, mouseY) == this;
        }

        private void animate(float delta, boolean active, int mouseX) {
            float response = 1 - (float) Math.exp(-delta * 12);
            boolean flat = expanded != null || layout.width > CARD_WIDTH;
            float targetLift = flat ? 0 : active ? 12 : choice == selected ? 4 : 0;
            lift = Mth.lerp(response, lift, targetLift);
            hover = Mth.lerp(response, hover, active ? 1 : 0);
            selection = Mth.lerp(response, selection, choice == selected ? 1 : 0);
            float horizontal = Mth.clamp((mouseX - getX()) / (CARD_WIDTH * layout.scale) * 2 - 1, -1, 1);
            float targetTilt = !flat && active && this == hovered ? horizontal * 1.25F : 0;
            if (target.details == 0) tilt = Mth.lerp(1 - (float) Math.exp(-delta * 10), tilt, targetTilt);
            setY(Math.round(layout.y - lift * layout.scale));
        }

        private void applyPose(GuiGraphics graphics) {
            graphics.pose().translate(layout.x, layout.y - lift * layout.scale, 0);
            graphics.pose().scale(layout.scale, layout.scale, 1);
            graphics.pose().translate(CARD_WIDTH / 2F, CARD_HEIGHT / 2F, 0);
            graphics.pose().mulPose(Axis.ZP.rotationDegrees(tilt));
            graphics.pose().translate(-CARD_WIDTH / 2F, -CARD_HEIGHT / 2F, 0);
        }

        private void draw(GuiGraphics graphics, int mouseX, int mouseY, float partialTick, int layer) {
            if (layout.opacity < 0.02F) return;
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
            applyPose(graphics);
            graphics.setColor(1, 1, 1, layout.opacity);
            if (cover.equals(FALLBACK)) blit(graphics, cover, 0, 0, CARD_WIDTH, CARD_HEIGHT);
            else blit(graphics, cover, 4, 4, CARD_WIDTH - 8, CARD_HEIGHT - 8);
            int frameWidth = Math.round(layout.width);
            if (frameWidth == CARD_WIDTH) blit(graphics, CARD, 0, 0, CARD_WIDTH, CARD_HEIGHT);
            else {
                RenderSystem.enableBlend();
                RenderSystem.defaultBlendFunc();
                graphics.blit(EXPANDED, 0, 0, 0, 0, frameWidth - 3, CARD_HEIGHT, EXPANDED_WIDTH, CARD_HEIGHT);
                graphics.blit(EXPANDED, frameWidth - 3, 0, EXPANDED_WIDTH - 3, 0, 3, CARD_HEIGHT, EXPANDED_WIDTH, CARD_HEIGHT);
                RenderSystem.disableBlend();
            }
            graphics.setColor(1, 1, 1, 1);
            int textAlpha = Math.round(layout.opacity * 255) << 24;
            int selectionAlpha = Math.round(selection * layout.opacity * 255);
            int hoverAlpha = Math.round(hover * (1 - selection) * layout.opacity * 255);
            if (selectionAlpha > 0) graphics.renderOutline(2, 2, 124, 188, selectionAlpha << 24 | 0xf2cd83);
            if (hoverAlpha > 0) graphics.renderOutline(2, 2, 124, 188, hoverAlpha << 24 | 0xeeeeee);
            float titleScale = Math.max(1.5F, Math.min(2, 114F / Math.max(1, font.width(getMessage()))));
            var lines = font.split(getMessage(), (int) (114 / titleScale));
            lines = lines.subList(0, Math.min(3, lines.size()));
            int titleHeight = Math.round(((lines.size() - 1) * font.lineHeight + 8) * titleScale);
            graphics.pose().pushPose();
            graphics.pose().translate(7, CARD_HEIGHT - 18 - titleHeight, 0);
            graphics.pose().scale(titleScale, titleScale, 1);
            for (int index = 0; index < lines.size(); index++) graphics.drawString(font, lines.get(index), 0, index * font.lineHeight, textAlpha | 0xffffff, true);
            graphics.pose().popPose();
            String subtitle = DefinitionJson.component(choice, "subtitle").getString();
            graphics.drawString(font, font.plainSubstrByWidth(subtitle, 114), 7, CARD_HEIGHT - 15, textAlpha | 0xdddddd, true);
            int descriptionAlpha = Math.round(layout.details * layout.opacity * 255);
            if (descriptionAlpha >= 4 && frameWidth > 140) {
                var description = font.split(DefinitionJson.component(choice, "description"), 230);
                descriptionScroll = Math.min(descriptionScroll, Math.max(0, description.size() * font.lineHeight - 170));
                graphics.enableScissor(Math.round(layout.x + 132 * layout.scale), getY() + Math.round(9 * layout.scale),
                        Math.round(layout.x + Math.min(366, frameWidth - 8) * layout.scale), getY() + Math.round(183 * layout.scale));
                for (int index = 0; index < description.size(); index++) {
                    graphics.drawString(font, description.get(index), 134, 10 + index * font.lineHeight - (int) descriptionScroll,
                            descriptionAlpha << 24 | 0xffffff, false);
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

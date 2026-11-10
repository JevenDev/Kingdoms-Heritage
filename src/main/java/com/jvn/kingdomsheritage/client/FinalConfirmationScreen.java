package com.jvn.kingdomsheritage.client;

import com.google.gson.JsonObject;
import com.jvn.kingdomsheritage.network.HeritageNetwork;
import com.jvn.toucanlib.client.ToucanGlyphLayout;
import com.jvn.toucanlib.client.ToucanGuiText;
import com.jvn.toucanlib.client.ToucanTextRenderer;
import com.jvn.kingdomsheritage.data.DialoguePacing;
import java.util.List;
import java.util.UUID;
import net.minecraft.Util;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import net.minecraft.util.Mth;
import net.neoforged.neoforge.network.PacketDistributor;
import org.lwjgl.glfw.GLFW;

final class FinalConfirmationScreen extends Screen {
    private final UUID token;
    private final DialoguePacing.Schedule timeline;
    private final List<ToucanGlyphLayout.Glyph> glyphs;
    private List<ToucanGlyphLayout.Line> lines = List.of();
    private long started = -1;
    private long revealedAt = -1;
    private boolean skipped;
    private boolean submitted;
    private int lastAudible;
    private int nextBlip = 1;
    private float textScale;
    private float textTop;
    private Button confirm;
    private Button back;
    private Button disconnect;

    FinalConfirmationScreen(JsonObject catalog, JsonObject review) {
        super(Component.translatable("screen.kingdomsheritage.review_title"));
        token = UUID.fromString(review.get("token").getAsString());
        var narration = SelectionNarration.create(DialogueText.context(review));
        timeline = narration.timeline();
        glyphs = ToucanGlyphLayout.glyphs(narration.text(), 0);
    }

    @Override
    protected void init() {
        int margin = Math.min(48, Math.max(16, width / 12));
        int available = Math.min(560, width - margin * 2);
        textScale = 1.5F;
        do {
            lines = ToucanGlyphLayout.wrap(font, glyphs, ToucanGuiText.scaledWrapWidth(available, textScale));
            if (lines.size() * (font.lineHeight + 5) * textScale <= Math.max(24, height - 136) || textScale <= 0.6F) break;
            textScale -= 0.1F;
        } while (true);
        float textHeight = lines.size() * (font.lineHeight + 5) * textScale;
        textTop = (height - textHeight) / 2 - 24;
        int buttonY = Math.round(textTop + textHeight + 20);
        int buttonWidth = Math.min(150, (width - margin * 2 - 8) / 2);
        confirm = addRenderableWidget(new SelectionControls.SoundButton(width / 2 - buttonWidth - 4, buttonY, buttonWidth, 20,
                Component.translatable("screen.kingdomsheritage.review_accept"), button -> confirm()));
        back = addRenderableWidget(new SelectionControls.SoundButton(width / 2 + 4, buttonY, buttonWidth, 20,
                Component.translatable("screen.kingdomsheritage.review_back"), button -> onClose()));
        disconnect = addRenderableWidget(SelectionControls.disconnect(height));
        updateButtons();
    }

    @Override
    protected void setInitialFocus() {
        if (complete()) super.setInitialFocus();
    }

    private long elapsed() { return started < 0 ? 0 : Util.getMillis() - started; }
    private int visible() { return skipped ? timeline.length() : timeline.visibleCharacters(elapsed()); }
    private boolean complete() { return skipped || started >= 0 && timeline.complete(elapsed()); }

    private void updateButtons() {
        boolean complete = complete();
        boolean revealed = revealedAt < 0 && complete;
        if (revealed) revealedAt = Util.getMillis();
        float alpha = controlsAlpha(revealedAt, Util.getMillis());
        confirm.visible = back.visible = complete;
        confirm.setAlpha(alpha);
        back.setAlpha(alpha);
        confirm.active = back.active = complete && alpha == 1 && !submitted;
        confirm.setMessage(submitted ? ClientSelection.progress() : Component.translatable("screen.kingdomsheritage.review_accept"));
        if (revealed && getFocused() == null && minecraft.getLastInputType().isKeyboard()) setFocused(confirm);
    }

    static float controlsAlpha(long revealedAt, long now) {
        if (revealedAt < 0) return 0;
        float progress = Mth.clamp((now - revealedAt) / 220F, 0, 1);
        return progress * progress * (3 - 2 * progress);
    }

    @Override
    public void tick() {
        if (SelectionTransition.active()) return;
        if (started < 0) started = Util.getMillis();
        updateButtons();
        int visible = visible();
        if (!skipped && visible >= nextBlip) {
            if (glyphs.subList(lastAudible, visible).stream().anyMatch(glyph -> Character.isLetterOrDigit(glyph.codePoint()))) {
                SelectionSounds.DIALOGUE.play(0.7F);
            }
            lastAudible = visible;
            nextBlip = visible + 2 + minecraft.player.getRandom().nextInt(3);
        }
    }

    private void revealAll() {
        skipped = true;
        lastAudible = timeline.length();
        updateButtons();
    }

    private void confirm() {
        if (!complete() || !confirm.active || submitted || SelectionTransition.active()) return;
        submitted = true;
        updateButtons();
        SelectionTransition.fadeOut(() -> PacketDistributor.sendToServer(new HeritageNetwork.ReviewDecision(token, true)));
    }

    void retry() {
        submitted = false;
        updateButtons();
    }

    @Override
    public void onClose() {
        if (!submitted && !SelectionTransition.active()) ClientSelection.cancelReview(token);
    }

    @Override
    public boolean isPauseScreen() { return false; }

    @Override
    public Component getNarrationMessage() { return Component.literal(timeline.text()); }

    @Override
    public boolean mouseClicked(double mouseX, double mouseY, int button) {
        if (SelectionTransition.active()) return false;
        if (button == 0 && !complete() && !disconnect.isMouseOver(mouseX, mouseY)) {
            revealAll();
            return true;
        }
        return super.mouseClicked(mouseX, mouseY, button);
    }

    @Override
    public boolean keyPressed(int key, int scanCode, int modifiers) {
        if (SelectionTransition.active()) return false;
        if (!complete() && (key == GLFW.GLFW_KEY_ENTER || key == GLFW.GLFW_KEY_SPACE) && getFocused() != disconnect) {
            revealAll();
            return true;
        }
        return super.keyPressed(key, scanCode, modifiers);
    }

    @Override
    public void renderBackground(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
        SelectionBackground.render(graphics, width, height);
    }

    @Override
    public void render(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
        updateButtons();
        super.render(graphics, mouseX, mouseY, partialTick);
        graphics.pose().pushPose();
        graphics.pose().translate(width / 2F, textTop, 0);
        graphics.pose().scale(textScale, textScale, 1);
        int visible = visible();
        for (int i = 0; i < lines.size(); i++) {
            var line = lines.get(i).visible(visible);
            ToucanTextRenderer.renderOutlinedLine(graphics, font, line, -font.width(line) / 2,
                    i * (font.lineHeight + 5), 0xffeeeae0, (int) (elapsed() / 50));
        }
        graphics.pose().popPose();
        int hintAlpha = Math.round((1 - controlsAlpha(revealedAt, Util.getMillis())) * 255);
        if (hintAlpha >= 4) SelectionText.centered(graphics, font, Component.translatable("screen.kingdomsheritage.review_skip"),
                width / 2, height - 27, hintAlpha << 24 | 0xaaaaaa);
    }
}

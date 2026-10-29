package com.jvn.kingdomsheritage.client;

import com.google.gson.JsonObject;
import com.jvn.kingdomsheritage.data.IntroDefinition;
import com.jvn.kingdomsheritage.network.HeritageNetwork;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.DeathScreen;
import net.minecraft.client.gui.screens.DisconnectedScreen;
import net.minecraft.client.gui.screens.PauseScreen;
import net.minecraft.client.gui.screens.ReceivingLevelScreen;
import net.minecraft.client.resources.sounds.SimpleSoundInstance;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.util.Mth;
import net.neoforged.neoforge.client.event.InputEvent;
import net.neoforged.neoforge.client.event.ScreenEvent;
import net.neoforged.neoforge.common.NeoForge;
import net.neoforged.neoforge.network.PacketDistributor;

public final class SpawnIntroOverlay {
    private static final SoundEvent BLIP = SoundEvent.createVariableRangeEvent(
            ResourceLocation.fromNamespaceAndPath("kingdomsheritage", "dialogue"));
    private static IntroDefinition intro;
    private static UUID token;
    private static ResourceLocation dimension;
    private static List<IntroText.Glyph> text = List.of();
    private static List<IntroText.Glyph> subtitle = List.of();
    private static List<IntroText.Glyph> all = List.of();
    private static List<Integer> wordEnds = List.of();
    private static IntroLayout layout;
    private static int layoutWidth;
    private static int layoutHeight;
    private static float barSlant;
    private static int age;
    private static int lastAudible;
    private static int nextBlip;
    private static boolean ready;

    private SpawnIntroOverlay() {}

    static void register() {
        NeoForge.EVENT_BUS.addListener(SpawnIntroOverlay::screen);
        NeoForge.EVENT_BUS.addListener(SpawnIntroOverlay::interaction);
        NeoForge.EVENT_BUS.addListener(SpawnIntroOverlay::scroll);
    }

    static void start(JsonObject message) {
        clear();
        intro = IntroDefinition.parse(message.getAsJsonObject("intro"));
        token = UUID.fromString(message.get("token").getAsString());
        barSlant = IntroCinematicBars.sampleSlant(token, intro.barStyle());
        JsonObject locations = message.getAsJsonObject("locations");
        dimension = ResourceLocation.parse(locations.get("dimension").getAsString());
        var names = Map.of("biome", IntroText.location("biome", id(locations, "biome")),
                "structure", IntroText.location("structure", id(locations, "structure")),
                "dimension", IntroText.location("dimension", id(locations, "dimension")));
        text = IntroText.glyphs(IntroText.resolve(intro.text(), names), 0);
        subtitle = IntroText.glyphs(IntroText.resolve(intro.subtitle(), names), text.size() + 1);
        var combined = new ArrayList<>(text);
        combined.add(new IntroText.Glyph('\n', net.minecraft.network.chat.Style.EMPTY, text.size()));
        combined.addAll(subtitle);
        all = List.copyOf(combined);
        wordEnds = IntroText.wordEnds(all);
        Minecraft.getInstance().getNarrator().sayNow(
                IntroText.resolve(intro.text(), names).copy().append("\n").append(IntroText.resolve(intro.subtitle(), names)));
    }

    private static String id(JsonObject locations, String key) {
        return locations.has(key) ? locations.get(key).getAsString() : "";
    }

    public static boolean active() { return intro != null; }
    public static boolean blocked() { return active() && (!ready || intro.control() == IntroDefinition.Control.AFTER_TITLE); }

    static void tick() {
        if (!active()) return;
        Minecraft minecraft = Minecraft.getInstance();
        if (minecraft.player == null || minecraft.level == null || !minecraft.player.isAlive()) {
            clear();
            return;
        }
        if (!minecraft.level.dimension().location().equals(dimension)) {
            if (ready) finish();
            return;
        }
        if (minecraft.isPaused() || minecraft.screen instanceof ReceivingLevelScreen
                || !minecraft.level.hasChunkAt(minecraft.player.blockPosition())) return;
        ready = true;
        if (++age >= intro.durationTicks()) {
            finish();
            return;
        }
        blip(minecraft, visible(age));
    }

    private static void finish() {
        UUID finished = token;
        clear();
        if (Minecraft.getInstance().getConnection() != null) PacketDistributor.sendToServer(new HeritageNetwork.FinishIntro(finished));
    }

    static void clear() {
        intro = null;
        token = null;
        dimension = null;
        text = subtitle = all = List.of();
        layout = null;
        layoutHeight = 0;
        barSlant = 0;
        wordEnds = List.of();
        age = layoutWidth = lastAudible = 0;
        nextBlip = 3;
        ready = false;
    }

    static int visible(float ticks) {
        if (intro.animation() == IntroDefinition.Animation.IMMEDIATE || intro.animation() == IntroDefinition.Animation.FADE_IN) return all.size();
        float progress = Mth.clamp(ticks / intro.revealTicks(), 0, 1);
        if (intro.animation() == IntroDefinition.Animation.LETTER_BY_LETTER) return (int) (all.size() * progress);
        int words = (int) (wordEnds.size() * progress);
        return words == 0 ? 0 : wordEnds.get(words - 1);
    }

    private static void blip(Minecraft minecraft, int visible) {
        if (!intro.blip() || visible < nextBlip) return;
        boolean audible = all.subList(Math.min(lastAudible, all.size()), Math.min(visible, all.size())).stream()
                .anyMatch(glyph -> Character.isLetterOrDigit(glyph.codePoint()));
        if (audible) minecraft.getSoundManager().play(SimpleSoundInstance.forUI(BLIP,
                0.9F + minecraft.player.getRandom().nextFloat() * 0.2F, 0.35F));
        lastAudible = visible;
        nextBlip = visible + 3 + minecraft.player.getRandom().nextInt(3);
    }

    static void render(GuiGraphics graphics, float partialTick) {
        if (!active()) return;
        Minecraft minecraft = Minecraft.getInstance();
        int width = graphics.guiWidth();
        int height = graphics.guiHeight();
        float ticks = ready ? age + (minecraft.isPaused() ? 0 : partialTick) : 0;
        int black = Math.round(255 * (1 - Mth.clamp(ticks / intro.fadeFromBlackTicks(), 0, 1)));
        if (black > 0) graphics.fill(0, 0, width, height, black << 24);
        if (!ready) return;
        if (intro.cinematicBars()) {
            IntroCinematicBars.render(graphics, width, height,
                    IntroCinematicBars.visibility(ticks, intro.durationTicks(), intro.barTransitionTicks()), barSlant);
        }
        if (layout == null || layoutWidth != width || layoutHeight != height) {
            layoutWidth = width;
            layoutHeight = height;
            layout = IntroLayout.create(minecraft.font, width, height, intro, text, subtitle, barSlant);
        }
        float alpha = Mth.clamp((intro.durationTicks() - ticks) / intro.fadeOutTicks(), 0, 1);
        if (intro.animation() == IntroDefinition.Animation.FADE_IN) alpha *= Mth.clamp(ticks / intro.revealTicks(), 0, 1);
        int opacity = Math.round(alpha * 255);
        if (opacity < 4) return;
        int color = (opacity << 24) | 0xFFFFFF;
        draw(graphics, layout.title(), visible(ticks), color);
        draw(graphics, layout.subtitle(), visible(ticks), color);
    }

    private static void draw(GuiGraphics graphics, IntroLayout.Block block, int visible, int color) {
        graphics.pose().pushPose();
        graphics.pose().translate(block.anchorX(), block.top(), 0);
        graphics.pose().scale(block.scale(), block.scale(), 1);
        for (int index = 0; index < block.lines().size(); index++) {
            var line = block.lines().get(index);
            graphics.drawString(Minecraft.getInstance().font, line.visible(visible),
                    Math.round(block.lineLeft(line)), index * block.lineHeight(), color, true);
        }
        graphics.pose().popPose();
    }

    private static void screen(ScreenEvent.Opening event) {
        if (!active()) return;
        if (event.getNewScreen() instanceof DeathScreen || event.getNewScreen() instanceof DisconnectedScreen) {
            finish();
        } else if (Minecraft.getInstance().screen == null && event.getNewScreen() != null
                && !(event.getNewScreen() instanceof PauseScreen) && !(event.getNewScreen() instanceof ReceivingLevelScreen)) {
            event.setCanceled(true);
            if (event.getNewScreen() instanceof net.minecraft.client.gui.screens.inventory.AbstractContainerScreen<?>
                    && Minecraft.getInstance().player != null) Minecraft.getInstance().player.closeContainer();
        }
    }

    private static void interaction(InputEvent.InteractionKeyMappingTriggered event) {
        if (blocked()) {
            event.setCanceled(true);
            event.setSwingHand(false);
        }
    }

    private static void scroll(InputEvent.MouseScrollingEvent event) {
        if (blocked()) event.setCanceled(true);
    }
}

package com.jvn.kingdomsheritage.client;

import com.google.gson.JsonObject;
import com.google.gson.JsonParseException;
import com.jvn.kingdomsheritage.KingdomsHeritage;
import com.jvn.kingdomsheritage.data.IntroDefinition;
import com.jvn.kingdomsheritage.data.DialoguePacing;
import com.jvn.toucanlib.client.ToucanTextRenderer;
import com.jvn.kingdomsheritage.network.HeritageNetwork;
import com.jvn.toucanlib.client.ToucanGlyphLayout;
import com.mojang.blaze3d.platform.InputConstants;
import com.mojang.blaze3d.vertex.PoseStack;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import net.minecraft.client.Camera;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.DeathScreen;
import net.minecraft.client.gui.screens.DisconnectedScreen;
import net.minecraft.client.gui.screens.PauseScreen;
import net.minecraft.client.gui.screens.ReceivingLevelScreen;
import net.minecraft.client.model.PlayerModel;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.resources.sounds.SimpleSoundInstance;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.phys.Vec3;
import net.neoforged.neoforge.client.event.InputEvent;
import net.neoforged.neoforge.client.event.RenderLevelStageEvent;
import net.neoforged.neoforge.client.event.ScreenEvent;
import net.neoforged.neoforge.common.NeoForge;
import net.neoforged.neoforge.network.PacketDistributor;
import org.lwjgl.glfw.GLFW;

public final class SpawnIntroOverlay {
    private static final SoundEvent BLIP = SoundEvent.createVariableRangeEvent(
            ResourceLocation.fromNamespaceAndPath("kingdomsheritage", "dialogue"));
    private static final int HAND_RETURN_TICKS = 12;
    private static IntroDefinition intro;
    private static UUID token;
    private static CinematicScene scene;
    private static InputConstants.Key pressedContinueKey;
    private static ResourceLocation dimension;
    private static List<ToucanGlyphLayout.Glyph> text = List.of();
    private static List<ToucanGlyphLayout.Glyph> subtitle = List.of();
    private static List<ToucanGlyphLayout.Glyph> all = List.of();
    private static List<Integer> wordEnds = List.of();
    private static DialoguePacing.Schedule pacing;
    private static int revealTicks;
    private static IntroLayout layout;
    private static int layoutWidth;
    private static int layoutHeight;
    private static float barSlant;
    private static int age;
    private static int handReturnTicks;
    private static int lastAudible;
    private static int nextBlip;
    private static boolean ready;
    private static boolean standalone;

    private SpawnIntroOverlay() {}

    static void register() {
        NeoForge.EVENT_BUS.addListener(SpawnIntroOverlay::screen);
        NeoForge.EVENT_BUS.addListener(SpawnIntroOverlay::interaction);
        NeoForge.EVENT_BUS.addListener(SpawnIntroOverlay::scroll);
        NeoForge.EVENT_BUS.addListener(SpawnIntroOverlay::sceneKey);
        NeoForge.EVENT_BUS.addListener(SpawnIntroOverlay::sceneMouse);
        NeoForge.EVENT_BUS.addListener(SpawnIntroOverlay::fov);
        NeoForge.EVENT_BUS.addListener(SpawnIntroOverlay::renderSceneBody);
    }

    static void start(JsonObject message) {
        clear();
        standalone = message.has("cinematic");
        intro = IntroDefinition.parse(message.getAsJsonObject("intro"));
        if (intro.scene() != null) {
            try {
                scene = new CinematicScene(intro.scene(), SceneClip.load(Minecraft.getInstance().getResourceManager(), intro.scene()));
            } catch (IOException | JsonParseException | IllegalArgumentException error) {
                KingdomsHeritage.LOGGER.warn("Could not load Heritage scene {}: {}", intro.scene().asset(), error.getMessage());
            }
        }
        token = UUID.fromString(message.get("token").getAsString());
        barSlant = IntroCinematicBars.sampleSlant(token, intro.barStyle());
        JsonObject locations = message.getAsJsonObject("locations");
        dimension = ResourceLocation.parse(locations.get("dimension").getAsString());
        var context = DialogueText.context(message);
        var resolved = intro.dialogue().resolve(intro.text(), intro.subtitle(), context, DialogueText::key);
        var playback = DialoguePlayback.create(net.minecraft.network.chat.Component.empty().append(resolved.text()).append("\n").append(resolved.subtitle()));
        int split = DialoguePacing.parse(IntroMarkup.style(resolved.text()).getString()).text().length();
        var styledText = ToucanTextRenderer.sliceUtf16(playback.text(), 0, split);
        var styledSubtitle = ToucanTextRenderer.sliceUtf16(playback.text(), split + 1, playback.text().getString().length());
        text = ToucanGlyphLayout.glyphs(styledText, 0);
        subtitle = ToucanGlyphLayout.glyphs(styledSubtitle, text.size() + 1);
        var combined = new ArrayList<>(text);
        combined.add(new ToucanGlyphLayout.Glyph('\n', net.minecraft.network.chat.Style.EMPTY, text.size()));
        combined.addAll(subtitle);
        all = List.copyOf(combined);
        wordEnds = ToucanGlyphLayout.wordEnds(all);
        revealTicks = intro.revealTicks();
        if (!playback.pacing().cues().isEmpty() && (intro.animation() == IntroDefinition.Animation.LETTER_BY_LETTER
                || intro.animation() == IntroDefinition.Animation.WORD_BY_WORD)) {
            boolean words = intro.animation() == IntroDefinition.Animation.WORD_BY_WORD;
            pacing = DialoguePacing.schedule(playback.pacing(), intro.revealTicks() * 50.0 / Math.max(1, words ? wordEnds.size() : all.size()), words);
            revealTicks = pacing.durationTicks();
        }
        Minecraft.getInstance().getNarrator().sayNow(
                styledText.copy().append("\n").append(styledSubtitle));
    }

    public static boolean active() { return intro != null; }
    static boolean hidesHud() {
        if (sceneReady()) return true;
        if (!active() || !intro.cinematicBars() || !intro.hideHudDuringBars()) return false;
        var timing = intro.timeline();
        return timing == null || age >= timing.barStartTicks()
                && age < timing.barStartTicks() + timing.barEnterTicks() + timing.barHoldTicks() + timing.barExitTicks();
    }
    public static boolean blocked() { return SelectionTransition.active() || active() && (!ready || intro.control() == IntroDefinition.Control.AFTER_TITLE); }

    static void tick() {
        Minecraft minecraft = Minecraft.getInstance();
        if (handReturnTicks > 0 && !minecraft.isPaused()) handReturnTicks--;
        if (!active()) return;
        if (minecraft.player == null || minecraft.level == null || !minecraft.player.isAlive()) {
            clear();
            return;
        }
        if (!minecraft.level.dimension().location().equals(dimension)) {
            if (ready || standalone) finish(false);
            return;
        }
        if (minecraft.isPaused() || minecraft.screen instanceof ReceivingLevelScreen
                || !ready && !standalone && !SelectionTransition.terrainReady()) return;
        int duration = scene == null ? intro.overlayDurationTicks(revealTicks) : intro.durationTicks(revealTicks);
        if (!ready) {
            if (scene != null) scene.start(minecraft);
            PacketDistributor.sendToServer(new HeritageNetwork.IntroReady(token, duration));
            ready = true;
        }
        SelectionTransition.introReady();
        if (scene != null && scene.waiting()) return;
        if (++age >= duration) {
            finish(true);
            return;
        }
        if (scene != null) {
            if (age == intro.scene().durationTicks()) {
                scene.startReturn(minecraft);
                if (minecraft.options.getCameraType().isFirstPerson()) handReturnTicks = HAND_RETURN_TICKS;
            }
            if (scene.reachWait(age)) PacketDistributor.sendToServer(new HeritageNetwork.IntroWait(token, true));
        }
        if (age >= intro.textStartTicks()) blip(minecraft, visible(age - intro.textStartTicks()));
    }

    static void cancelArrival() {
        if (active() && !standalone) finish(false);
    }

    private static void finish(boolean completed) {
        UUID finished = token;
        clear(completed);
        if (Minecraft.getInstance().getConnection() != null) PacketDistributor.sendToServer(new HeritageNetwork.FinishIntro(finished));
    }

    static void clear() { clear(false); }

    private static void clear(boolean completed) {
        if (scene != null) {
            var minecraft = Minecraft.getInstance();
            boolean handWasHidden = ready && (age <= intro.scene().durationTicks() || !minecraft.options.getCameraType().isFirstPerson());
            scene.clear(minecraft, completed);
            if (completed && handWasHidden && minecraft.options.getCameraType().isFirstPerson()) {
                handReturnTicks = HAND_RETURN_TICKS;
            }
        }
        if (!completed) handReturnTicks = 0;
        scene = null;
        intro = null;
        token = null;
        dimension = null;
        text = subtitle = all = List.of();
        layout = null;
        layoutHeight = 0;
        barSlant = 0;
        wordEnds = List.of();
        pacing = null;
        revealTicks = 0;
        age = layoutWidth = lastAudible = 0;
        nextBlip = 3;
        ready = standalone = false;
    }

    static int visible(float ticks) {
        if (intro.animation() == IntroDefinition.Animation.IMMEDIATE || intro.animation() == IntroDefinition.Animation.FADE_IN) return all.size();
        if (pacing != null) return pacing.visibleCharacters(ticks * 50.0);
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

    private static float elapsed(float partialTick) {
        if (!ready) return 0;
        float partial = Minecraft.getInstance().isPaused() ? 0 : partialTick;
        return scene == null ? age + partial : scene.elapsed(age, partial);
    }

    public record CameraPose(Vec3 position, float yaw, float pitch, float roll) {}

    public static CameraPose sceneCamera(Entity entity, Vec3 eye, float yaw, float pitch, float roll, float partialTick) {
        if (!sceneActive() || entity != Minecraft.getInstance().player) return null;
        return scene.camera((LocalPlayer) entity, eye, yaw, pitch, roll, elapsed(partialTick), partialTick);
    }

    public static CameraPose returnSceneCamera(Entity entity, Camera camera, float partialTick) {
        Minecraft minecraft = Minecraft.getInstance();
        if (!sceneReady() || entity != minecraft.player) return null;
        return scene.returnCamera(minecraft.player, camera, age, partialTick, minecraft.isPaused());
    }

    public static boolean renderSceneArms(float partialTick, PoseStack poses, MultiBufferSource.BufferSource buffer,
                                          LocalPlayer player, int light) {
        if (!sceneActive() || !scene.firstPerson() || Minecraft.getInstance().getCameraEntity() != player) return false;
        if (!scene.hasFullBody()) scene.renderFirstPersonArms(elapsed(partialTick), poses, buffer, player, light);
        return true;
    }

    public static float gameplayHandReveal(float partialTick, LocalPlayer player) {
        var minecraft = Minecraft.getInstance();
        if (handReturnTicks == 0 || minecraft.getCameraEntity() != player) return 1F;
        float partial = minecraft.isPaused() ? 0 : partialTick;
        return (float) Mth.smoothstep(1F - (handReturnTicks - partial) / HAND_RETURN_TICKS);
    }

    private static void renderSceneBody(RenderLevelStageEvent event) {
        if (event.getStage() != RenderLevelStageEvent.Stage.AFTER_ENTITIES
                || !sceneActive() || !scene.firstPerson() || !scene.hasFullBody()) return;
        var minecraft = Minecraft.getInstance();
        var player = minecraft.player;
        var camera = event.getCamera();
        if (player == null || camera.getEntity() != player || camera.isDetached()
                || player.isSpectator() || player.isSleeping() || minecraft.options.hideGui) return;
        int light = minecraft.getEntityRenderDispatcher().getPackedLightCoords(player, camera.getPartialTickTime());
        scene.renderFirstPersonBody(elapsed(camera.getPartialTickTime()), event.getPoseStack(),
                minecraft.renderBuffers().bufferSource(), player, camera, light);
    }

    public static boolean animatesPlayerModel(Entity entity) {
        return sceneActive() && !scene.firstPerson() && Minecraft.getInstance().player == entity;
    }

    public static void poseScenePlayer(PlayerModel<?> model, float partialTick, List<Runnable> restore) {
        scene.posePlayer(model, elapsed(partialTick), restore);
    }

    private static boolean sceneActive() {
        return sceneReady() && age < intro.scene().durationTicks();
    }

    private static boolean sceneReady() {
        var level = Minecraft.getInstance().level;
        return ready && scene != null && level != null && level.dimension().location().equals(dimension);
    }

    static float worldReveal(float ticks) {
        if (!active()) return 1;
        float progress = Mth.clamp((ticks - intro.blackHoldTicks()) / intro.fadeFromBlackTicks(), 0, 1);
        return progress * progress * (3 - 2 * progress);
    }

    private static void fov(net.neoforged.neoforge.client.event.ViewportEvent.ComputeFov event) {
        if (active() && event.usedConfiguredFov()) {
            event.setFOV(Math.max(1, event.getFOV() - 10 * (1 - worldReveal(elapsed((float) event.getPartialTick())))));
        }
    }

    static void render(GuiGraphics graphics, float partialTick) {
        if (!active()) return;
        Minecraft minecraft = Minecraft.getInstance();
        int width = graphics.guiWidth();
        int height = graphics.guiHeight();
        float elapsed = elapsed(partialTick);
        int black = Math.round(255 * (1 - worldReveal(elapsed)));
        if (black > 0) graphics.fill(0, 0, width, height, black << 24);
        if (!ready) return;
        if (intro.cinematicBars()) {
            var timing = intro.timeline();
            float visibility = timing == null
                    ? IntroCinematicBars.visibility(elapsed - intro.blackHoldTicks(), intro.presentationTicks(revealTicks), intro.barTransitionTicks())
                    : IntroCinematicBars.visibility(elapsed - timing.barStartTicks(), timing.barEnterTicks(), timing.barHoldTicks(), timing.barExitTicks());
            IntroCinematicBars.render(graphics, width, height, visibility, barSlant, intro.barHeight());
        }
        if (scene != null && scene.waiting()) {
            var binding = minecraft.options.keyInventory;
            var key = binding.isUnbound() ? Component.literal("E") : binding.getTranslatedKeyMessage();
            graphics.drawCenteredString(minecraft.font, Component.translatable("screen.kingdomsheritage.scene_continue", key),
                    width / 2, Math.round(height * 0.79F), 0xFFFFFF);
        }
        float ticks = elapsed - intro.textStartTicks();
        if (ticks < 0) return;
        if (layout == null || layoutWidth != width || layoutHeight != height) {
            layoutWidth = width;
            layoutHeight = height;
            layout = IntroLayout.create(minecraft.font, width, height, intro, text, subtitle);
        }
        float alpha = Mth.clamp((intro.textDurationTicks(revealTicks) - ticks) / intro.fadeOutTicks(), 0, 1);
        if (intro.animation() == IntroDefinition.Animation.FADE_IN) alpha *= Mth.clamp(ticks / intro.revealTicks(), 0, 1);
        int opacity = Math.round(alpha * 255);
        if (opacity < 4) return;
        int color = (opacity << 24) | 0xFFFFFF;
        draw(graphics, layout.title(), visible(ticks), color, (int) ticks);
        draw(graphics, layout.subtitle(), visible(ticks), color, (int) ticks);
    }

    private static void draw(GuiGraphics graphics, IntroLayout.Block block, int visible, int color, int ticks) {
        graphics.pose().pushPose();
        graphics.pose().translate(block.anchorX(), block.top(), 0);
        graphics.pose().scale(block.scale(), block.scale(), 1);
        for (int index = 0; index < block.lines().size(); index++) {
            var line = block.lines().get(index);
            SelectionText.draw(graphics, Minecraft.getInstance().font, line.visible(visible),
                    Math.round(block.lineLeft(line)), index * block.lineHeight(), color, ticks, intro.outline());
        }
        graphics.pose().popPose();
    }

    private static void screen(ScreenEvent.Opening event) {
        if (!active()) return;
        if (event.getNewScreen() instanceof DeathScreen || event.getNewScreen() instanceof DisconnectedScreen) {
            finish(false);
        } else if (Minecraft.getInstance().screen == null && event.getNewScreen() != null
                && !(event.getNewScreen() instanceof PauseScreen) && !(event.getNewScreen() instanceof ReceivingLevelScreen)
                && !(event.getNewScreen() instanceof SelectionTransition.ArrivalScreen)) {
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

    private static void sceneKey(InputEvent.Key event) {
        var key = InputConstants.getKey(event.getKey(), event.getScanCode());
        var binding = Minecraft.getInstance().options.keyInventory;
        if (key.equals(pressedContinueKey)) {
            if (event.getAction() == GLFW.GLFW_REPEAT) {
                binding.consumeClick();
                return;
            }
            pressedContinueKey = null;
        }
        if (awaitingSceneInput() && event.getAction() == GLFW.GLFW_PRESS
                && (binding.matches(event.getKey(), event.getScanCode()) || binding.isUnbound() && event.getKey() == GLFW.GLFW_KEY_E)) {
            pressedContinueKey = key;
            binding.consumeClick();
            resumeScene();
        }
    }

    private static void sceneMouse(InputEvent.MouseButton.Pre event) {
        if (awaitingSceneInput() && event.getAction() == GLFW.GLFW_PRESS
                && Minecraft.getInstance().options.keyInventory.matchesMouse(event.getButton())) {
            resumeScene();
            event.setCanceled(true);
        }
    }

    private static boolean awaitingSceneInput() {
        Minecraft minecraft = Minecraft.getInstance();
        return sceneActive() && scene.waiting() && minecraft.screen == null && minecraft.getOverlay() == null;
    }

    private static void resumeScene() {
        scene.resume();
        PacketDistributor.sendToServer(new HeritageNetwork.IntroWait(token, false));
    }

    private static void scroll(InputEvent.MouseScrollingEvent event) {
        if (blocked()) event.setCanceled(true);
    }
}

package com.jvn.kingdomsheritage.client;

import com.mojang.blaze3d.pipeline.TextureTarget;
import com.mojang.blaze3d.platform.GlStateManager;
import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.blaze3d.vertex.BufferUploader;
import com.mojang.blaze3d.vertex.DefaultVertexFormat;
import com.mojang.blaze3d.vertex.Tesselator;
import com.mojang.blaze3d.vertex.VertexFormat;
import net.minecraft.Util;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.renderer.GameRenderer;
import net.minecraft.util.Mth;
import org.lwjgl.opengl.GL11;
import org.lwjgl.opengl.GL14;
import org.lwjgl.opengl.GL30;

public final class IntroHud {
    private static final int FADE_MILLIS = 400;
    private static ClientLevel level;
    private static boolean hiddenByIntro;
    private static long fadeStarted = -1;
    private static TextureTarget world;

    private IntroHud() {}

    static void visibility(boolean introHidden, boolean hidden) {
        ClientLevel current = Minecraft.getInstance().level;
        if (level != current) {
            clear();
            level = current;
        }
        if (hidden) {
            hiddenByIntro |= introHidden || fadeStarted >= 0;
            fadeStarted = -1;
            releaseWorld();
        } else if (hiddenByIntro) {
            hiddenByIntro = false;
            fadeStarted = Util.getMillis();
        }
    }

    static void clear() {
        level = null;
        hiddenByIntro = false;
        fadeStarted = -1;
        releaseWorld();
    }

    public static void render(GuiGraphics graphics, Runnable drawHud) {
        if (fadeStarted < 0) {
            drawHud.run();
            return;
        }
        double progress = (Util.getMillis() - fadeStarted) / (double) FADE_MILLIS;
        if (progress >= 1) {
            fadeStarted = -1;
            releaseWorld();
            drawHud.run();
            return;
        }

        captureWorld(graphics);
        drawHud.run();
        graphics.flush();
        drawWorld(graphics, 1F - (float) Mth.smoothstep(progress));
    }

    private static void captureWorld(GuiGraphics graphics) {
        var main = Minecraft.getInstance().getMainRenderTarget();
        graphics.flush();
        int width = main.viewWidth;
        int height = main.viewHeight;
        try {
            if (world == null) {
                world = new TextureTarget(width, height, false, Minecraft.ON_OSX);
            } else if (world.width != width || world.height != height) {
                world.resize(width, height, Minecraft.ON_OSX);
            }
            world.bindWrite(false);
            GlStateManager._glBindFramebuffer(GL30.GL_READ_FRAMEBUFFER, main.frameBufferId);
            GlStateManager._glBlitFrameBuffer(0, 0, width, height, 0, 0, width, height, GL11.GL_COLOR_BUFFER_BIT, GL11.GL_NEAREST);
        } finally {
            main.bindWrite(true);
        }
    }

    private static void drawWorld(GuiGraphics graphics, float opacity) {
        // crosshairs and other hud layers blend against the world, so fade the composited result
        RenderSystem.enableBlend();
        GL14.glBlendColor(0, 0, 0, opacity);
        RenderSystem.blendFuncSeparate(GL14.GL_CONSTANT_ALPHA, GL14.GL_ONE_MINUS_CONSTANT_ALPHA, GL11.GL_ZERO, GL11.GL_ONE);
        RenderSystem.disableDepthTest();
        RenderSystem.depthMask(false);
        try {
            RenderSystem.setShader(GameRenderer::getPositionTexShader);
            RenderSystem.setShaderTexture(0, world.getColorTextureId());
            RenderSystem.setShaderColor(1, 1, 1, 1);
            var pose = graphics.pose().last().pose();
            var buffer = Tesselator.getInstance().begin(VertexFormat.Mode.QUADS, DefaultVertexFormat.POSITION_TEX);
            buffer.addVertex(pose, 0, graphics.guiHeight(), 0).setUv(0, 0);
            buffer.addVertex(pose, graphics.guiWidth(), graphics.guiHeight(), 0).setUv(1, 0);
            buffer.addVertex(pose, graphics.guiWidth(), 0, 0).setUv(1, 1);
            buffer.addVertex(pose, 0, 0, 0).setUv(0, 1);
            BufferUploader.drawWithShader(buffer.buildOrThrow());
        } finally {
            GL14.glBlendColor(0, 0, 0, 0);
            RenderSystem.defaultBlendFunc();
            RenderSystem.disableBlend();
            RenderSystem.depthMask(true);
            RenderSystem.enableDepthTest();
        }
    }

    private static void releaseWorld() {
        if (world != null) {
            world.destroyBuffers();
            world = null;
            Minecraft.getInstance().getMainRenderTarget().bindWrite(true);
        }
    }
}

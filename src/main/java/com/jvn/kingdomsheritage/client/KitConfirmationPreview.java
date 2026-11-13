package com.jvn.kingdomsheritage.client;

import com.mojang.blaze3d.pipeline.TextureTarget;
import com.mojang.blaze3d.platform.GlStateManager;
import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.blaze3d.vertex.BufferUploader;
import com.mojang.blaze3d.vertex.DefaultVertexFormat;
import com.mojang.blaze3d.vertex.Tesselator;
import com.mojang.blaze3d.vertex.VertexFormat;
import com.mojang.math.Axis;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.renderer.GameRenderer;
import net.minecraft.client.renderer.Rect2i;
import net.minecraft.util.Mth;
import org.lwjgl.opengl.GL11;
import org.lwjgl.opengl.GL30;

final class KitConfirmationPreview {
    private static TextureTarget captureTarget;
    private static int cachedTargets;
    private TextureTarget target;
    private Crop crop;

    record Crop(int x, int y, int width, int height, float u0, float u1, float v0, float v1) {}

    static Crop crop(Rect2i bounds, int guiWidth, int guiHeight, int pixelWidth, int pixelHeight) {
        float left = bounds.getX() / (float) guiWidth * pixelWidth;
        float right = (bounds.getX() + bounds.getWidth()) / (float) guiWidth * pixelWidth;
        float top = (1 - bounds.getY() / (float) guiHeight) * pixelHeight;
        float bottom = (1 - (bounds.getY() + bounds.getHeight()) / (float) guiHeight) * pixelHeight;
        int x = Mth.clamp((int) Math.floor(left), 0, pixelWidth - 1);
        int y = Mth.clamp((int) Math.floor(bottom), 0, pixelHeight - 1);
        int width = Mth.clamp((int) Math.ceil(right), x + 1, pixelWidth) - x;
        int height = Mth.clamp((int) Math.ceil(top), y + 1, pixelHeight) - y;
        return new Crop(x, y, width, height, (left - x) / width, (right - x) / width,
                (top - y) / height, (bottom - y) / height);
    }

    void close() {
        if (target != null) {
            target.destroyBuffers();
            target = null;
            crop = null;
            if (--cachedTargets == 0 && captureTarget != null) {
                captureTarget.destroyBuffers();
                captureTarget = null;
            }
            // deleting a preview unbinds the framebuffer, including during carousel eviction
            Minecraft.getInstance().getMainRenderTarget().bindWrite(true);
        }
    }

    void render(GuiGraphics graphics, Rect2i bounds, float x, float y, float scale, float tilt, Runnable inventory) {
        capture(graphics, bounds, inventory);
        draw(graphics, bounds, x, y, scale, tilt, 1);
    }

    void capture(GuiGraphics graphics, Rect2i bounds, Runnable inventory) {
        var main = Minecraft.getInstance().getMainRenderTarget();
        graphics.flush();
        try {
            crop = crop(bounds, graphics.guiWidth(), graphics.guiHeight(), main.viewWidth, main.viewHeight);
            if (target == null) {
                target = new TextureTarget(crop.width(), crop.height(), false, Minecraft.ON_OSX);
                cachedTargets++;
            } else if (target.width != crop.width() || target.height != crop.height()) {
                target.resize(crop.width(), crop.height(), Minecraft.ON_OSX);
            }
            if (captureTarget == null) {
                captureTarget = new TextureTarget(main.viewWidth, main.viewHeight, true, Minecraft.ON_OSX);
                captureTarget.setClearColor(0, 0, 0, 0);
            } else if (captureTarget.width != main.viewWidth || captureTarget.height != main.viewHeight) {
                captureTarget.resize(main.viewWidth, main.viewHeight, Minecraft.ON_OSX);
            }
            captureTarget.clear(Minecraft.ON_OSX);
            captureTarget.bindWrite(true);
            // share full-size capture for scissor compatibility, retaining only each card's color pixels
            inventory.run();
            graphics.flush();
            GlStateManager._glBindFramebuffer(GL30.GL_READ_FRAMEBUFFER, captureTarget.frameBufferId);
            RenderSystem.bindTexture(target.getColorTextureId());
            GlStateManager._glCopyTexSubImage2D(GL11.GL_TEXTURE_2D, 0, 0, 0, crop.x(), crop.y(), crop.width(), crop.height());
            RenderSystem.bindTexture(0);
        } finally {
            main.bindWrite(true);
        }
    }

    void draw(GuiGraphics graphics, Rect2i bounds, float x, float y, float scale, float tilt, float opacity) {
        if (target == null || opacity <= 0) return;
        graphics.flush();
        float u0 = crop.u0(), u1 = crop.u1(), v0 = crop.v0(), v1 = crop.v1();
        graphics.pose().pushPose();
        graphics.pose().translate(x + bounds.getWidth() * scale / 2, y + bounds.getHeight() * scale / 2, 100);
        graphics.pose().mulPose(Axis.ZP.rotationDegrees(tilt));
        graphics.pose().scale(scale, scale, 1);
        graphics.pose().translate(-bounds.getWidth() / 2F, -bounds.getHeight() / 2F, 0);
        RenderSystem.enableBlend();
        RenderSystem.blendFunc(GL11.GL_ONE, GL11.GL_ONE_MINUS_SRC_ALPHA);
        RenderSystem.disableDepthTest();
        RenderSystem.depthMask(false);
        try {
            RenderSystem.setShader(GameRenderer::getPositionTexShader);
            RenderSystem.setShaderTexture(0, target.getColorTextureId());
            RenderSystem.setShaderColor(opacity, opacity, opacity, opacity);
            var pose = graphics.pose().last().pose();
            var buffer = Tesselator.getInstance().begin(VertexFormat.Mode.QUADS, DefaultVertexFormat.POSITION_TEX);
            buffer.addVertex(pose, 0, bounds.getHeight(), 0).setUv(u0, v1);
            buffer.addVertex(pose, bounds.getWidth(), bounds.getHeight(), 0).setUv(u1, v1);
            buffer.addVertex(pose, bounds.getWidth(), 0, 0).setUv(u1, v0);
            buffer.addVertex(pose, 0, 0, 0).setUv(u0, v0);
            BufferUploader.drawWithShader(buffer.buildOrThrow());
        } finally {
            RenderSystem.setShaderColor(1, 1, 1, 1);
            RenderSystem.defaultBlendFunc();
            RenderSystem.disableBlend();
            RenderSystem.depthMask(true);
            RenderSystem.enableDepthTest();
            graphics.pose().popPose();
        }
    }
}

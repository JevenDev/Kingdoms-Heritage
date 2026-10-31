package com.jvn.kingdomsheritage.client;

import com.mojang.blaze3d.pipeline.TextureTarget;
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
import org.lwjgl.opengl.GL11;

final class KitConfirmationPreview {
    private TextureTarget target;

    void close() {
        if (target != null) {
            target.destroyBuffers();
            target = null;
        }
    }

    void render(GuiGraphics graphics, Rect2i bounds, float x, float y, float scale, float tilt, Runnable inventory) {
        var main = Minecraft.getInstance().getMainRenderTarget();
        graphics.flush();
        try {
            if (target == null) {
                target = new TextureTarget(main.viewWidth, main.viewHeight, true, Minecraft.ON_OSX);
                target.setClearColor(0, 0, 0, 0);
            } else if (target.width != main.viewWidth || target.height != main.viewHeight) {
                target.resize(main.viewWidth, main.viewHeight, Minecraft.ON_OSX);
            }
            target.clear(Minecraft.ON_OSX);
            target.bindWrite(true);
            // capture at the original coordinates so container scissor rectangles stay aligned
            inventory.run();
            graphics.flush();
        } finally {
            main.bindWrite(true);
        }
        float u0 = bounds.getX() / (float) graphics.guiWidth();
        float u1 = (bounds.getX() + bounds.getWidth()) / (float) graphics.guiWidth();
        float v0 = 1 - bounds.getY() / (float) graphics.guiHeight();
        float v1 = 1 - (bounds.getY() + bounds.getHeight()) / (float) graphics.guiHeight();
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
            RenderSystem.setShaderColor(1, 1, 1, 1);
            var pose = graphics.pose().last().pose();
            var buffer = Tesselator.getInstance().begin(VertexFormat.Mode.QUADS, DefaultVertexFormat.POSITION_TEX);
            buffer.addVertex(pose, 0, bounds.getHeight(), 0).setUv(u0, v1);
            buffer.addVertex(pose, bounds.getWidth(), bounds.getHeight(), 0).setUv(u1, v1);
            buffer.addVertex(pose, bounds.getWidth(), 0, 0).setUv(u1, v0);
            buffer.addVertex(pose, 0, 0, 0).setUv(u0, v0);
            BufferUploader.drawWithShader(buffer.buildOrThrow());
        } finally {
            RenderSystem.defaultBlendFunc();
            RenderSystem.disableBlend();
            RenderSystem.depthMask(true);
            RenderSystem.enableDepthTest();
            graphics.pose().popPose();
        }
    }
}

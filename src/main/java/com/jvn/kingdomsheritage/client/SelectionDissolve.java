package com.jvn.kingdomsheritage.client;

import com.jvn.kingdomsheritage.KingdomsHeritage;
import com.mojang.blaze3d.pipeline.TextureTarget;
import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.blaze3d.vertex.BufferUploader;
import com.mojang.blaze3d.vertex.DefaultVertexFormat;
import com.mojang.blaze3d.vertex.Tesselator;
import com.mojang.blaze3d.vertex.VertexFormat;
import java.io.IOException;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.renderer.GameRenderer;
import net.minecraft.client.renderer.ShaderInstance;
import net.minecraft.resources.ResourceLocation;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.client.event.RegisterShadersEvent;
import org.lwjgl.opengl.GL11;

@EventBusSubscriber(modid = KingdomsHeritage.MOD_ID, value = Dist.CLIENT)
public final class SelectionDissolve {
    private static ShaderInstance shader;
    private static TextureTarget target;

    private SelectionDissolve() {}

    @SubscribeEvent
    public static void registerShaders(RegisterShadersEvent event) throws IOException {
        close();
        event.registerShader(new ShaderInstance(event.getResourceProvider(),
                ResourceLocation.fromNamespaceAndPath(KingdomsHeritage.MOD_ID, "selection_dissolve"),
                DefaultVertexFormat.POSITION_TEX), value -> shader = value);
    }

    static void close() {
        if (target != null) {
            target.destroyBuffers();
            target = null;
        }
    }

    static void render(GuiGraphics graphics, float progress, Runnable cards) {
        if (progress <= 0) {
            cards.run();
            return;
        }
        if (progress >= 1) return;
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
            cards.run();
            graphics.flush();
        } finally {
            main.bindWrite(true);
        }
        RenderSystem.enableBlend();
        RenderSystem.blendFunc(GL11.GL_ONE, GL11.GL_ONE_MINUS_SRC_ALPHA);
        RenderSystem.disableDepthTest();
        RenderSystem.depthMask(false);
        try {
            if (shader != null) {
                shader.safeGetUniform("Progress").set(progress);
                shader.safeGetUniform("Resolution").set((float) graphics.guiWidth(), (float) graphics.guiHeight());
                RenderSystem.setShader(() -> shader);
                RenderSystem.setShaderColor(1, 1, 1, 1);
            } else {
                RenderSystem.setShader(GameRenderer::getPositionTexShader);
                RenderSystem.setShaderColor(1 - progress, 1 - progress, 1 - progress, 1 - progress);
            }
            RenderSystem.setShaderTexture(0, target.getColorTextureId());
            var pose = graphics.pose().last().pose();
            var buffer = Tesselator.getInstance().begin(VertexFormat.Mode.QUADS, DefaultVertexFormat.POSITION_TEX);
            buffer.addVertex(pose, 0, graphics.guiHeight(), 0).setUv(0, 0);
            buffer.addVertex(pose, graphics.guiWidth(), graphics.guiHeight(), 0).setUv(1, 0);
            buffer.addVertex(pose, graphics.guiWidth(), 0, 0).setUv(1, 1);
            buffer.addVertex(pose, 0, 0, 0).setUv(0, 1);
            BufferUploader.drawWithShader(buffer.buildOrThrow());
        } finally {
            RenderSystem.setShaderColor(1, 1, 1, 1);
            RenderSystem.defaultBlendFunc();
            RenderSystem.disableBlend();
            RenderSystem.depthMask(true);
            RenderSystem.enableDepthTest();
        }
    }
}

package com.jvn.kingdomsheritage.client;

import com.jvn.kingdomsheritage.KingdomsHeritage;
import com.mojang.blaze3d.pipeline.TextureTarget;
import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.blaze3d.vertex.BufferUploader;
import com.mojang.blaze3d.vertex.DefaultVertexFormat;
import com.mojang.blaze3d.vertex.Tesselator;
import com.mojang.blaze3d.vertex.VertexFormat;
import java.io.IOException;
import net.minecraft.Util;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.renderer.GameRenderer;
import net.minecraft.client.renderer.ShaderInstance;
import net.minecraft.resources.ResourceLocation;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.client.event.ClientPlayerNetworkEvent;
import net.neoforged.neoforge.client.event.RegisterShadersEvent;

@EventBusSubscriber(modid = KingdomsHeritage.MOD_ID, value = Dist.CLIENT)
public final class SelectionBackground {
    private static final int MAX_WIDTH = 640;
    private static final int MAX_HEIGHT = 360;
    private static final long STARTED = Util.getMillis();
    private static ShaderInstance shader;
    private static TextureTarget target;

    private SelectionBackground() {}

    @SubscribeEvent
    public static void registerShaders(RegisterShadersEvent event) throws IOException {
        event.registerShader(new ShaderInstance(event.getResourceProvider(),
                ResourceLocation.fromNamespaceAndPath(KingdomsHeritage.MOD_ID, "selection_background"),
                DefaultVertexFormat.POSITION), value -> shader = value);
    }

    @SubscribeEvent
    public static void logout(ClientPlayerNetworkEvent.LoggingOut event) {
        if (target != null) {
            target.destroyBuffers();
            target = null;
        }
    }

    public static boolean renderKitBackground(Screen screen, GuiGraphics graphics) {
        if (!ClientSelection.choosingKit() || !KitSelection.isInventory(screen) && !KitSelection.isLayoutPicker(screen)) return false;
        if (KitSelection.capturingPreview()) return true;
        render(graphics, screen.width, screen.height);
        return true;
    }

    static void render(GuiGraphics graphics, int width, int height) {
        if (width <= 0 || height <= 0) return;
        if (shader == null) {
            graphics.fillGradient(0, 0, width, height, 0xff171a20, 0xff08090b);
            return;
        }
        Minecraft minecraft = Minecraft.getInstance();
        var main = minecraft.getMainRenderTarget();
        float scale = Math.min(1, Math.min(MAX_WIDTH / (float) main.viewWidth, MAX_HEIGHT / (float) main.viewHeight));
        int targetWidth = Math.max(1, Math.round(main.viewWidth * scale));
        int targetHeight = Math.max(1, Math.round(main.viewHeight * scale));
        graphics.flush();
        try {
            if (target == null) {
                target = new TextureTarget(targetWidth, targetHeight, false, Minecraft.ON_OSX);
            } else if (target.width != targetWidth || target.height != targetHeight) {
                target.resize(targetWidth, targetHeight, Minecraft.ON_OSX);
            }
            target.bindWrite(true);
            RenderSystem.disableDepthTest();
            RenderSystem.depthMask(false);
            RenderSystem.disableBlend();
            shader.safeGetUniform("Resolution").set((float) targetWidth, (float) targetHeight);
            shader.safeGetUniform("Time").set((Util.getMillis() - STARTED) / 1000F);
            RenderSystem.setShader(() -> shader);
            var buffer = Tesselator.getInstance().begin(VertexFormat.Mode.QUADS, DefaultVertexFormat.POSITION);
            buffer.addVertex(-1, -1, 0);
            buffer.addVertex(1, -1, 0);
            buffer.addVertex(1, 1, 0);
            buffer.addVertex(-1, 1, 0);
            BufferUploader.drawWithShader(buffer.buildOrThrow());
            main.bindWrite(true);
            RenderSystem.setShader(GameRenderer::getPositionTexShader);
            RenderSystem.setShaderTexture(0, target.getColorTextureId());
            RenderSystem.setShaderColor(1, 1, 1, 1);
            var pose = graphics.pose().last().pose();
            var quad = Tesselator.getInstance().begin(VertexFormat.Mode.QUADS, DefaultVertexFormat.POSITION_TEX);
            quad.addVertex(pose, 0, height, 0).setUv(0, 0);
            quad.addVertex(pose, width, height, 0).setUv(1, 0);
            quad.addVertex(pose, width, 0, 0).setUv(1, 1);
            quad.addVertex(pose, 0, 0, 0).setUv(0, 1);
            BufferUploader.drawWithShader(quad.buildOrThrow());
        } finally {
            main.bindWrite(true);
            RenderSystem.depthMask(true);
            RenderSystem.enableDepthTest();
        }
    }
}

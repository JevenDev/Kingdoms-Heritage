package com.jvn.kingdomsheritage.client;

import com.jvn.kingdomsheritage.KingdomsHeritage;
import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.blaze3d.vertex.BufferUploader;
import com.mojang.blaze3d.vertex.DefaultVertexFormat;
import com.mojang.blaze3d.vertex.Tesselator;
import com.mojang.blaze3d.vertex.VertexFormat;
import java.io.IOException;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.inventory.tooltip.TooltipRenderUtil;
import net.minecraft.client.renderer.ShaderInstance;
import net.minecraft.resources.ResourceLocation;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.client.event.RegisterShadersEvent;

@EventBusSubscriber(modid = KingdomsHeritage.MOD_ID, value = Dist.CLIENT)
public final class SelectionMusicToastBackground {
    private static ShaderInstance shader;

    private SelectionMusicToastBackground() {}

    @SubscribeEvent
    public static void registerShaders(RegisterShadersEvent event) throws IOException {
        event.registerShader(new ShaderInstance(event.getResourceProvider(),
                ResourceLocation.fromNamespaceAndPath(KingdomsHeritage.MOD_ID, "selection_music_toast"),
                DefaultVertexFormat.POSITION_TEX), value -> shader = value);
    }

    static void render(GuiGraphics graphics, int width, int height, float time) {
        if (shader == null) {
            TooltipRenderUtil.renderTooltipBackground(graphics, 4, 4, width - 8, height - 8, 0,
                    0xf0101217, 0xf0101217, 0xbfbec2c9, 0xbf797f8b);
            return;
        }
        graphics.flush();
        shader.safeGetUniform("Size").set((float) width, (float) height);
        shader.safeGetUniform("Time").set(time);
        RenderSystem.enableBlend();
        RenderSystem.defaultBlendFunc();
        try {
            RenderSystem.setShader(() -> shader);
            var pose = graphics.pose().last().pose();
            var buffer = Tesselator.getInstance().begin(VertexFormat.Mode.QUADS, DefaultVertexFormat.POSITION_TEX);
            buffer.addVertex(pose, 0, height, 0).setUv(0, 1);
            buffer.addVertex(pose, width, height, 0).setUv(1, 1);
            buffer.addVertex(pose, width, 0, 0).setUv(1, 0);
            buffer.addVertex(pose, 0, 0, 0).setUv(0, 0);
            BufferUploader.drawWithShader(buffer.buildOrThrow());
        } finally {
            RenderSystem.disableBlend();
        }
    }
}

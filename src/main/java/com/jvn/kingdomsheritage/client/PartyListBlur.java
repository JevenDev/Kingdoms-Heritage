package com.jvn.kingdomsheritage.client;

import com.jvn.kingdomsheritage.KingdomsHeritage;
import com.mojang.blaze3d.systems.RenderSystem;
import java.io.IOException;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.renderer.PostChain;
import net.minecraft.resources.ResourceLocation;

final class PartyListBlur {
    private PostChain effect;
    private int width;
    private int height;
    private boolean unavailable;

    void render(GuiGraphics graphics, float visibility) {
        var minecraft = Minecraft.getInstance();
        if (unavailable || minecraft.options.getMenuBackgroundBlurriness() == 0) return;
        graphics.flush();
        RenderSystem.disableDepthTest();
        try {
            var main = minecraft.getMainRenderTarget();
            if (effect == null) effect = new PostChain(minecraft.getTextureManager(), minecraft.getResourceManager(), main,
                    ResourceLocation.withDefaultNamespace("shaders/post/blur.json"));
            if (width != main.viewWidth || height != main.viewHeight) {
                width = main.viewWidth;
                height = main.viewHeight;
                effect.resize(width, height);
            }
            effect.setUniform("Radius", Math.min(3, (float) minecraft.options.getMenuBackgroundBlurriness()) * visibility);
            effect.process(0);
        } catch (IOException | com.google.gson.JsonSyntaxException error) {
            KingdomsHeritage.LOGGER.warn("Unable to load the selection player list blur", error);
            unavailable = true;
            close();
        } finally {
            minecraft.getMainRenderTarget().bindWrite(true);
            RenderSystem.enableDepthTest();
        }
    }

    void reload() {
        close();
        unavailable = false;
    }

    void close() {
        if (effect != null) {
            try {
                effect.close();
            } finally {
                effect = null;
                width = height = 0;
                Minecraft.getInstance().getMainRenderTarget().bindWrite(true);
            }
        }
    }
}

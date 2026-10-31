package com.jvn.kingdomsheritage.client;

import com.jvn.kingdomsheritage.KingdomsHeritage;
import com.jvn.kingdomsheritage.data.IntroDefinition;
import com.mojang.blaze3d.vertex.DefaultVertexFormat;
import java.io.IOException;
import java.util.UUID;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.renderer.ShaderInstance;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.client.event.RegisterShadersEvent;

@EventBusSubscriber(modid = KingdomsHeritage.MOD_ID, value = Dist.CLIENT)
public final class IntroCinematicBars {
    private static ShaderInstance shader;

    private IntroCinematicBars() {}

    @SubscribeEvent
    public static void registerShaders(RegisterShadersEvent event) throws IOException {
        event.registerShader(new ShaderInstance(event.getResourceProvider(),
                ResourceLocation.fromNamespaceAndPath(KingdomsHeritage.MOD_ID, "dialogue_cinematic_bars"),
                DefaultVertexFormat.POSITION), value -> shader = value);
    }

    static float sampleSlant(UUID token, IntroDefinition.BarStyle style) {
        return style == IntroDefinition.BarStyle.STRAIGHT ? 0
                : Mth.lerp(RandomSource.create(token.getLeastSignificantBits()).nextFloat(), -12, 12);
    }

    static int height(int screenHeight) { return Math.min(26, screenHeight / 4); }

    static float visibility(float ticks, int duration, int transitionTicks) {
        float transition = Math.min(transitionTicks, duration / 2F);
        float entry = Mth.clamp(ticks / transition, 0, 1);
        float exit = Mth.clamp((ticks - (duration - transition)) / transition, 0, 1);
        return (1 - (float) Math.pow(1 - entry, 3)) * (1 - exit * exit * exit);
    }

    static void render(GuiGraphics graphics, int width, int height, float visibility, float slant) {
        int barHeight = height(height);
        if (barHeight <= 0 || visibility <= 0) return;
        if (shader == null) {
            int visibleHeight = Math.round(barHeight * visibility);
            graphics.fill(0, 0, width, visibleHeight, 0xFF000000);
            graphics.fill(0, height - visibleHeight, width, height, 0xFF000000);
            return;
        }
        com.jvn.toucanlib.neoforge.client.ToucanCinematicBars.render(
                graphics, shader, width, height, barHeight, slant, visibility);
    }
}

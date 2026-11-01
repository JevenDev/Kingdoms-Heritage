package com.example.vr;

import com.jvn.kingdomsheritage.client.HeritageLoadingScreen;
import com.jvn.kingdomsheritage.client.HeritageParty;
import com.jvn.kingdomsheritage.client.HeritageScreen;
import com.jvn.kingdomsheritage.client.HeritageScreens;
import com.jvn.kingdomsheritage.client.HeritageStyles;
import java.util.function.BiConsumer;
import java.util.function.BooleanSupplier;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;

public final class VrScreenIntegration {
    private VrScreenIntegration() {}

    public static void register(BooleanSupplier enabled, BooleanSupplier dataReady, BiConsumer<ResourceLocation, ResourceLocation> configure) {
        HeritageScreens.register(VrFlowIntegration.LOADING, context ->
                enabled.getAsBoolean() ? new HeritageLoadingScreen(Component.literal("VR loading"),
                        () -> Component.literal("Loading Villager Retaliation"), dataReady, context::complete) : null);
        HeritageScreens.register(VrFlowIntegration.SETUP, context ->
                enabled.getAsBoolean() ? new Setup(context, configure) : null);
    }

    private static final class Setup extends HeritageScreen {
        private final HeritageScreens.Context context;
        private final BiConsumer<ResourceLocation, ResourceLocation> configure;
        private final ResourceLocation spawnId;
        private final ResourceLocation kitId;

        private Setup(HeritageScreens.Context context, BiConsumer<ResourceLocation, ResourceLocation> configure) {
            super(Component.literal("VR setup"));
            this.context = context;
            this.configure = configure;
            spawnId = context.spawn().orElseThrow().id();
            kitId = context.kit().orElseThrow().id();
        }

        @Override
        public boolean showsParty() { return true; }

        @Override
        protected void init() {
            addRenderableWidget(HeritageStyles.disconnect(height));
            var back = addRenderableWidget(HeritageStyles.button(width / 2 - 75, height / 2 + 46, 150, 20,
                    Component.translatable("gui.back"), button -> context.back()));
            back.active = context.canGoBack();
            addRenderableWidget(HeritageStyles.button(width / 2 - 75, height / 2 + 20, 150, 20,
                    Component.literal("Configure and continue"), button -> {
                        button.active = false;
                        configure.accept(spawnId, kitId);
                        context.complete();
                    }));
        }

        @Override
        public void render(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
            super.render(graphics, mouseX, mouseY, partialTick);
            HeritageStyles.centeredText(graphics, Component.literal("<gold>Villager Retaliation</gold>"),
                    width / 2, height / 2 - 48, 0xffffffff);
            HeritageStyles.centeredText(graphics, Component.literal("Spawn: ").append(context.spawn().orElseThrow().title()),
                    width / 2, height / 2 - 30, 0xffbbbbbb);
            HeritageStyles.centeredText(graphics, Component.literal("Kit: ").append(context.kit().orElseThrow().title()),
                    width / 2, height / 2 - 16, 0xffbbbbbb);
            var party = HeritageParty.snapshot();
            HeritageStyles.centeredText(graphics, Component.literal("Party members: " + party.members().size()),
                    width / 2, height / 2 - 2, 0xffbbbbbb);
        }
    }
}

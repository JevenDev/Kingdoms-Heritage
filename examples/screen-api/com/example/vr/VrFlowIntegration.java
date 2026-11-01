package com.example.vr;

import com.jvn.kingdomsheritage.api.HeritageFlow;
import com.jvn.kingdomsheritage.api.ScreenStep;
import net.minecraft.resources.ResourceLocation;

public final class VrFlowIntegration {
    public static final ResourceLocation LOADING = ResourceLocation.fromNamespaceAndPath("examplevr", "loading");
    public static final ResourceLocation SETUP = ResourceLocation.fromNamespaceAndPath("examplevr", "setup");

    private VrFlowIntegration() {}

    public static void registerCommon(ScreenStep.PartyPolicy policy) {
        HeritageFlow.register(new ScreenStep(LOADING, ScreenStep.Placement.AFTER_KIT, 100));
        HeritageFlow.register(new ScreenStep(SETUP, ScreenStep.Placement.AFTER_KIT, 110).after(LOADING).party(policy));
    }
}

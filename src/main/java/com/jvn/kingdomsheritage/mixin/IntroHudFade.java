package com.jvn.kingdomsheritage.mixin;

import com.jvn.kingdomsheritage.client.IntroHud;
import com.llamalad7.mixinextras.injector.wrapmethod.WrapMethod;
import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.gui.GuiGraphics;
import net.neoforged.neoforge.client.gui.GuiLayerManager;
import org.spongepowered.asm.mixin.Mixin;

@Mixin(value = GuiLayerManager.class, remap = false)
public abstract class IntroHudFade {
    @WrapMethod(method = "renderInner")
    private void fadeIntroHud(GuiGraphics graphics, DeltaTracker partialTick, Operation<Void> original) {
        IntroHud.render(graphics, () -> original.call(graphics, partialTick));
    }
}

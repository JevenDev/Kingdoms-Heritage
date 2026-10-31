package com.jvn.kingdomsheritage.mixin;

import com.jvn.kingdomsheritage.client.ClientSelection;
import com.jvn.kingdomsheritage.client.SelectionMusic;
import com.jvn.kingdomsheritage.client.SpawnIntroOverlay;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.toasts.ToastComponent;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(ToastComponent.class)
public abstract class IntroToastGuard {
    @Inject(method = "render", at = @At("HEAD"), cancellable = true)
    private void hideIntroToasts(GuiGraphics graphics, CallbackInfo callback) {
        ToastComponent music = SelectionMusic.toasts();
        if ((Object) this == music) return;
        if ((Object) this == Minecraft.getInstance().getToasts() && music != null && !SpawnIntroOverlay.active()) {
            music.render(graphics);
        }
        if (ClientSelection.blocksToasts()) callback.cancel();
    }
}

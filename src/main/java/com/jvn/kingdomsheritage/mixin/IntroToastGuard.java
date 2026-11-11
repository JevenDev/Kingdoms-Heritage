package com.jvn.kingdomsheritage.mixin;

import com.jvn.kingdomsheritage.client.ClientSelection;
import com.jvn.kingdomsheritage.client.SelectionToasts;
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
    private static final int SELECTION_TOAST_DEPTH_OFFSET = 1000;

    @Inject(method = "render", at = @At("HEAD"), cancellable = true)
    private void hideIntroToasts(GuiGraphics graphics, CallbackInfo callback) {
        ToastComponent selection = SelectionToasts.component();
        if ((Object) this == selection) return;
        if ((Object) this == Minecraft.getInstance().getToasts() && selection != null && !SpawnIntroOverlay.active()) {
            graphics.pose().pushPose();
            graphics.pose().translate(0, 0, SELECTION_TOAST_DEPTH_OFFSET);
            try {
                selection.render(graphics);
            } finally {
                graphics.pose().popPose();
            }
        }
        if (ClientSelection.blocksToasts()) callback.cancel();
    }
}

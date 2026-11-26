package com.jvn.kingdomsheritage.mixin;

import com.jvn.kingdomsheritage.client.KitSelection;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.recipebook.RecipeBookComponent;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Mixin(RecipeBookComponent.class)
public abstract class KitPreviewRecipeBook {
    @Inject(method = "isVisibleAccordingToBookData", at = @At("HEAD"), cancellable = true)
    private void hideBookDuringSelection(CallbackInfoReturnable<Boolean> callback) {
        if (KitSelection.isPreviewInventory(Minecraft.getInstance().screen)) callback.setReturnValue(false);
    }

    @Inject(method = {"setVisible", "setupGhostRecipe"}, at = @At("HEAD"), cancellable = true)
    private void skipBookUpdatesDuringSelection(CallbackInfo callback) {
        if (KitSelection.isPreviewInventory(Minecraft.getInstance().screen)) callback.cancel();
    }
}

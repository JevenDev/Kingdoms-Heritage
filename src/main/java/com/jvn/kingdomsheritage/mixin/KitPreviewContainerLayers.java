package com.jvn.kingdomsheritage.mixin;

import com.jvn.kingdomsheritage.client.KitSelection;
import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import com.llamalad7.mixinextras.injector.wrapoperation.WrapOperation;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.inventory.AbstractContainerScreen;
import net.minecraft.client.gui.screens.recipebook.RecipeUpdateListener;
import net.minecraft.world.inventory.Slot;
import net.neoforged.bus.api.Event;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.neoforge.client.event.ContainerScreenEvent;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

@Mixin(AbstractContainerScreen.class)
public abstract class KitPreviewContainerLayers {
    @WrapOperation(method = "render", at = @At(value = "INVOKE", target = "Lnet/neoforged/bus/api/IEventBus;post(Lnet/neoforged/bus/api/Event;)Lnet/neoforged/bus/api/Event;"))
    private Event renderContainerLayer(IEventBus bus, Event event, Operation<Event> original) {
        if (event instanceof ContainerScreenEvent.Render layer && KitSelection.capturingPreview()
                && KitSelection.isPreviewInventory(layer.getContainerScreen())) return event;
        return original.call(bus, event);
    }

    @WrapOperation(method = "render", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/gui/screens/inventory/AbstractContainerScreen;renderLabels(Lnet/minecraft/client/gui/GuiGraphics;II)V"))
    private void renderLabels(AbstractContainerScreen<?> screen, GuiGraphics graphics, int mouseX, int mouseY,
                              Operation<Void> original) {
        if (KitSelection.capturingPreview() && screen instanceof RecipeUpdateListener) return;
        original.call(screen, graphics, mouseX, mouseY);
    }

    @WrapOperation(method = {"render", "findSlot"}, at = @At(value = "INVOKE", target = "Lnet/minecraft/world/inventory/Slot;isActive()Z"))
    private boolean showSlot(Slot slot, Operation<Boolean> original) {
        if (KitSelection.isCraftingSlot(slot) && KitSelection.isPreviewInventory(Minecraft.getInstance().screen)) return false;
        return original.call(slot);
    }
}

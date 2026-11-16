package com.jvn.kingdomsheritage.mixin;

import com.jvn.kingdomsheritage.client.KitSelection;
import io.wispforest.owo.ui.layers.Layer;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.function.BiFunction;
import java.util.function.Consumer;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.Screen;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Pseudo;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Pseudo
@Mixin(targets = "io.wispforest.owo.ui.layers.Layers", remap = false)
public abstract class KitPreviewOwoLayers {
    @Unique
    private static final Set<Layer<?, ?>> heritage$equipmentLayers = new HashSet<>();

    @Inject(method = "add", at = @At("RETURN"))
    private static void rememberEquipmentLayer(BiFunction<?, ?, ?> rootMaker, Consumer<?> initializer,
                                               Class<?>[] screenClasses, CallbackInfoReturnable<Layer<?, ?>> result) {
        if (KitSelection.isEquipmentClass(initializer.getClass())) heritage$equipmentLayers.add(result.getReturnValue());
    }

    @Inject(method = "getLayers", at = @At("RETURN"), cancellable = true)
    private static void filterPreviewLayers(Class<? extends Screen> screenClass,
                                            CallbackInfoReturnable<Collection<Layer<?, ?>>> result) {
        Screen screen = Minecraft.getInstance().screen;
        if (!KitSelection.isPreviewInventory(screen) || screen.getClass() != screenClass) return;
        // filter before owo installs the layers as input handlers
        result.setReturnValue(KitSelection.showsEquipmentControls()
                ? result.getReturnValue().stream().filter(heritage$equipmentLayers::contains).toList()
                : List.of());
    }
}

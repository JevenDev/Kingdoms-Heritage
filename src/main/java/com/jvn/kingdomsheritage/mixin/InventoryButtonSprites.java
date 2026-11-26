package com.jvn.kingdomsheritage.mixin;

import net.minecraft.client.gui.components.ImageButton;
import net.minecraft.client.gui.components.WidgetSprites;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

@Mixin(ImageButton.class)
public interface InventoryButtonSprites {
    @Accessor("sprites")
    WidgetSprites heritage$getSprites();
}

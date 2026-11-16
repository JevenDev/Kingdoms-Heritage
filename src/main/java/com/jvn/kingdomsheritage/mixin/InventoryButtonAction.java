package com.jvn.kingdomsheritage.mixin;

import net.minecraft.client.gui.components.Button;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

@Mixin(Button.class)
public interface InventoryButtonAction {
    @Accessor("onPress")
    Button.OnPress heritage$getOnPress();
}

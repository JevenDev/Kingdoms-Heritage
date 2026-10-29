package com.jvn.kingdomsheritage.mixin;

import com.jvn.kingdomsheritage.server.SelectionManager;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.network.ServerGamePacketListenerImpl;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(ServerGamePacketListenerImpl.class)
public abstract class SelectionPacketGuard {
    @Shadow public ServerPlayer player;

    @Inject(method = {"handleContainerClick", "handleContainerButtonClick", "handlePlaceRecipe",
            "handleSetCreativeModeSlot", "handlePlayerAction", "handleSetCarriedItem"}, at = @At("HEAD"), cancellable = true)
    private void protectSelectionInventory(CallbackInfo callback) {
        if (player.server.isSameThread() && SelectionManager.blocked(player)) callback.cancel();
    }
}

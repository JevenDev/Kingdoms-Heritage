package com.jvn.kingdomsheritage.mixin;

import com.jvn.kingdomsheritage.server.SelectionManager;
import com.jvn.kingdomsheritage.server.SpawnIntro;
import net.minecraft.network.protocol.game.ServerboundMovePlayerPacket;
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

    @Inject(method = "handleMovePlayer", at = @At(value = "INVOKE",
            target = "Lnet/minecraft/network/protocol/PacketUtils;ensureRunningOnSameThread(Lnet/minecraft/network/protocol/Packet;Lnet/minecraft/network/PacketListener;Lnet/minecraft/server/level/ServerLevel;)V",
            shift = At.Shift.AFTER), cancellable = true)
    private void holdCinematicPlayerPacket(ServerboundMovePlayerPacket packet, CallbackInfo callback) {
        if (SpawnIntro.locked(player)) callback.cancel();
    }

    @Inject(method = {"handleContainerClick", "handleContainerButtonClick", "handlePlaceRecipe",
            "handleSetCreativeModeSlot", "handlePlayerAction", "handleSetCarriedItem"}, at = @At("HEAD"), cancellable = true)
    private void protectSelectionInventory(CallbackInfo callback) {
        if (player.server.isSameThread() && SelectionManager.blocked(player)) callback.cancel();
    }
}

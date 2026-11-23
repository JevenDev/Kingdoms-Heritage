package com.jvn.kingdomsheritage.client;

import com.jvn.kingdomsheritage.data.KitLoadout;
import com.mojang.authlib.GameProfile;
import java.util.UUID;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.client.player.RemotePlayer;
import net.minecraft.client.resources.PlayerSkin;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.world.entity.player.PlayerModelPart;

final class KitPreviewPlayer extends RemotePlayer {
    private final AbstractClientPlayer source;

    KitPreviewPlayer(AbstractClientPlayer source, KitLoadout.Snapshot loadout) {
        super(source.clientLevel, new GameProfile(UUID.randomUUID(), source.getGameProfile().getName()));
        this.source = source;
        getGameProfile().getProperties().putAll(source.getGameProfile().getProperties());
        // each kit needs its own entity identity and equipment attachments for renderer caches
        var data = source.saveWithoutId(new CompoundTag()).copy();
        data.putUUID("UUID", getUUID());
        load(data);
        var entityData = source.getEntityData().getNonDefaultValues();
        if (entityData != null) getEntityData().assignValues(entityData);
        getAttributes().assignAllValues(source.getAttributes());
        loadout.write(this, true, false);
    }

    void prepare() {
        tickCount = source.tickCount;
        setPos(source.position());
        xo = source.xo;
        yo = source.yo;
        zo = source.zo;
        xOld = source.xOld;
        yOld = source.yOld;
        zOld = source.zOld;
        xCloak = source.xCloak;
        yCloak = source.yCloak;
        zCloak = source.zCloak;
        xCloakO = source.xCloakO;
        yCloakO = source.yCloakO;
        zCloakO = source.zCloakO;
        bob = source.bob;
        oBob = source.oBob;
        walkDist = source.walkDist;
        walkDistO = source.walkDistO;
        setYRot(source.getYRot());
        setXRot(source.getXRot());
        yRotO = source.yRotO;
        xRotO = source.xRotO;
        yBodyRot = source.yBodyRot;
        yBodyRotO = source.yBodyRotO;
        yHeadRot = source.yHeadRot;
        yHeadRotO = source.yHeadRotO;
        attackAnim = source.attackAnim;
        oAttackAnim = source.oAttackAnim;
        setPose(source.getPose());
        setMainArm(source.getMainArm());
        setOnGround(source.onGround());
        setDeltaMovement(source.getDeltaMovement());
    }

    @Override
    public PlayerSkin getSkin() {
        return source.getSkin();
    }

    @Override
    public boolean isModelPartShown(PlayerModelPart part) {
        return source.isModelPartShown(part);
    }
}

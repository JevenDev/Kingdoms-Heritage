package com.jvn.kingdomsheritage.compat;

import com.jvn.kingdomsheritage.data.HeritageException;
import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.neoforged.fml.ModList;
import net.neoforged.neoforge.network.PacketDistributor;

public final class IronsSpellsCompat {
    private IronsSpellsCompat() {}

    public static boolean available() {
        return ModList.get().isLoaded("irons_spellbooks") && Access.INSTANCE != null;
    }

    public static void requireMana() {
        if (!available()) throw new HeritageException("irons_mana", "This kit requires Iron's Spells 'n Spellbooks for its mana settings");
    }

    public static float mana(Player player) {
        requireMana();
        try {
            if (player.level().isClientSide()) {
                return ((Number) ClientAccess.GET.invoke(null)).floatValue();
            }
            var data = Access.INSTANCE.data().invoke(null, player);
            return ((Number) Access.INSTANCE.get().invoke(data)).floatValue();
        } catch (ReflectiveOperationException error) {
            throw new IllegalStateException("Could not read Iron's Spells mana", error);
        }
    }

    public static void setMana(ServerPlayer player, float value) {
        requireMana();
        try {
            var access = Access.INSTANCE;
            var data = access.data().invoke(null, player);
            access.set().invoke(data, value);
            PacketDistributor.sendToPlayer(player, (CustomPacketPayload) access.packet().newInstance(data));
        } catch (ReflectiveOperationException error) {
            throw new IllegalStateException("Could not set Iron's Spells mana", error);
        }
    }

    private record Access(Method data, Method get, Method set, Constructor<?> packet) {
        private static final Access INSTANCE = find();

        private static Access find() {
            try {
                var data = Class.forName("io.redspace.ironsspellbooks.api.magic.MagicData", false, IronsSpellsCompat.class.getClassLoader());
                var packet = Class.forName("io.redspace.ironsspellbooks.network.SyncManaPacket", false, IronsSpellsCompat.class.getClassLoader());
                return new Access(data.getMethod("getPlayerMagicData", LivingEntity.class), data.getMethod("getMana"),
                        data.getMethod("setMana", float.class), packet.getConstructor(data));
            } catch (ClassNotFoundException | NoSuchMethodException error) {
                return null;
            }
        }
    }

    private static final class ClientAccess {
        private static final Method GET = find();

        private static Method find() {
            try {
                return Class.forName("io.redspace.ironsspellbooks.player.ClientMagicData").getMethod("getPlayerMana");
            } catch (ClassNotFoundException | NoSuchMethodException error) {
                throw new IllegalStateException("Could not access Iron's Spells client mana", error);
            }
        }
    }
}

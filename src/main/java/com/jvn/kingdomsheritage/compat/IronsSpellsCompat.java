package com.jvn.kingdomsheritage.compat;

import com.jvn.kingdomsheritage.data.HeritageException;
import com.jvn.kingdomsheritage.server.SelectionManager;
import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.neoforged.bus.api.EventPriority;
import net.neoforged.bus.api.ICancellableEvent;
import net.neoforged.fml.ModList;
import net.neoforged.neoforge.common.NeoForge;
import net.neoforged.neoforge.event.entity.player.PlayerEvent;
import net.neoforged.neoforge.network.PacketDistributor;

public final class IronsSpellsCompat {
    private static final ThreadLocal<ServerPlayer> APPLYING_MANA = new ThreadLocal<>();
    private IronsSpellsCompat() {}

    public static boolean available() {
        return ModList.get().isLoaded("irons_spellbooks") && Access.INSTANCE != null;
    }

    public static void register() {
        if (!available()) return;
        NeoForge.EVENT_BUS.addListener(EventPriority.HIGHEST, false, Access.INSTANCE.changeEvent(), IronsSpellsCompat::changeMana);
    }

    private static void changeMana(PlayerEvent event) {
        if (event.getEntity() instanceof ServerPlayer player && SelectionManager.pending(player)
                && APPLYING_MANA.get() != player) {
            ((ICancellableEvent) event).setCanceled(true);
        }
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
            // kit grants and rollbacks run before selection releases the player
            var previous = APPLYING_MANA.get();
            try {
                APPLYING_MANA.set(player);
                access.set().invoke(data, value);
            } finally {
                if (previous == null) APPLYING_MANA.remove();
                else APPLYING_MANA.set(previous);
            }
            PacketDistributor.sendToPlayer(player, (CustomPacketPayload) access.packet().newInstance(data));
        } catch (ReflectiveOperationException error) {
            throw new IllegalStateException("Could not set Iron's Spells mana", error);
        }
    }

    private record Access(Method data, Method get, Method set, Constructor<?> packet, Class<? extends PlayerEvent> changeEvent) {
        private static final Access INSTANCE = find();

        private static Access find() {
            try {
                var data = Class.forName("io.redspace.ironsspellbooks.api.magic.MagicData", false, IronsSpellsCompat.class.getClassLoader());
                var packet = Class.forName("io.redspace.ironsspellbooks.network.SyncManaPacket", false, IronsSpellsCompat.class.getClassLoader());
                var changeEvent = Class.forName("io.redspace.ironsspellbooks.api.events.ChangeManaEvent", false,
                        IronsSpellsCompat.class.getClassLoader()).asSubclass(PlayerEvent.class);
                return new Access(data.getMethod("getPlayerMagicData", LivingEntity.class), data.getMethod("getMana"),
                        data.getMethod("setMana", float.class), packet.getConstructor(data), changeEvent);
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

package com.jvn.kingdomsheritage.compat;

import com.jvn.kingdomsheritage.data.HeritageException;
import java.lang.reflect.Method;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.player.Player;
import net.neoforged.fml.ModList;

public final class NumismaticCompat {
    private NumismaticCompat() {}

    public static boolean available() {
        return ModList.get().isLoaded("numismaticoverhaul") && ReforgedAgain.ACCESS != null;
    }

    public static void requirePurse() {
        if (!available()) {
            throw new HeritageException("numismatic_purse", "This kit requires Numismatic Overhaul Reforged Again for its purse grant");
        }
    }

    public static long balance(ServerPlayer player) {
        return balance((Player) player);
    }

    public static long balance(Player player) {
        requirePurse();
        return (long) invoke(ReforgedAgain.ACCESS.get(), player);
    }

    public static void setBalance(ServerPlayer player, long value) {
        requirePurse();
        invoke(ReforgedAgain.ACCESS.set(), player, value);
    }

    private static Object invoke(Method method, Object... arguments) {
        try {
            return method.invoke(null, arguments);
        } catch (ReflectiveOperationException error) {
            throw new IllegalStateException("Could not access the Numismatic Overhaul purse", error);
        }
    }

    private record ReforgedAgain(Method get, Method set) {
        private static final ReforgedAgain ACCESS = find();

        private static ReforgedAgain find() {
            try {
                var holder = Class.forName("tallestred.numismaticoverhaul.cap.CurrencyHolder", false, NumismaticCompat.class.getClassLoader());
                return new ReforgedAgain(holder.getMethod("getValue", Player.class), holder.getMethod("setValue", Player.class, long.class));
            } catch (ClassNotFoundException | NoSuchMethodException error) {
                return null;
            }
        }
    }
}

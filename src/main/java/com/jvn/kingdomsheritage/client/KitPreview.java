package com.jvn.kingdomsheritage.client;

import com.jvn.kingdomsheritage.HeritageConfig.InventoryPolicy;
import com.jvn.kingdomsheritage.data.KitDefinition;
import com.jvn.kingdomsheritage.data.KitLoadout;
import java.util.List;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;

final class KitPreview {
    private final Player player;
    private KitLoadout.Snapshot original;
    private KitLoadout.Snapshot expected;
    private KitDefinition kit;
    private List<KitDefinition.StackEntry> stacks;
    private InventoryPolicy policy;
    private IllegalArgumentException failure;

    KitPreview(Player player) {
        this.player = player;
    }

    boolean apply(KitDefinition kit, List<KitDefinition.StackEntry> stacks, InventoryPolicy policy) {
        if (this.kit == kit && this.stacks == stacks && this.policy == policy && original != null && original.matches(player)) {
            if (failure != null) throw failure;
            return false;
        }
        original = KitLoadout.capture(player, true);
        expected = null;
        failure = null;
        this.kit = kit;
        this.stacks = stacks;
        this.policy = policy;
        try {
            if (kit != null && policy != InventoryPolicy.PRESERVE) {
                expected = KitLoadout.plan(original, player.getInventory().items.size(), kit, stacks, policy);
            }
        } catch (IllegalArgumentException error) {
            failure = error;
            throw error;
        }
        return true;
    }

    ItemStack item(int slot) {
        return expected == null ? player.getInventory().getItem(slot).copy() : expected.item(slot);
    }

    void render(Runnable draw) {
        if (expected == null) {
            draw.run();
            return;
        }
        // modded equipment renderers read the live entity
        var actual = KitLoadout.capture(player, false);
        try {
            expected.write(player, true);
            draw.run();
        } finally {
            actual.write(player, false);
        }
    }
}

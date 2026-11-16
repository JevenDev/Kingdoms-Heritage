package com.jvn.kingdomsheritage.client;

import com.jvn.kingdomsheritage.HeritageConfig.InventoryPolicy;
import com.jvn.kingdomsheritage.data.KitDefinition;
import com.jvn.kingdomsheritage.data.KitLoadout;
import com.jvn.kingdomsheritage.data.KitStats;
import java.util.List;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;

final class KitPreview {
    private static KitPreview rendering;
    private final Player player;
    private KitPreviewPlayer renderPlayer;
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
        renderPlayer = null;
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

    KitStats.Preview stats() {
        return (kit == null || policy == InventoryPolicy.PRESERVE ? KitStats.EMPTY : kit.stats()).preview(player, original, expected);
    }

    long purseGrant() {
        return expected == null ? 0 : kit.stats().purse();
    }

    int purchaseIndex(int slot) {
        return expected == null ? -1 : expected.purchaseIndex(slot);
    }

    static Entity renderEntity(Entity entity) {
        if (rendering == null || entity != rendering.player) return entity;
        if (rendering.renderPlayer == null) {
            rendering.renderPlayer = new KitPreviewPlayer((AbstractClientPlayer) entity,
                    rendering.expected == null ? rendering.original : rendering.expected);
        }
        rendering.renderPlayer.prepare();
        return rendering.renderPlayer;
    }

    void render(Runnable draw) {
        var previous = rendering;
        var actual = expected == null ? null : KitLoadout.capture(player, false);
        try {
            rendering = this;
            // inventory screens still read the live player's slots
            if (expected != null) expected.write(player, true);
            draw.run();
        } finally {
            rendering = previous;
            if (actual != null) actual.write(player, false);
        }
    }
}

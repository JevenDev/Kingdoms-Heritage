package com.jvn.kingdomsheritage.client;

import com.jvn.kingdomsheritage.HeritageConfig.InventoryPolicy;
import com.jvn.kingdomsheritage.compat.EquipmentCompat;
import com.jvn.kingdomsheritage.data.KitDefinition;
import com.jvn.kingdomsheritage.data.KitLoadout;
import com.jvn.kingdomsheritage.data.KitStats;
import java.util.List;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.neoforged.fml.ModList;

final class KitPreview {
    private static KitPreview rendering;
    private final Player player;
    private KitPreviewPlayer renderPlayer;
    private boolean renderingCosmeticArmor;
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
            if (kit != null) {
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
        return expected == null || policy == InventoryPolicy.PRESERVE ? 0 : kit.stats().purse();
    }

    int overflowStacks() {
        return expected == null ? 0 : expected.overflowStacks();
    }

    int purchaseIndex(int slot) {
        return expected == null ? -1 : expected.purchaseIndex(slot);
    }

    private KitLoadout.Snapshot loadout() {
        return expected == null ? original : expected;
    }

    boolean showsCosmeticArmor() {
        return kit != null && kit.shop() == null && ModList.get().isLoaded(EquipmentCompat.COSMETIC_ARMOR);
    }

    static KitLoadout.Snapshot cosmeticArmor() {
        return rendering != null && rendering.showsCosmeticArmor() ? rendering.loadout() : null;
    }

    static Entity renderEntity(Entity entity) {
        if (rendering == null || entity != rendering.player) return entity;
        var loadout = rendering.loadout();
        if (rendering.renderPlayer == null) {
            rendering.renderPlayer = new KitPreviewPlayer((AbstractClientPlayer) entity, loadout);
        }
        if (!rendering.renderingCosmeticArmor && rendering.showsCosmeticArmor()) {
            rendering.renderingCosmeticArmor = true;
            EquipmentCompat.previewCosmeticArmor(rendering.renderPlayer, loadout::cosmeticArmor);
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
            if (expected != null) expected.write(player, true, false);
            draw.run();
        } finally {
            rendering = previous;
            try {
                if (renderingCosmeticArmor) {
                    renderingCosmeticArmor = false;
                    // the mod caches cosmetic stacks by the preview player's UUID
                    EquipmentCompat.previewCosmeticArmor(renderPlayer, index -> ItemStack.EMPTY);
                }
            } finally {
                if (actual != null) actual.write(player, false, false);
            }
        }
    }
}

package com.jvn.kingdomsheritage.client;

import net.minecraft.resources.ResourceLocation;

public final class KitInventoryTextures {
    private static final ResourceLocation VANILLA = ResourceLocation.withDefaultNamespace("textures/gui/container/inventory.png");
    private static final ResourceLocation COSMETIC_ARMOR = ResourceLocation.fromNamespaceAndPath(
            "cosmeticarmorreworked", "textures/gui/cosarmorinventory.png");
    static final ResourceLocation INVENTORY = ResourceLocation.fromNamespaceAndPath(
            "kingdomsheritage", "textures/gui/selection/kit_inventory.png");
    private static final ResourceLocation COSMETIC_INVENTORY = ResourceLocation.fromNamespaceAndPath(
            "kingdomsheritage", "textures/gui/selection/kit_cosmetic_inventory.png");

    private KitInventoryTextures() {}

    public static ResourceLocation previewTexture(ResourceLocation texture) {
        if (VANILLA.equals(texture) && KitSelection.capturingPreview()) return INVENTORY;
        if (COSMETIC_ARMOR.equals(texture) && KitSelection.capturingPreview()) return COSMETIC_INVENTORY;
        return texture;
    }
}

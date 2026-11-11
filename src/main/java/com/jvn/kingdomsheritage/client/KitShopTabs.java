package com.jvn.kingdomsheritage.client;

import com.jvn.kingdomsheritage.data.KitShop;
import com.mojang.math.Axis;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

final class KitShopTabs {
    static final int HEIGHT = 26, PITCH = 27, WIDTH = 28;
    private static final int SPRITE_WIDTH = 32;
    static final int PAGER_INSET = (SPRITE_WIDTH - 16) / 2;
    private static final int PREVIEW_ROWS = 4;
    private static final ResourceLocation SELECTED = texture("tab_top_selected_1");
    private static final ResourceLocation SELECTED_MIDDLE = texture("tab_top_selected_2");
    private static final ResourceLocation UNSELECTED = texture("tab_top_unselected_1");

    private KitShopTabs() {}

    private static ResourceLocation texture(String name) {
        return ResourceLocation.withDefaultNamespace("textures/gui/sprites/container/creative_inventory/" + name + ".png");
    }

    static ItemStack icon(KitShop.Section section) {
        return BuiltInRegistries.ITEM.getOptional(section.icon()).orElse(Items.PAPER).getDefaultInstance();
    }

    static void background(GuiGraphics graphics, int x, int y, boolean selected, boolean first) {
        graphics.pose().pushPose();
        graphics.pose().translate(x, y + HEIGHT, 0);
        graphics.pose().mulPose(Axis.ZP.rotationDegrees(-90));
        var sprite = selected ? first ? SELECTED : SELECTED_MIDDLE : UNSELECTED;
        graphics.blit(sprite, 0, 0, HEIGHT, SPRITE_WIDTH, HEIGHT, 0,
                -HEIGHT, SPRITE_WIDTH, HEIGHT, SPRITE_WIDTH);
        graphics.pose().popPose();
    }

    static void drawIcon(GuiGraphics graphics, int x, int y, ItemStack icon) {
        graphics.renderItem(icon, x + (SPRITE_WIDTH - 16) / 2, y + (HEIGHT - 16) / 2);
    }

    static int previewHeight(int sections) {
        return sections == 0 ? 0 : (Math.min(PREVIEW_ROWS, sections + 1) - 1) * PITCH + HEIGHT;
    }

    static Preview preview(KitShop shop) {
        if (shop == null || shop.sections().isEmpty()) return Preview.EMPTY;
        int count = shop.sections().size() + 1;
        int visible = count > PREVIEW_ROWS ? PREVIEW_ROWS - 1 : count;
        var icons = new ArrayList<ItemStack>(visible);
        icons.add(Items.CHEST.getDefaultInstance());
        for (int index = 0; index < visible - 1; index++) icons.add(icon(shop.sections().get(index)));
        return new Preview(List.copyOf(icons), count - visible);
    }

    record Preview(List<ItemStack> icons, int remaining) {
        static final Preview EMPTY = new Preview(List.of(), 0);

        int width(int left) { return icons.isEmpty() || left < WIDTH ? 0 : WIDTH; }

        void renderUnselected(GuiGraphics graphics, int left, int top) {
            int x = left - WIDTH;
            for (int row = 1; row < icons.size(); row++) {
                int y = top + row * PITCH;
                background(graphics, x, y, false, false);
                drawIcon(graphics, x, y, icons.get(row));
            }
            if (remaining > 0) {
                int y = top + icons.size() * PITCH;
                background(graphics, x, y, false, false);
                SelectionText.centered(graphics, Minecraft.getInstance().font, "+" + remaining,
                        x + SPRITE_WIDTH / 2, y + 9, 0xffffffff);
            }
        }

        void renderSelected(GuiGraphics graphics, int left, int top) {
            int x = left - WIDTH;
            background(graphics, x, top, true, true);
            drawIcon(graphics, x, top, icons.getFirst());
        }
    }
}

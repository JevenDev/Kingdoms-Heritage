package com.jvn.kingdomsheritage.client;

import com.jvn.kingdomsheritage.KingdomsHeritage;
import com.jvn.kingdomsheritage.data.KitStats;
import com.mojang.datafixers.util.Either;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.Gui;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.inventory.tooltip.ClientTooltipComponent;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.FormattedText;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.inventory.tooltip.TooltipComponent;
import net.minecraft.world.item.ItemStack;
import net.neoforged.neoforge.client.event.RegisterClientTooltipComponentFactoriesEvent;

final class KitStatPanel {
    private static final int STAT_SIZE = 9;
    private static final int GAP = 3;
    private static final int GROUP_GAP = 6;
    static final int HEIGHT = STAT_SIZE;
    private static final String TEXT = "screen.kingdomsheritage.kit_stats.";

    private KitStatPanel() {}

    static void registerTooltips(RegisterClientTooltipComponentFactoriesEvent event) {
        event.register(HudIcons.class, icons -> icons);
    }

    private static boolean showInInfo(KitStats.Bonus bonus) {
        return !bonus.attribute().equals(Attributes.ARMOR.unwrapKey().orElseThrow().location())
                && !bonus.attribute().equals(Attributes.MAX_HEALTH.unwrapKey().orElseThrow().location())
                && !bonus.attribute().equals(KitStats.MAX_MANA);
    }

    private static boolean hasInfo(KitStats.Preview stats) {
        return stats.bonuses().attributes().stream().anyMatch(KitStatPanel::showInInfo);
    }

    static int width(Font font, KitStats.Preview stats) {
        return statWidth(font, Integer.toString(stats.armor())) + statWidth(font, number(stats.health()))
                + statWidth(font, Integer.toString(stats.hunger())) + GROUP_GAP * 2
                + (hasInfo(stats) ? STAT_SIZE + GROUP_GAP : 0)
                + (stats.mana() == null ? 0 : statWidth(font, manaText(stats.mana())) + GROUP_GAP);
    }

    private static int statWidth(Font font, String value) {
        return STAT_SIZE + GAP + font.width(value);
    }

    static void render(GuiGraphics graphics, Font font, KitStats.Preview stats, int x, int y, int mouseX, int mouseY) {
        int tooltipX = x + width(font, stats);
        int tooltipY = y + HEIGHT + 16;
        graphics.pose().pushPose();
        graphics.pose().translate(0, 0, 550);
        if (hasInfo(stats)) {
            graphics.blitSprite(icon("info"), x, y, STAT_SIZE, STAT_SIZE);
            if (inside(mouseX, mouseY, x, y, STAT_SIZE, STAT_SIZE)) {
                var lines = new ArrayList<Component>();
                for (var bonus : stats.bonuses().attributes()) {
                    if (!showInInfo(bonus)) continue;
                    var key = BuiltInRegistries.ATTRIBUTE.getHolder(bonus.attribute())
                            .map(type -> type.value().getDescriptionId()).orElse(bonus.attribute().toString());
                    double value = bonus.amount();
                    var operation = bonus.operation();
                    String amount = switch (operation) {
                        case ADD_VALUE -> number(value);
                        case ADD_MULTIPLIED_BASE, ADD_MULTIPLIED_TOTAL -> number(value * 100) + "%";
                    };
                    lines.add(Component.translatable(TEXT + operation.getSerializedName(),
                            Component.translatable(key), (value >= 0 ? "+" : "") + amount));
                }
                graphics.renderComponentTooltip(font, lines, tooltipX, tooltipY);
            }
            x += STAT_SIZE + GROUP_GAP;
        }
        int statY = y + (HEIGHT - STAT_SIZE) / 2;
        x += drawStat(graphics, font, "armor", Integer.toString(stats.armor()), x, statY, mouseX, mouseY, tooltipX, tooltipY,
                new HudIcons(Stat.ARMOR, stats.armor(), 10),
                Component.translatable(TEXT + "armor", stats.armor())) + GROUP_GAP;
        x += drawStat(graphics, font, "health", number(stats.health()), x, statY, mouseX, mouseY, tooltipX, tooltipY,
                new HudIcons(Stat.HEALTH, (int) Math.ceil(stats.health()), (int) Math.ceil(stats.maxHealth() / 2)),
                Component.translatable(TEXT + "health", number(stats.health()), number(stats.maxHealth()))) + GROUP_GAP;
        x += drawStat(graphics, font, "hunger", Integer.toString(stats.hunger()), x, statY, mouseX, mouseY, tooltipX, tooltipY,
                new HudIcons(Stat.HUNGER, stats.hunger(), 10),
                Component.translatable(TEXT + "hunger", stats.hunger())) + GROUP_GAP;
        if (stats.mana() != null) {
            String value = manaText(stats.mana());
            graphics.blitSprite(icon("mana"), x, statY, STAT_SIZE, STAT_SIZE);
            SelectionText.draw(graphics, font, value, x + STAT_SIZE + GAP, statY, 0xffffff);
            if (inside(mouseX, mouseY, x, statY, statWidth(font, value), STAT_SIZE)) {
                graphics.renderComponentTooltip(font, List.of(Component.translatable(TEXT + "mana",
                        number(stats.mana().amount()), number(stats.mana().capacity()))), tooltipX, tooltipY);
            }
        }
        graphics.pose().popPose();
    }

    private static String manaText(KitStats.ManaPreview mana) {
        return number(mana.amount()) + " / " + number(mana.capacity());
    }

    private static int drawStat(GuiGraphics graphics, Font font, String name, String value, int x, int y,
                                int mouseX, int mouseY, int tooltipX, int tooltipY, HudIcons icons, Component description) {
        graphics.blitSprite(icon(name), x, y, STAT_SIZE, STAT_SIZE);
        SelectionText.draw(graphics, font, value, x + STAT_SIZE + GAP, y + (STAT_SIZE - font.lineHeight) / 2, 0xffffff);
        int width = statWidth(font, value);
        if (inside(mouseX, mouseY, x, y, width, STAT_SIZE)) {
            List<Either<FormattedText, TooltipComponent>> elements = List.of(Either.right(icons), Either.left(description));
            graphics.renderComponentTooltipFromElements(font, elements, tooltipX, tooltipY, ItemStack.EMPTY);
        }
        return width;
    }

    private static boolean inside(int mouseX, int mouseY, int x, int y, int width, int height) {
        return mouseX >= x && mouseX < x + width && mouseY >= y && mouseY < y + height;
    }

    private static ResourceLocation icon(String name) {
        return ResourceLocation.fromNamespaceAndPath(KingdomsHeritage.MOD_ID, "kit/stat_icon_" + name);
    }

    private static String number(double value) {
        if (!Double.isFinite(value)) return Double.toString(value);
        if (Math.abs(value) >= 1_000_000) return String.format(java.util.Locale.ROOT, "%.2g", value);
        return net.minecraft.world.item.component.ItemAttributeModifiers.ATTRIBUTE_MODIFIER_FORMAT.format(value);
    }

    private enum Stat {
        ARMOR("armor"), HEALTH("heart"), HUNGER("food");

        final ResourceLocation empty;
        final ResourceLocation half;
        final ResourceLocation full;

        Stat(String name) {
            String prefix = "hud/" + name + "_";
            empty = ResourceLocation.withDefaultNamespace(prefix + "empty");
            half = ResourceLocation.withDefaultNamespace(prefix + "half");
            full = ResourceLocation.withDefaultNamespace(prefix + "full");
        }
    }

    private record HudIcons(Stat stat, int filled, int slots) implements TooltipComponent, ClientTooltipComponent {
        private int rows() { return (slots + 9) / 10; }

        private int rowStep() { return Math.max(3, 10 - Math.max(0, rows() - 2)); }

        @Override
        public int getWidth(Font font) { return Math.min(10, slots) * 8 + 1; }

        @Override
        public int getHeight() { return 9 + Math.max(0, rows() - 1) * rowStep(); }

        @Override
        public void renderImage(Font font, int x, int y, GuiGraphics graphics) {
            for (int i = slots - 1; i >= 0; i--) {
                int column = stat == Stat.HUNGER ? 9 - i % 10 : i % 10;
                int left = x + column * 8;
                int top = y + (rows() - 1 - i / 10) * rowStep();
                int points = filled - 2 * i;
                if (stat == Stat.HEALTH) {
                    graphics.blitSprite(Gui.HeartType.CONTAINER.getSprite(false, false, false), left, top, 9, 9);
                    if (points > 0) {
                        graphics.blitSprite(Gui.HeartType.NORMAL.getSprite(false, points == 1, false), left, top, 9, 9);
                    }
                } else {
                    graphics.blitSprite(stat == Stat.HUNGER ? stat.empty : points >= 2 ? stat.full : points == 1 ? stat.half : stat.empty,
                            left, top, 9, 9);
                    if (stat == Stat.HUNGER && points > 0) graphics.blitSprite(points == 1 ? stat.half : stat.full, left, top, 9, 9);
                }
            }
        }
    }
}

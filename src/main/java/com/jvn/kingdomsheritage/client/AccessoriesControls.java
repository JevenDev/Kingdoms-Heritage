package com.jvn.kingdomsheritage.client;

import io.wispforest.owo.ui.core.OwoUIAdapter;
import io.wispforest.owo.ui.layers.Layers;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.screens.Screen;

final class AccessoriesControls {
    private AccessoriesControls() {}

    static void hideCrafting(Screen screen) {
        if (screen instanceof io.wispforest.accessories.client.gui.AccessoriesExperimentalScreen experimental) {
            var button = experimental.component(io.wispforest.owo.ui.core.Component.class, "crafting_grid_button");
            if (button != null && button.parent() != null) button.parent().removeChild(button);
        }
    }

    static net.minecraft.client.renderer.Rect2i inventoryBounds(Screen screen) {
        if (!(screen instanceof io.wispforest.accessories.client.gui.AccessoriesExperimentalScreen experimental)) return null;
        var entity = experimental.component(io.wispforest.owo.ui.core.Component.class, "entity_rendering_component");
        var armor = experimental.component(io.wispforest.owo.ui.core.Component.class, "armor_entity_layout");
        int height = Math.min(138, Math.max(100, screen.height - 134));
        if (entity != null && armor != null) {
            armor.verticalSizing(io.wispforest.owo.ui.core.Sizing.fixed(height));
            entity.verticalSizing(io.wispforest.owo.ui.core.Sizing.fixed(height - 30));
            var panel = entity.parent().parent();
            panel.verticalSizing(io.wispforest.owo.ui.core.Sizing.fixed(height));
            panel.surface(io.wispforest.accessories.client.gui.components.ComponentUtils.getPanelSurface().and((graphics, component) -> {
                graphics.fill(component.x() + 3, component.y() + 3,
                        component.x() + component.width() - 3, component.y() + component.height() - 3, 0xff000000);
                var texture = io.wispforest.accessories.Accessories.of("textures/gui/theme/"
                        + io.wispforest.accessories.client.gui.components.ComponentUtils.checkMode("light", "dark") + "/slot.png");
                panel.forEachDescendant(child -> {
                    if (child instanceof io.wispforest.owo.ui.base.BaseOwoHandledScreen.SlotComponent) {
                        graphics.blit(texture, child.x() - 1, child.y() - 1, 0, 0, 18, 18, 18, 18);
                    }
                });
            }));
        }
        for (var child : screen.children()) {
            if (child instanceof OwoUIAdapter<?> adapter && !adapter.rootComponent.children().isEmpty()) {
                var content = adapter.rootComponent.children().getFirst();
                int top = Math.max(14, (screen.height - content.height() - 12) / 2);
                content.positioning(io.wispforest.owo.ui.core.Positioning.absolute(
                        (screen.width - content.width()) / 2, top));
                return new net.minecraft.client.renderer.Rect2i(content.x(), content.y(), content.width(), content.height());
            }
        }
        return null;
    }

    static boolean isControl(Screen screen, double x, double y) {
        for (var layer : Layers.getInstances(screen)) {
            if (layer.adapter.rootComponent.childAt((int) x, (int) y) instanceof AbstractWidget widget
                    && widget.active && widget.visible) return true;
        }
        for (var child : screen.children()) {
            if (child instanceof OwoUIAdapter<?> adapter
                    && adapter.rootComponent.childAt((int) x, (int) y) instanceof AbstractWidget widget
                    && widget.active && widget.visible) return true;
        }
        return false;
    }
}

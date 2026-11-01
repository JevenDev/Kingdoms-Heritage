package com.jvn.kingdomsheritage.client;

import net.minecraft.Util;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.network.chat.Component;

final class ExtensionWaitingScreen extends HeritageScreen {
    private final HeritageScreens.Context context;
    private final String problem;
    private net.minecraft.client.gui.components.Button retry;
    private net.minecraft.client.gui.components.Button back;

    ExtensionWaitingScreen(HeritageScreens.Context context, String problem) {
        super(Component.translatable("screen.kingdomsheritage.extension_title"));
        this.context = context;
        this.problem = problem;
    }

    @Override
    protected void init() {
        addRenderableWidget(HeritageStyles.disconnect(height));
        back = addRenderableWidget(HeritageStyles.button(width / 2 - 75, height - 50, 150, 20,
                Component.translatable("gui.back"), button -> context.back()));
        back.active = context.canGoBack();
        retry = addRenderableWidget(HeritageStyles.button(width / 2 - 75, height - 76, 150, 20,
                Component.translatable("screen.kingdomsheritage.extension_retry"), button -> HeritageScreens.retry(context)));
        tick();
    }

    @Override
    public void tick() {
        retry.visible = !problem.isEmpty() || context.status().error().isPresent();
        back.active = context.canGoBack();
    }

    @Override
    public void render(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
        super.render(graphics, mouseX, mouseY, partialTick);
        var status = context.status();
        String error = problem.isEmpty() ? status.error().orElse("") : problem;
        Component message = !error.isEmpty() ? Component.literal(error)
                : !status.canDecide() && !status.decided() ? Component.translatable("screen.kingdomsheritage.extension_leader")
                : status.ready() ? Component.translatable("screen.kingdomsheritage.extension_ready", status.readyCount(), status.members())
                : Component.translatable("screen.kingdomsheritage.wait");
        if (error.isEmpty()) HeritageStyles.loading(graphics, width / 2, height / 2 - 32, Util.getMillis(), 255);
        var lines = font.split(message, Math.max(1, width - 40));
        int y = Math.max(32, Math.min(height / 2, height - 86 - lines.size() * (font.lineHeight + 3)));
        for (var line : lines) {
            SelectionText.centered(graphics, font, line, width / 2, y, error.isEmpty() ? 0xffffffff : 0xffff8888);
            y += font.lineHeight + 3;
        }
    }
}

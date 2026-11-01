package com.jvn.kingdomsheritage.client;

import java.util.Objects;
import java.util.function.BooleanSupplier;
import java.util.function.Supplier;
import net.minecraft.Util;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.network.chat.Component;

public class HeritageLoadingScreen extends HeritageScreen {
    private final Supplier<Component> status;
    private final BooleanSupplier ready;
    private final Runnable onReady;
    private final long started = Util.getMillis();
    private boolean completed;

    public HeritageLoadingScreen(Component title, Supplier<Component> status, BooleanSupplier ready, Runnable onReady) {
        super(title);
        this.status = Objects.requireNonNull(status, "status");
        this.ready = Objects.requireNonNull(ready, "ready");
        this.onReady = Objects.requireNonNull(onReady, "onReady");
    }

    @Override
    protected void init() { addRenderableWidget(HeritageStyles.disconnect(height)); }

    @Override
    public void tick() {
        if (!completed && ready.getAsBoolean()) {
            completed = true;
            onReady.run();
        }
    }

    @Override
    public void render(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
        super.render(graphics, mouseX, mouseY, partialTick);
        HeritageStyles.loading(graphics, width / 2, height / 2 - 8, Util.getMillis() - started, 255);
        HeritageStyles.centeredText(graphics, status.get(), width / 2, height / 2 + 16, 0xffffffff);
    }

    @Override
    public Component getNarrationMessage() { return getTitle().copy().append(". ").append(status.get()); }
}

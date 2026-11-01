package com.jvn.kingdomsheritage.client;

import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

public abstract class HeritageScreen extends Screen {
    protected HeritageScreen(Component title) { super(title); }

    public boolean showsParty() { return false; }

    @Override
    public boolean isPauseScreen() { return false; }

    @Override
    public boolean shouldCloseOnEsc() { return false; }

    @Override
    public void renderBackground(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
        HeritageStyles.background(graphics, width, height);
    }

    @Override
    public void render(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
        super.render(graphics, mouseX, mouseY, partialTick);
        HeritageStyles.centeredText(graphics, getTitle(), width / 2, 12, 0xffffffff);
    }
}

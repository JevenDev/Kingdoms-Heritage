package com.jvn.kingdomsheritage.client;

import com.jvn.toucanlib.client.ToucanComponentMarkup;
import net.minecraft.network.chat.Component;

final class IntroMarkup {
    private IntroMarkup() {}

    static Component style(Component component) {
        return ToucanComponentMarkup.format(component, () -> true, false);
    }
}

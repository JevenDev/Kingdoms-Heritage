package com.jvn.kingdomsheritage.client;

import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;

final class IntroText {
    private IntroText() {}

    static Component location(String kind, String id) {
        if (id.isEmpty()) return Component.translatable("intro.kingdomsheritage." + (kind.equals("structure") ? "wilderness" : "unknown"));
        ResourceLocation key = ResourceLocation.parse(id);
        StringBuilder fallback = new StringBuilder();
        for (String word : key.getPath().split("[/_]+")) {
            if (!fallback.isEmpty()) fallback.append(' ');
            if (!word.isEmpty()) fallback.append(Character.toUpperCase(word.charAt(0))).append(word.substring(1));
        }
        return Component.translatableWithFallback(kind + "." + key.getNamespace() + "." + key.getPath().replace('/', '.'), fallback.toString());
    }
}

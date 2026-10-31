package com.jvn.kingdomsheritage.client;

import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.Style;
import net.minecraft.resources.ResourceLocation;

final class IntroText {
    private static final Pattern TAG = Pattern.compile("<(biome|structure|dimension)>");
    private IntroText() {}

    static Component resolve(Component text, Map<String, Component> locations) {
        var result = Component.empty();
        text.visit((style, value) -> {
            var matcher = TAG.matcher(value);
            int previous = 0;
            while (matcher.find()) {
                result.append(Component.literal(value.substring(previous, matcher.start())).withStyle(style));
                result.append(locations.get(matcher.group(1)).copy().withStyle(style));
                previous = matcher.end();
            }
            result.append(Component.literal(value.substring(previous)).withStyle(style));
            return Optional.empty();
        }, Style.EMPTY);
        return result;
    }

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

package com.jvn.kingdomsheritage.data;

import net.minecraft.network.chat.Component;

public final class HeritageException extends IllegalArgumentException {
    private final Component component;

    public HeritageException(String key, String fallback, Object... arguments) {
        super(String.format(java.util.Locale.ROOT, fallback, arguments));
        component = Component.translatableWithFallback("error.kingdomsheritage." + key, fallback, arguments);
    }

    public static Component component(IllegalArgumentException error) {
        return error instanceof HeritageException heritage ? heritage.component
                : Component.translatable("error.kingdomsheritage.definition", error.getMessage());
    }
}

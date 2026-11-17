package com.jvn.kingdomsheritage.data;

import java.util.Objects;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.contents.TranslatableContents;

public final class HeritageException extends IllegalArgumentException {
    private final Component component;

    public HeritageException(String key, String fallback, Object... arguments) {
        super(String.format(java.util.Locale.ROOT, fallback, arguments));
        Object[] translationArguments = arguments.clone();
        for (int i = 0; i < translationArguments.length; i++) {
            Object argument = translationArguments[i];
            if (!(argument instanceof Component) && !TranslatableContents.isAllowedPrimitiveArgument(argument)) {
                translationArguments[i] = String.valueOf(argument);
            }
        }
        component = Component.translatableWithFallback("error.kingdomsheritage." + key, fallback, translationArguments);
    }

    public static Component component(IllegalArgumentException error) {
        return error instanceof HeritageException heritage ? heritage.component
                : Component.translatable("error.kingdomsheritage.definition",
                        Objects.toString(error.getMessage(), error.getClass().getName()));
    }
}

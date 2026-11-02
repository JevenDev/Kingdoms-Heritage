package com.jvn.kingdomsheritage.api;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;

public final class HeritageDialogue {
    @FunctionalInterface
    public interface VariableProvider {
        Optional<Component> resolve(ServerPlayer player, SelectionState selection);
    }

    private static final Map<ResourceLocation, VariableProvider> VARIABLES = new LinkedHashMap<>();

    private HeritageDialogue() {}

    public static synchronized void registerVariable(ResourceLocation id, VariableProvider provider) {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(provider, "provider");
        if (VARIABLES.size() >= 64) throw new IllegalStateException("At most 64 dialogue variables can be registered");
        if (VARIABLES.putIfAbsent(id, provider) != null) throw new IllegalArgumentException("Duplicate dialogue variable: " + id);
    }

    public static DialogueContext context(ServerPlayer player, SelectionState selection, DialogueContext base) {
        Map<ResourceLocation, VariableProvider> providers;
        synchronized (HeritageDialogue.class) { providers = new LinkedHashMap<>(VARIABLES); }
        var result = base;
        for (var entry : providers.entrySet()) {
            var value = Objects.requireNonNull(entry.getValue().resolve(player, selection), "dialogue variable");
            if (value.isPresent()) result = result.with("var:" + entry.getKey(), value.get(), value.get().getString());
        }
        if (result.json().toString().length() > 32768) throw new IllegalArgumentException("Dialogue context exceeds 32768 characters");
        return result;
    }
}

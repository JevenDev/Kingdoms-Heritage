package com.example.vr;

import com.jvn.kingdomsheritage.api.HeritageDialogue;
import com.jvn.kingdomsheritage.api.HeritageFlow;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;

public final class VrDialogueIntegration {
    public static void register() {
        var screen = ResourceLocation.fromNamespaceAndPath("example", "faction");
        HeritageDialogue.registerVariable(ResourceLocation.fromNamespaceAndPath("example", "faction"), (player, selection) ->
                HeritageFlow.decision(player, screen).filter(value -> value.has("faction"))
                        .map(value -> Component.literal(value.get("faction").getAsString())));
    }
}

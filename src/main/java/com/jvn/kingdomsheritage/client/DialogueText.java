package com.jvn.kingdomsheritage.client;

import com.google.gson.JsonObject;
import com.jvn.kingdomsheritage.api.DialogueContext;
import java.util.Locale;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;

public final class DialogueText {
    private DialogueText() {}

    public static DialogueContext context(JsonObject message) {
        var context = DialogueContext.parse(message.getAsJsonObject("dialogue_context"));
        var locations = message.getAsJsonObject("locations");
        for (String kind : java.util.List.of("biome", "structure", "dimension")) {
            String id = locations.has(kind) ? locations.get(kind).getAsString() : "";
            context = context.with(kind, IntroText.location(kind, id), id);
        }
        var place = place(locations);
        return context.with("place", place, place.getString());
    }

    public static Component key(String id) {
        String name = id.startsWith("key.") ? id : "key." + id;
        for (var mapping : net.minecraft.client.Minecraft.getInstance().options.keyMappings) {
            if (mapping.getName().equals(id) || mapping.getName().equals(name)) return mapping.getTranslatedKeyMessage();
        }
        return null;
    }

    private static Component place(JsonObject locations) {
        String kind = locations.has("structure") ? "structure" : "biome";
        String id = locations.has(kind) ? locations.get(kind).getAsString() : "";
        if (!id.isEmpty() && kind.equals("structure")) id = structure(ResourceLocation.parse(id)).toString();
        String name = IntroText.location(id.isEmpty() ? "structure" : kind, id).getString().trim().toLowerCase(Locale.ROOT);
        if (name.startsWith("the ") || name.startsWith("a ") || name.startsWith("an ")) return Component.literal(name);
        return Component.translatable("screen.kingdomsheritage.review_place", Component.literal(name));
    }

    private static ResourceLocation structure(ResourceLocation id) {
        if (!id.getNamespace().equals("minecraft")) return id;
        String path = id.getPath();
        if (path.startsWith("village_")) path = "village";
        else if (path.startsWith("ruined_portal")) path = "ruined_portal";
        else if (path.startsWith("ocean_ruin_")) path = "ocean_ruins";
        else path = switch (path) {
            case "shipwreck_beached" -> "shipwreck";
            case "mineshaft_mesa" -> "mineshaft";
            case "jungle_pyramid" -> "jungle_temple";
            case "desert_pyramid" -> "desert_temple";
            default -> path;
        };
        return ResourceLocation.withDefaultNamespace(path);
    }
}

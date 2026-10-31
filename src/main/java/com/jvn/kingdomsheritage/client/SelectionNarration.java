package com.jvn.kingdomsheritage.client;

import com.google.gson.JsonObject;
import com.jvn.kingdomsheritage.data.DefinitionJson;
import com.jvn.toucanlib.client.ToucanTextTimeline;
import java.util.List;
import java.util.Locale;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;

record SelectionNarration(Component text, ToucanTextTimeline timeline) {
    static SelectionNarration create(Component player, JsonObject locations, JsonObject kit, String policy) {
        Component equipment;
        if (policy.equals("PRESERVE") || policy.equals("MERGE") && kit.getAsJsonArray("items").isEmpty()) {
            equipment = Component.translatable("screen.kingdomsheritage.review_carried", aqua(Component.translatable("screen.kingdomsheritage.review_carried_items")));
        } else if (kit.getAsJsonArray("items").isEmpty()) {
            equipment = Component.translatable("screen.kingdomsheritage.review_empty", aqua(Component.translatable("screen.kingdomsheritage.review_empty_items")));
        } else {
            equipment = Component.translatable(policy.equals("MERGE") ? "screen.kingdomsheritage.review_merged"
                    : "screen.kingdomsheritage.review_equipment", aqua(DefinitionJson.component(kit, "title")));
        }
        var opening = Component.translatable("screen.kingdomsheritage.review_player", aqua(player));
        var location = Component.translatable("screen.kingdomsheritage.review_location", place(locations));
        var question = Component.translatable("screen.kingdomsheritage.review_question");
        var text = Component.empty().append(opening).append(location).append(equipment).append(question);
        var timeline = new ToucanTextTimeline(List.of(segment(opening, 500), segment(location, 1000),
                segment(equipment, 1000), segment(question, 0)), 40);
        return new SelectionNarration(text, timeline);
    }

    private static Component aqua(Component text) { return text.copy().withStyle(ChatFormatting.AQUA); }

    private static ToucanTextTimeline.Segment segment(Component text, long pause) {
        return new ToucanTextTimeline.Segment(text.getString().replace("\r\n", "\n").replace('\r', '\n'), pause);
    }

    private static Component place(JsonObject locations) {
        String kind = locations.has("structure") ? "structure" : "biome";
        String id = locations.has(kind) ? locations.get(kind).getAsString() : "";
        if (!id.isEmpty() && kind.equals("structure")) id = structure(ResourceLocation.parse(id)).toString();
        String name = IntroText.location(id.isEmpty() ? "structure" : kind, id).getString().trim().toLowerCase(Locale.ROOT);
        if (name.startsWith("the ") || name.startsWith("a ") || name.startsWith("an ")) return aqua(Component.literal(name));
        return Component.translatable("screen.kingdomsheritage.review_place", aqua(Component.literal(name)));
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

package com.jvn.kingdomsheritage.client;

import com.google.gson.JsonObject;
import com.jvn.kingdomsheritage.data.DefinitionJson;
import com.jvn.toucanlib.client.ToucanGlyphLayout;
import com.jvn.toucanlib.client.ToucanTextTimeline;
import java.util.List;
import java.util.Locale;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;

record SelectionNarration(Component text, ToucanTextTimeline timeline) {
    static SelectionNarration create(Component player, JsonObject locations, JsonObject kit, String policy, boolean hasBelongings) {
        return create(player, locations, kit, policy, hasBelongings, List.of());
    }

    static SelectionNarration create(Component player, JsonObject locations, JsonObject kit, String policy, boolean hasBelongings, List<String> companions) {
        boolean keepsBelongings = hasBelongings && (policy.equals("PRESERVE") || policy.equals("MERGE"));
        boolean receivesKit = !policy.equals("PRESERVE") && !kit.getAsJsonArray("items").isEmpty();
        Component equipment;
        if (!receivesKit && keepsBelongings) {
            equipment = Component.translatable("screen.kingdomsheritage.review_carried", aqua(Component.translatable("screen.kingdomsheritage.review_carried_items")));
        } else if (!receivesKit) {
            equipment = Component.translatable("screen.kingdomsheritage.review_empty", aqua(Component.translatable("screen.kingdomsheritage.review_empty_items")));
        } else {
            equipment = Component.translatable(keepsBelongings ? "screen.kingdomsheritage.review_merged"
                    : "screen.kingdomsheritage.review_equipment", aqua(DefinitionJson.component(kit, "title")));
        }
        var opening = Component.translatable("screen.kingdomsheritage.review_player", aqua(player));
        var location = Component.translatable("screen.kingdomsheritage.review_location", place(locations));
        var question = Component.translatable("screen.kingdomsheritage.review_question");
        var party = companions.isEmpty() ? Component.empty() : Component.translatable("screen.kingdomsheritage.review_party",
                aqua(companionNames(companions)));
        var text = Component.empty().append(opening).append(location).append(equipment).append(party).append(question);
        var segments = new java.util.ArrayList<>(List.of(segment(opening, 500), segment(location, 1000), segment(equipment, 1000)));
        if (!companions.isEmpty()) segments.add(segment(party, 1000));
        segments.add(segment(question, 0));
        var timeline = new ToucanTextTimeline(segments, 40);
        return new SelectionNarration(text, timeline);
    }

    private static Component companionNames(List<String> names) {
        if (names.size() == 1) return Component.literal(names.getFirst());
        String key = names.size() == 2 ? "screen.kingdomsheritage.review_party_pair" : "screen.kingdomsheritage.review_party_list";
        return Component.translatable(key, String.join(", ", names.subList(0, names.size() - 1)), names.getLast());
    }

    private static Component aqua(Component text) { return text.copy().withStyle(ChatFormatting.AQUA); }

    private static ToucanTextTimeline.Segment segment(Component text, long pause) {
        var plain = new StringBuilder();
        for (var glyph : ToucanGlyphLayout.glyphs(text, 0)) plain.appendCodePoint(glyph.codePoint());
        return new ToucanTextTimeline.Segment(plain.toString(), pause);
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

package com.jvn.kingdomsheritage.client;

import com.jvn.kingdomsheritage.api.DialogueContext;
import com.jvn.toucanlib.client.ToucanGlyphLayout;
import com.jvn.toucanlib.client.ToucanTextTimeline;
import java.util.List;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;

record SelectionNarration(Component text, ToucanTextTimeline timeline) {
    static SelectionNarration create(DialogueContext context) {
        boolean keeps = context.fact("keeps_belongings").orElse("false").equals("true");
        boolean receives = context.fact("receives_kit").orElse("false").equals("true");
        Component equipment = Component.translatable("screen.kingdomsheritage." + (receives
                ? keeps ? "review_merged" : "review_equipment" : keeps ? "review_carried" : "review_empty"),
                aqua(context.value(receives ? "kit" : "equipment").orElseThrow()));
        var opening = Component.translatable("screen.kingdomsheritage.review_player", aqua(context.value("player").orElseThrow()));
        var location = Component.translatable("screen.kingdomsheritage.review_location", aqua(context.value("place").orElseThrow()));
        var question = Component.translatable("screen.kingdomsheritage.review_question");
        var party = context.present("companions") ? Component.translatable("screen.kingdomsheritage.review_party",
                aqua(context.value("companions").orElseThrow())) : Component.empty();
        var text = Component.empty().append(opening).append(location).append(equipment).append(party).append(question);
        var segments = new java.util.ArrayList<>(List.of(segment(opening, 500), segment(location, 1000), segment(equipment, 1000)));
        if (context.present("companions")) segments.add(segment(party, 1000));
        segments.add(segment(question, 0));
        return new SelectionNarration(text, new ToucanTextTimeline(segments, 40));
    }

    private static Component aqua(Component text) { return text.copy().withStyle(ChatFormatting.AQUA); }

    private static ToucanTextTimeline.Segment segment(Component text, long pause) {
        var plain = new StringBuilder();
        for (var glyph : ToucanGlyphLayout.glyphs(text, 0)) plain.appendCodePoint(glyph.codePoint());
        return new ToucanTextTimeline.Segment(plain.toString(), pause);
    }
}

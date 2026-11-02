package com.jvn.kingdomsheritage.client;

import com.jvn.kingdomsheritage.api.DialogueContext;
import com.jvn.kingdomsheritage.data.DialoguePacing;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;

record SelectionNarration(Component text, DialoguePacing.Schedule timeline) {
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
        var source = Component.empty().append(opening).append("<pause=500>").append(location).append("<pause=1000>")
                .append(equipment).append("<pause=1000>");
        if (context.present("companions")) source.append(party).append("<pause=1000>");
        source.append(question);
        var playback = DialoguePlayback.create(context.resolve(source, java.util.Map.of(), DialogueText::key));
        return new SelectionNarration(playback.text(), DialoguePacing.schedule(playback.pacing(), 40, false));
    }

    private static Component aqua(Component text) { return text.copy().withStyle(ChatFormatting.AQUA); }

}

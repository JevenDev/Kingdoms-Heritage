package com.jvn.kingdomsheritage.client;

import com.jvn.kingdomsheritage.data.DialoguePacing;
import com.jvn.toucanlib.client.ToucanTextRenderer;
import net.minecraft.network.chat.Component;

record DialoguePlayback(Component text, DialoguePacing.Text pacing) {
    static DialoguePlayback create(Component source) {
        Component styled = IntroMarkup.style(source);
        var pacing = DialoguePacing.parse(styled.getString());
        var text = Component.empty();
        int previous = 0;
        for (var cue : pacing.cues()) {
            text.append(ToucanTextRenderer.sliceUtf16(styled, previous, cue.start()));
            previous = cue.end();
        }
        text.append(ToucanTextRenderer.sliceUtf16(styled, previous, styled.getString().length()));
        return new DialoguePlayback(text, pacing);
    }
}

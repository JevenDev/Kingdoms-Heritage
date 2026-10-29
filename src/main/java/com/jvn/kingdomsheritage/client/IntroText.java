package com.jvn.kingdomsheritage.client;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;
import net.minecraft.client.gui.Font;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.Style;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.FormattedCharSequence;
import net.minecraft.util.StringDecomposer;

final class IntroText {
    private static final Pattern TAG = Pattern.compile("<(biome|structure|dimension)>");
    record Glyph(int codePoint, Style style, int index) {}
    record Line(List<Glyph> glyphs, int width) {
        FormattedCharSequence visible(int count) {
            return sink -> {
                for (Glyph glyph : glyphs) {
                    if (glyph.index < count && !sink.accept(glyph.index, glyph.style, glyph.codePoint)) return false;
                }
                return true;
            };
        }
    }

    private IntroText() {}

    static Component resolve(Component text, Map<String, Component> locations) {
        var result = Component.empty();
        text.visit((style, value) -> {
            var matcher = TAG.matcher(value);
            int previous = 0;
            while (matcher.find()) {
                result.append(Component.literal(value.substring(previous, matcher.start())).withStyle(style));
                result.append(locations.get(matcher.group(1)).copy().withStyle(style));
                previous = matcher.end();
            }
            result.append(Component.literal(value.substring(previous)).withStyle(style));
            return Optional.empty();
        }, Style.EMPTY);
        return result;
    }

    static Component location(String kind, String id) {
        if (id.isEmpty()) return Component.translatable("intro.kingdomsheritage." + (kind.equals("structure") ? "wilderness" : "unknown"));
        ResourceLocation key = ResourceLocation.parse(id);
        StringBuilder fallback = new StringBuilder();
        for (String word : key.getPath().split("[/_]+")) {
            if (!fallback.isEmpty()) fallback.append(' ');
            if (!word.isEmpty()) fallback.append(Character.toUpperCase(word.charAt(0))).append(word.substring(1));
        }
        return Component.translatableWithFallback(kind + "." + key.getNamespace() + "." + key.getPath().replace('/', '.'), fallback.toString());
    }

    static List<Glyph> glyphs(Component text, int offset) {
        List<Glyph> glyphs = new ArrayList<>();
        text.visit((style, value) -> {
            String normalized = value.replace("\r\n", "\n").replace('\r', '\n');
            StringDecomposer.iterateFormatted(normalized, style, (index, format, codePoint) -> {
                glyphs.add(new Glyph(codePoint, format, offset + glyphs.size()));
                return true;
            });
            return Optional.empty();
        }, Style.EMPTY);
        return List.copyOf(glyphs);
    }

    static List<Integer> wordEnds(List<Glyph> glyphs) {
        List<Integer> ends = new ArrayList<>();
        for (int index = 0; index < glyphs.size(); index++) {
            if (!Character.isWhitespace(glyphs.get(index).codePoint)
                    && (index + 1 == glyphs.size() || Character.isWhitespace(glyphs.get(index + 1).codePoint))) {
                ends.add(glyphs.get(index).index + 1);
            }
        }
        return ends;
    }

    static List<Line> wrap(Font font, List<Glyph> glyphs, int width) {
        List<Line> lines = new ArrayList<>();
        int start = 0;
        for (int index = 0; index <= glyphs.size(); index++) {
            if (index != glyphs.size() && glyphs.get(index).codePoint != '\n') continue;
            if (index == start) lines.add(new Line(List.of(), 0));
            while (start < index) {
                int end = start;
                int used = 0;
                int lastSpace = -1;
                while (end < index) {
                    Glyph glyph = glyphs.get(end);
                    int advance = font.width(FormattedCharSequence.codepoint(glyph.codePoint, glyph.style));
                    if (end > start && used + advance > width) break;
                    used += advance;
                    if (Character.isWhitespace(glyph.codePoint)) lastSpace = end;
                    end++;
                }
                if (end < index && lastSpace > start) end = lastSpace;
                int trimmed = end;
                while (trimmed > start && Character.isWhitespace(glyphs.get(trimmed - 1).codePoint)) trimmed--;
                var part = List.copyOf(glyphs.subList(start, trimmed));
                int lineWidth = part.stream().mapToInt(glyph -> font.width(FormattedCharSequence.codepoint(glyph.codePoint, glyph.style))).sum();
                lines.add(new Line(part, lineWidth));
                start = end;
                while (start < index && Character.isWhitespace(glyphs.get(start).codePoint)) start++;
            }
            start = index + 1;
        }
        return List.copyOf(lines);
    }
}

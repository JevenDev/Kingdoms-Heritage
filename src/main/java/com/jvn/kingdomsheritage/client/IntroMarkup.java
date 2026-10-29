package com.jvn.kingdomsheritage.client;

import com.jvn.toucanlib.client.ToucanTextEffects;
import com.jvn.toucanlib.client.ToucanTextRenderer;
import com.jvn.toucanlib.client.ToucanTextSpan;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Pattern;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.Style;
import net.minecraft.util.StringDecomposer;

final class IntroMarkup {
    private static final Pattern TAG = Pattern.compile("<(/?)([^<>]+)>");
    private record Frame(String tag, ToucanTextEffects effects) {}
    private record Tag(int start, int end, String name, boolean closing, ToucanTextEffects effects) {}

    private IntroMarkup() {}

    static Component style(Component component) {
        var plain = new StringBuilder();
        var styles = new ArrayList<Style>();
        component.visit((style, value) -> {
            StringDecomposer.iterateFormatted(value.replace("\r\n", "\n").replace('\r', '\n'), style, (index, format, codePoint) -> {
                plain.appendCodePoint(codePoint);
                for (int unit = 0; unit < Character.charCount(codePoint); unit++) styles.add(format);
                return true;
            });
            return Optional.empty();
        }, Style.EMPTY);
        var tags = new ArrayList<Tag>();
        var matcher = TAG.matcher(plain);
        while (matcher.find()) {
            String raw = matcher.group(2).trim().toLowerCase(Locale.ROOT);
            tags.add(new Tag(matcher.start(), matcher.end(), canonical(raw.split(":", 2)[0]),
                    !matcher.group(1).isEmpty(), effects(raw)));
        }
        var stack = new ArrayList<Frame>();
        stack.add(new Frame("", ToucanTextEffects.NONE));
        var result = Component.empty();
        int cursor = 0;
        for (int index = 0; index < tags.size(); index++) {
            var tag = tags.get(index);
            boolean valid = tag.closing()
                    ? stack.size() > 1 && stack.getLast().tag().equals(tag.name())
                    : tag.effects() != null && stack.size() < 64 && hasClosingTag(tags, index, tag.name());
            if (!valid) continue;
            append(result, plain, styles, cursor, tag.start(), stack.getLast().effects());
            if (tag.closing()) stack.removeLast();
            else stack.add(new Frame(tag.name(), merge(stack.getLast().effects(), tag.effects())));
            cursor = tag.end();
        }
        append(result, plain, styles, cursor, plain.length(), stack.getLast().effects());
        return result;
    }

    private static boolean hasClosingTag(List<Tag> tags, int index, String name) {
        int depth = 1;
        for (int next = index + 1; next < tags.size(); next++) {
            var tag = tags.get(next);
            if (!tag.name().equals(name)) continue;
            if (tag.closing()) {
                if (--depth == 0) return true;
            } else if (tag.effects() != null) depth++;
        }
        return false;
    }

    private static void append(net.minecraft.network.chat.MutableComponent result, StringBuilder plain,
                               List<Style> styles, int start, int end, ToucanTextEffects effects) {
        while (start < end) {
            int next = start + 1;
            while (next < end && styles.get(start).equals(styles.get(next))) next++;
            result.append(ToucanTextRenderer.component(
                    List.of(new ToucanTextSpan(plain.substring(start, next), effects)), styles.get(start), null));
            start = next;
        }
    }

    private static String canonical(String tag) {
        return switch (tag) {
            case "i", "italic", "italics" -> "italic";
            case "b", "bold" -> "bold";
            case "u", "underline", "underlined" -> "underline";
            case "s", "strike", "strikethrough" -> "strike";
            case "obfuscated", "obfuscate", "magic" -> "obfuscated";
            case "wave", "wavy" -> "wave";
            case "shake", "shaky" -> "shake";
            case "pulse", "pulsing" -> "pulse";
            case "jump", "jumping", "bounce", "bouncy" -> "jump";
            default -> tag;
        };
    }

    private static ToucanTextEffects effects(String raw) {
        String tag = canonical(raw);
        Integer color = color(raw);
        Integer start = null;
        Integer end = null;
        if (raw.startsWith("color:")) {
            color = color(raw.substring(6));
            if (color == null) return null;
        } else if (raw.startsWith("gradient:")) {
            String[] colors = raw.substring(9).split(":", -1);
            if (colors.length != 2) return null;
            start = color(colors[0]);
            end = color(colors[1]);
            if (start == null || end == null) return null;
        } else if (color == null && !List.of("italic", "bold", "underline", "strike", "obfuscated",
                "wave", "shake", "pulse", "jump", "rainbow").contains(tag)) return null;
        return new ToucanTextEffects(tag.equals("italic"), tag.equals("bold"), tag.equals("underline"),
                tag.equals("strike"), tag.equals("obfuscated"), tag.equals("wave"), tag.equals("shake"),
                tag.equals("pulse"), tag.equals("jump"), tag.equals("rainbow"), color, start, end);
    }

    private static Integer color(String raw) {
        String name = switch (raw) {
            case "grey" -> "gray";
            case "dark_grey" -> "dark_gray";
            case "purple", "magenta" -> "light_purple";
            default -> raw;
        };
        ChatFormatting format = ChatFormatting.getByName(name);
        if (format != null && format.isColor()) return format.getColor();
        String hex = name.startsWith("#") ? name.substring(1) : name.startsWith("0x") ? name.substring(2) : name;
        return hex.matches("[0-9a-f]{6}") ? Integer.parseInt(hex, 16) : null;
    }

    private static ToucanTextEffects merge(ToucanTextEffects base, ToucanTextEffects next) {
        return new ToucanTextEffects(base.italic() || next.italic(), base.bold() || next.bold(),
                base.underlined() || next.underlined(), base.strikethrough() || next.strikethrough(),
                base.obfuscated() || next.obfuscated(), base.wavy() || next.wavy(), base.shake() || next.shake(),
                base.pulse() || next.pulse(), base.jump() || next.jump(), base.rainbow() || next.rainbow(),
                next.color() == null ? base.color() : next.color(),
                next.gradientStartColor() == null ? base.gradientStartColor() : next.gradientStartColor(),
                next.gradientEndColor() == null ? base.gradientEndColor() : next.gradientEndColor());
    }
}

package com.jvn.kingdomsheritage.client;

import com.jvn.kingdomsheritage.data.IntroDefinition;
import java.util.List;
import java.util.function.DoubleFunction;
import net.minecraft.client.gui.Font;
import net.minecraft.util.Mth;

record IntroLayout(IntroLayout.Block title, IntroLayout.Block subtitle) {
    record Block(List<IntroText.Line> lines, float anchorX, float top, float scale,
                 IntroDefinition.Position position, int lineHeight) {
        float width() { return lines.stream().mapToInt(IntroText.Line::width).max().orElse(0) * scale; }
        float height() { return lines.size() * lineHeight * scale; }
        float left() { return anchorX - width() * position.column() / 2; }
        float lineLeft(IntroText.Line line) { return -line.width() * position.column() / 2F; }
    }

    static IntroLayout create(Font font, int width, int height, IntroDefinition intro,
                              List<IntroText.Glyph> text, List<IntroText.Glyph> subtitle, float slant) {
        int horizontalPadding = Math.max(IntroText.effectPadding(text, false), IntroText.effectPadding(subtitle, false));
        int verticalPadding = Math.max(IntroText.effectPadding(text, true), IntroText.effectPadding(subtitle, true));
        float margin = Math.min(20 + Math.max(horizontalPadding, verticalPadding) * 1.5F, Math.min(width, height) / 4F);
        float top = margin;
        float bottom = height - margin;
        if (intro.cinematicBars()) {
            top = Math.min(height / 2F - 1, top + IntroCinematicBars.height(height) + Math.max(0, slant));
            bottom = Math.max(height / 2F + 1, bottom - IntroCinematicBars.height(height) + Math.min(0, slant));
        }
        float availableWidth = Math.max(1, width - margin * 2);
        float availableHeight = Math.max(1, bottom - top);
        float titleScale = intro.title() ? 1.5F : 1;
        float subtitleScale = intro.largeSubtitle() ? 1.5F : 1;
        int lineHeight = font.lineHeight + 3 + verticalPadding * 2;
        var titlePosition = intro.titlePosition();
        var subtitlePosition = intro.subtitlePosition();
        if (intro.titleCoordinates() == null && intro.subtitleCoordinates() == null
                && (subtitle.isEmpty() || titlePosition == subtitlePosition)) {
            var titleLines = IntroText.wrap(font, text, Math.max(1, (int) (availableWidth / titleScale)));
            var subtitleLines = subtitle.isEmpty() ? List.<IntroText.Line>of()
                    : IntroText.wrap(font, subtitle, Math.max(1, (int) (availableWidth / subtitleScale)));
            float titleHeight = titleLines.size() * lineHeight * titleScale;
            float subtitleHeight = subtitleLines.size() * lineHeight * subtitleScale;
            float gap = subtitleLines.isEmpty() ? 0 : 8;
            float fit = Math.min(1, Math.min(availableHeight / (titleHeight + gap + subtitleHeight),
                    availableWidth / Math.max(1, Math.max(maxWidth(titleLines) * titleScale, maxWidth(subtitleLines) * subtitleScale))));
            float anchorX = margin + availableWidth * titlePosition.column() / 2;
            float groupTop = top + (availableHeight - (titleHeight + gap + subtitleHeight) * fit) * titlePosition.row() / 2;
            return new IntroLayout(new Block(titleLines, anchorX, groupTop, titleScale * fit, titlePosition, lineHeight),
                    new Block(subtitleLines, anchorX, groupTop + (titleHeight + gap) * fit, subtitleScale * fit, titlePosition, lineHeight));
        }
        float contentTop = top;
        DoubleFunction<Block> titleLayout = limit -> positioned(font, text, titleScale, titlePosition, intro.titleCoordinates(),
                lineHeight, width, height, margin, contentTop, availableWidth, availableHeight, (float) limit);
        DoubleFunction<Block> subtitleLayout = limit -> positioned(font, subtitle, subtitleScale, subtitlePosition, intro.subtitleCoordinates(),
                lineHeight, width, height, margin, contentTop, availableWidth, availableHeight, (float) limit);
        var title = titleLayout.apply(Float.POSITIVE_INFINITY);
        var sub = subtitleLayout.apply(Float.POSITIVE_INFINITY);
        if (!overlaps(title, sub, font.lineHeight, horizontalPadding + 1, verticalPadding + 1)) return new IntroLayout(title, sub);
        float gap = 4 + horizontalPadding * 2 * Math.max(titleScale, subtitleScale);
        IntroLayout best = null;
        for (int index = 0; index < 2; index++) {
            Block block = index == 0 ? title : sub;
            Block other = index == 0 ? sub : title;
            var coordinates = index == 0 ? intro.titleCoordinates() : intro.subtitleCoordinates();
            float preferredWidth = coordinates == null ? availableWidth : (float) (width * coordinates.width() / 100);
            float[] limits = {space(block, 0, other.left() - gap),
                    space(block, other.left() + other.width() + gap, width), preferredWidth};
            for (float limit : limits) {
                if (limit <= 0 || limit >= block.width()) continue;
                Block wrapped = (index == 0 ? titleLayout : subtitleLayout).apply(limit);
                var candidate = index == 0 ? new IntroLayout(wrapped, sub) : new IntroLayout(title, wrapped);
                if (!overlaps(candidate.title, candidate.subtitle, font.lineHeight, horizontalPadding + 1, verticalPadding + 1)) {
                    best = prefer(best, candidate);
                }
            }
        }
        if (title.anchorX != sub.anchorX) {
            float middle = (title.anchorX + sub.anchorX) / 2;
            float titleWidth = title.anchorX < sub.anchorX ? space(title, 0, middle - gap / 2) : space(title, middle + gap / 2, width);
            float subWidth = title.anchorX < sub.anchorX ? space(sub, middle + gap / 2, width) : space(sub, 0, middle - gap / 2);
            if (titleWidth > 0 && subWidth > 0) {
                var candidate = new IntroLayout(titleLayout.apply(titleWidth), subtitleLayout.apply(subWidth));
                if (!overlaps(candidate.title, candidate.subtitle, font.lineHeight, horizontalPadding + 1, verticalPadding + 1)) {
                    best = prefer(best, candidate);
                }
            }
        }
        if (best != null) return best;
        float fit = Math.min(1, availableHeight / (title.height() + 8 + sub.height()));
        float titleY = title.top + title.height() * title.position.row() / 2;
        float subtitleY = sub.top + sub.height() * sub.position.row() / 2;
        float groupHeight = (title.height() + 8 + sub.height()) * fit;
        float groupTop = Mth.clamp((titleY + subtitleY - groupHeight) / 2, top, bottom - groupHeight);
        return new IntroLayout(new Block(title.lines, title.anchorX, groupTop, title.scale * fit, title.position, lineHeight),
                new Block(sub.lines, sub.anchorX, groupTop + (title.height() + 8) * fit, sub.scale * fit, sub.position, lineHeight));
    }

    private static IntroLayout prefer(IntroLayout current, IntroLayout candidate) {
        if (current == null) return candidate;
        int lines = current.title.lines.size() + current.subtitle.lines.size();
        int candidateLines = candidate.title.lines.size() + candidate.subtitle.lines.size();
        return candidateLines < lines || candidateLines == lines && candidate.title.scale + candidate.subtitle.scale
                > current.title.scale + current.subtitle.scale ? candidate : current;
    }

    private static float space(Block block, float left, float right) {
        if (block.anchorX < left || block.anchorX > right) return 0;
        return span(block.anchorX - left, right - left, block.position.column());
    }

    private static boolean overlaps(Block first, Block second, int fontHeight, int horizontalPadding, int verticalPadding) {
        for (int a = 0; a < first.lines.size(); a++) {
            var line = first.lines.get(a);
            if (line.glyphs().isEmpty()) continue;
            float left = first.anchorX + first.lineLeft(line) * first.scale - horizontalPadding * first.scale;
            float right = left + (line.width() + horizontalPadding * 2) * first.scale;
            float top = first.top + (a * first.lineHeight - verticalPadding) * first.scale;
            float bottom = top + (fontHeight + verticalPadding * 2) * first.scale;
            for (int b = 0; b < second.lines.size(); b++) {
                var other = second.lines.get(b);
                if (other.glyphs().isEmpty()) continue;
                float otherLeft = second.anchorX + second.lineLeft(other) * second.scale - horizontalPadding * second.scale;
                float otherTop = second.top + (b * second.lineHeight - verticalPadding) * second.scale;
                if (left < otherLeft + (other.width() + horizontalPadding * 2) * second.scale && right > otherLeft
                        && top < otherTop + (fontHeight + verticalPadding * 2) * second.scale && bottom > otherTop) return true;
            }
        }
        return false;
    }

    private static Block positioned(Font font, List<IntroText.Glyph> glyphs, float scale, IntroDefinition.Position position,
                                    IntroDefinition.Coordinates coordinates, int lineHeight, int width, int height,
                                    float margin, float top, float availableWidth, float availableHeight, float widthLimit) {
        if (coordinates == null) {
            float maxWidth = Math.max(1, Math.min(availableWidth, widthLimit));
            var lines = glyphs.isEmpty() ? List.<IntroText.Line>of()
                    : IntroText.wrap(font, glyphs, Math.max(1, (int) (maxWidth / scale)));
            return place(lines, scale, position, lineHeight, margin, top, availableWidth, availableHeight, maxWidth, availableHeight);
        }
        float x = (float) (width * coordinates.x() / 100);
        float y = (float) (height * coordinates.y() / 100);
        // configured widths only constrain text when another block would overlap
        float maxWidth = Math.max(1, Math.min(widthLimit, span(x, width, position.column())));
        float maxHeight = Math.max(1, span(y, height, position.row()));
        var lines = glyphs.isEmpty() ? List.<IntroText.Line>of() : IntroText.wrap(font, glyphs, Math.max(1, (int) (maxWidth / scale)));
        scale *= Math.min(1, Math.min(maxHeight / Math.max(1, lines.size() * lineHeight * scale),
                maxWidth / Math.max(1, maxWidth(lines) * scale)));
        return new Block(lines, x, y - lines.size() * lineHeight * scale * position.row() / 2, scale, position, lineHeight);
    }

    private static float span(float anchor, float size, int alignment) {
        return alignment == 0 ? size - anchor : alignment == 2 ? anchor : 2 * Math.min(anchor, size - anchor);
    }

    private static Block place(List<IntroText.Line> lines, float scale, IntroDefinition.Position position, int lineHeight,
                               float left, float top, float width, float height, float maxWidth, float maxHeight) {
        float fit = Math.min(1, Math.min(maxHeight / Math.max(1, lines.size() * lineHeight * scale),
                maxWidth / Math.max(1, maxWidth(lines) * scale)));
        scale *= fit;
        return new Block(lines, left + width * position.column() / 2,
                top + (height - lines.size() * lineHeight * scale) * position.row() / 2, scale, position, lineHeight);
    }

    private static int maxWidth(List<IntroText.Line> lines) {
        return lines.stream().mapToInt(IntroText.Line::width).max().orElse(0);
    }
}

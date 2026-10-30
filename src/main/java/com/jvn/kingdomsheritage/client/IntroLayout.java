package com.jvn.kingdomsheritage.client;

import com.jvn.kingdomsheritage.data.IntroDefinition;
import java.util.List;
import net.minecraft.client.gui.Font;

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
        if (intro.titleCoordinates() != null || intro.subtitleCoordinates() != null) {
            return new IntroLayout(positioned(font, text, titleScale, intro.titlePosition(), intro.titleCoordinates(),
                    lineHeight, width, height, margin, top, availableWidth, availableHeight),
                    positioned(font, subtitle, subtitleScale, intro.subtitlePosition(), intro.subtitleCoordinates(),
                            lineHeight, width, height, margin, top, availableWidth, availableHeight));
        }
        var titlePosition = intro.titlePosition();
        var subtitlePosition = intro.subtitlePosition();
        boolean together = subtitle.isEmpty() || titlePosition == subtitlePosition;
        boolean separateRows = !together && titlePosition.row() != subtitlePosition.row();
        float wrapWidth = !together && !separateRows
                ? availableWidth / (Math.abs(titlePosition.column() - subtitlePosition.column()) == 2 ? 2 : 3)
                : availableWidth;
        float maxHeight = separateRows ? availableHeight / 3 : availableHeight;
        var titleLines = IntroText.wrap(font, text, Math.max(1, (int) (wrapWidth / titleScale)));
        var subtitleLines = subtitle.isEmpty() ? List.<IntroText.Line>of()
                : IntroText.wrap(font, subtitle, Math.max(1, (int) (wrapWidth / subtitleScale)));
        float titleHeight = titleLines.size() * lineHeight * titleScale;
        float subtitleHeight = subtitleLines.size() * lineHeight * subtitleScale;
        if (together) {
            float gap = subtitleLines.isEmpty() ? 0 : 8;
            float fit = Math.min(1, Math.min(availableHeight / (titleHeight + gap + subtitleHeight),
                    availableWidth / Math.max(1, Math.max(maxWidth(titleLines) * titleScale, maxWidth(subtitleLines) * subtitleScale))));
            float anchorX = margin + availableWidth * titlePosition.column() / 2;
            float groupTop = top + (availableHeight - (titleHeight + gap + subtitleHeight) * fit) * titlePosition.row() / 2;
            return new IntroLayout(new Block(titleLines, anchorX, groupTop, titleScale * fit, titlePosition, lineHeight),
                    new Block(subtitleLines, anchorX, groupTop + (titleHeight + gap) * fit, subtitleScale * fit, titlePosition, lineHeight));
        }
        return new IntroLayout(place(titleLines, titleScale, titlePosition, lineHeight, margin, top,
                availableWidth, availableHeight, wrapWidth, maxHeight),
                place(subtitleLines, subtitleScale, subtitlePosition, lineHeight, margin, top,
                        availableWidth, availableHeight, wrapWidth, maxHeight));
    }

    private static Block positioned(Font font, List<IntroText.Glyph> glyphs, float scale, IntroDefinition.Position position,
                                    IntroDefinition.Coordinates coordinates, int lineHeight, int width, int height,
                                    float margin, float top, float availableWidth, float availableHeight) {
        if (coordinates == null) {
            var lines = glyphs.isEmpty() ? List.<IntroText.Line>of()
                    : IntroText.wrap(font, glyphs, Math.max(1, (int) (availableWidth / scale)));
            return place(lines, scale, position, lineHeight, margin, top, availableWidth, availableHeight, availableWidth, availableHeight);
        }
        float x = (float) (width * coordinates.x() / 100);
        float y = (float) (height * coordinates.y() / 100);
        float maxWidth = Math.max(1, Math.min((float) (width * coordinates.width() / 100), span(x, width, position.column())));
        float maxHeight = Math.max(1, span(y, height, position.row()));
        var lines = glyphs.isEmpty() ? List.<IntroText.Line>of() : IntroText.wrap(font, glyphs, Math.max(1, (int) (maxWidth / scale)));
        scale *= Math.min(1, Math.min(maxHeight / Math.max(1, lines.size() * lineHeight * scale),
                maxWidth / Math.max(1, maxWidth(lines) * scale)));
        return new Block(lines, x, y - lines.size() * lineHeight * scale * position.row() / 2, scale, position, lineHeight);
    }

    private static float span(float anchor, int size, int alignment) {
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

package com.jvn.kingdomsheritage.data;

import com.jvn.toucanlib.text.ToucanRevealTimeline;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

public final class DialoguePacing {
    public static final int MAX_CUES = 64;
    private static final double TIMING_TOLERANCE_MILLIS = 1e-7;
    private static final Pattern TAG = Pattern.compile("<(/?)(pause|speed)(?:([=:])([^<>]*))?>", Pattern.CASE_INSENSITIVE);
    public enum Kind { PAUSE, SPEED }
    public record Cue(int start, int end, int offset, Kind kind, double value) {}
    public record Text(String text, List<Cue> cues) {
        public Text { cues = List.copyOf(cues); }
    }
    public record Schedule(String text, ToucanRevealTimeline timeline, List<Integer> positions) {
        public Schedule { positions = List.copyOf(positions); }
        public int length() { return text.codePointCount(0, text.length()); }
        public double durationMillis() { return timeline.durationMillis(); }
        public int durationTicks() { return Math.max(0, (int) Math.ceil((durationMillis() - TIMING_TOLERANCE_MILLIS) / 50)); }
        public boolean complete(long elapsed) { return elapsed >= durationMillis(); }
        public int visibleCharacters(double elapsed) {
            int count = timeline.visibleCharacters(elapsed + TIMING_TOLERANCE_MILLIS);
            return count == 0 ? 0 : positions.get(count - 1);
        }
    }

    private DialoguePacing() {}

    public static Text parse(String source) {
        var text = new StringBuilder();
        var cues = new ArrayList<Cue>();
        var matcher = TAG.matcher(source);
        int previous = 0;
        int offset = 0;
        while (matcher.find()) {
            String argument = matcher.group(4);
            if (!matcher.group(1).isEmpty() || argument == null || !argument.matches("[0-9]+(?:\\.[0-9]+)?")) {
                throw new IllegalArgumentException("Invalid dialogue pacing tag: " + matcher.group());
            }
            double value = Double.parseDouble(argument);
            Kind kind = matcher.group(2).equalsIgnoreCase("pause") ? Kind.PAUSE : Kind.SPEED;
            if (!Double.isFinite(value) || (kind == Kind.PAUSE ? value < 0 || value > 60000 || value != Math.rint(value)
                    : value < 0.1 || value > 10)) throw new IllegalArgumentException("Invalid dialogue pacing value: " + matcher.group());
            text.append(source, previous, matcher.start());
            offset += source.codePointCount(previous, matcher.start());
            cues.add(new Cue(matcher.start(), matcher.end(), offset, kind, value));
            if (cues.size() > MAX_CUES) throw new IllegalArgumentException("Dialogue may contain at most 64 pacing cues");
            previous = matcher.end();
        }
        text.append(source, previous, source.length());
        return new Text(text.toString(), cues);
    }

    public static Schedule schedule(Text text, double unitMillis, boolean words) {
        var builder = ToucanRevealTimeline.builder(unitMillis, false);
        var positions = new ArrayList<Integer>();
        int[] points = text.text().codePoints().toArray();
        int cue = 0;
        for (int index = 0; index <= points.length; index++) {
            while (cue < text.cues().size() && text.cues().get(cue).offset() == index) {
                var event = text.cues().get(cue++);
                if (event.kind() == Kind.PAUSE) builder.pause(event.value());
                else builder.speed(event.value());
            }
            if (index == points.length) break;
            if (!words || !Character.isWhitespace(points[index])
                    && (index + 1 == points.length || Character.isWhitespace(points[index + 1]))) {
                builder.appendCodePoint(points[index]);
                positions.add(index + 1);
            }
        }
        return new Schedule(text.text(), builder.build(), positions);
    }
}

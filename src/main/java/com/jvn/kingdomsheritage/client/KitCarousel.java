package com.jvn.kingdomsheritage.client;

import com.jvn.kingdomsheritage.data.DefinitionJson;
import java.util.Comparator;
import java.util.HashMap;
import java.util.Map;
import java.util.stream.IntStream;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.renderer.Rect2i;
import net.minecraft.util.Mth;

final class KitCarousel {
    private static final float RESPONSE = 14;
    private final Map<Integer, Frame> frames = new HashMap<>();
    private float from;
    private float velocity;
    private int selected;
    private long started;
    private boolean initialized;
    private int hovered = -1;
    private double scrollRemainder;

    void select(int index, long now) {
        if (initialized && selected == index) return;
        Motion current = motion(now);
        from = initialized ? current.position : index;
        velocity = initialized ? current.velocity : 0;
        selected = index;
        started = now;
        initialized = true;
    }

    int scroll(double delta, int count) {
        if (Math.signum(delta) != Math.signum(scrollRemainder)) scrollRemainder = 0;
        scrollRemainder += delta;
        int steps = (int) scrollRemainder;
        scrollRemainder -= steps;
        return Mth.clamp(selected - steps, 0, count - 1);
    }

    float position(long now) {
        return motion(now).position;
    }

    boolean moving(long now) {
        Motion current = motion(now);
        return current.position != selected || current.velocity != 0;
    }

    private Motion motion(long now) {
        // closed-form spring motion keeps retargeting independent of frame rate
        float elapsed = Math.max(0, (now - started) / 1000F);
        float offset = from - selected;
        float coefficient = velocity + RESPONSE * offset;
        float decay = (float) Math.exp(-RESPONSE * elapsed);
        float position = selected + (offset + coefficient * elapsed) * decay;
        float speed = (velocity - RESPONSE * coefficient * elapsed) * decay;
        if (Math.abs(position - selected) < 0.003F && Math.abs(speed) < 0.04F) return new Motion(selected, 0);
        return new Motion(position, speed);
    }

    int first(long now, int count) {
        return Mth.clamp(Mth.floor(position(now)) - 2, 0, count - 1);
    }

    int last(long now, int count) {
        return Mth.clamp(Mth.ceil(position(now)) + 2, 0, count - 1);
    }

    void close() {
        frames.values().forEach(frame -> frame.preview.close());
        frames.clear();
        hovered = -1;
    }

    void render(GuiGraphics graphics, Rect2i bounds, int width, KitSelection model, int mouseX, int mouseY,
                long now, float visibility, boolean includeSelected, PreviewRenderer drawInventory) {
        if (visibility <= 0) {
            hovered = -1;
            return;
        }
        float position = position(now);
        int first = Math.max(0, Mth.floor(position) - 1);
        int last = Math.min(model.choices().size() - 1, Mth.ceil(position) + 1);
        frames.entrySet().removeIf(entry -> {
            if (entry.getKey() >= first && entry.getKey() <= last) return false;
            entry.getValue().preview.close();
            return true;
        });
        int nextHovered = visibility == 1 ? hit(bounds, width, model.choices().size(), mouseX, mouseY, now) : -1;
        if (nextHovered != hovered && nextHovered >= 0 && !SelectionTransition.active()) SelectionSounds.HOVER.play();
        hovered = nextHovered;
        var order = IntStream.rangeClosed(first, last).boxed()
                .sorted(Comparator.comparingDouble((Integer index) -> Math.abs(index - position)).reversed()).toList();
        for (int index : order) {
            if (!includeSelected && index == selected) continue;
            Pose pose = pose(index, bounds, width, position);
            if (pose.opacity <= 0) continue;
            if (index == selected && !moving(now)) {
                drawInventory.render(index, 1);
                continue;
            }
            Frame frame = frames.computeIfAbsent(index, ignored -> new Frame());
            boolean looking = pose.look > 0;
            if (index == selected || looking || frame.looking || now - frame.captured >= 120 || frame.captured == 0) {
                frame.preview.capture(graphics, () -> drawInventory.render(index, pose.look));
                frame.captured = now;
                frame.looking = looking;
            }
            float response = 1 - (float) Math.exp(-Math.min(0.05F, (now - frame.rendered) / 1000F) * 14);
            frame.hover = Mth.lerp(response, frame.hover, index == hovered ? 1 : 0);
            frame.rendered = now;
            float opacity = Math.min(1, pose.opacity + frame.hover * 0.2F) * visibility;
            frame.preview.draw(graphics, bounds, pose.x, pose.y, pose.scale, 0, opacity);
            if (index != selected) {
                var font = Minecraft.getInstance().font;
                var name = DefinitionJson.component(model.choices().get(index), "title");
                int textWidth = Math.max(1, Math.round(bounds.getWidth() * pose.scale) - 8);
                var lines = font.split(name, textWidth);
                float nameOpacity = opacity * Mth.clamp((Math.abs(index - position) - 0.85F) / 0.15F, 0, 1);
                if (!lines.isEmpty() && nameOpacity * 255 >= 4) {
                    SelectionText.centered(graphics, font, lines.getFirst(),
                            Math.round(pose.x + bounds.getWidth() * pose.scale / 2), Math.round(pose.y) - 13,
                            Math.round(nameOpacity * 255) << 24 | 0xffffff);
                }
            }
        }
    }

    int hit(Rect2i bounds, int width, int count, double x, double y, long now) {
        float position = position(now);
        int first = Math.max(0, Mth.floor(position) - 1);
        int last = Math.min(count - 1, Mth.ceil(position) + 1);
        var order = IntStream.rangeClosed(first, last).boxed()
                .sorted(Comparator.comparingDouble(index -> Math.abs(index - position))).toList();
        for (int index : order) {
            Pose pose = pose(index, bounds, width, position);
            if (pose.opacity > 0 && x >= pose.x && x < pose.x + bounds.getWidth() * pose.scale
                    && y >= pose.y && y < pose.y + bounds.getHeight() * pose.scale) {
                return index == selected ? -1 : index;
            }
        }
        return -1;
    }

    private Pose pose(int index, Rect2i bounds, int width, float position) {
        float distance = index - position;
        float depth = Math.min(1, Math.abs(distance));
        float scale = Mth.lerp(depth, 1, 0.68F);
        float step = Math.max(bounds.getWidth() * 0.58F,
                Math.min(bounds.getWidth() * 0.95F, (width - bounds.getWidth() * 0.32F) / 2));
        float x = bounds.getX() + bounds.getWidth() / 2F + distance * step - bounds.getWidth() * scale / 2;
        float y = bounds.getY() + (bounds.getHeight() - bounds.getHeight() * scale) / 2;
        float opacity = Mth.lerp(depth, 1, 0.32F) * Mth.clamp(2 - Math.abs(distance), 0, 1);
        return new Pose(x, y, scale, opacity, 1 - (float) Mth.smoothstep(depth));
    }

    interface PreviewRenderer {
        void render(int index, float look);
    }

    private record Motion(float position, float velocity) {}

    private record Pose(float x, float y, float scale, float opacity, float look) {}

    private static final class Frame {
        final KitConfirmationPreview preview = new KitConfirmationPreview();
        long captured;
        long rendered;
        float hover;
        boolean looking;
    }
}

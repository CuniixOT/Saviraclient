package gg.savira.client;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.client.gui.widget.SliderWidget;
import net.minecraft.text.Text;
import java.util.function.BooleanSupplier;
import java.util.function.DoubleConsumer;
import java.util.function.DoubleFunction;
import java.util.function.IntConsumer;
import java.util.function.IntSupplier;
import java.util.function.Supplier;

/** Controls for the module settings page, styled like the rest of the Savira menu. */
public final class MenuWidgets {
    private MenuWidgets() {}
    private static final int BOX = 0xFF0A0C0F, LINE = MenuStyle.LINE;

    /** Value box plus track, e.g. "110 %" ──●──. Snaps to the given step. */
    public static SliderWidget slider(int x, int y, int w, int h, double min, double max, double step, double start, DoubleFunction<String> label, DoubleConsumer onChange) {
        // Named "start": inside the anonymous class, SliderWidget's own "value" field would shadow it.
        return new SliderWidget(x, y, w, h, Text.literal(label.apply(start)), (start - min) / (max - min)) {
            private double current = start;
            @Override protected void updateMessage() { setMessage(Text.literal(label.apply(current))); }
            @Override protected void applyValue() {
                double next = Math.round((min + this.value * (max - min)) / step) * step;
                if (next != current) { current = next; onChange.accept(next); }
            }
            @Override
            public void renderWidget(DrawContext c, int mouseX, int mouseY, float delta) {
                var font = MinecraftClient.getInstance().textRenderer;
                boolean hover = isHovered() || isFocused();
                int boxW = 38;
                MenuStyle.outlined(c, getX(), getY(), boxW, getHeight(), 3, hover ? MenuStyle.accentAlpha(0xA0) : LINE, BOX);
                String text = getMessage().getString();
                c.drawText(font, text, getX() + (boxW - font.getWidth(text)) / 2, getY() + (getHeight() - 8) / 2 + 1, MenuStyle.TEXT, false);
                int tx = getX() + boxW + 8, tw = getWidth() - boxW - 12, ty = getY() + getHeight() / 2 - 1;
                double t = (current - min) / (max - min);
                c.fill(tx, ty, tx + tw, ty + 2, 0xFF2B3038);
                c.fill(tx, ty, tx + (int) Math.round(tw * t), ty + 2, MenuStyle.accent());
                int knob = tx + (int) Math.round(tw * t);
                MenuStyle.round(c, knob - 3, ty - 4, 6, 10, 2, hover ? 0xFFFFFFFF : 0xFFD7DCE1);
            }
            // The track starts after the value box, so map the mouse onto the track only.
            private void setFromMouse(double mx) {
                int tx = getX() + 46, tw = getWidth() - 50;
                this.value = Math.clamp((mx - tx) / Math.max(1, tw), 0d, 1d);
                applyValue(); updateMessage();
            }
            @Override public void onClick(double mx, double my) { setFromMouse(mx); }
            @Override protected void onDrag(double mx, double my, double dx, double dy) { setFromMouse(mx); }
        };
    }

    /** "<  DARK PANEL  >": left half steps back, right half (and Enter) steps forward. */
    public static ButtonWidget cycle(int x, int y, int w, int h, Supplier<String> label, IntConsumer onStep) {
        return new ButtonWidget(x, y, w, h, Text.literal(label.get()), b -> onStep.accept(1), n -> n.get()) {
            @Override
            public boolean mouseClicked(double mx, double my, int button) {
                if (!active || !visible || !isMouseOver(mx, my) || (button != 0 && button != 1)) return false;
                playDownSound(MinecraftClient.getInstance().getSoundManager());
                onStep.accept(button == 1 || mx < getX() + getWidth() / 2d ? -1 : 1);
                return true;
            }
            @Override
            protected void renderWidget(DrawContext c, int mouseX, int mouseY, float delta) {
                var font = MinecraftClient.getInstance().textRenderer;
                boolean hover = isHovered() || isFocused();
                MenuStyle.outlined(c, getX(), getY(), getWidth(), getHeight(), 3, hover ? MenuStyle.accentAlpha(0xA0) : LINE, BOX);
                int ty = getY() + (getHeight() - 8) / 2 + 1;
                c.drawText(font, "<", getX() + 6, ty, hover ? MenuStyle.TEXT : MenuStyle.MUTED, false);
                c.drawText(font, ">", getX() + getWidth() - 11, ty, hover ? MenuStyle.TEXT : MenuStyle.MUTED, false);
                String text = label.get().toUpperCase(java.util.Locale.ROOT);
                c.drawText(font, text, getX() + (getWidth() - font.getWidth(text)) / 2, ty, MenuStyle.TEXT, false);
            }
        };
    }

    /** Row of colour swatches; the active one gets a white frame. */
    public static ButtonWidget palette(int x, int y, int w, int h, int[] colors, IntSupplier current, IntConsumer onPick) {
        return new ButtonWidget(x, y, w, h, Text.literal("Palette"), b -> { }, n -> n.get()) {
            private int size() { return Math.min(h, (w - (colors.length - 1) * 2) / colors.length); }
            @Override
            public boolean mouseClicked(double mx, double my, int button) {
                if (!active || !visible || !isMouseOver(mx, my) || button != 0) return false;
                int index = (int) ((mx - getX()) / (size() + 2));
                if (index < 0 || index >= colors.length) return false;
                playDownSound(MinecraftClient.getInstance().getSoundManager());
                onPick.accept(colors[index]);
                return true;
            }
            @Override
            protected void renderWidget(DrawContext c, int mouseX, int mouseY, float delta) {
                int s = size(), selected = current.getAsInt() & 0xFFFFFF;
                int start = getX() + getWidth() - colors.length * (s + 2) + 2;
                for (int i = 0; i < colors.length; i++) {
                    int sx = start + i * (s + 2), sy = getY() + (getHeight() - s) / 2;
                    boolean chosen = (colors[i] & 0xFFFFFF) == selected;
                    boolean hover = mouseX >= sx && mouseX < sx + s && mouseY >= sy && mouseY < sy + s;
                    if (chosen || hover) MenuStyle.round(c, sx - 1, sy - 1, s + 2, s + 2, 3, chosen ? 0xFFFFFFFF : 0xFF8A939D);
                    MenuStyle.round(c, sx, sy, s, s, 2, colors[i] | 0xFF000000);
                }
            }
            @Override
            public boolean isMouseOver(double mx, double my) {
                int s = size(), start = getX() + getWidth() - colors.length * (s + 2) + 2;
                return mx >= start && mx < getX() + getWidth() && my >= getY() && my < getY() + getHeight();
            }
        };
    }

    /** Small on/off switch. */
    public static ButtonWidget toggle(int x, int y, String label, BooleanSupplier value, Runnable onToggle) {
        return new ButtonWidget(x, y, 22, 12, Text.literal(label), b -> onToggle.run(), n -> n.get()) {
            @Override
            protected void renderWidget(DrawContext c, int mouseX, int mouseY, float delta) {
                if (isHovered() || isFocused()) MenuStyle.round(c, getX() - 1, getY() - 1, 24, 14, 4, MenuStyle.accentAlpha(0x70));
                MenuStyle.toggle(c, getX(), getY(), value.getAsBoolean());
            }
        };
    }
}

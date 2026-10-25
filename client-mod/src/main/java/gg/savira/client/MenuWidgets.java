package gg.savira.client;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.text.Text;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;
import java.util.function.DoubleConsumer;
import java.util.function.DoubleFunction;
import java.util.function.DoubleSupplier;
import java.util.function.IntConsumer;
import java.util.function.IntSupplier;
import java.util.function.Supplier;

/**
 * Controls of the Right-Shift menu, drawn like NoRisk's: square switch, check box, value box with
 * reset "x" and a thin track, "·  VANILLA  ·" selector and colour swatch.
 * Sizes are menu units (NoRisk pixels); the message of each control is its label.
 */
public final class MenuWidgets {
    private MenuWidgets() {}
    public static final int SWITCH_W = 21, SWITCH_H = 11, CHECK = 12, SLIDER_W = 166, SLIDER_H = 13, CYCLE_W = 95, CYCLE_H = 15, SWATCH = 15;

    private static MenuTheme t() { return MenuTheme.current(); }

    /** ButtonWidget with Savira's click sound. */
    public abstract static class Control extends ButtonWidget {
        protected Control(int x, int y, int w, int h, String label, PressAction action) { super(x, y, w, h, Text.literal(label), action, n -> n.get()); }
        @Override public void playDownSound(net.minecraft.client.sound.SoundManager sounds) { SaviraSounds.play(SaviraSounds.Sound.CLICK); }
        protected boolean hover() { return isHovered() || isFocused(); }
        @Override protected abstract void renderWidget(DrawContext c, int mouseX, int mouseY, float delta);
    }

    /** Box with a 1px edge, the base of every input. */
    public static void box(DrawContext c, int x, int y, int w, int h, boolean hover) {
        c.fill(x, y, x + w, y + h, t().box());
        c.drawBorder(x, y, w, h, hover ? t().boxHover() : t().boxEdge());
    }

    /** NoRisk's switch: 21x11 frame, the knob a bright square on the right when on, grey on the left when off. */
    public static void drawSwitch(DrawContext c, int x, int y, boolean on, boolean hover) {
        MenuTheme t = t();
        c.fill(x, y, x + SWITCH_W, y + SWITCH_H, on ? t.switchOn() : t.switchOff());
        c.drawBorder(x, y, SWITCH_W, SWITCH_H, hover ? t.boxHover() : on ? t.switchEdge() : t.boxEdge());
        if (on) c.fill(x + 13, y + 2, x + 19, y + 9, 0xFFFFFFFF);
        else c.fill(x + 2, y + 2, x + 8, y + 9, t.knobOff());
    }

    public static Control toggle(int x, int y, String label, BooleanSupplier value, Runnable onToggle) {
        return new Control(x, y, SWITCH_W, SWITCH_H, label, b -> onToggle.run()) {
            @Override protected void renderWidget(DrawContext c, int mx, int my, float delta) { drawSwitch(c, getX(), getY(), value.getAsBoolean(), hover()); }
        };
    }

    /** 12x12 box with a pixel check mark. */
    public static Control checkbox(int x, int y, String label, BooleanSupplier value, Runnable onToggle) {
        return new Control(x, y, CHECK, CHECK, label, b -> onToggle.run()) {
            @Override
            protected void renderWidget(DrawContext c, int mx, int my, float delta) {
                MenuTheme t = t();
                int x0 = getX(), y0 = getY();
                c.fill(x0, y0, x0 + CHECK, y0 + CHECK, t.box());
                c.drawBorder(x0, y0, CHECK, CHECK, hover() ? t.boxHover() : t.switchEdge());
                if (!value.getAsBoolean()) return;
                int color = t.text();
                // Short stroke down to the right, long stroke up to the right.
                for (int i = 0; i < 3; i++) c.fill(x0 + 2 + i, y0 + 5 + i, x0 + 4 + i, y0 + 6 + i, color);
                for (int i = 0; i < 6; i++) c.fill(x0 + 4 + i, y0 + 8 - i, x0 + 6 + i, y0 + 9 - i, color);
            }
        };
    }

    /** "[ 110 % ][x] ──▮──": value box, reset button and track; snaps to the step. */
    public static Control slider(int x, int y, String label, double min, double max, double step, double reset, DoubleSupplier value, DoubleFunction<String> format, DoubleConsumer onChange) {
        return new Control(x, y, SLIDER_W, SLIDER_H, label, b -> { }) {
            private boolean dragging;
            private int trackX() { return getX() + 69; }
            private int trackW() { return getWidth() - 71; }
            private void set(double mx) {
                double k = Math.clamp((mx - trackX()) / Math.max(1, trackW()), 0d, 1d);
                double next = Math.clamp(Math.round((min + k * (max - min)) / step) * step, min, max);
                if (next != value.getAsDouble()) onChange.accept(next);
            }
            @Override
            public void onClick(double mx, double my) {
                dragging = false;
                if (mx >= getX() + 47 && mx < getX() + 64) { if (reset != value.getAsDouble()) onChange.accept(reset); return; }
                if (mx >= trackX() - 4) { dragging = true; set(mx); }
            }
            @Override protected void onDrag(double mx, double my, double dx, double dy) { if (dragging) set(mx); }
            @Override public void onRelease(double mx, double my) { dragging = false; }
            @Override
            protected void renderWidget(DrawContext c, int mx, int my, float delta) {
                MenuTheme t = t();
                int x0 = getX(), y0 = getY();
                boolean onBox = hover() && mx < x0 + 47, onReset = hover() && mx >= x0 + 47 && mx < x0 + 64;
                box(c, x0, y0, 46, SLIDER_H, onBox);
                MenuText.plain(c, format.apply(value.getAsDouble()), x0 + 4, y0 + 3, 1f, t.text());
                box(c, x0 + 47, y0, 17, SLIDER_H, onReset);
                int cx = x0 + 53, cy = y0 + 4, xc = onReset ? t.text() : t.muted();
                for (int i = 0; i < 5; i++) { c.fill(cx + i, cy + i, cx + i + 1, cy + i + 1, xc); c.fill(cx + 4 - i, cy + i, cx + 5 - i, cy + i + 1, xc); }
                int tx = trackX(), tw = trackW(), ty = y0 + 6;
                c.fill(tx, ty, tx + tw, ty + 1, t.track());
                double k = (value.getAsDouble() - min) / (max - min);
                int knob = tx + (int) Math.round(tw * Math.clamp(k, 0, 1));
                c.fill(knob - 2, y0 + 3, knob + 2, y0 + 10, hover() && !onBox && !onReset || dragging ? 0xFFFFFFFF : t.knob());
            }
        };
    }

    /** "·  VANILLA  ·": left half (or right click) steps back, right half steps forward. */
    public static Control cycle(int x, int y, Supplier<String> value, IntConsumer onStep) {
        return new Control(x, y, CYCLE_W, CYCLE_H, value.get(), b -> onStep.accept(1)) {
            @Override
            public boolean mouseClicked(double mx, double my, int button) {
                if (!active || !visible || !isMouseOver(mx, my) || (button != 0 && button != 1)) return false;
                playDownSound(MinecraftClient.getInstance().getSoundManager());
                onStep.accept(button == 1 || mx < getX() + getWidth() / 2d ? -1 : 1);
                setMessage(Text.literal(value.get()));
                return true;
            }
            @Override
            protected void renderWidget(DrawContext c, int mx, int my, float delta) {
                MenuTheme t = t();
                box(c, getX(), getY(), getWidth(), getHeight(), hover());
                int dy = getY() + getHeight() / 2 - 1;
                boolean left = hover() && mx < getX() + getWidth() / 2;
                c.fill(getX() + 5, dy, getX() + 7, dy + 2, hover() && left ? t.text() : t.muted());
                c.fill(getX() + getWidth() - 7, dy, getX() + getWidth() - 5, dy + 2, hover() && !left ? t.text() : t.muted());
                MenuText.capsCentered(c, value.get().toUpperCase(java.util.Locale.ROOT), getX() + getWidth() / 2f, getY() + getHeight() / 2f, MenuText.LABEL, t.text());
            }
        };
    }

    /** Colour square; a click opens the colour picker. */
    public static Control swatch(int x, int y, String label, IntSupplier color, Consumer<Control> onOpen) {
        Control[] self = new Control[1];
        self[0] = new Control(x, y, SWATCH, SWATCH, label, b -> onOpen.accept(self[0])) {
            @Override
            protected void renderWidget(DrawContext c, int mx, int my, float delta) {
                c.fill(getX(), getY(), getX() + SWATCH, getY() + SWATCH, 0xFF000000 | color.getAsInt());
                c.drawBorder(getX(), getY(), SWATCH, SWATCH, hover() ? 0xFFFFFFFF : t().boxHover());
            }
        };
        return self[0];
    }

    /** Header button with a caps label, like NoRisk's "OFF" and "RESET". */
    public static Control labelButton(int x, int y, int w, int h, String label, Supplier<String> text, IntSupplier fill, ButtonWidget.PressAction action) {
        return new Control(x, y, w, h, label, action) {
            @Override
            protected void renderWidget(DrawContext c, int mx, int my, float delta) {
                c.fill(getX(), getY(), getX() + getWidth(), getY() + getHeight(), fill.getAsInt());
                if (hover()) c.drawBorder(getX(), getY(), getWidth(), getHeight(), t().boxHover());
                MenuText.capsCentered(c, text.get(), getX() + getWidth() / 2f, getY() + getHeight() / 2f, MenuText.TITLE, 0xFFFFFFFF);
            }
        };
    }

    /** Pixel icon button (theme, sounds); the icon brightens on hover. */
    public static Control iconButton(int x, int y, int size, String label, Supplier<String[]> icon, IntSupplier color, ButtonWidget.PressAction action) {
        return new Control(x, y, size, size, label, action) {
            @Override
            protected void renderWidget(DrawContext c, int mx, int my, float delta) {
                String[] glyph = icon.get();
                int gw = glyph[0].length(), gh = glyph.length;
                PixelIcons.draw(c, glyph, getX() + (getWidth() - gw) / 2, getY() + (getHeight() - gh) / 2, 1, hover() ? 0xFFFFFFFF : color.getAsInt());
            }
        };
    }

    /** "< TITLE": chevron and caps title, back to the module grid. */
    public static Control back(int x, int y, String title, ButtonWidget.PressAction action) {
        int w = MenuText.width(title.toUpperCase(java.util.Locale.ROOT), MenuText.TITLE) + 22;
        return new Control(x, y, w, 21, "< " + title, action) {
            @Override
            protected void renderWidget(DrawContext c, int mx, int my, float delta) {
                MenuTheme t = t();
                int color = hover() ? 0xFFFFFFFF : t.text(), cy = getY() + getHeight() / 2;
                for (int i = 0; i < 4; i++) { c.fill(getX() + 3 + i, cy - i, getX() + 4 + i, cy - i + 1, color); c.fill(getX() + 3 + i, cy + i, getX() + 4 + i, cy + i + 1, color); }
                MenuText.capsMiddle(c, title.toUpperCase(java.util.Locale.ROOT), getX() + 15, cy + .5f, MenuText.TITLE, color);
            }
        };
    }

    /** Header tab; the selected one sits in a framed box. */
    public static Control tab(int x, int y, String label, boolean selected, ButtonWidget.PressAction action) {
        String text = label.toUpperCase(java.util.Locale.ROOT);
        int w = MenuText.width(text, MenuText.TITLE) + 18;
        return new Control(x, y, w, 21, label, action) {
            @Override
            protected void renderWidget(DrawContext c, int mx, int my, float delta) {
                MenuTheme t = t();
                if (selected) { c.fill(getX(), getY(), getX() + getWidth(), getY() + getHeight(), t.tab()); c.drawBorder(getX(), getY(), getWidth(), getHeight(), t.tabEdge()); }
                else if (hover()) c.fill(getX(), getY(), getX() + getWidth(), getY() + getHeight(), t.cardHover());
                MenuText.capsMiddle(c, text, getX() + 9, getY() + getHeight() / 2f + .5f, MenuText.TITLE, selected || hover() ? t.text() : t.title());
            }
        };
    }
}

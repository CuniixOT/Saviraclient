package gg.savira.client;

import net.minecraft.client.gui.DrawContext;
import java.util.function.IntConsumer;

/**
 * Colour picker of the Right-Shift menu, in the design's look: preview, saturation/brightness
 * field, hue bar and a hex box you can type into. Opens next to a colour swatch; changes apply
 * live. Coordinates are the menu's design pixels.
 */
public final class ColorPicker {
    public static final int W = 236, H = 176;
    private static final int PAD = 14, TOP = 40, PREVIEW = 52, SV_X = PAD + PREVIEW + 12, SV_W = W - SV_X - PAD, SV_H = 52, HUE_Y = 104, HUE_H = 10, HEX_Y = 126, HEX_H = 30;
    public final int x, y;
    private final IntConsumer onChange;
    private float hue, sat, val;
    private int drag; // 0 nothing, 1 field, 2 hue bar
    /** Hex text while typing; null when it just shows the colour. */
    private String typed;

    public ColorPicker(int x, int y, int rgb, IntConsumer onChange) {
        this.x = x; this.y = y; this.onChange = onChange;
        float[] hsv = hsv(rgb);
        hue = hsv[0]; sat = hsv[1]; val = hsv[2];
    }

    public int rgb() { return rgb(hue, sat, val); }
    public boolean contains(double mx, double my) { return mx >= x && mx < x + W && my >= y && my < y + H; }
    public boolean typing() { return typed != null; }

    public boolean mouseClicked(double mx, double my) {
        if (inside(mx, my, SV_X, TOP, SV_W, SV_H)) { drag = 1; typed = null; pick(mx, my); return true; }
        if (inside(mx, my, PAD, HUE_Y - 2, W - 2 * PAD, HUE_H + 4)) { drag = 2; typed = null; pick(mx, my); return true; }
        if (inside(mx, my, PAD, HEX_Y, W - 2 * PAD, HEX_H)) { typed = hexOf(rgb()).substring(1); return true; }
        typed = null;
        return contains(mx, my);
    }
    public void mouseDragged(double mx, double my) { if (drag != 0) pick(mx, my); }
    public void mouseReleased() { drag = 0; }

    /** Typing into the hex box: hex digits, backspace; six digits apply. */
    public boolean charTyped(char ch) {
        if (typed == null || Character.digit(ch, 16) < 0 || typed.length() >= 6) return typed != null;
        typed += Character.toUpperCase(ch);
        if (typed.length() == 6) {
            float[] next = hsv(Integer.parseInt(typed, 16));
            hue = next[0]; sat = next[1]; val = next[2];
            onChange.accept(rgb());
        }
        return true;
    }
    public boolean backspace() {
        if (typed == null) return false;
        if (!typed.isEmpty()) typed = typed.substring(0, typed.length() - 1);
        return true;
    }
    public void stopTyping() { typed = null; }

    private boolean inside(double mx, double my, int rx, int ry, int rw, int rh) { return mx >= x + rx && mx < x + rx + rw && my >= y + ry && my < y + ry + rh; }
    private void pick(double mx, double my) {
        if (drag == 1) {
            sat = (float) Math.clamp((mx - x - SV_X) / (SV_W - 1), 0, 1);
            val = 1 - (float) Math.clamp((my - y - TOP) / (SV_H - 1), 0, 1);
        } else hue = (float) Math.clamp((mx - x - PAD) / (W - 2 * PAD - 1), 0, .999);
        onChange.accept(rgb());
    }

    public void render(DrawContext c, double mx, double my, float u) {
        DesignTheme t = DesignTheme.current();
        float px = Paint.pixels(u);
        c.getMatrices().push();
        c.getMatrices().translate(0, 0, 200);
        Paint.round(c, x, y, W, H, 0, t.dark() ? DesignTheme.alpha(t.bg(), .97f) : DesignTheme.alpha(t.bg(), .98f), px);
        HudScreen.frame(c, x, y, W, H, t.line(), px);
        MenuType.middle(c, MenuType.Face.SILK, "FARBE", x + PAD, y + 20, 11, t.mu(), .08f, u);
        // Preview with the design's pressed-in bottom edge.
        Paint.round(c, x + PAD, y + TOP, PREVIEW, PREVIEW, 0, 0xFF000000 | rgb(), px);
        Paint.round(c, x + PAD, y + TOP + PREVIEW - 3, PREVIEW, 3, 0, 0x40000000, px);
        HudScreen.frame(c, x + PAD, y + TOP, PREVIEW, PREVIEW, t.line(), px);
        // Saturation left to right, brightness top to bottom, drawn in screen-pixel columns.
        int cols = Math.max(1, Math.round(SV_W * px));
        for (int i = 0; i < cols; i++) {
            float x0 = x + SV_X + i / px;
            int top = 0xFF000000 | rgb(hue, i / (float) Math.max(1, cols - 1), 1);
            c.getMatrices().push();
            c.getMatrices().translate(x0, y + TOP, 0);
            c.getMatrices().scale(1 / px, 1 / px, 1);
            c.fillGradient(0, 0, 1, Math.round(SV_H * px), top, 0xFF000000);
            c.getMatrices().pop();
        }
        HudScreen.frame(c, x + SV_X, y + TOP, SV_W, SV_H, t.line(), px);
        float sx = x + SV_X + sat * (SV_W - 1), sy = y + TOP + (1 - val) * (SV_H - 1);
        Paint.round(c, sx - 4, sy - 4, 8, 8, 0, 0xFFFFFFFF, px);
        Paint.round(c, sx - 3, sy - 3, 6, 6, 0, 0xFF000000 | rgb(), px);
        // Hue, red to red.
        int hueCols = Math.max(1, Math.round((W - 2 * PAD) * px));
        c.getMatrices().push();
        c.getMatrices().translate(x + PAD, y + HUE_Y, 0);
        c.getMatrices().scale(1 / px, 1 / px, 1);
        for (int i = 0; i < hueCols; i++) c.fill(i, 0, i + 1, Math.round(HUE_H * px), 0xFF000000 | rgb(i / (float) hueCols, 1, 1));
        c.getMatrices().pop();
        float hx = x + PAD + hue * (W - 2 * PAD - 1);
        Paint.round(c, hx - 4, y + HUE_Y - 3, 8, HUE_H + 6, 0, t.tx(), px);
        Paint.round(c, hx - 4, y + HUE_Y + HUE_H, 8, 3, 0, 0x40000000, px);
        // Hex box: click to type.
        boolean over = inside(mx, my, PAD, HEX_Y, W - 2 * PAD, HEX_H);
        Paint.round(c, x + PAD, y + HEX_Y, W - 2 * PAD, HEX_H, 0, t.fill(), px);
        HudScreen.frame(c, x + PAD, y + HEX_Y, W - 2 * PAD, HEX_H, typed != null ? t.ac() : over ? t.mu() : t.line(), px);
        String hex = typed != null ? "#" + typed : hexOf(rgb());
        MenuType.middle(c, MenuType.Face.PIXEL, hex, x + PAD + 10, y + HEX_Y + HEX_H / 2f, 16, t.tx(), u);
        if (typed != null && net.minecraft.util.Util.getMeasuringTimeMs() / 530 % 2 == 0) {
            float cx = x + PAD + 10 + MenuType.width(MenuType.Face.PIXEL, hex, 16, u) + 1;
            Paint.round(c, cx, y + HEX_Y + 8, 1, HEX_H - 16, 0, t.tx(), px);
        }
        MenuType.middle(c, MenuType.Face.SILK, typed != null ? "ENTER" : "HEX", x + W - PAD - 10 - MenuType.width(MenuType.Face.SILK, typed != null ? "ENTER" : "HEX", 9, .06f, u), y + HEX_Y + HEX_H / 2f, 9, t.mu(), .06f, u);
        c.getMatrices().pop();
    }

    static String hexOf(int rgb) { return String.format("#%06X", rgb & 0xFFFFFF); }

    /** Hue, saturation and value in 0..1 from an RGB colour. */
    static float[] hsv(int rgb) {
        float r = (rgb >> 16 & 0xFF) / 255f, g = (rgb >> 8 & 0xFF) / 255f, b = (rgb & 0xFF) / 255f;
        float max = Math.max(r, Math.max(g, b)), min = Math.min(r, Math.min(g, b)), d = max - min, h = 0;
        if (d > 0) {
            if (max == r) h = ((g - b) / d) % 6;
            else if (max == g) h = (b - r) / d + 2;
            else h = (r - g) / d + 4;
            h /= 6; if (h < 0) h += 1;
        }
        return new float[]{h, max == 0 ? 0 : d / max, max};
    }
    static int rgb(float h, float s, float v) {
        float c = v * s, hh = (h % 1f) * 6, x = c * (1 - Math.abs(hh % 2 - 1)), m = v - c, r, g, b;
        if (hh < 1) { r = c; g = x; b = 0; } else if (hh < 2) { r = x; g = c; b = 0; } else if (hh < 3) { r = 0; g = c; b = x; }
        else if (hh < 4) { r = 0; g = x; b = c; } else if (hh < 5) { r = x; g = 0; b = c; } else { r = c; g = 0; b = x; }
        return Math.round((r + m) * 255) << 16 | Math.round((g + m) * 255) << 8 | Math.round((b + m) * 255);
    }
}

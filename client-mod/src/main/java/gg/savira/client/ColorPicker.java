package gg.savira.client;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.widget.TextFieldWidget;
import net.minecraft.text.Text;
import java.util.function.IntConsumer;

/**
 * NoRisk's colour picker: preview square, saturation/brightness field, hue bar and a hex box.
 * Opens next to a swatch; changes apply live. Coordinates are menu units.
 */
public final class ColorPicker {
    public static final int W = 139, H = 104;
    private static final int PAD = 19, SV_X = 57, TOP = 27, SV_W = 60, SV_H = 34, HUE_Y = 65, HUE_W = 101, HUE_H = 7, HEX_Y = 77;
    public final int x, y;
    public final TextFieldWidget hex;
    private final IntConsumer onChange;
    private float hue, sat, val;
    private int drag; // 0 nothing, 1 field, 2 hue bar
    private boolean typing;

    public ColorPicker(int x, int y, int rgb, IntConsumer onChange) {
        this.x = x; this.y = y; this.onChange = onChange;
        float[] hsv = hsv(rgb);
        hue = hsv[0]; sat = hsv[1]; val = hsv[2];
        hex = new TextFieldWidget(MinecraftClient.getInstance().textRenderer, x + PAD + 5, y + HEX_Y + 5, 88, 9, Text.literal("Hex-Farbe"));
        hex.setDrawsBackground(false); hex.setMaxLength(7);
        hex.setTextPredicate(text -> text.matches("#?[0-9a-fA-F]{0,6}"));
        hex.setText(hexOf(rgb));
        hex.setChangedListener(text -> {
            if (typing) return;
            String digits = text.startsWith("#") ? text.substring(1) : text;
            if (digits.length() != 6) return;
            int value = Integer.parseInt(digits, 16);
            float[] next = hsv(value);
            hue = next[0]; sat = next[1]; val = next[2];
            onChange.accept(value);
        });
    }

    public int rgb() { return rgb(hue, sat, val); }
    public boolean contains(double mx, double my) { return mx >= x && mx < x + W && my >= y && my < y + H; }

    public boolean mouseClicked(double mx, double my) {
        if (inside(mx, my, SV_X, TOP, SV_W, SV_H)) { drag = 1; pick(mx, my); return true; }
        if (inside(mx, my, PAD, HUE_Y - 1, HUE_W, HUE_H + 2)) { drag = 2; pick(mx, my); return true; }
        return false;
    }
    public void mouseDragged(double mx, double my) { if (drag != 0) pick(mx, my); }
    public void mouseReleased() { drag = 0; }

    private boolean inside(double mx, double my, int rx, int ry, int rw, int rh) { return mx >= x + rx && mx < x + rx + rw && my >= y + ry && my < y + ry + rh; }
    private void pick(double mx, double my) {
        if (drag == 1) {
            sat = (float) Math.clamp((mx - x - SV_X) / (SV_W - 1), 0, 1);
            val = 1 - (float) Math.clamp((my - y - TOP) / (SV_H - 1), 0, 1);
        } else hue = (float) Math.clamp(1 - (mx - x - PAD) / (HUE_W - 1), 0, .999); // red, magenta, blue … like NoRisk
        typing = true; hex.setText(hexOf(rgb())); typing = false;
        onChange.accept(rgb());
    }

    public void render(DrawContext c, int mx, int my, float delta) {
        MenuTheme t = MenuTheme.current();
        c.getMatrices().push();
        c.getMatrices().translate(0, 0, 200);
        c.fill(x, y, x + W, y + H, t.dark() ? 0xF2161618 : 0xE6403E39);
        c.drawBorder(x, y, W, H, 0xC8FFFFFF);
        MenuText.caps(c, "FARBWAHL", x + PAD, y + 11, MenuText.TITLE, 0xFFFFFFFF);
        // Preview
        c.fill(x + PAD, y + TOP, x + PAD + 34, y + TOP + 34, 0xFF000000 | rgb());
        c.drawBorder(x + PAD, y + TOP, 34, 34, 0xFFF4F4F4);
        // Saturation left to right, brightness top to bottom, in columns.
        for (int i = 0; i < SV_W; i++) {
            int top = 0xFF000000 | rgb(hue, i / (float) (SV_W - 1), 1);
            c.fillGradient(x + SV_X + i, y + TOP, x + SV_X + i + 1, y + TOP + SV_H, top, 0xFF000000);
        }
        int sx = x + SV_X + Math.round(sat * (SV_W - 1)), sy = y + TOP + Math.round((1 - val) * (SV_H - 1));
        c.drawBorder(sx - 2, sy - 2, 5, 5, 0xFFFFFFFF);
        c.fill(sx - 1, sy - 1, sx + 2, sy + 2, 0xFF000000 | rgb());
        for (int i = 0; i < HUE_W; i++) c.fill(x + PAD + i, y + HUE_Y, x + PAD + i + 1, y + HUE_Y + HUE_H, 0xFF000000 | rgb(1 - i / (float) HUE_W, 1, 1));
        int hx = x + PAD + Math.round((1 - hue) * (HUE_W - 1));
        c.fill(hx - 3, y + HUE_Y - 1, hx + 4, y + HUE_Y + HUE_H + 1, 0xFFFFFFFF);
        c.fill(hx - 2, y + HUE_Y, hx + 3, y + HUE_Y + HUE_H, 0xFF000000 | rgb(hue, 1, 1));
        c.fill(x + PAD, y + HEX_Y, x + PAD + 98, y + HEX_Y + 17, 0x40000000);
        c.drawBorder(x + PAD, y + HEX_Y, 98, 17, hex.isFocused() ? 0xFFFFFFFF : 0x8CFFFFFF);
        hex.render(c, mx, my, delta);
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

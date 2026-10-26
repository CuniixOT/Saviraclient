package gg.savira.client;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.util.Identifier;

/**
 * Smooth rounded boxes for the main menu: drawn in real screen pixels instead of GUI pixels,
 * with the corner pixels faded by how much of them the rounding covers (simple anti-aliasing).
 * Coordinates are in the caller's units; {@code unit} is screen pixels per caller unit.
 */
public final class Paint {
    private Paint() {}

    /** Screen pixels per reference unit, for a layout scaled by u gui units per unit. */
    public static float pixels(float u) { return u * (float) MinecraftClient.getInstance().getWindow().getScaleFactor(); }

    public static void round(DrawContext c, float x, float y, float w, float h, float r, int color, float unit) { gradient(c, x, y, w, h, r, color, color, unit); }

    /** Rounded box with a vertical gradient from top to bottom colour. */
    public static void gradient(DrawContext c, float x, float y, float w, float h, float r, int top, int bottom, float unit) {
        c.getMatrices().push();
        c.getMatrices().translate(x, y, 0);
        c.getMatrices().scale(1 / unit, 1 / unit, 1);
        int W = Math.max(1, Math.round(w * unit)), H = Math.max(1, Math.round(h * unit));
        float R = Math.min(r * unit, Math.min(W, H) / 2f);
        int ri = (int) Math.ceil(R);
        for (int row = 0; row < H; row++) {
            int color = top == bottom ? top : lerp(top, bottom, H == 1 ? 0 : row / (float) (H - 1));
            int edge = row < ri ? row : row >= H - ri ? H - 1 - row : -1;
            if (edge < 0) {
                // Straight part: draw the run of plain rows in one go.
                int end = top == bottom ? H - ri : row + 1;
                c.fill(0, row, W, end, color);
                row = end - 1;
                continue;
            }
            float dy = R - (edge + .5f);
            float inset = R - (float) Math.sqrt(Math.max(0, R * R - dy * dy));
            int full = (int) Math.ceil(inset);
            c.fill(full, row, W - full, row + 1, color);
            float cover = full - inset;
            if (full > 0 && cover > .03f) {
                int faded = Math.round((color >>> 24) * cover) << 24 | color & 0xFFFFFF;
                c.fill(full - 1, row, full, row + 1, faded);
                c.fill(W - full, row, W - full + 1, row + 1, faded);
            }
        }
        c.getMatrices().pop();
    }

    /**
     * A picture inside a rounded box: the box is filled row by row with the matching strip of the
     * picture, which covers ix, iy, iw, ih (also in caller units, usually larger than the box).
     */
    public static void roundTexture(DrawContext c, Identifier texture, float x, float y, float w, float h, float r, float ix, float iy, float iw, float ih, float unit) {
        c.getMatrices().push();
        c.getMatrices().translate(x, y, 0);
        c.getMatrices().scale(1 / unit, 1 / unit, 1);
        int W = Math.max(1, Math.round(w * unit)), H = Math.max(1, Math.round(h * unit));
        int IW = Math.max(1, Math.round(iw * unit)), IH = Math.max(1, Math.round(ih * unit));
        float ox = (ix - x) * unit, oy = (iy - y) * unit;
        float R = Math.min(r * unit, Math.min(W, H) / 2f);
        int ri = (int) Math.ceil(R);
        for (int row = 0; row < H; row++) {
            int edge = row < ri ? row : row >= H - ri ? H - 1 - row : -1;
            int full = 0, end = row + 1;
            if (edge < 0) end = H - ri;
            else {
                float dy = R - (edge + .5f);
                full = Math.round(R - (float) Math.sqrt(Math.max(0, R * R - dy * dy)));
            }
            c.drawTexture(texture, full, row, W - 2 * full, end - row, full - ox, row - oy, W - 2 * full, end - row, IW, IH);
            row = end - 1;
        }
        c.getMatrices().pop();
    }

    /** A 1 pixel rounded outline, drawn as a ring between two boxes. */
    public static void outline(DrawContext c, float x, float y, float w, float h, float r, int color, float unit) {
        c.getMatrices().push();
        c.getMatrices().translate(x, y, 0);
        c.getMatrices().scale(1 / unit, 1 / unit, 1);
        int W = Math.round(w * unit), H = Math.round(h * unit);
        float R = Math.min(r * unit, Math.min(W, H) / 2f);
        int ri = (int) Math.ceil(R);
        c.fill(ri, 0, W - ri, 1, color);
        c.fill(ri, H - 1, W - ri, H, color);
        c.fill(0, ri, 1, H - ri, color);
        c.fill(W - 1, ri, W, H - ri, color);
        for (int i = 0; i < ri; i++) {
            float dy = R - (i + .5f);
            int inset = Math.round(R - (float) Math.sqrt(Math.max(0, R * R - dy * dy)));
            int next = i + 1 < ri ? Math.round(R - (float) Math.sqrt(Math.max(0, R * R - (R - (i + 1.5f)) * (R - (i + 1.5f))))) : inset;
            int from = Math.min(inset, next), to = Math.max(inset, next) + 1;
            c.fill(from, i, to, i + 1, color);
            c.fill(W - to, i, W - from, i + 1, color);
            c.fill(from, H - 1 - i, to, H - i, color);
            c.fill(W - to, H - 1 - i, W - from, H - i, color);
        }
        c.getMatrices().pop();
    }

    public static int lerp(int a, int b, float t) {
        t = Math.clamp(t, 0f, 1f);
        int aa = a >>> 24, ar = a >> 16 & 0xFF, ag = a >> 8 & 0xFF, ab = a & 0xFF;
        int ba = b >>> 24, br = b >> 16 & 0xFF, bg = b >> 8 & 0xFF, bb = b & 0xFF;
        return Math.round(aa + (ba - aa) * t) << 24 | Math.round(ar + (br - ar) * t) << 16 | Math.round(ag + (bg - ag) * t) << 8 | Math.round(ab + (bb - ab) * t);
    }
}

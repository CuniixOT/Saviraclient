package gg.savira.client;

import java.util.List;

/**
 * Colours of the Right-Shift menu from the design (Rshift Menu v5): a dark and a light palette in
 * OKLCH, and the accent with its variants. The accent is one of the design's thirteen or, by
 * default, the launcher's accent colour.
 */
public record DesignTheme(boolean dark,
                          int bg, int glass, int card, int line, int hi, int tx, int mu, int fill, int track, int scrim,
                          int ac, int act, int acx, int acd, int acs) {

    public record Accent(String name, float l, float c, float h) {}
    public static final List<Accent> ACCENTS = List.of(
        new Accent("Mint", .78f, .13f, 160), new Accent("Smaragd", .66f, .13f, 163), new Accent("Türkis", .72f, .11f, 185),
        new Accent("Cyan", .74f, .12f, 222), new Accent("Blau", .66f, .16f, 258), new Accent("Indigo", .6f, .16f, 275),
        new Accent("Violett", .66f, .17f, 295), new Accent("Pink", .7f, .16f, 345), new Accent("Rose", .65f, .17f, 12),
        new Accent("Rot", .62f, .2f, 27), new Accent("Orange", .7f, .16f, 50), new Accent("Gold", .77f, .13f, 78),
        new Accent("Savira", .72f, .075f, 270));
    /** The knob of switches and the light grey of the design's controls. */
    public static final int KNOB = oklch(.97f, .005f, 268, 1), KNOB_EDGE = oklch(.8f, .01f, 268, 1), ONLINE = oklch(.72f, .19f, 145, 1);

    private static DesignTheme cached;
    private static String cachedKey = "";

    public static DesignTheme current() {
        HudConfig cfg = SaviraClient.config;
        String key = cfg.menuDark + "|" + cfg.menuAccent + "|" + (cfg.accent & 0xFFFFFF);
        if (cached == null || !key.equals(cachedKey)) { cached = build(cfg.menuDark, accent()); cachedKey = key; }
        return cached;
    }

    /** The chosen accent; the launcher's colour when none is chosen. */
    public static Accent accent() {
        String name = SaviraClient.config.menuAccent;
        for (Accent a : ACCENTS) if (a.name().equals(name)) return a;
        float[] lch = toOklch(MenuStyle.launcherAccent());
        return new Accent("Launcher", lch[0], lch[1], lch[2]);
    }

    private static DesignTheme build(boolean dark, Accent a) {
        float l = a.l(), c = a.c(), h = a.h();
        int ac = oklch(l, c, h, 1);
        int act = dark ? oklch(Math.max(l, .72f), c, h, 1) : oklch(.48f, c, h, 1);
        int acx = oklch(.18f, .03f, h, 1), acd = oklch(l - .15f, c, h, 1), acs = oklch(l, c, h, dark ? .16f : .2f);
        if (dark) return new DesignTheme(true,
            oklch(.15f, .012f, 268, 1), oklch(.16f, .012f, 268, .62f), oklch(.2f, .013f, 268, .5f), oklch(.29f, .015f, 268, 1),
            oklch(.235f, .016f, 268, 1), oklch(.95f, .005f, 268, 1), oklch(.7f, .012f, 268, 1), oklch(.14f, .01f, 268, .85f),
            oklch(.28f, .012f, 268, 1), 0x5906080E, ac, act, acx, acd, acs);
        return new DesignTheme(false,
            oklch(.95f, .006f, 268, 1), oklch(.975f, .004f, 268, .62f), oklch(.99f, .003f, 268, .55f), oklch(.86f, .01f, 268, 1),
            oklch(.92f, .012f, 268, 1), oklch(.22f, .02f, 268, 1), oklch(.47f, .015f, 268, 1), oklch(.945f, .006f, 268, 1),
            oklch(.85f, .01f, 268, 1), 0x47E1E5F0, ac, act, acx, acd, acs);
    }

    /** The same colour at another alpha (0..1). */
    public static int alpha(int color, float alpha) { return Math.round(Math.clamp(alpha, 0f, 1f) * 255) << 24 | color & 0xFFFFFF; }
    /** CSS color-mix(in srgb, a share, b). */
    public static int mix(int a, int b, float share) { return Paint.lerp(b, a, share); }

    // ---------- OKLCH ----------
    public static int oklch(float l, float c, float hDeg, float alpha) {
        double h = Math.toRadians(hDeg), A = c * Math.cos(h), B = c * Math.sin(h);
        double l_ = l + .3963377774 * A + .2158037573 * B, m_ = l - .1055613458 * A - .0638541728 * B, s_ = l - .0894841775 * A - 1.2914855480 * B;
        double L3 = l_ * l_ * l_, M3 = m_ * m_ * m_, S3 = s_ * s_ * s_;
        double r = 4.0767416621 * L3 - 3.3077115913 * M3 + .2309699292 * S3;
        double g = -1.2684380046 * L3 + 2.6097574011 * M3 - .3413193965 * S3;
        double b = -.0041960863 * L3 - .7034186147 * M3 + 1.7076147010 * S3;
        return Math.round(alpha * 255) << 24 | channel(r) << 16 | channel(g) << 8 | channel(b);
    }
    private static int channel(double linear) {
        double v = linear <= .0031308 ? 12.92 * linear : 1.055 * Math.pow(linear, 1 / 2.4) - .055;
        return (int) Math.round(Math.clamp(v, 0, 1) * 255);
    }
    private static double linear(int c) { double v = c / 255.0; return v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }
    /** RGB to OKLCH: lightness, chroma, hue in degrees. */
    public static float[] toOklch(int rgb) {
        double r = linear(rgb >> 16 & 0xFF), g = linear(rgb >> 8 & 0xFF), b = linear(rgb & 0xFF);
        double l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b);
        double m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b);
        double s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
        double L = .2104542553 * l + .7936177850 * m - .0040720468 * s;
        double A = 1.9779984951 * l - 2.4285922050 * m + .4505937099 * s;
        double B = .0259040371 * l + .7827717662 * m - .8086757660 * s;
        double h = Math.toDegrees(Math.atan2(B, A));
        return new float[] {(float) L, (float) Math.hypot(A, B), (float) (h < 0 ? h + 360 : h)};
    }
}

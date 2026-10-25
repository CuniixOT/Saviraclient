package gg.savira.client;

/**
 * Colours of the Right-Shift menu, measured from NoRisk's menu: light is a thin dark veil over the
 * blurred world with white details, dark an almost opaque grey with the accent for active things.
 * The sun/moon button in the header switches between them; the choice is saved.
 */
public record MenuTheme(boolean dark,
                        int panel, int line,
                        int card, int cardHover, int cardEdge, int cardOn, int cardOnEdge,
                        int text, int title, int muted, int section,
                        int box, int boxEdge, int boxHover, int knob, int track,
                        int switchOn, int switchOff, int switchEdge, int knobOff,
                        int stateOn, int stateOff, int reset,
                        int tab, int tabEdge, int scroll) {

    private static MenuTheme cached;
    private static boolean cachedDark;
    private static int cachedAccent;

    public static MenuTheme current() {
        boolean dark = SaviraClient.config.menuDark;
        int accent = MenuStyle.accent();
        if (cached == null || cachedDark != dark || cachedAccent != accent) {
            cached = dark ? dark(accent) : light();
            cachedDark = dark; cachedAccent = accent;
        }
        return cached;
    }

    /** Over the blurred world: about 28 % black, cards a little darker, active ones lighter. */
    private static MenuTheme light() {
        return new MenuTheme(false,
            0x47000000, 0x33FFFFFF,
            0x38000000, 0x24FFFFFF, 0x40FFFFFF, 0x52FFFFFF, 0x99FFFFFF,
            0xFFF4F4F4, 0xFFF4F4F4, 0xFFDDDBD3, 0xFFD3D0C6,
            0x33000000, 0x59FFFFFF, 0xB3FFFFFF, 0xFFF4F4F4, 0x99FFFFFF,
            0x66FFFFFF, 0x1AFFFFFF, 0xB3FFFFFF, 0xFFC9C9C9,
            0x8CA5A5A5, 0x40000000, 0xB34A4A4A,
            0x40FFFFFF, 0x99FFFFFF, 0xB3FFFFFF);
    }

    /** About 85 % dark grey; the launcher accent marks active cards, tabs and switches. */
    private static MenuTheme dark(int accent) {
        return new MenuTheme(true,
            0xD91A1A1B, 0x26FFFFFF,
            0xA0121213, 0xB8222327, 0x1AFFFFFF, mix(0xFF1D1F26, accent, .22f), mix(0xFF1D1F26, accent, .62f),
            0xFFE6E7EE, 0xFFB7B8C3, 0xFF9C9DA7, 0xFF8E8F99,
            0x66000000, 0x33FFFFFF, 0x8CFFFFFF, 0xFFE6E7EE, 0x66FFFFFF,
            mix(0xFF2A2C33, accent, .55f), 0x14FFFFFF, 0x80FFFFFF, 0xFF9C9DA7,
            mix(0xFF2A2C33, accent, .45f), 0xFF2E2F35, 0xFF26272C,
            mix(0xFF1D1F26, accent, .18f), mix(0xFF1D1F26, accent, .65f), 0x99FFFFFF);
    }

    /** Opaque blend of two colours, t = share of the second. */
    public static int mix(int a, int b, float t) {
        int r = Math.round(((a >> 16) & 0xFF) * (1 - t) + ((b >> 16) & 0xFF) * t);
        int g = Math.round(((a >> 8) & 0xFF) * (1 - t) + ((b >> 8) & 0xFF) * t);
        int bl = Math.round((a & 0xFF) * (1 - t) + (b & 0xFF) * t);
        return 0xFF000000 | (r << 16) | (g << 8) | bl;
    }
}

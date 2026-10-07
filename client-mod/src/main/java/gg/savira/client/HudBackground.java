package gg.savira.client;

/** Background styles every HUD module can use (NoRisk-style choices). */
public enum HudBackground {
    BLANK("Blank", false, false),
    VANILLA("Vanilla", false, true),
    DARK_PANEL("Dark Panel", false, true),
    TOOLTIP("Tooltip", false, false),
    BLUR("Blur", false, true),
    COLOR("Farbe", true, true),
    OUTLINE("Outline", true, true);

    public final String label;
    /** Uses the module's background colour setting. */
    public final boolean coloured;
    /** Uses the corner radius setting. */
    public final boolean rounded;

    HudBackground(String label, boolean coloured, boolean rounded) {
        this.label = label; this.coloured = coloured; this.rounded = rounded;
    }

    public static HudBackground parse(String name) {
        for (HudBackground value : values()) if (value.name().equals(name)) return value;
        return DARK_PANEL;
    }
    public HudBackground next(int direction) {
        HudBackground[] all = values();
        return all[Math.floorMod(ordinal() + direction, all.length)];
    }
}

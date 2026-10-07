package gg.savira.client;

import net.minecraft.item.Item;
import net.minecraft.item.Items;

public enum HudModule {
    FPS("FPS-Anzeige", "Performance", "Deine Bildrate in Echtzeit.", Items.CLOCK, .02f, .04f, 83, 27),
    CPS("CPS-Zähler", "PvP", "Linke und rechte Klicks pro Sekunde.", Items.IRON_SWORD, .02f, .16f, 112, 27),
    KEYSTROKES("Keystrokes", "PvP", "Bewegung, Maustasten und Sprung.", Items.OAK_BUTTON, .02f, .40f, 85, 114),
    PING("Ping", "Performance", "Deine Verbindung zum Server.", Items.ENDER_PEARL, .98f, .04f, 83, 27),
    COORDINATES("Koordinaten", "Welt", "Position, Blickrichtung und Biom.", Items.COMPASS, .02f, .82f, 152, 58),
    ARMOR("Rüstungsstatus", "PvP", "Ausrüstung und ihre Haltbarkeit.", Items.NETHERITE_CHESTPLATE, .98f, .88f, 100, 38),
    POTIONS("Effekte", "PvP", "Aktive Effekte mit Restdauer.", Items.POTION, .02f, .64f, 134, 62),
    SPRINT("Sprint-Status", "Gameplay", "Sprinten, Schleichen oder Laufen.", Items.LEATHER_BOOTS, .98f, .16f, 110, 27),
    ZOOM("Zoom", "Gameplay", "C halten zum Heranzoomen.", Items.SPYGLASS, .45f, .02f, 96, 27),
    RAM("Arbeitsspeicher", "Performance", "Genutzter und maximaler RAM.", Items.REDSTONE, .98f, .28f, 118, 27);

    public final String title, category, description;
    public final Item icon;
    public final float x, y;
    public final int width, height;
    HudModule(String title, String category, String description, Item icon, float x, float y, int width, int height) {
        this.title = title; this.category = category; this.description = description;
        this.icon = icon; this.x = x; this.y = y; this.width = width; this.height = height;
    }
    /** Single-line modules whose text can be customised; others draw their own layout. */
    public boolean textual() { return defaultText() != null; }
    public String defaultText() {
        return switch (this) {
            case FPS -> "{value} FPS";
            case CPS -> "{left} | {right} CPS";
            case PING -> "{value} ms";
            case SPRINT -> "{value}";
            case ZOOM -> "Zoom: {value}";
            case RAM -> "{value} MB";
            default -> null;
        };
    }
    /** Placeholders the template understands, shown as help in the settings. */
    public String placeholders() { return this == CPS ? "{left} {right}" : "{value}"; }
    /** Widest typical value, so the box does not jump in size while numbers change. */
    public String sample(String placeholder) {
        return switch (this) {
            case FPS -> "9999"; case PING -> "999"; case SPRINT -> "SCHLEICHEN";
            case ZOOM -> "BEREIT (C)"; case RAM -> "9999 / 9999";
            case CPS -> "20";
            default -> "";
        };
    }
    public boolean enabled() {
        HudConfig c = SaviraClient.config;
        return switch (this) {
            case FPS -> c.fps; case CPS -> c.cps; case KEYSTROKES -> c.keystrokes;
            case PING -> c.ping; case COORDINATES -> c.coordinates; case ARMOR -> c.armor;
            case POTIONS -> c.potions; case SPRINT -> c.sprint; case ZOOM -> c.zoom;
            case RAM -> c.ram;
        };
    }
    public void toggle() {
        HudConfig c = SaviraClient.config;
        switch (this) {
            case FPS -> c.fps = !c.fps; case CPS -> c.cps = !c.cps;
            case KEYSTROKES -> c.keystrokes = !c.keystrokes; case PING -> c.ping = !c.ping;
            case COORDINATES -> c.coordinates = !c.coordinates; case ARMOR -> c.armor = !c.armor;
            case POTIONS -> c.potions = !c.potions; case SPRINT -> c.sprint = !c.sprint;
            case ZOOM -> c.zoom = !c.zoom; case RAM -> c.ram = !c.ram;
        }
    }
}

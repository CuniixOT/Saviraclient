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
    RAM("Arbeitsspeicher", "Performance", "Genutzter und maximaler RAM.", Items.REDSTONE, .98f, .28f, 118, 27),
    ICON("Icon", "Savira", "Dein Savira-Icon vor dem Namen in Nametag und Tab-Liste.", Items.NETHER_STAR, 0, 0, 0, 0),
    NAMETAG("Nametag", "Gameplay", "Dein Nametag in F5, Textschatten und Hintergrund der Namen.", Items.NAME_TAG, 0, 0, 0, 0),
    LIGHT_LEVEL("Light Level", "Welt", "Zeigt die Lichtstufe der Blöcke um dich herum, damit du Mob-Spawns erkennst und verhinderst.", Items.TORCH, 0, 0, 0, 0);

    public final String title, category, description;
    public final Item icon;
    public final float x, y;
    public final int width, height;
    HudModule(String title, String category, String description, Item icon, float x, float y, int width, int height) {
        this.title = title; this.category = category; this.description = description;
        this.icon = icon; this.x = x; this.y = y; this.width = width; this.height = height;
    }
    /** Drawn on the HUD (and movable in the editor); the Icon module only changes names. */
    public boolean onHud() { return this != ICON && this != NAMETAG && this != LIGHT_LEVEL; }
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
    /** How long a module keeps its "NEU" tag after its release. */
    public static final int NEW_FOR_DAYS = 21;
    /** Release date of each module; the newest ones are listed first and tagged "NEU". */
    public java.time.LocalDate released() {
        return switch (this) {
            case LIGHT_LEVEL -> java.time.LocalDate.of(2026, 10, 26);
            case NAMETAG -> java.time.LocalDate.of(2026, 10, 13);
            case ICON -> java.time.LocalDate.of(2026, 10, 12);
            case ZOOM, POTIONS, RAM -> java.time.LocalDate.of(2026, 9, 7);
            default -> java.time.LocalDate.of(2026, 9, 1);
        };
    }
    public boolean isNew() { return !java.time.LocalDate.now().isAfter(released().plusDays(NEW_FOR_DAYS)); }
    public boolean enabled() {
        HudConfig c = SaviraClient.config;
        return switch (this) {
            case FPS -> c.fps; case CPS -> c.cps; case KEYSTROKES -> c.keystrokes;
            case PING -> c.ping; case COORDINATES -> c.coordinates; case ARMOR -> c.armor;
            case POTIONS -> c.potions; case SPRINT -> c.sprint; case ZOOM -> c.zoom;
            case RAM -> c.ram; case ICON -> c.icon; case NAMETAG -> c.nametag; case LIGHT_LEVEL -> c.lightLevel;
        };
    }
    public void toggle() {
        HudConfig c = SaviraClient.config;
        switch (this) {
            case FPS -> c.fps = !c.fps; case CPS -> c.cps = !c.cps;
            case KEYSTROKES -> c.keystrokes = !c.keystrokes; case PING -> c.ping = !c.ping;
            case COORDINATES -> c.coordinates = !c.coordinates; case ARMOR -> c.armor = !c.armor;
            case POTIONS -> c.potions = !c.potions; case SPRINT -> c.sprint = !c.sprint;
            case ZOOM -> c.zoom = !c.zoom; case RAM -> c.ram = !c.ram; case ICON -> c.icon = !c.icon; case NAMETAG -> c.nametag = !c.nametag; case LIGHT_LEVEL -> c.lightLevel = !c.lightLevel;
        }
    }
}

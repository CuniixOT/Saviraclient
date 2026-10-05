package gg.savira.client;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.fabricmc.loader.api.FabricLoader;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.HashMap;
import java.util.Map;

public final class HudConfig {
    private static final Logger LOGGER = LoggerFactory.getLogger("Savira");
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
    private static final Path FILE = FabricLoader.getInstance().getConfigDir().resolve("savira.json");
    public boolean fps = true;
    public boolean cps = true;
    public boolean keystrokes = true;
    public boolean coordinates = false;
    public boolean ping = true;
    public boolean armor = true;
    public boolean potions = true;
    public boolean sprint = true;
    public boolean zoom = false;
    public boolean ram = true;
    public float scale = 1.0f;
    public boolean snap = true;
    /** RGB accent written by the launcher; keeps the in-game menu in the launcher's color. */
    public int accent = 0x5CCF95;
    public Map<String, Placement> layout = new HashMap<>();

    public static final class Placement {
        public float x, y, size = 1f;
        public Placement(float x, float y) { this.x = x; this.y = y; }
    }

    public Placement placement(HudModule module) {
        if (layout == null) layout = new HashMap<>();
        Placement p = layout.computeIfAbsent(module.name(), key -> new Placement(module.x, module.y));
        if (!Float.isFinite(p.x)) p.x = module.x;
        if (!Float.isFinite(p.y)) p.y = module.y;
        if (!Float.isFinite(p.size)) p.size = 1f;
        p.x = Math.clamp(p.x, 0f, 1f);
        p.y = Math.clamp(p.y, 0f, 1f);
        p.size = Math.clamp(p.size, .5f, 2f);
        return p;
    }

    public static HudConfig load() {
        if (Files.exists(FILE)) {
            try {
                HudConfig config = GSON.fromJson(Files.readString(FILE), HudConfig.class);
                if (config != null) {
                    if (config.scale != .75f && config.scale != 1f && config.scale != 1.25f && config.scale != 1.5f) config.scale = 1f;
                    config.accent &= 0xFFFFFF;
                    return config;
                }
            } catch (IOException | RuntimeException e) {
                LOGGER.warn("HUD-Konfiguration konnte nicht geladen werden; verwende Standardwerte.", e);
            }
        }
        return new HudConfig();
    }

    public boolean save() {
        try {
            Files.createDirectories(FILE.getParent());
            Path temp = FILE.resolveSibling("savira.json.tmp");
            Files.writeString(temp, GSON.toJson(this));
            Files.move(temp, FILE, StandardCopyOption.REPLACE_EXISTING);
            return true;
        } catch (IOException e) {
            LOGGER.error("HUD-Konfiguration konnte nicht gespeichert werden.", e);
            return false;
        }
    }
}

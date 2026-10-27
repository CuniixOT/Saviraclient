package gg.savira.client;

import com.mojang.blaze3d.systems.RenderSystem;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.util.Util;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Notifications in the top right corner, as in the design: the accent stripe on the left, a check
 * (or an X when something was turned off), the title in small caps above the text, and a bar along
 * the bottom running out over five seconds. They slide in from the right and out again.
 * Shown over the mod menu and in game; at most three, a new one for the same title replaces the old.
 */
public final class SaviraToasts {
    private record Toast(String title, String text, long start) {}
    private static final long SLIDE = 260, SHOW = 5000;
    private static final int MAX = 3;
    private static final List<Toast> TOASTS = new ArrayList<>();
    private SaviraToasts() {}

    public static void show(String title, String text) {
        TOASTS.removeIf(t -> t.title().equals(title));
        TOASTS.add(new Toast(title, text, Util.getMeasuringTimeMs()));
        SaviraSounds.play(SaviraSounds.Sound.NOTIFY);
        while (TOASTS.size() > MAX) TOASTS.remove(0);
    }

    public static boolean any() { return !TOASTS.isEmpty(); }

    private static float easeOut(float t) { t = Math.clamp(t, 0f, 1f); return 1 - (1 - t) * (1 - t) * (1 - t); }
    private static float easeIn(float t) { t = Math.clamp(t, 0f, 1f); return t * t * t; }

    public static void render(DrawContext c, int screenWidth) { render(c, screenWidth, 16, false); }
    /** At a distance from the top in design pixels; info marks plain notices (main menu) instead of a check. */
    public static void render(DrawContext c, int screenWidth, float top, boolean info) {
        long now = Util.getMeasuringTimeMs();
        TOASTS.removeIf(t -> now - t.start() > SHOW + SLIDE);
        if (TOASTS.isEmpty()) return;
        DesignTheme t = DesignTheme.current();
        boolean anim = SaviraClient.config.menuAnimations;
        int screenHeight = MinecraftClient.getInstance().getWindow().getScaledHeight();
        float u = HudScreen.unitFor(screenWidth, screenHeight), px = Paint.pixels(u);
        float sw = screenWidth / u;
        RenderSystem.enableBlend();
        c.getMatrices().push();
        c.getMatrices().translate(0, 0, 900);
        c.getMatrices().scale(u, u, 1);
        float y = top;
        for (int i = TOASTS.size() - 1; i >= 0; i--) {
            Toast toast = TOASTS.get(i);
            long age = now - toast.start();
            boolean off = toast.text().equals("Deaktiviert") || toast.text().startsWith("Ausgeblendet");
            String title = toast.title().toUpperCase(Locale.ROOT);
            float textW = Math.max(MenuType.width(MenuType.Face.SILK, title, 10, .06f, u), MenuType.width(MenuType.Face.PIXEL, toast.text(), 15, u));
            float w = Math.clamp(18 + 4 + 18 + 14 + textW + 22, 300, 480), h = 60;
            // In from the right, out to the right after five seconds.
            float shift = anim ? (1 - easeOut(age / (float) SLIDE) + (age > SHOW ? easeIn((age - SHOW) / (float) SLIDE) : 0)) * (w + 24) : 0;
            float x = sw - 16 - w + shift;
            Paint.round(c, x, y, w, h, 0, DesignTheme.alpha(t.bg(), .93f), px);
            outline(c, x, y, w, h, t.line(), px);
            Paint.round(c, x, y, 4, h, 0, t.ac(), px);
            MenuType.icon(c, info ? MenuType.INFO : off ? MenuType.X : MenuType.CHECK, x + 4 + 18 + 9, y + h / 2, 18, off ? t.mu() : t.act(), false, u);
            float tx = x + 4 + 18 + 18 + 14, maxW = w - (tx - x) - 22;
            MenuType.middle(c, MenuType.Face.SILK, MenuType.fit(MenuType.Face.SILK, title, 10, maxW, u), tx, y + h / 2 - 9, 10, t.tx(), .06f, u);
            MenuType.middle(c, MenuType.Face.PIXEL, MenuType.fit(MenuType.Face.PIXEL, toast.text(), 15, maxW, u), tx, y + h / 2 + 9, 15, t.mu(), u);
            float left = 1 - Math.clamp(age / (float) SHOW, 0f, 1f);
            Paint.round(c, x, y + h - 2, w * left, 2, 0, DesignTheme.alpha(t.ac(), .63f), px);
            y += h + 8;
        }
        c.getMatrices().pop();
    }
    private static void outline(DrawContext c, float x, float y, float w, float h, int color, float px) {
        Paint.round(c, x, y, w, 1 / px, 0, color, px);
        Paint.round(c, x, y + h - 1 / px, w, 1 / px, 0, color, px);
        Paint.round(c, x + w - 1 / px, y, 1 / px, h, 0, color, px);
    }
}

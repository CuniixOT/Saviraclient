package gg.savira.client;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.util.Util;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Notifications in the top right corner: slide in from the right, stay five seconds with a
 * shrinking progress bar, then slide out again. Shown over the mod menu and in game.
 */
public final class SaviraToasts {
    private record Toast(String title, String text, long start) {}
    private static final long SLIDE = 260, SHOW = 5000;
    private static final int WIDTH = 150, HEIGHT = 30, MAX = 3;
    private static final List<Toast> TOASTS = new ArrayList<>();
    private SaviraToasts() {}

    public static void show(String title, String text) {
        TOASTS.removeIf(t -> t.title().equals(title));
        TOASTS.add(new Toast(title, text, Util.getMeasuringTimeMs()));
        SaviraSounds.play(SaviraSounds.Sound.NOTIFY);
        while (TOASTS.size() > MAX) TOASTS.remove(0);
    }

    public static boolean any() { return !TOASTS.isEmpty(); }

    private static float ease(float t) { t = Math.clamp(t, 0f, 1f); return 1 - (1 - t) * (1 - t) * (1 - t); }

    public static void render(DrawContext c, int screenWidth) {
        long now = Util.getMeasuringTimeMs();
        TOASTS.removeIf(t -> now - t.start() > SHOW + SLIDE);
        var font = MinecraftClient.getInstance().textRenderer;
        c.getMatrices().push();
        c.getMatrices().translate(0, 0, 900);
        int y = 8;
        for (int i = TOASTS.size() - 1; i >= 0; i--) {
            Toast t = TOASTS.get(i);
            long age = now - t.start();
            // In over SLIDE ms, out over the last SLIDE ms.
            float in = ease(age / (float) SLIDE), out = age > SHOW ? ease((age - SHOW) / (float) SLIDE) : 0f;
            // As wide as the text needs, within limits.
            int width = Math.clamp(Math.max(font.getWidth(t.title().toUpperCase(Locale.ROOT)), font.getWidth(t.text())) + 36, WIDTH, 240);
            int x = screenWidth - 8 - width + Math.round((width + 12) * (1 - in + out));
            c.fill(x, y, x + width, y + HEIGHT, 0xEE0E1116);
            c.fill(x, y, x + 2, y + HEIGHT, MenuStyle.accent());
            // Check mark in the accent colour.
            int cx = x + 9, cy = y + 11;
            for (int k = 0; k < 3; k++) c.fill(cx + k, cy + 3 + k, cx + k + 2, cy + 5 + k, MenuStyle.accent());
            for (int k = 0; k < 6; k++) c.fill(cx + 3 + k, cy + 4 - k, cx + 5 + k, cy + 6 - k, MenuStyle.accent());
            c.drawText(font, font.trimToWidth(t.title().toUpperCase(Locale.ROOT), width - 32), x + 24, y + 6, MenuStyle.TEXT, false);
            c.drawText(font, font.trimToWidth(t.text(), width - 32), x + 24, y + 17, 0xFFB4BCC5, false);
            float left = 1 - Math.clamp(age / (float) SHOW, 0f, 1f);
            c.fill(x + 2, y + HEIGHT - 1, x + 2 + Math.round((width - 2) * left), y + HEIGHT, MenuStyle.accentAlpha(0xA0));
            y += HEIGHT + 4;
        }
        c.getMatrices().pop();
    }
}

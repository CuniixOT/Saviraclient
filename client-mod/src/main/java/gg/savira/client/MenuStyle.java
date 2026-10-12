package gg.savira.client;

import com.mojang.blaze3d.systems.RenderSystem;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.text.Text;
import net.minecraft.util.Identifier;

public final class MenuStyle {
    public static final int TEXT = 0xFFEEF1F4, MUTED = 0xFF8A939D, ON_ACCENT = 0xFF0B0D10;
    public static final int PANEL = 0xF00D1014, SIDEBAR = 0xFF0A0C0F, SURFACE = 0xFF161A1F, SURFACE_HOVER = 0xFF1F242B, LINE = 0xFF272C34;
    private MenuStyle() {}

    /** Savira mint, the default launcher accent. */
    public static final int BRAND = 0xFF5CCF95;
    /** Menus follow the accent colour picked in the launcher. */
    public static int accent() { return launcherAccent(); }
    /** The accent colour from the launcher settings. */
    public static int launcherAccent() { return 0xFF000000 | (SaviraClient.config.accent & 0xFFFFFF); }
    public static int launcherAccentAlpha(int alpha) { return (alpha << 24) | (launcherAccent() & 0xFFFFFF); }
    /** Darker accent for the 3D bottom edge of buttons, like the launcher. */
    public static int accentDark() { return shade(accent(), .62f); }
    /** Accent at the given alpha (0-255). */
    public static int accentAlpha(int alpha) { return (alpha << 24) | (accent() & 0xFFFFFF); }
    public static int shade(int color, float factor) {
        int r = Math.min(255, (int) (((color >> 16) & 0xFF) * factor)), g = Math.min(255, (int) (((color >> 8) & 0xFF) * factor)), b = Math.min(255, (int) ((color & 0xFF) * factor));
        return (color & 0xFF000000) | (r << 16) | (g << 8) | b;
    }

    public static void round(DrawContext c, int x, int y, int w, int h, int radius, int color) {
        int r = Math.max(0, Math.min(radius, Math.min(w, h) / 2));
        c.fill(x + r, y, x + w - r, y + h, color);
        for (int row = 0; row < h; row++) {
            double dy = row < r ? r - row - .5 : row >= h - r ? row - (h - r) + .5 : 0;
            int inset = dy == 0 ? 0 : (int) Math.ceil(r - Math.sqrt(r * r - dy * dy));
            c.fill(x + inset, y + row, x + r, y + row + 1, color);
            c.fill(x + w - r, y + row, x + w - inset, y + row + 1, color);
        }
    }
    /** Rounded box with a 1px outline. */
    public static void outlined(DrawContext c, int x, int y, int w, int h, int radius, int border, int fill) {
        round(c, x, y, w, h, radius, border);
        round(c, x + 1, y + 1, w - 2, h - 2, Math.max(0, radius - 1), fill);
    }
    /** Raised block: body plus a darker 2px bottom edge, pressed state drops it. */
    public static void raised(DrawContext c, int x, int y, int w, int h, int radius, int color, boolean pressed) {
        if (pressed) { round(c, x, y + 1, w, h - 1, radius, color); return; }
        round(c, x, y, w, h, radius, shade(color, .62f));
        round(c, x, y, w, h - 2, radius, color);
    }
    /** Flat, nearly square look shared by the main menu and the Right-Shift menu. */
    public static final int CORNER = 1, GLASS = 0xE00C0F13, GLASS_HOVER = 0xF0141920, EDGE = 0xFF252A32, ICON = 0xFFD7DCE1;

    /** Square switch, 22x12: accent track with a white knob when on. */
    public static void toggle(DrawContext c, int x, int y, boolean on) {
        round(c, x, y, 22, 12, CORNER, on ? accent() : 0xFF2B3038);
        round(c, on ? x + 12 : x + 2, y + 2, 8, 8, CORNER, on ? 0xFFFFFFFF : 0xFF8A939D);
    }

    /** Flat button: accent fill for the primary one, glass with an edge otherwise. */
    public static ButtonWidget button(int x, int y, int w, int h, String label, boolean primary, ButtonWidget.PressAction action) {
        return new ButtonWidget(x, y, w, h, Text.literal(label), action, narration -> narration.get()) {
            @Override
            public void playDownSound(net.minecraft.client.sound.SoundManager sounds) { SaviraSounds.play(SaviraSounds.Sound.CLICK); }
            @Override
            protected void renderWidget(DrawContext c, int mouseX, int mouseY, float delta) {
                boolean hover = isHovered() || isFocused();
                var font = MinecraftClient.getInstance().textRenderer;
                String text = font.trimToWidth(getMessage().getString(), getWidth() - 8);
                int tx = getX() + (getWidth() - font.getWidth(text)) / 2, ty = getY() + (getHeight() - 8) / 2;
                if (primary) {
                    raised(c, getX(), getY(), getWidth(), getHeight(), CORNER, hover ? shade(accent(), 1.08f) : accent(), false);
                    c.drawText(font, text, tx, ty - 1, ON_ACCENT, false);
                } else {
                    outlined(c, getX(), getY(), getWidth(), getHeight(), CORNER, hover ? accentAlpha(0xC0) : EDGE, hover ? GLASS_HOVER : GLASS);
                    c.drawTextWithShadow(font, text, tx, ty, TEXT);
                }
            }
        };
    }

    private static final Identifier LOGO = Identifier.of("savira", "textures/gui/logo.png");
    private static final Identifier LOGO_COLOR = Identifier.of("savira", "textures/gui/logo_color.png");
    private static final int LOGO_SIZE = 128;

    /**
     * The Savira logo in a 16-unit box (it fills units 1–15). Drawn in its own colours, except
     * when asked for ON_ACCENT: then it is a dark silhouette for accent-coloured buttons.
     */
    public static void logo(DrawContext c, int x, int y, int unit, int color) { logo(c, x, y, unit, color, true); }
    public static void logo(DrawContext c, int x, int y, int unit, int color, boolean shadow) {
        RenderSystem.enableBlend();
        RenderSystem.defaultBlendFunc();
        boolean silhouette = (color & 0xFFFFFF) == (ON_ACCENT & 0xFFFFFF);
        // Respect a fade the caller set (menu animations) and restore it afterwards.
        float[] base = RenderSystem.getShaderColor().clone();
        if (shadow) drawLogo(c, LOGO, x, y + unit, unit, 0x90000000, base);
        drawLogo(c, silhouette ? LOGO : LOGO_COLOR, x, y, unit, silhouette ? color : 0xFFFFFFFF, base);
        c.setShaderColor(base[0], base[1], base[2], base[3]);
    }
    /** The logo as a single-colour shape (white mask tinted), e.g. for the Icon module previews. */
    public static void logoTinted(DrawContext c, int x, int y, int unit, int color) {
        RenderSystem.enableBlend();
        float[] base = RenderSystem.getShaderColor().clone();
        drawLogo(c, LOGO, x, y, unit, color, base);
        c.setShaderColor(base[0], base[1], base[2], base[3]);
    }
    // The shader colour tints the white mask (and leaves the colour version as it is when white).
    private static void drawLogo(DrawContext c, Identifier texture, int x, int y, int unit, int color, float[] base) {
        c.setShaderColor(base[0] * (color >> 16 & 0xFF) / 255f, base[1] * (color >> 8 & 0xFF) / 255f, base[2] * (color & 0xFF) / 255f, base[3] * (color >>> 24) / 255f);
        c.getMatrices().push();
        c.getMatrices().translate(x + unit, y + unit, 0);
        float scale = 14f * unit / LOGO_SIZE;
        c.getMatrices().scale(scale, scale, 1f);
        c.drawTexture(texture, 0, 0, 0, 0, LOGO_SIZE, LOGO_SIZE, LOGO_SIZE, LOGO_SIZE);
        c.getMatrices().pop();
    }
}

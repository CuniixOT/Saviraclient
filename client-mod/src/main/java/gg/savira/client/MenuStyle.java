package gg.savira.client;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.text.Text;

public final class MenuStyle {
    public static final int TEXT = 0xFFEEF1F4, MUTED = 0xFF8A939D, ON_ACCENT = 0xFF0B0D10;
    public static final int PANEL = 0xF00D1014, SIDEBAR = 0xFF0A0C0F, SURFACE = 0xFF161A1F, SURFACE_HOVER = 0xFF1F242B, LINE = 0xFF272C34;
    private MenuStyle() {}

    /** Fixed Savira mint for the mod menu and HUD: they keep the brand colour whatever the launcher uses. */
    public static final int BRAND = 0xFF5CCF95;
    public static int accent() { return BRAND; }
    /** The launcher accent; only the Savira main menu (title screen) follows it. */
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
    public static void panel(DrawContext c, int x, int y, int w, int h) {
        round(c, x - 4, y + 5, w + 8, h + 6, 12, 0x60000000);
        outlined(c, x, y, w, h, 9, LINE, PANEL);
    }
    /** Small switch, 22x12, matching the launcher's square-ish toggles. */
    public static void toggle(DrawContext c, int x, int y, boolean on) {
        round(c, x, y, 22, 12, 3, on ? accent() : 0xFF2B3038);
        round(c, on ? x + 12 : x + 2, y + 2, 8, 8, 2, on ? 0xFFFFFFFF : 0xFFAEB5BD);
    }

    private static void label(DrawContext c, String text, int x, int y, int w, int h, int color, boolean pressedOffset) {
        var font = MinecraftClient.getInstance().textRenderer;
        c.drawCenteredTextWithShadow(font, font.trimToWidth(text, w - 8), x + w / 2, y + (h - 8) / 2 - (pressedOffset ? 0 : 1), color);
    }

    public static ButtonWidget button(int x, int y, int w, int h, String label, boolean primary, ButtonWidget.PressAction action) {
        return new ButtonWidget(x, y, w, h, Text.literal(label), action, narration -> narration.get()) {
            @Override
            protected void renderWidget(DrawContext c, int mouseX, int mouseY, float delta) {
                boolean hover = isHovered() || isFocused();
                if (primary) {
                    raised(c, getX(), getY(), getWidth(), getHeight(), 4, hover ? shade(accent(), 1.08f) : accent(), false);
                    // The vanilla shadow would look muddy on a light accent.
                    var font = MinecraftClient.getInstance().textRenderer;
                    String text = font.trimToWidth(getMessage().getString(), getWidth() - 8);
                    c.drawText(font, text, getX() + (getWidth() - font.getWidth(text)) / 2, getY() + (getHeight() - 8) / 2 - 1, ON_ACCENT, false);
                } else {
                    round(c, getX(), getY(), getWidth(), getHeight(), 4, hover ? accentAlpha(0xB0) : LINE);
                    raised(c, getX() + 1, getY() + 1, getWidth() - 2, getHeight() - 2, 3, hover ? SURFACE_HOVER : SURFACE, false);
                    MenuStyle.label(c, getMessage().getString(), getX(), getY(), getWidth(), getHeight(), TEXT, false);
                }
            }
        };
    }

    /** Sidebar entry: accent bar and tinted fill when selected. */
    public static ButtonWidget navButton(int x, int y, int w, int h, String label, String count, boolean selected, ButtonWidget.PressAction action) {
        return new ButtonWidget(x, y, w, h, Text.literal(label), action, narration -> narration.get()) {
            @Override
            protected void renderWidget(DrawContext c, int mouseX, int mouseY, float delta) {
                boolean hover = isHovered() || isFocused();
                if (selected) { round(c, getX(), getY(), getWidth(), getHeight(), 4, accentAlpha(0x2C)); c.fill(getX(), getY() + 4, getX() + 2, getY() + getHeight() - 4, accent()); }
                else if (hover) round(c, getX(), getY(), getWidth(), getHeight(), 4, 0x14FFFFFF);
                var font = MinecraftClient.getInstance().textRenderer;
                c.drawText(font, getMessage().getString(), getX() + 9, getY() + (getHeight() - 8) / 2, selected ? accent() : hover ? TEXT : MUTED, false);
                c.drawText(font, count, getX() + getWidth() - 7 - font.getWidth(count), getY() + (getHeight() - 8) / 2, 0xFF5D656F, false);
            }
        };
    }

    public static ButtonWidget iconButton(int x, int y, int w, int h, String label, Item icon, ButtonWidget.PressAction action) {
        return new ButtonWidget(x, y, w, h, Text.literal(label), action, narration -> narration.get()) {
            @Override
            protected void renderWidget(DrawContext c, int mouseX, int mouseY, float delta) {
                boolean hover = isHovered() || isFocused();
                round(c, getX(), getY(), getWidth(), getHeight(), 5, hover ? accent() : LINE);
                raised(c, getX() + 1, getY() + 1, getWidth() - 2, getHeight() - 2, 4, hover ? SURFACE_HOVER : 0xF0101317, false);
                c.drawItem(new ItemStack(icon), getX() + (getWidth() - 16) / 2, getY() + 6);
                var font = MinecraftClient.getInstance().textRenderer;
                String text = font.trimToWidth(getMessage().getString().toLowerCase(), getWidth() - 4);
                c.drawCenteredTextWithShadow(font, text, getX() + getWidth() / 2, getY() + getHeight() - 13, hover ? TEXT : MUTED);
            }
        };
    }

    public enum Variant { NORMAL, ACCENT, DANGER }

    /** Main-menu button: item icon on the left, label centred, three colour variants. */
    public static ButtonWidget menuButton(int x, int y, int w, int h, String label, Item icon, Variant variant, ButtonWidget.PressAction action) {
        return new ButtonWidget(x, y, w, h, Text.literal(label), action, narration -> narration.get()) {
            @Override
            protected void renderWidget(DrawContext c, int mouseX, int mouseY, float delta) {
                boolean hover = isHovered() || isFocused();
                var font = MinecraftClient.getInstance().textRenderer;
                int textColor = TEXT;
                switch (variant) {
                    case ACCENT -> { raised(c, getX(), getY(), getWidth(), getHeight(), 4, hover ? shade(launcherAccent(), 1.1f) : launcherAccent(), false); textColor = ON_ACCENT; }
                    case DANGER -> {
                        round(c, getX(), getY(), getWidth(), getHeight(), 4, hover ? 0xFFE5484D : 0xFF7A2A2E);
                        raised(c, getX() + 1, getY() + 1, getWidth() - 2, getHeight() - 2, 3, hover ? 0xFFB3363B : 0xF0401B1E, false);
                    }
                    default -> {
                        round(c, getX(), getY(), getWidth(), getHeight(), 4, hover ? launcherAccentAlpha(0xC0) : 0xFF2A2F37);
                        raised(c, getX() + 1, getY() + 1, getWidth() - 2, getHeight() - 2, 3, hover ? 0xF0222831 : 0xE0121519, false);
                    }
                }
                int textWidth = font.getWidth(getMessage());
                int contentWidth = (icon != null ? 14 : 0) + textWidth;
                int left = getX() + (getWidth() - contentWidth) / 2;
                if (icon != null) {
                    // Items are 16px; scale to 12px so they sit like font icons next to the label.
                    c.getMatrices().push();
                    c.getMatrices().translate(left, getY() + (getHeight() - 12) / 2f - 1, 0);
                    c.getMatrices().scale(.75f, .75f, 1);
                    c.drawItem(new ItemStack(icon), 0, 0);
                    c.getMatrices().pop();
                    left += 14;
                }
                if (variant == Variant.ACCENT) c.drawText(font, getMessage(), left, getY() + (getHeight() - 8) / 2, textColor, false);
                else c.drawTextWithShadow(font, getMessage(), left, getY() + (getHeight() - 8) / 2, textColor);
            }
        };
    }

    /** The Savira pixel "S" (same shape as the launcher logo) on a 16-unit grid. */
    public static void logo(DrawContext c, int x, int y, int unit, int color) { logo(c, x, y, unit, color, true); }
    public static void logo(DrawContext c, int x, int y, int unit, int color, boolean shadow) {
        int[][] rects = {{2, 1, 14, 4}, {2, 4, 5, 6}, {2, 6, 14, 9}, {11, 9, 14, 12}, {2, 12, 14, 15}};
        int dark = shade(color, .58f);
        if (shadow) for (int[] r : rects) c.fill(x + r[0] * unit, y + r[1] * unit + unit, x + r[2] * unit, y + r[3] * unit + unit, dark);
        for (int[] r : rects) c.fill(x + r[0] * unit, y + r[1] * unit, x + r[2] * unit, y + r[3] * unit, color);
    }
}

package gg.savira.client;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.font.TextRenderer;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.text.Style;
import net.minecraft.text.Text;
import net.minecraft.util.Identifier;

/**
 * Text in the Right-Shift menu. Titles, labels and buttons use the small-caps pixel font NoRisk
 * uses (assets/savira/font/caps.json); descriptions and values the normal Minecraft font.
 * Sizes are NoRisk's font sizes; positions are menu units (NoRisk pixels at 1280x720).
 */
public final class MenuText {
    public static final Identifier CAPS = Identifier.of("savira", "caps");
    /** Label size and title size of the caps font in NoRisk's menu. */
    public static final float LABEL = 12f, TITLE = 15f, TINY = 9f;
    private static float perSize = -1;
    private MenuText() {}

    private static TextRenderer font() { return MinecraftClient.getInstance().textRenderer; }
    public static Text caps(String text) { return Text.literal(text).setStyle(Style.EMPTY.withFont(CAPS)); }

    /**
     * Minecraft sizes TTF fonts by line height, NoRisk by em: measure once how wide "HUD SCALE"
     * comes out and scale so it is 62 units at size 11.92, as in NoRisk's menu.
     */
    public static void calibrate() {
        int width = font().getWidth(caps("HUD SCALE"));
        perSize = width > 0 ? 62f / (width * 11.92f) : 1 / 12f;
    }
    public static float scale(float size) { if (perSize < 0) calibrate(); return size * perSize; }
    public static int width(String text, float size) { return Math.round(font().getWidth(caps(text)) * scale(size)); }
    /** Height of capital letters, for centring caps text in a box. */
    public static float capHeight(float size) { return size * .58f; }

    public static void caps(DrawContext c, String text, float x, float y, float size, int color) {
        float s = scale(size);
        c.getMatrices().push();
        c.getMatrices().translate(x, y, 0);
        c.getMatrices().scale(s, s, 1);
        c.drawText(font(), caps(text), 0, 0, color, false);
        c.getMatrices().pop();
    }
    /** Caps text centred vertically on y (the middle of its capitals). */
    public static void capsMiddle(DrawContext c, String text, float x, float middle, float size, int color) {
        caps(c, text, x, middle - capHeight(size) / 2f, size, color);
    }
    public static void capsCentered(DrawContext c, String text, float centerX, float middle, float size, int color) {
        capsMiddle(c, text, centerX - width(text, size) / 2f, middle, size, color);
    }

    /** Minecraft font at the given scale (1 = NoRisk's description size). */
    public static void plain(DrawContext c, String text, float x, float y, float scale, int color) {
        c.getMatrices().push();
        c.getMatrices().translate(x, y, 0);
        c.getMatrices().scale(scale, scale, 1);
        c.drawText(font(), text, 0, 0, color, false);
        c.getMatrices().pop();
    }
    public static void plain(DrawContext c, net.minecraft.text.OrderedText text, float x, float y, float scale, int color) {
        c.getMatrices().push();
        c.getMatrices().translate(x, y, 0);
        c.getMatrices().scale(scale, scale, 1);
        c.drawText(font(), text, 0, 0, color, false);
        c.getMatrices().pop();
    }
}

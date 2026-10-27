package gg.savira.client;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.font.TextRenderer;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.text.Style;
import net.minecraft.text.Text;
import net.minecraft.util.Identifier;
import org.joml.Vector3f;

/**
 * Sharp Inter text for screens laid out in reference units (u gui units per unit).
 * Minecraft draws font glyphs without filtering, so a scaled font loses pixels. Inter therefore
 * comes in one font per pixel size (font/ui_<size>.json); each text picks the size that matches
 * the screen and is drawn one glyph pixel per screen pixel, on the pixel grid: sharp at every scale.
 * Scale 1 is the size Minecraft's 9 pixel font had at scale 1 (Inter at .87 of it).
 */
public final class UiText {
    private UiText() {}
    private static final int[] SIZES = {6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 26, 28, 30, 32, 34, 36, 38, 40};
    private static final Identifier[] FONTS = new Identifier[41];

    private static TextRenderer font() { return MinecraftClient.getInstance().textRenderer; }
    private static int size(float scale, float px) {
        int want = Math.round(9 * .87f * scale * px), best = SIZES[0];
        for (int size : SIZES) if (Math.abs(size - want) < Math.abs(best - want)) best = size;
        return best;
    }
    private static Text text(String s, int size) {
        if (FONTS[size] == null) FONTS[size] = Identifier.of("savira", "ui_" + size);
        return Text.literal(s).setStyle(Style.EMPTY.withFont(FONTS[size]));
    }

    public static void draw(DrawContext c, String s, float x, float y, float scale, int color, boolean shadow, boolean bold, float u) {
        float px = Paint.pixels(u);
        int size = size(scale, px);
        Text t = text(s, size);
        // The baseline where the 9 pixel font had it, moved onto the nearest screen pixel.
        float baseline = y + 7.5f * .87f * scale;
        Vector3f at = c.getMatrices().peek().getPositionMatrix().transformPosition(x, baseline, 0, new Vector3f());
        double gui = MinecraftClient.getInstance().getWindow().getScaleFactor();
        float dx = (float) ((Math.round(at.x * gui) / gui - at.x) / u), dy = (float) ((Math.round(at.y * gui) / gui - at.y) / u);
        c.getMatrices().push();
        c.getMatrices().translate(x + dx, baseline + dy, 0);
        c.getMatrices().scale(1 / px, 1 / px, 1);
        // Glyphs sit with their baseline 7 font pixels below the drawing position.
        if (shadow) c.drawText(font(), t, 0, -7 + Math.max(1, Math.round(size / 9f)), (color >>> 24) / 3 << 24, false);
        c.drawText(font(), t, 0, -7, color, false);
        if (bold) c.drawText(font(), t, 1, -7, color, false);
        c.getMatrices().pop();
    }
    public static void centered(DrawContext c, String s, float cx, float y, float scale, int color, boolean bold, float u) {
        draw(c, s, cx - width(s, scale, u) / 2f, y, scale, color, false, bold, u);
    }
    public static float width(String s, float scale, float u) {
        float px = Paint.pixels(u);
        return font().getWidth(text(s, size(scale, px))) / px;
    }
    public static String trim(String s, float maxWidth, float scale, float u) {
        float px = Paint.pixels(u);
        return font().trimToWidth(text(s, size(scale, px)), (int) (maxWidth * px)).getString();
    }
}

package gg.savira.client;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.font.TextRenderer;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.text.Style;
import net.minecraft.text.Text;
import net.minecraft.util.Identifier;
import org.joml.Vector3f;
import java.util.HashMap;
import java.util.Map;

/**
 * Type of the in-game menus, the same as the launcher's: Minecraft Ten for titles and labels,
 * SmallCaps in lower case for small labels (the launcher's .pixel), Geist for text; Phosphor icons.
 * Minecraft Ten is drawn at .75 of the size, on its pixel grid (multiples of 4 and 8), to match the design.
 *
 * Minecraft draws font glyphs without filtering, so a scaled font loses pixels. Each family
 * therefore comes in one font per pixel size (font/px_18.json …, see scripts/menu-fonts.mjs); a
 * text picks the size matching the screen and is drawn one glyph pixel per screen pixel, on the
 * pixel grid. Sizes are the design's CSS pixels; u is gui units per design pixel.
 */
public final class MenuType {
    private MenuType() {}

    public enum Face {
        PIXEL("px", .875f, .75f, false), SILK("sk", .5f, 1.1f, true), INTER("ui", .71f, 1f, false), ICON("ic", 0, 1, false), ICON_FILL("icf", 0, 1, false);
        final String prefix;
        /** Height of the letters drawn (capitals, or small capitals in lower case) in em, to centre them on a line. */
        final float cap;
        /** Size of this face for a design size, so the families match each other. */
        final float scale;
        /** Written in lower case, which this font shows as small capitals. */
        final boolean lower;
        int[] sizes;
        Face(String prefix, float cap, float scale, boolean lower) { this.prefix = prefix; this.cap = cap; this.scale = scale; this.lower = lower; }
    }
    static {
        Face.PIXEL.sizes = sizes(8, 28, 4, 32, 80, 8);
        Face.SILK.sizes = sizes(6, 30, 1, 0, -1, 1);
        Face.INTER.sizes = sizes(6, 24, 1, 26, 40, 2);
        Face.ICON.sizes = sizes(8, 30, 1, 32, 44, 2);
        Face.ICON_FILL.sizes = sizes(12, 44, 2, 0, -1, 1);
    }
    private static int[] sizes(int a, int b, int stepA, int c, int d, int stepC) {
        java.util.List<Integer> list = new java.util.ArrayList<>();
        for (int i = a; i <= b; i += stepA) list.add(i);
        for (int i = c; i <= d; i += stepC) list.add(i);
        return list.stream().mapToInt(Integer::intValue).toArray();
    }
    private static final Map<String, Identifier> FONTS = new HashMap<>();

    private static TextRenderer font() { return MinecraftClient.getInstance().textRenderer; }
    private static int size(Face face, float px) {
        int best = face.sizes[0];
        for (int s : face.sizes) if (Math.abs(s - px) < Math.abs(best - px)) best = s;
        return best;
    }
    private static Text text(Face face, String s, int size) {
        Identifier id = FONTS.computeIfAbsent(face.prefix + "_" + size, key -> Identifier.of("savira", key));
        return Text.literal(s).setStyle(Style.EMPTY.withFont(id));
    }
    /** Screen pixels per design pixel. */
    private static float px(float u) { return Paint.pixels(u); }

    /** Text with its baseline at y. Letter spacing in em, like CSS letter-spacing. */
    public static void baseline(DrawContext c, Face face, String s, float x, float y, float size, int color, float spacing, float u) {
        if (face.lower) s = s.toLowerCase(java.util.Locale.ROOT);
        size *= face.scale;
        float px = px(u);
        int fontSize = size(face, size * px);
        // Snap the start onto the screen's pixel grid.
        Vector3f at = c.getMatrices().peek().getPositionMatrix().transformPosition(x, y, 0, new Vector3f());
        double gui = MinecraftClient.getInstance().getWindow().getScaleFactor();
        float dx = (float) ((Math.round(at.x * gui) / gui - at.x) / u), dy = (float) ((Math.round(at.y * gui) / gui - at.y) / u);
        c.getMatrices().push();
        c.getMatrices().translate(x + dx, y + dy, 0);
        c.getMatrices().scale(1 / px, 1 / px, 1);
        if (spacing == 0) c.drawText(font(), text(face, s, fontSize), 0, -7, color, false);
        else {
            // Letter by letter, each gap widened by the spacing.
            float gap = Math.round(spacing * fontSize), cx = 0;
            for (int i = 0; i < s.length(); ) {
                int cp = s.codePointAt(i), n = Character.charCount(cp);
                Text ch = text(face, s.substring(i, i + n), fontSize);
                c.drawText(font(), ch, Math.round(cx), -7, color, false);
                cx += font().getWidth(ch) + gap;
                i += n;
            }
        }
        c.getMatrices().pop();
    }
    public static void baseline(DrawContext c, Face face, String s, float x, float y, float size, int color, float u) { baseline(c, face, s, x, y, size, color, 0, u); }

    /** Text whose capitals are centred on the line at y. */
    public static void middle(DrawContext c, Face face, String s, float x, float y, float size, int color, float spacing, float u) {
        baseline(c, face, s, x, y + face.cap * face.scale * size / 2f, size, color, spacing, u);
    }
    public static void middle(DrawContext c, Face face, String s, float x, float y, float size, int color, float u) { middle(c, face, s, x, y, size, color, 0, u); }
    public static void centered(DrawContext c, Face face, String s, float cx, float y, float size, int color, float spacing, float u) {
        middle(c, face, s, cx - width(face, s, size, spacing, u) / 2f, y, size, color, spacing, u);
    }

    /** A Phosphor icon centred on (cx, cy); size is the icon's font size in design pixels. */
    public static void icon(DrawContext c, char glyph, float cx, float cy, float size, int color, boolean fill, float u) {
        Face face = fill ? Face.ICON_FILL : Face.ICON;
        // Phosphor's em box runs from 64 below to 960 above the baseline (of 1024).
        baseline(c, face, String.valueOf(glyph), cx - size / 2f, cy + size * 448f / 1024f, size, color, u);
    }

    public static float width(Face face, String s, float size, float spacing, float u) {
        if (face.lower) s = s.toLowerCase(java.util.Locale.ROOT);
        size *= face.scale;
        float px = px(u);
        int fontSize = size(face, size * px);
        float w = font().getWidth(text(face, s, fontSize));
        if (spacing != 0) w += Math.round(spacing * fontSize) * Math.max(0, s.codePointCount(0, s.length()) - 1);
        return w / px;
    }
    public static float width(Face face, String s, float size, float u) { return width(face, s, size, 0, u); }

    /** Cuts the text with an ellipsis so it fits into maxWidth. */
    public static String fit(Face face, String s, float size, float maxWidth, float u) {
        if (width(face, s, size, u) <= maxWidth) return s;
        String cut = s;
        while (cut.length() > 1 && width(face, cut + "…", size, u) > maxWidth) cut = cut.substring(0, cut.length() - 1);
        return cut.stripTrailing() + "…";
    }

    /** Wraps text into lines no wider than maxWidth. */
    public static java.util.List<String> wrap(Face face, String s, float size, float maxWidth, float u) {
        java.util.List<String> lines = new java.util.ArrayList<>();
        StringBuilder line = new StringBuilder();
        for (String word : s.split(" ")) {
            String next = line.isEmpty() ? word : line + " " + word;
            if (!line.isEmpty() && width(face, next, size, u) > maxWidth) { lines.add(line.toString()); line = new StringBuilder(word); }
            else line = new StringBuilder(next);
        }
        if (!line.isEmpty()) lines.add(line.toString());
        return lines;
    }

    /** Phosphor code points used by the menu. */
    public static final char LIGHTNING = '', SHIRT = '', USERS = '', SUN = '', MOON = '', GEAR = '',
        X = '', SEARCH = '', CARET_LEFT = '', CARET_RIGHT = '', RESET = '', CHECK = '', PLUS = '',
        DOWNLOAD = '', UPLOAD = '', COPY = '', TRASH = '', PLAY = '', GAUGE = '', CURSOR_CLICK = '',
        KEYBOARD = '', WIFI = '', MAP_PIN = '', SHIELD = '', FLASK = '', RUN = '', ZOOM = '',
        MEMORY = '', BADGE = '', TAG = '', LIGHTBULB = '', SMILEY = '', PALETTE = '', CIRCLE_HALF = '',
        SPARKLE = '', LAYOUT = '', SPEAKER = '', LOCK = '', HAND_WAVING = '', GRID = '', PENCIL = '',
        USER = '', COIN = '', LINK = '', BRUSH = '', CART = '', CHAT_TEXT = '', TRANSLATE = '',
        EYE = '', IMAGE = '', MOUNTAINS = '', CARET_DOWN = '', CHAT_DOTS = '', GITHUB = '', INFO = '', CARET_UP = '';
}

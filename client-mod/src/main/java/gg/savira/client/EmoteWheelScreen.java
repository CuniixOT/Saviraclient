package gg.savira.client;

import com.mojang.blaze3d.systems.RenderSystem;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.text.Text;
import net.minecraft.util.Util;
import org.lwjgl.glfw.GLFW;

/**
 * The emote wheel: your player in the middle, eight slots around it, five pages.
 * Left click plays the emote, right click (or a click on an empty slot) opens the emote list for
 * that slot; the mouse wheel or the arrow keys turn the page, 1 to 8 play a slot directly.
 * Laid out in reference units: a 720 high screen.
 */
public final class EmoteWheelScreen extends Screen {
    private static final int BOX_W = 78, BOX_H = 92, RADIUS_X = 196, RADIUS_Y = 150;
    private static int page;
    private float u = 1;
    private int sw, sh, hovered = -1;
    private long openedAt = Util.getMeasuringTimeMs(), pageAt, hoverAt;
    private int pageFrom = -1;
    /** Each slot's hover, eased in and out. */
    private final float[] hover = new float[Emotes.SLOTS];
    private long lastFrame;

    public EmoteWheelScreen() { super(Text.literal("Emotes")); }
    /** Back from the emote list: no intro again, same page. */
    EmoteWheelScreen(boolean quiet) { this(); if (quiet) openedAt = 0; }

    public static int page() { return page; }

    @Override
    protected void init() {
        u = height / 720f;
        sw = Math.round(width / u); sh = Math.round(height / u);
    }

    private float slotX(int i) { return sw / 2f + RADIUS_X * (float) Math.cos(Math.toRadians(-90 + i * 45)); }
    private float slotY(int i) { return sh / 2f - 20 + RADIUS_Y * (float) Math.sin(Math.toRadians(-90 + i * 45)); }
    private int slotAt(double mx, double my) {
        for (int i = 0; i < Emotes.SLOTS; i++) if (Math.abs(mx - slotX(i)) <= BOX_W / 2f && Math.abs(my - slotY(i)) <= BOX_H / 2f) return i;
        return -1;
    }
    private int index(int slot) { return page * Emotes.SLOTS + slot; }
    private static float ease(float t) { t = Math.clamp(t, 0f, 1f); return 1 - (1 - t) * (1 - t) * (1 - t); }

    @Override
    public void renderBackground(DrawContext c, int mouseX, int mouseY, float delta) {
        // The world stays visible: only a soft shade towards the edges.
        c.fillGradient(0, 0, width, height / 2, 0x66000000, 0x22000000);
        c.fillGradient(0, height / 2, width, height, 0x22000000, 0x77000000);
    }

    @Override
    public void render(DrawContext c, int mouseX, int mouseY, float delta) {
        renderBackground(c, mouseX, mouseY, delta);
        long now = Util.getMeasuringTimeMs();
        float dt = lastFrame == 0 ? 0 : Math.min(.1f, (now - lastFrame) / 1000f);
        lastFrame = now;
        double mx = mouseX / u, my = mouseY / u;
        int over = slotAt(mx, my);
        if (over != hovered) { hovered = over; hoverAt = now; }
        float px = Paint.pixels(u);
        RenderSystem.enableBlend();
        c.getMatrices().push();
        c.getMatrices().scale(u, u, 1);

        // Your player in the middle, showing the emote under the mouse.
        float intro = ease((now - openedAt) / 360f);
        Emote preview = hovered >= 0 ? Emotes.slot(index(hovered)) : null;
        float cx = sw / 2f, feet = sh / 2f + 52;
        RenderSystem.setShaderColor(1f, 1f, 1f, Math.max(.01f, intro));
        Emotes.drawFigure(c, cx, feet + (1 - intro) * 10, 62, 0, preview, (now - hoverAt) / 1000f, (float) (mx - cx) / 300f, (float) (my - (feet - 100)) / 300f);
        RenderSystem.setShaderColor(1f, 1f, 1f, 1f);

        // Page under the player: "‹  1 / 5  ›".
        String pageText = (page + 1) + " / " + Emotes.PAGES;
        UiText.centered(c, pageText, cx, feet + 14, 1.3f, 0xFFFFFFFF, true, u);
        float pw = UiText.width(pageText, 1.3f, u) / 2 + 14;
        UiText.centered(c, "‹", cx - pw, feet + 13, 1.5f, onArrow(mx, my) < 0 ? 0xFFFFFFFF : 0x99FFFFFF, true, u);
        UiText.centered(c, "›", cx + pw, feet + 13, 1.5f, onArrow(mx, my) > 0 ? 0xFFFFFFFF : 0x99FFFFFF, true, u);

        // Slots: they open outwards from the middle, one after the other; a new page fades in.
        float turn = ease((now - pageAt) / 260f);
        for (int i = 0; i < Emotes.SLOTS; i++) {
            hover[i] += ((i == hovered ? 1 : 0) - hover[i]) * (1 - (float) Math.exp(-dt * 16));
            float k = ease((now - openedAt - i * 28) / 320f) * (pageFrom >= 0 ? turn : 1);
            drawSlot(c, i, k, px, now);
        }

        String hint = "Linksklick: abspielen   ·   Rechtsklick: ändern   ·   Mausrad: Seite";
        UiText.centered(c, hint, cx, sh - 30, .95f, 0xB3FFFFFF, false, u);
        c.getMatrices().pop();
        SaviraToasts.render(c, width);
    }

    private void drawSlot(DrawContext c, int i, float k, float px, long now) {
        Emote emote = Emotes.slot(index(i));
        float h = hover[i], x = slotX(i), y = slotY(i);
        // From the middle out to its place, growing a little on hover.
        float ox = (sw / 2f - x) * (1 - k), oy = (sh / 2f - 20 - y) * (1 - k), scale = (.85f + .15f * k) * (1 + .06f * h);
        RenderSystem.setShaderColor(1f, 1f, 1f, Math.max(.01f, k));
        c.getMatrices().push();
        c.getMatrices().translate(x + ox, y + oy, 0);
        c.getMatrices().scale(scale, scale, 1);
        float x0 = -BOX_W / 2f, y0 = -BOX_H / 2f;
        int rarity = emote == null ? 0xFFFFFFFF : emote.rarity().color;
        Paint.gradient(c, x0, y0, BOX_W, BOX_H, 7, Paint.lerp(0x38000000, 0x40FFFFFF, h * .5f), Paint.lerp(0x55000000, 0x66000000, h), px * scale);
        if (emote != null) Paint.gradient(c, x0, y0 + BOX_H * .55f, BOX_W, BOX_H * .45f, 7, rarity & 0x00FFFFFF, (Math.round(0x40 + 0x30 * h) << 24) | rarity & 0xFFFFFF, px * scale);
        Paint.outline(c, x0, y0, BOX_W, BOX_H, 7, Paint.lerp(0x33FFFFFF, 0xE6FFFFFF, h), px * scale);
        if (emote == null) {
            UiText.centered(c, "+", 0, -12, 2.4f, Paint.lerp(0x99FFFFFF, 0xFFFFFFFF, h), false, u * scale);
            UiText.centered(c, "LEER", 0, 18, .85f, 0x80FFFFFF, true, u * scale);
        } else {
            float t = i == hovered ? (now - hoverAt) / 1000f : emote.length() * .4f;
            Emotes.drawFigure(c, 0, y0 + BOX_H - 15, 38, 20, emote, t, 0, 0);
            c.getMatrices().translate(0, 0, 300);
            String name = UiText.trim(emote.label(), BOX_W - 8, .85f, u * scale);
            UiText.centered(c, name, 0, y0 + BOX_H - 11, .85f, 0xFFFFFFFF, true, u * scale);
        }
        // Slot number, for the 1 to 8 keys.
        UiText.draw(c, Integer.toString(i + 1), x0 + 6, y0 + 5, .8f, 0x80FFFFFF, false, false, u * scale);
        c.getMatrices().pop();
        RenderSystem.setShaderColor(1f, 1f, 1f, 1f);
    }

    /** -1 over the left page arrow, 1 over the right one, 0 elsewhere. */
    private int onArrow(double mx, double my) {
        float cx = sw / 2f, y = sh / 2f + 52 + 18, pw = UiText.width((page + 1) + " / " + Emotes.PAGES, 1.3f, u) / 2 + 14;
        if (Math.abs(my - y) > 9) return 0;
        if (Math.abs(mx - (cx - pw)) < 9) return -1;
        if (Math.abs(mx - (cx + pw)) < 9) return 1;
        return 0;
    }
    private void turn(int step) {
        pageFrom = page;
        page = Math.floorMod(page + step, Emotes.PAGES);
        pageAt = Util.getMeasuringTimeMs();
        SaviraSounds.play(SaviraSounds.Sound.CLICK);
    }

    private void playSlot(int slot) {
        Emote emote = Emotes.slot(index(slot));
        if (emote == null) { edit(slot); return; }
        if (Emotes.play(emote)) { SaviraSounds.play(SaviraSounds.Sound.ON); close(); }
    }
    private void edit(int slot) {
        SaviraSounds.play(SaviraSounds.Sound.WINDOW);
        client.setScreen(new EmotePickerScreen(index(slot)));
    }

    @Override
    public boolean mouseClicked(double mouseX, double mouseY, int button) {
        double mx = mouseX / u, my = mouseY / u;
        int arrow = onArrow(mx, my);
        if (arrow != 0 && button == 0) { turn(arrow); return true; }
        int slot = slotAt(mx, my);
        if (slot < 0) return super.mouseClicked(mouseX, mouseY, button);
        if (button == 1) edit(slot);
        else if (button == 0) playSlot(slot);
        return true;
    }
    @Override
    public boolean mouseScrolled(double mouseX, double mouseY, double horizontal, double vertical) {
        if (vertical != 0) turn(vertical > 0 ? -1 : 1);
        return true;
    }
    @Override
    public boolean keyPressed(int key, int scan, int modifiers) {
        if (SaviraClient.emoteKey.matchesKey(key, scan)) { close(); return true; }
        if (key >= GLFW.GLFW_KEY_1 && key <= GLFW.GLFW_KEY_8) { playSlot(key - GLFW.GLFW_KEY_1); return true; }
        if (key == GLFW.GLFW_KEY_LEFT || key == GLFW.GLFW_KEY_RIGHT) { turn(key == GLFW.GLFW_KEY_LEFT ? -1 : 1); return true; }
        return super.keyPressed(key, scan, modifiers);
    }
    @Override
    public boolean shouldPause() { return false; }

    /** For the UI test. */
    public void playSlotForTest(int slot) { playSlot(slot); }
}

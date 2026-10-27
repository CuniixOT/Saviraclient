package gg.savira.client;

import com.mojang.blaze3d.systems.RenderSystem;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.PlayerSkinDrawer;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.util.InputUtil;
import net.minecraft.text.Text;
import net.minecraft.util.Util;
import org.lwjgl.glfw.GLFW;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;
import java.util.function.DoubleConsumer;
import java.util.function.DoubleFunction;
import java.util.function.DoubleSupplier;
import java.util.function.IntConsumer;
import java.util.function.IntSupplier;
import java.util.function.Supplier;

import static gg.savira.client.MenuType.Face.INTER;
import static gg.savira.client.MenuType.Face.PIXEL;
import static gg.savira.client.MenuType.Face.SILK;

/**
 * Savira's Right-Shift menu, built after the design "Rshift Menu v5": a rail on the left (Mods,
 * Cosmetics, Freunde, HUD-Editor; light/dark and settings at the bottom) and the window with the
 * top bar (Savira, version, active modules, profile, close) and the page.
 *
 * Pages: the mod grid with search and the profiles tab, a mod's settings in sections, Cosmetics and
 * Freunde (coming soon), the menu settings (accent, look, behaviour) and the HUD editor, where the
 * HUD elements are dragged, resized, nudged with the arrow keys and hidden.
 *
 * Everything is laid out in the design's CSS pixels; u is gui units per design pixel, so the menu
 * keeps the design's proportions at every window size and GUI scale. Controls are drawn directly
 * and register their click areas each frame.
 */
public final class HudScreen extends Screen {
    private enum Page { MODS, DETAIL, COSMETICS, FRIENDS, SETTINGS, EDITOR }
    private record Hit(float x, float y, float w, float h, String label, Runnable left, Runnable right, float[] clip) {
        boolean contains(double mx, double my) {
            return mx >= x && mx < x + w && my >= y && my < y + h && (clip == null || mx >= clip[0] && mx < clip[2] && my >= clip[1] && my < clip[3]);
        }
    }
    /** One row of a settings section. Toggles take half a line, everything else the whole line. */
    private record Row(String label, Kind kind, Object control) {}
    private enum Kind { SLIDER, ENUM, COLOR, TOGGLE, KEY, TEXT, ICONS }
    private record Slider(double min, double max, double step, double reset, DoubleSupplier get, DoubleConsumer set, DoubleFunction<String> format) {}
    private record Cycle(Supplier<String> value, IntConsumer step) {}
    private record Swatch(IntSupplier get, IntConsumer set) {}
    private record Toggle(BooleanSupplier get, Runnable flip) {}
    private record Field(Supplier<String> get, Consumer<String> set, String placeholder) {}
    private record Section(String title, List<Row> rows) {}

    private static final int RAIL = 60, GAP = 10, TOP_BAR = 52, ROW_H = 50, PAD_X = 24;

    private Page page = Page.MODS;
    private boolean profilesTab;
    private HudModule editing;
    private float u = 1, sw, sh;
    private float wx, wy, ww, wh, mainX, mainW;
    private double mouseX, mouseY;
    private final List<Hit> hits = new ArrayList<>();
    private List<Hit> lastHits = List.of();
    private float[] clip;
    private final long openedAt = Util.getMeasuringTimeMs();
    private long pageAt = openedAt, lastFrame;
    private float dt, windowAlpha = 1;
    private final Map<String, Float> anims = new HashMap<>();
    // Scrolling content of the page.
    private float scroll, scrollPos, maxScroll, bodyTop, bodyBottom;
    private boolean draggingBar;
    // Text input: the search, or the text of a HUD module.
    private String query = "";
    private Field typing;
    /** What is typed into the focused field; it may be empty while the setting falls back to its default. */
    private String buffer = "";
    private KeyBinding listening;
    private Slider sliding;
    private float slideX, slideW;
    private ColorPicker picker;
    private String saveError = "";
    // HUD editor, in screen (gui) coordinates.
    private HudModule selected, dragging;
    private boolean resizing;
    private double grabX, grabY;
    private float initialSize;

    public HudScreen() { super(Text.literal("Savira · Mod-Menü")); }

    /** Gui units per design pixel for a screen of this size. */
    public static float unitFor(int width, int height) { return Math.max(.2f, Math.min(height / 1000f, width / 1440f)); }
    public float unit() { return u; }
    public ColorPicker picker() { return picker; }
    private DesignTheme t() { return DesignTheme.current(); }
    private boolean anim() { return SaviraClient.config.menuAnimations; }
    private float px() { return Paint.pixels(u); }

    @Override
    protected void init() {
        u = unitFor(width, height);
        sw = width / u; sh = height / u;
        ww = Math.min(1040, sw - 56); wh = Math.min(660, sh - 56);
        wx = (sw - ww) / 2f; wy = (sh - wh) / 2f;
        mainX = wx + RAIL + GAP; mainW = ww - RAIL - GAP;
        if (lastFrame == 0) SaviraSounds.play(SaviraSounds.Sound.OPEN);
    }

    private void show(Page next) {
        if (next == page && next != Page.DETAIL) return;
        persist();
        if (page == Page.EDITOR || next == Page.EDITOR) SaviraSounds.play(SaviraSounds.Sound.WINDOW);
        page = next; pageAt = Util.getMeasuringTimeMs();
        scroll = scrollPos = 0; picker = null; typing = null; listening = null; sliding = null; selected = dragging = null;
    }
    private void openModule(HudModule module) { editing = module; show(Page.DETAIL); }

    private void persist() { saveError = SaviraClient.config.save() ? "" : "Speichern fehlgeschlagen. Bitte Spielordner prüfen."; }

    // ---------- Small drawing helpers ----------
    private static float ease(float t) { t = Math.clamp(t, 0f, 1f); return 1 - (1 - t) * (1 - t) * (1 - t); }
    /** Eased value for a control, moving towards target over about the design's 0.22 s. */
    private float approach(String key, float target) {
        float v = anims.getOrDefault(key, target);
        v = anim() ? v + (target - v) * (1 - (float) Math.exp(-dt * 18)) : target;
        if (Math.abs(target - v) < .002f) v = target;
        anims.put(key, v);
        return v;
    }
    private void box(DrawContext c, float x, float y, float w, float h, int color) { if (w > 0 && h > 0) Paint.round(c, x, y, w, h, 0, color, px()); }
    /** A 1 px border, as thin as the screen allows. */
    public static void frame(DrawContext c, float x, float y, float w, float h, int color, float px) {
        float b = Math.max(1, Math.round(px)) / px;
        Paint.round(c, x, y, w, b, 0, color, px);
        Paint.round(c, x, y + h - b, w, b, 0, color, px);
        Paint.round(c, x, y + b, b, h - 2 * b, 0, color, px);
        Paint.round(c, x + w - b, y + b, b, h - 2 * b, 0, color, px);
    }
    private void frame(DrawContext c, float x, float y, float w, float h, int color) { frame(c, x, y, w, h, color, px()); }
    private boolean over(float x, float y, float w, float h) {
        if (picker != null && picker.contains(mouseX, mouseY)) return false;
        return mouseX >= x && mouseX < x + w && mouseY >= y && mouseY < y + h && (clip == null || mouseX >= clip[0] && mouseX < clip[2] && mouseY >= clip[1] && mouseY < clip[3]);
    }
    private void hit(float x, float y, float w, float h, String label, Runnable left) { hit(x, y, w, h, label, left, null); }
    private void hit(float x, float y, float w, float h, String label, Runnable left, Runnable right) { hits.add(new Hit(x, y, w, h, label, left, right, clip)); }
    private void startClip(DrawContext c, float x0, float y0, float x1, float y1) {
        clip = new float[] {x0, y0, x1, y1};
        // Minecraft's scissor ignores the matrix: in gui units, following the window's opening.
        var m = c.getMatrices().peek().getPositionMatrix();
        var a = m.transformPosition(x0, y0, 0, new org.joml.Vector3f());
        var b = m.transformPosition(x1, y1, 0, new org.joml.Vector3f());
        c.enableScissor((int) Math.floor(a.x), (int) Math.floor(a.y), (int) Math.ceil(b.x), (int) Math.ceil(b.y));
    }
    private void endClip(DrawContext c) { c.disableScissor(); clip = null; }
    /** Fades in content and lifts it 8 px, the design's svIn, after a delay in steps of 25 ms. */
    private float svIn(DrawContext c, int index) {
        if (!anim()) return 1;
        float k = ease((Util.getMeasuringTimeMs() - pageAt - Math.min(index, 14) * 25) / 380f);
        if (k >= 1) return 1;
        c.draw();
        RenderSystem.setShaderColor(1f, 1f, 1f, Math.max(.01f, k * windowAlpha));
        c.getMatrices().push();
        c.getMatrices().translate(0, (1 - k) * 8, 0);
        return k;
    }
    private void svOut(DrawContext c, float k) {
        if (k >= 1) return;
        c.draw();
        c.getMatrices().pop();
        RenderSystem.setShaderColor(1f, 1f, 1f, windowAlpha);
    }

    private void caps(DrawContext c, String s, float x, float middle, float size, int color, float spacing) { MenuType.middle(c, SILK, s, x, middle, size, color, spacing, u); }
    private float width(MenuType.Face face, String s, float size) { return MenuType.width(face, s, size, face == SILK ? .06f : 0, u); }
    private void icon(DrawContext c, char glyph, float cx, float cy, float size, int color) { MenuType.icon(c, glyph, cx, cy, size, color, false, u); }

    /** The design's switch: 44x24, the knob sliding right when on. */
    private void toggle(DrawContext c, float x, float y, boolean on, String key, String label, Runnable flip) {
        DesignTheme t = t();
        float k = approach("sw:" + key, on ? 1 : 0);
        box(c, x, y, 44, 24, Paint.lerp(t.track(), t.ac(), k));
        box(c, x, y + 21, 44, 3, 0x33000000);
        float kx = x + 3 + 20 * k;
        box(c, kx, y + 3, 18, 18, DesignTheme.KNOB);
        box(c, kx, y + 18, 18, 3, DesignTheme.KNOB_EDGE);
        hit(x, y, 44, 24, label, flip);
    }
    private float buttonWidth(char glyph, String label) { return 28 + width(SILK, label, 11) + (glyph != 0 ? 21 : 0); }
    /** Button with a border, Silkscreen label and an optional icon, like "STANDARD" or "IMPORT". */
    private float button(DrawContext c, float x, float y, float h, char glyph, String label, boolean primary, String hitLabel, Runnable run) {
        DesignTheme t = t();
        float w = buttonWidth(glyph, label);
        boolean hover = over(x, y, w, h);
        if (primary) {
            box(c, x, y, w, h, hover ? Paint.lerp(t.ac(), 0xFFFFFFFF, .08f) : t.ac());
            box(c, x, y + h - 3, w, 3, t.acd());
        } else {
            box(c, x, y, w, h, t.card());
            frame(c, x, y, w, h, hover ? t.mu() : t.line());
        }
        int fg = primary ? t.acx() : t.tx();
        float tx = x + 14, mid = y + h / 2f - (primary ? 1 : 0);
        if (glyph != 0) { icon(c, glyph, tx + 7, mid, 14, fg); tx += 21; }
        caps(c, label, tx, mid, 11, fg, .06f);
        hit(x, y, w, h, hitLabel, () -> { SaviraSounds.play(SaviraSounds.Sound.CLICK); run.run(); });
        return w;
    }

    // ---------- Rendering ----------
    @Override
    public void renderBackground(DrawContext context, int mouseX, int mouseY, float delta) { }

    @Override
    public void render(DrawContext c, int mx, int my, float delta) {
        long now = Util.getMeasuringTimeMs();
        dt = lastFrame == 0 ? 0 : Math.min(.1f, (now - lastFrame) / 1000f);
        lastFrame = now;
        mouseX = mx / u; mouseY = my / u;
        lastHits = new ArrayList<>(hits);
        hits.clear();
        DesignTheme t = t();
        RenderSystem.enableBlend();

        if (page == Page.EDITOR) {
            // Without a world (opened from the main menu) the panorama stays behind the HUD.
            if (client.world == null) super.renderBackground(c, mx, my, delta);
            renderEditor(c, mx, my); SaviraToasts.render(c, width); return;
        }

        // The game (or the title panorama) behind the menu, with the HUD, blurred and veiled.
        if (client.world == null) super.renderBackground(c, mx, my, delta);
        else {
            SaviraHud.renderModules(c, true);
            if (SaviraClient.config.menuBlur) applyBlur(delta);
        }
        c.fill(0, 0, width, height, t.scrim());

        float k = anim() ? ease((now - openedAt) / 220f) : 1;
        windowAlpha = Math.max(.02f, k);
        c.draw();
        RenderSystem.setShaderColor(1f, 1f, 1f, windowAlpha);
        c.getMatrices().push();
        c.getMatrices().translate(0, 0, 400);
        c.getMatrices().scale(u, u, 1);
        // The window rises 14 px and grows from 98 % as it opens.
        float s = .98f + .02f * k;
        c.getMatrices().translate(sw / 2f, sh / 2f + (1 - k) * 14, 0);
        c.getMatrices().scale(s, s, 1);
        c.getMatrices().translate(-sw / 2f, -sh / 2f, 0);

        renderRail(c);
        box(c, mainX, wy, mainW, wh, t.glass());
        frame(c, mainX, wy, mainW, wh, t.line());
        renderTopBar(c);
        bodyTop = wy + TOP_BAR + 1; bodyBottom = wy + wh - 1;
        switch (page) {
            case MODS -> { if (profilesTab) renderProfiles(c); else renderMods(c); }
            case DETAIL -> renderDetail(c);
            case COSMETICS -> renderSoon(c, "GARDEROBE", "Cosmetics", MenuType.SHIRT, "Capes, Hüte und Flügel kommen bald.", "Dein eigenes Cape stellst du schon jetzt im Launcher unter Garderobe ein.");
            case FRIENDS -> renderSoon(c, "SOZIAL", "Freunde", MenuType.USERS, "Freunde, Einladungen und Partys kommen bald.", "Dann siehst du hier, wer online ist und wo gerade gespielt wird.");
            case SETTINGS -> renderSettings(c);
            default -> { }
        }
        renderRailTooltip(c);
        if (picker != null) picker.render(c, mouseX, mouseY, u);
        if (!saveError.isEmpty()) MenuType.centered(c, INTER, saveError, sw / 2f, wy + wh + 14, 13, 0xFFFF9C9C, 0, u);
        c.draw();
        c.getMatrices().pop();
        RenderSystem.setShaderColor(1f, 1f, 1f, 1f);
        SaviraToasts.render(c, width);
    }

    // ---------- Rail ----------
    private record RailItem(String label, char glyph, Runnable action, boolean active) {}
    private String railHover;
    private float railHoverY;
    private void renderRail(DrawContext c) {
        DesignTheme t = t();
        box(c, wx, wy, RAIL, wh, t.glass());
        frame(c, wx, wy, RAIL, wh, t.line());
        List<RailItem> top = List.of(
            new RailItem("Mods", MenuType.LIGHTNING, () -> show(Page.MODS), page == Page.MODS || page == Page.DETAIL),
            new RailItem("Cosmetics", MenuType.SHIRT, () -> show(Page.COSMETICS), page == Page.COSMETICS),
            new RailItem("Freunde", MenuType.USERS, () -> show(Page.FRIENDS), page == Page.FRIENDS),
            new RailItem("HUD-Editor", MenuType.LAYOUT, () -> show(Page.EDITOR), false));
        boolean dark = SaviraClient.config.menuDark;
        List<RailItem> bottom = List.of(
            new RailItem(dark ? "Heller Modus" : "Dunkler Modus", dark ? MenuType.SUN : MenuType.MOON, this::flipTheme, false),
            new RailItem("Einstellungen", MenuType.GEAR, () -> show(Page.SETTINGS), page == Page.SETTINGS));
        railHover = null;
        float y = wy + 8;
        for (RailItem item : top) { railButton(c, item, y); y += 48; }
        y = wy + wh - 8 - 42 - 48;
        for (RailItem item : bottom) { railButton(c, item, y); y += 48; }
    }
    private void railButton(DrawContext c, RailItem item, float y) {
        DesignTheme t = t();
        float x = wx + 9;
        boolean hover = over(x, y, 42, 42);
        float k = approach("rail:" + item.label(), item.active() ? 1 : 0);
        if (k > 0) {
            box(c, x, y, 42, 42, DesignTheme.alpha(t.ac(), k));
            box(c, x, y + 39, 42, 3, DesignTheme.alpha(t.acd(), k));
        }
        int fg = item.active() ? t.acx() : hover ? t.tx() : t.mu();
        icon(c, item.glyph(), x + 21, y + 21 - (item.active() ? 1 : 0), 21, fg);
        if (hover) { railHover = item.label(); railHoverY = y + 21; }
        hit(x, y, 42, 42, item.label(), () -> { SaviraSounds.play(SaviraSounds.Sound.CLICK); item.action().run(); });
    }
    private void renderRailTooltip(DrawContext c) {
        if (railHover == null) return;
        DesignTheme t = t();
        String label = railHover.toUpperCase(Locale.ROOT);
        float w = width(SILK, label, 10) + 20, x = wx + RAIL + 8, y = railHoverY - 14;
        box(c, x, y, w, 28, DesignTheme.alpha(t.bg(), .96f));
        frame(c, x, y, w, 28, t.line());
        caps(c, label, x + 10, railHoverY, 10, t.tx(), .06f);
    }
    private void flipTheme() {
        SaviraClient.config.menuDark = !SaviraClient.config.menuDark; persist();
        SaviraToasts.show("Design", SaviraClient.config.menuDark ? "Dunkel" : "Hell");
    }

    // ---------- Top bar ----------
    private void renderTopBar(DrawContext c) {
        DesignTheme t = t();
        float mid = wy + TOP_BAR / 2f;
        box(c, mainX, wy + TOP_BAR, mainW, 1, t.line());
        float x = mainX + 18;
        MenuType.icon(c, MenuType.LIGHTNING, x + 11, mid, 22, t.act(), true, u);
        x += 32;
        MenuType.middle(c, PIXEL, "Savira", x, mid, 24, t.tx(), u);
        x += MenuType.width(PIXEL, "Savira", 24, u) + 10;
        String version = ("v" + launcherVersion()).toUpperCase(Locale.ROOT);
        float vw = width(SILK, version, 9) + 12;
        box(c, x, mid - 9, vw, 18, t.hi());
        frame(c, x, mid - 9, vw, 18, t.line());
        caps(c, version, x + 6, mid, 9, t.mu(), .06f);

        // Right side: close, profile chip, active modules.
        float cx = mainX + mainW - 10 - 36;
        boolean closeHover = over(cx, mid - 18, 36, 36);
        if (closeHover) box(c, cx, mid - 18, 36, 36, t.hi());
        icon(c, MenuType.X, cx + 18, mid, 16, closeHover ? t.tx() : t.mu());
        hit(cx, mid - 18, 36, 36, "Schließen", this::close);

        HudConfig cfg = SaviraClient.config;
        String name = client.getSession().getUsername(), profile = "PROFIL: " + cfg.profiles().get(cfg.activeProfile).name.toUpperCase(Locale.ROOT);
        float pw = 4 + 28 + 9 + Math.max(MenuType.width(PIXEL, name, 15, u), width(SILK, profile, 8)) + 12;
        float px0 = cx - 10 - pw;
        boolean profileHover = over(px0, mid - 18, pw, 36);
        box(c, px0, mid - 18, pw, 36, t.card());
        frame(c, px0, mid - 18, pw, 36, profileHover ? t.mu() : t.line());
        c.draw();
        PlayerSkinDrawer.draw(c, client.getSkinProvider().getSkinTextures(client.getGameProfile()), Math.round(px0 + 4), Math.round(mid - 14), 28);
        MenuType.middle(c, PIXEL, name, px0 + 41, mid - 5, 15, t.tx(), u);
        caps(c, profile, px0 + 41, mid + 9, 8, t.mu(), .06f);
        hit(px0, mid - 18, pw, 36, "Profile", () -> { SaviraSounds.play(SaviraSounds.Sound.CLICK); show(Page.MODS); profilesTab = true; pageAt = Util.getMeasuringTimeMs(); });

        long active = Arrays.stream(HudModule.values()).filter(HudModule::enabled).count();
        String count = active + " / " + HudModule.values().length + " AKTIV";
        float aw = 12 + 7 + 6 + width(SILK, count, 9) + 12, ax = px0 - 10 - aw;
        box(c, ax, mid - 18, aw, 36, t.card());
        frame(c, ax, mid - 18, aw, 36, t.line());
        box(c, ax + 12, mid - 3.5f, 7, 7, DesignTheme.ONLINE);
        caps(c, count, ax + 25, mid, 9, t.mu(), .06f);
    }
    private String launcherVersion() {
        String v = SaviraClient.config.launcherVersion;
        if (v != null && !v.isBlank()) return v;
        return net.fabricmc.loader.api.FabricLoader.getInstance().getModContainer("savira").map(m -> m.getMetadata().getVersion().getFriendlyString()).orElse("");
    }

    // ---------- Page header ----------
    /** "CLIENT" over a 40 px title; returns the bottom of the title. */
    private float header(DrawContext c, String kicker, String title) {
        DesignTheme t = t();
        float y = bodyTop + 22;
        caps(c, kicker, mainX + PAD_X, y + 6.5f, 11, t.mu(), .08f);
        MenuType.middle(c, PIXEL, title, mainX + PAD_X, y + 19 + 20, 40, t.tx(), u);
        return y + 19 + 40;
    }
    /** Tabs like "MODS | PROFILE" with the accent line under the chosen one. */
    private void tabs(DrawContext c, float y, String[] labels, int chosen, IntConsumer pick) {
        DesignTheme t = t();
        float x = mainX + PAD_X;
        for (int i = 0; i < labels.length; i++) {
            float w = 32 + MenuType.width(SILK, labels[i], 11, .08f, u);
            boolean on = i == chosen, hover = over(x, y, w, 36);
            if (on) box(c, x, y, w, 36, t.hi());
            frame(c, x, y, w, 36, t.line());
            box(c, x, y + 34, w, 2, on ? t.ac() : t.line());
            caps(c, labels[i], x + 16, y + 17, 11, on || hover ? t.tx() : t.mu(), .08f);
            int index = i;
            hit(x, y, w, 36, labels[i], () -> { SaviraSounds.play(SaviraSounds.Sound.CLICK); pick.accept(index); });
            x += w + 6;
        }
    }
    private void focus(Field f) { typing = f; buffer = f.get().get(); }
    private void pickTab(int index) { profilesTab = index == 1; pageAt = Util.getMeasuringTimeMs(); scroll = scrollPos = 0; typing = null; }

    /** Smooth scrolling of the page body; returns where the content starts this frame. */
    private float scrollBody(float contentTop) {
        if (draggingBar || Math.abs(scroll - scrollPos) < .05f) scrollPos = scroll;
        else scrollPos += (scroll - scrollPos) * (1 - (float) Math.exp(-dt * 16));
        return contentTop - scrollPos;
    }
    private void endBody(DrawContext c, float listTop, float contentBottom) {
        maxScroll = Math.max(0, contentBottom + scrollPos - bodyBottom);
        scroll = Math.clamp(scroll, 0, maxScroll);
        scrollPos = Math.clamp(scrollPos, 0, maxScroll);
        if (maxScroll <= 0) return;
        DesignTheme t = t();
        float track = bodyBottom - listTop - 8, thumb = Math.max(30, track * track / (track + maxScroll));
        float top = listTop + 4 + (track - thumb) * scrollPos / maxScroll;
        box(c, mainX + mainW - 8, top, 4, thumb, draggingBar ? t.mu() : t.line());
    }

    // ---------- Mods ----------
    private static char glyph(HudModule m) {
        return switch (m) {
            case FPS -> MenuType.GAUGE; case CPS -> MenuType.CURSOR_CLICK; case KEYSTROKES -> MenuType.KEYBOARD; case PING -> MenuType.WIFI;
            case COORDINATES -> MenuType.MAP_PIN; case ARMOR -> MenuType.SHIELD; case POTIONS -> MenuType.FLASK; case SPRINT -> MenuType.RUN;
            case ZOOM -> MenuType.ZOOM; case RAM -> MenuType.MEMORY; case ICON -> MenuType.BADGE; case NAMETAG -> MenuType.TAG;
            case LIGHT_LEVEL -> MenuType.LIGHTBULB; case EMOTES -> MenuType.SMILEY;
        };
    }
    private List<HudModule> visibleModules() {
        String needle = query.strip().toLowerCase(Locale.ROOT);
        return Arrays.stream(HudModule.values())
            .filter(m -> (m.title + " " + m.category + " " + m.description).toLowerCase(Locale.ROOT).contains(needle))
            .sorted(java.util.Comparator.comparing((HudModule m) -> !m.isNew()).thenComparing(m -> m.isNew() ? -m.released().toEpochDay() : 0)).toList();
    }
    private void toggleModule(HudModule m) {
        m.toggle(); persist();
        SaviraSounds.play(m.enabled() ? SaviraSounds.Sound.ON : SaviraSounds.Sound.OFF);
        SaviraToasts.show(m.title, m.enabled() ? "Aktiviert" : "Deaktiviert");
    }
    private final Field searchField = new Field(() -> query, v -> { query = v; scroll = scrollPos = 0; }, "Mods suchen…");

    private void renderMods(DrawContext c) {
        DesignTheme t = t();
        float k = svIn(c, 0);
        float bottom = header(c, "CLIENT", "Mods");
        // Search box, bottom aligned with the title.
        float sx = mainX + mainW - PAD_X - 240, sy = bottom - 38;
        boolean focused = typing == searchField;
        box(c, sx, sy, 240, 38, t.fill());
        frame(c, sx, sy, 240, 38, focused ? t.ac() : over(sx, sy, 240, 38) ? t.mu() : t.line());
        icon(c, MenuType.SEARCH, sx + 12 + 7.5f, sy + 19, 15, t.mu());
        inputText(c, focused ? buffer : query, "Mods suchen…", sx + 35, sy + 19, 240 - 47, focused);
        hit(sx, sy, 240, 38, "Mods suchen", () -> focus(searchField));
        tabs(c, bottom + 16, new String[] {"MODS", "PROFILE"}, 0, this::pickTab);
        svOut(c, k);

        float listTop = bottom + 16 + 36;
        List<HudModule> list = visibleModules();
        float innerW = mainW - 2 * PAD_X;
        int cols = Math.max(1, (int) ((innerW + 10) / 310));
        float cardW = (innerW - (cols - 1) * 10) / cols, cardH = 76;
        startClip(c, mainX, listTop, mainX + mainW, bodyBottom);
        float y = scrollBody(listTop + 18);
        for (int i = 0; i < list.size(); i++) {
            float x = mainX + PAD_X + (i % cols) * (cardW + 10), cy = y + (i / cols) * (cardH + 10);
            if (cy + cardH < listTop || cy > bodyBottom) continue;
            float ki = svIn(c, i + 1);
            moduleCard(c, list.get(i), x, cy, cardW, cardH);
            svOut(c, ki);
        }
        float end = y + ((list.size() + cols - 1) / cols) * (cardH + 10) + 14;
        if (list.isEmpty()) MenuType.middle(c, INTER, "Keine Mods für „" + query.strip() + "“ gefunden.", mainX + PAD_X, y + 48 + 7, 14, t.mu(), u);
        endClip(c);
        endBody(c, listTop, end);
    }

    private void moduleCard(DrawContext c, HudModule m, float x, float y, float w, float h) {
        DesignTheme t = t();
        boolean on = m.enabled(), hover = over(x, y, w, h);
        float k = approach("card:" + m.name(), on ? 1 : 0);
        box(c, x, y, w, h, t.card());
        int edge = Paint.lerp(t.line(), DesignTheme.mix(t.ac(), t.line(), .45f), k);
        frame(c, x, y, w, h, hover ? t.mu() : edge);
        // Icon tile.
        float ix = x + 14, iy = y + (h - 44) / 2f;
        box(c, ix, iy, 44, 44, Paint.lerp(t.fill(), t.acs(), k));
        frame(c, ix, iy, 44, 44, t.line());
        icon(c, glyph(m), ix + 22, iy + 22, 23, Paint.lerp(t.mu(), t.act(), k));
        // Name, NEU, two lines of description.
        float tx = ix + 44 + 14, tw = w - (tx - x) - 14 - 44 - 14;
        float nameW = Math.min(tw - (m.isNew() ? 34 : 0), MenuType.width(PIXEL, m.title, 18, u));
        MenuType.middle(c, PIXEL, MenuType.fit(PIXEL, m.title, 18, nameW + .5f, u), tx, y + 22, 18, t.tx(), u);
        if (m.isNew()) {
            float bx = tx + nameW + 8, bw = width(SILK, "NEU", 8) + 10;
            box(c, bx, y + 15, bw, 14, t.acs());
            caps(c, "NEU", bx + 5, y + 22, 8, t.act(), .06f);
        }
        List<String> lines = MenuType.wrap(INTER, m.description, 12.5f, tw, u);
        for (int i = 0; i < Math.min(2, lines.size()); i++) {
            String line = i == 1 && lines.size() > 2 ? MenuType.fit(INTER, lines.get(1) + " " + lines.get(2), 12.5f, tw, u) : lines.get(i);
            MenuType.middle(c, INTER, line, tx, y + 42 + i * 17, 12.5f, t.mu(), u);
        }
        hit(x, y, w, h, m.title, () -> { SaviraSounds.play(SaviraSounds.Sound.CLICK); openModule(m); }, () -> { SaviraSounds.play(SaviraSounds.Sound.CLICK); openModule(m); });
        toggle(c, x + w - 14 - 44, y + (h - 24) / 2f, on, m.name(), m.title + ": An/Aus", () -> toggleModule(m));
    }

    // ---------- Profiles ----------
    private void renderProfiles(DrawContext c) {
        DesignTheme t = t();
        List<HudConfig.Profile> profiles = SaviraClient.config.profiles();
        float k = svIn(c, 0);
        float bottom = header(c, "CLIENT", "Mods");
        float right = mainX + mainW - PAD_X, by = bottom - 38;
        float addW = buttonWidth(MenuType.PLUS, "PROFIL"), importW = buttonWidth(MenuType.DOWNLOAD, "IMPORT");
        button(c, right - addW, by, 38, MenuType.PLUS, "PROFIL", true, "Profil hinzufügen", this::addProfile);
        button(c, right - addW - 8 - importW, by, 38, MenuType.DOWNLOAD, "IMPORT", false, "Profil importieren", this::importProfile);
        tabs(c, bottom + 16, new String[] {"MODS", "PROFILE"}, 1, this::pickTab);
        svOut(c, k);

        float listTop = bottom + 16 + 36;
        startClip(c, mainX, listTop, mainX + mainW, bodyBottom);
        float y = scrollBody(listTop + 18);
        MenuType.middle(c, INTER, "Speichere verschiedene Mod- und Einstellungs-Setups und wechsle zwischen ihnen.", mainX + PAD_X, y + 8, 13, t.mu(), u);
        y += 30;
        for (int i = 0; i < profiles.size(); i++) {
            float ki = svIn(c, i + 1);
            profileRow(c, profiles.get(i), i, y);
            svOut(c, ki);
            y += 64 + 10;
        }
        endClip(c);
        endBody(c, listTop, y + 14);
    }
    private record ProfileAction(char glyph, String label, Runnable run) {}
    private void profileRow(DrawContext c, HudConfig.Profile p, int index, float y) {
        DesignTheme t = t();
        HudConfig cfg = SaviraClient.config;
        boolean active = index == cfg.activeProfile;
        float x = mainX + PAD_X, w = mainW - 2 * PAD_X, h = 64;
        box(c, x, y, w, h, t.card());
        frame(c, x, y, w, h, active ? DesignTheme.mix(t.ac(), t.line(), .45f) : t.line());
        MenuType.middle(c, PIXEL, p.name, x + 16, y + 24, 20, t.tx(), u);
        if (active) {
            float bx = x + 16 + MenuType.width(PIXEL, p.name, 20, u) + 8, bw = width(SILK, "AKTIV", 8) + 10;
            box(c, bx, y + 17, bw, 14, t.acs());
            caps(c, "AKTIV", bx + 5, y + 24, 8, t.act(), .06f);
        }
        long on = active ? Arrays.stream(HudModule.values()).filter(HudModule::enabled).count() : p.modules.values().stream().filter(Boolean::booleanValue).count();
        caps(c, on + " MODS AKTIV", x + 16, y + 44, 9, t.mu(), .06f);
        // Actions on the right: load, export, duplicate, delete.
        List<ProfileAction> actions = new ArrayList<>();
        if (!active) actions.add(new ProfileAction(MenuType.PLAY, "Laden: " + p.name, () -> loadProfile(index)));
        actions.add(new ProfileAction(MenuType.UPLOAD, "Exportieren: " + p.name, () -> exportProfile(index)));
        actions.add(new ProfileAction(MenuType.COPY, "Duplizieren: " + p.name, () -> duplicateProfile(index)));
        if (cfg.profiles().size() > 1) actions.add(new ProfileAction(MenuType.TRASH, "Löschen: " + p.name, () -> deleteProfile(index)));
        float ax = x + w - 12 - actions.size() * 38 - (actions.size() - 1) * 10;
        for (ProfileAction a : actions) {
            boolean hover = over(ax, y + 13, 38, 38);
            box(c, ax, y + 13, 38, 38, hover ? t.hi() : t.fill());
            frame(c, ax, y + 13, 38, 38, hover ? t.mu() : t.line());
            icon(c, a.glyph(), ax + 19, y + 32, 17, t.tx());
            hit(ax, y + 13, 38, 38, a.label(), () -> { SaviraSounds.play(SaviraSounds.Sound.CLICK); a.run().run(); });
            ax += 48;
        }
    }
    /** Keeps the active profile up to date with the current setup. */
    private void storeActive() {
        HudConfig cfg = SaviraClient.config;
        List<HudConfig.Profile> list = cfg.profiles();
        list.set(cfg.activeProfile, cfg.capture(list.get(cfg.activeProfile).name));
    }
    private String freeName(String base) {
        String name = base;
        for (int n = 2; ; n++) {
            String test = name;
            if (SaviraClient.config.profiles().stream().noneMatch(p -> p.name.equalsIgnoreCase(test))) return name;
            name = base + " " + n;
        }
    }
    private void addProfile() {
        HudConfig cfg = SaviraClient.config;
        storeActive();
        HudConfig.Profile p = cfg.capture(freeName("Profil " + (cfg.profiles().size() + 1)));
        cfg.profiles().add(p); cfg.activeProfile = cfg.profiles().size() - 1; persist();
        SaviraToasts.show("Profile", p.name + " angelegt");
    }
    private void loadProfile(int index) {
        HudConfig cfg = SaviraClient.config;
        storeActive();
        cfg.activeProfile = index; cfg.apply(cfg.profiles().get(index)); persist();
        SaviraSounds.play(SaviraSounds.Sound.ON);
        SaviraToasts.show("Profile", cfg.profiles().get(index).name + " geladen");
    }
    private void exportProfile(int index) {
        HudConfig cfg = SaviraClient.config;
        if (index == cfg.activeProfile) storeActive();
        client.keyboard.setClipboard(HudConfig.export(cfg.profiles().get(index)));
        SaviraToasts.show("Profile", "In die Zwischenablage kopiert");
    }
    private void importProfile() {
        HudConfig.Profile p = HudConfig.parseProfile(client.keyboard.getClipboard());
        if (p == null) { SaviraToasts.show("Profile", "Kein Profil in der Zwischenablage"); return; }
        p.name = freeName(p.name);
        SaviraClient.config.profiles().add(p); persist();
        SaviraToasts.show("Profile", p.name + " importiert");
    }
    private void duplicateProfile(int index) {
        HudConfig cfg = SaviraClient.config;
        if (index == cfg.activeProfile) storeActive();
        HudConfig.Profile copy = HudConfig.parseProfile(HudConfig.export(cfg.profiles().get(index)));
        if (copy == null) return;
        copy.name = freeName(cfg.profiles().get(index).name + " Kopie");
        cfg.profiles().add(index + 1, copy);
        if (cfg.activeProfile > index) cfg.activeProfile++;
        persist();
        SaviraToasts.show("Profile", copy.name + " angelegt");
    }
    private void deleteProfile(int index) {
        HudConfig cfg = SaviraClient.config;
        if (cfg.profiles().size() <= 1) return;
        String name = cfg.profiles().remove(index).name;
        if (index == cfg.activeProfile) { cfg.activeProfile = 0; cfg.apply(cfg.profiles().get(0)); }
        else if (cfg.activeProfile > index) cfg.activeProfile--;
        persist();
        SaviraToasts.show("Profile", name + " gelöscht");
    }

    // ---------- A mod's settings ----------
    private void renderDetail(DrawContext c) {
        DesignTheme t = t();
        HudModule m = editing;
        float k = svIn(c, 0);
        float y = bodyTop + 22;
        boolean backHover = over(mainX + PAD_X, y - 2, 70, 18);
        int backColor = backHover ? t.tx() : t.mu();
        icon(c, MenuType.CARET_LEFT, mainX + PAD_X + 5, y + 6.5f, 11, backColor);
        caps(c, "MODS", mainX + PAD_X + 16, y + 6.5f, 11, backColor, .08f);
        hit(mainX + PAD_X, y - 2, 70, 18, "< Mods", () -> { SaviraSounds.play(SaviraSounds.Sound.CLICK); show(Page.MODS); });
        float titleBottom = y + 19 + 40;
        // Right: STANDARD, the on/off box, and for emotes the wheel.
        float right = mainX + mainW - PAD_X, by = titleBottom - 38;
        float resetW = buttonWidth(MenuType.RESET, "STANDARD");
        button(c, right - resetW, by, 38, MenuType.RESET, "STANDARD", false, "Zurücksetzen", () -> resetModule(m));
        String status = m.enabled() ? "AKTIV" : "AUS";
        float statusW = 14 + width(SILK, "AKTIV", 10) + 10 + 44 + 10, sx = right - resetW - 10 - statusW;
        box(c, sx, by, statusW, 38, t.card());
        frame(c, sx, by, statusW, 38, t.line());
        caps(c, status, sx + 14, by + 19, 10, t.mu(), .06f);
        toggle(c, sx + statusW - 10 - 44, by + 7, m.enabled(), m.name(), "Modul an/aus", () -> toggleModule(m));
        float titleW = sx - 16 - (mainX + PAD_X);
        if (m == HudModule.EMOTES) {
            float ew = buttonWidth(MenuType.HAND_WAVING, "EMOTE-RAD");
            button(c, sx - 10 - ew, by, 38, MenuType.HAND_WAVING, "EMOTE-RAD", true, "Emote-Rad öffnen", () -> client.setScreen(new EmoteWheelScreen()));
            titleW -= ew + 10;
        }
        MenuType.middle(c, PIXEL, MenuType.fit(PIXEL, m.title, 40, titleW, u), mainX + PAD_X, y + 19 + 20, 40, t.tx(), u);
        svOut(c, k);

        float listTop = titleBottom;
        startClip(c, mainX, listTop, mainX + mainW, bodyBottom);
        float cy = scrollBody(listTop + 14);
        float innerW = mainW - 2 * PAD_X;
        List<String> about = MenuType.wrap(INTER, m.description, 13, Math.min(innerW, 520), u);
        for (int i = 0; i < about.size(); i++) MenuType.middle(c, INTER, about.get(i), mainX + PAD_X, cy + 9 + i * 19, 13, t.mu(), u);
        cy += about.size() * 19 + 16;
        List<Section> sections = sections(m);
        for (int i = 0; i < sections.size(); i++) {
            float ki = svIn(c, i + 1);
            cy = section(c, sections.get(i), mainX + PAD_X, cy, innerW) + 12;
            svOut(c, ki);
        }
        if (previewable(m)) {
            float ki = svIn(c, sections.size() + 1);
            cy = preview(c, m, mainX + PAD_X, cy, innerW) + 12;
            svOut(c, ki);
        }
        endClip(c);
        endBody(c, listTop, cy + 12);
    }

    /** The sections of a module's settings page. */
    private List<Section> sections(HudModule m) {
        HudConfig cfg = SaviraClient.config;
        List<Section> out = new ArrayList<>();
        switch (m) {
            case ICON -> {
                out.add(new Section("Icon", List.of(new Row("Icon", Kind.ICONS, null))));
                out.add(new Section("Anzeige", List.of(
                    toggleRow("Im Nametag anzeigen", () -> cfg.iconNametag, () -> cfg.iconNametag = !cfg.iconNametag),
                    toggleRow("In Tab-Liste anzeigen", () -> cfg.iconTablist, () -> cfg.iconTablist = !cfg.iconTablist),
                    toggleRow("Abstand zum Namen", () -> cfg.iconSpace, () -> cfg.iconSpace = !cfg.iconSpace))));
            }
            case NAMETAG -> out.add(new Section("Nametag", List.of(
                toggleRow("In F5 anzeigen", () -> cfg.nametagF5, () -> cfg.nametagF5 = !cfg.nametagF5),
                toggleRow("Textschatten", () -> cfg.nametagShadow, () -> cfg.nametagShadow = !cfg.nametagShadow),
                toggleRow("Kein Hintergrund", () -> cfg.nametagNoBackground, () -> cfg.nametagNoBackground = !cfg.nametagNoBackground))));
            case LIGHT_LEVEL -> {
                out.add(new Section("Allgemein", List.of(
                    new Row("Taste", Kind.KEY, SaviraClient.lightKey),
                    new Row("Reichweite", Kind.SLIDER, new Slider(1, 32, 1, 16, () -> cfg.lightRange, v -> { cfg.lightRange = (int) v; LightLevel.rescanNow(); }, v -> Integer.toString((int) v))))));
                List<Row> look = new ArrayList<>();
                look.add(new Row("Modus", Kind.ENUM, new Cycle(() -> LightLevel.Mode.parse(cfg.lightMode).label, step -> cfg.lightMode = LightLevel.Mode.parse(cfg.lightMode).next(step).name())));
                LightLevel.Mode mode = LightLevel.Mode.parse(cfg.lightMode);
                if (mode == LightLevel.Mode.NUMBER) look.add(new Row("Textgröße", Kind.SLIDER, new Slider(.5, 2, .1, 1, () -> cfg.lightTextSize, v -> cfg.lightTextSize = (float) v, v -> String.format(Locale.ROOT, "%.1f", v))));
                if (mode == LightLevel.Mode.FILL) look.add(new Row("Deckkraft", Kind.SLIDER, new Slider(.1, 1, .05, .4, () -> cfg.lightAlpha, v -> cfg.lightAlpha = (float) v, v -> String.format(Locale.ROOT, "%.2f", v))));
                look.add(toggleRow("Nur Spawnbare", () -> cfg.lightOnlySpawnable, () -> { cfg.lightOnlySpawnable = !cfg.lightOnlySpawnable; LightLevel.rescanNow(); }));
                out.add(new Section("Anzeige", look));
                out.add(new Section("Farben", List.of(
                    new Row("Spawnbar", Kind.COLOR, new Swatch(() -> cfg.lightColorSpawnable, v -> cfg.lightColorSpawnable = v)),
                    new Row("Nachts spawnbar", Kind.COLOR, new Swatch(() -> cfg.lightColorNight, v -> cfg.lightColorNight = v)),
                    new Row("Sicher", Kind.COLOR, new Swatch(() -> cfg.lightColorSafe, v -> cfg.lightColorSafe = v)))));
            }
            case EMOTES -> {
                String[][] seen = {{"ALL", "Alle"}, {"FRIENDS", "Freunde"}, {"NONE", "Niemand"}};
                out.add(new Section("Allgemein", List.of(
                    new Row("Taste", Kind.KEY, SaviraClient.emoteKey),
                    new Row("Interaktions-Taste", Kind.KEY, SaviraClient.emoteJoinKey),
                    new Row("Emotes sichtbar für", Kind.ENUM, new Cycle(() -> Arrays.stream(seen).filter(v -> v[0].equals(cfg.emoteVisibility)).map(v -> v[1]).findFirst().orElse("Alle"), step -> {
                        int i = 0;
                        for (int k = 0; k < seen.length; k++) if (seen[k][0].equals(cfg.emoteVisibility)) i = k;
                        cfg.emoteVisibility = seen[Math.floorMod(i + step, seen.length)][0];
                    })),
                    toggleRow("Automatisch wechseln", () -> cfg.emoteAutoSwitch, () -> cfg.emoteAutoSwitch = !cfg.emoteAutoSwitch),
                    toggleRow("Ego-Perspektive erlauben", () -> cfg.emoteFirstPerson, () -> cfg.emoteFirstPerson = !cfg.emoteFirstPerson))));
                out.add(new Section("Einstellungen", List.of(
                    new Row("Sound-Spieler-Limit", Kind.SLIDER, new Slider(1, 20, 1, 6, () -> cfg.emoteSoundLimit, v -> cfg.emoteSoundLimit = (int) v, v -> Integer.toString((int) v))),
                    new Row("Audio-Reichweite", Kind.SLIDER, new Slider(4, 64, 1, 16, () -> cfg.emoteAudioRange, v -> cfg.emoteAudioRange = (int) v, v -> Integer.toString((int) v))),
                    toggleRow("Immersive Emotes", () -> cfg.emoteImmersive, () -> cfg.emoteImmersive = !cfg.emoteImmersive),
                    toggleRow("Emote-Sounds", () -> cfg.emoteSounds, () -> cfg.emoteSounds = !cfg.emoteSounds))));
            }
            default -> out.addAll(styleSections(m));
        }
        if (m == HudModule.ZOOM) out.add(1, new Section("Steuerung", List.of(new Row("Taste", Kind.KEY, SaviraClient.zoomKey))));
        return out;
    }
    private Row toggleRow(String label, BooleanSupplier get, Runnable flip) { return new Row(label, Kind.TOGGLE, new Toggle(get, flip)); }

    /** Look of a HUD element: scale, background, colours, corners, text. */
    private List<Section> styleSections(HudModule m) {
        HudConfig cfg = SaviraClient.config;
        HudConfig.Style style = cfg.style(m);
        HudConfig.Placement placement = cfg.placement(m);
        HudBackground bg = HudBackground.parse(style.background);
        List<Row> look = new ArrayList<>();
        look.add(new Row("HUD-Skalierung", Kind.SLIDER, new Slider(50, 200, 5, 100, () -> Math.round(placement.size * 100), v -> placement.size = (float) (v / 100), v -> Math.round(v) + "%")));
        look.add(new Row("Hintergrund", Kind.ENUM, new Cycle(() -> HudBackground.parse(style.background).label, step -> style.background = HudBackground.parse(style.background).next(step).name())));
        if (bg.coloured) {
            look.add(new Row("Hintergrundfarbe", Kind.COLOR, new Swatch(() -> style.backgroundColor & 0xFFFFFF, v -> style.backgroundColor = (style.backgroundColor & 0xFF000000) | (v & 0xFFFFFF))));
            if (bg == HudBackground.COLOR) look.add(new Row("Deckkraft", Kind.SLIDER, new Slider(10, 100, 5, 70, () -> Math.round((style.backgroundColor >>> 24) / 2.55), v -> style.backgroundColor = ((int) Math.round(v * 2.55) << 24) | (style.backgroundColor & 0xFFFFFF), v -> Math.round(v) + "%")));
        }
        if (bg.rounded) look.add(new Row("Ecken", Kind.SLIDER, new Slider(0, 8, 1, 3, () -> style.radius, v -> style.radius = (int) v, v -> Integer.toString((int) v))));
        List<Row> text = new ArrayList<>();
        if (m.textual()) text.add(new Row("Text", Kind.TEXT, new Field(() -> style.text != null ? style.text : m.defaultText(), v -> style.text = v.isBlank() || v.equals(m.defaultText()) ? null : v, m.defaultText())));
        text.add(new Row("Textfarbe", Kind.COLOR, new Swatch(() -> style.textColor & 0xFFFFFF, v -> style.textColor = 0xFF000000 | v)));
        text.add(toggleRow("Textschatten", () -> style.textShadow, () -> style.textShadow = !style.textShadow));
        return List.of(new Section("Anzeige", look), new Section("Text", text));
    }

    private void resetModule(HudModule m) {
        HudConfig cfg = SaviraClient.config, fresh = new HudConfig();
        cfg.styles.remove(m.name());
        cfg.placement(m).size = 1f;
        switch (m) {
            case ICON -> { cfg.iconType = fresh.iconType; cfg.iconNametag = cfg.iconTablist = cfg.iconSpace = true; }
            case NAMETAG -> { cfg.nametagF5 = true; cfg.nametagShadow = cfg.nametagNoBackground = false; }
            case LIGHT_LEVEL -> {
                cfg.lightRange = fresh.lightRange; cfg.lightMode = fresh.lightMode; cfg.lightOnlySpawnable = fresh.lightOnlySpawnable;
                cfg.lightTextSize = fresh.lightTextSize; cfg.lightAlpha = fresh.lightAlpha;
                cfg.lightColorSpawnable = fresh.lightColorSpawnable; cfg.lightColorNight = fresh.lightColorNight; cfg.lightColorSafe = fresh.lightColorSafe;
                LightLevel.rescanNow();
            }
            case EMOTES -> {
                cfg.emoteAutoSwitch = fresh.emoteAutoSwitch; cfg.emoteImmersive = fresh.emoteImmersive; cfg.emoteSounds = fresh.emoteSounds;
                cfg.emoteFirstPerson = fresh.emoteFirstPerson; cfg.emoteSoundLimit = fresh.emoteSoundLimit; cfg.emoteAudioRange = fresh.emoteAudioRange;
                cfg.emoteVisibility = fresh.emoteVisibility;
                resetKey(SaviraClient.emoteKey); resetKey(SaviraClient.emoteJoinKey);
            }
            case ZOOM -> resetKey(SaviraClient.zoomKey);
            default -> { }
        }
        persist(); picker = null; typing = null;
        SaviraToasts.show(m.title, "Einstellungen zurückgesetzt");
    }
    private void resetKey(KeyBinding key) {
        key.setBoundKey(key.getDefaultKey());
        KeyBinding.updateKeysByCode(); client.options.write();
    }

    /** A section: title, then rows in two columns; toggles take one column, the rest both. */
    private float section(DrawContext c, Section s, float x, float y, float w) {
        DesignTheme t = t();
        // Lay the rows out first to know the height.
        List<float[]> places = new ArrayList<>();
        float rowY = 0, colW = (w - 36 - 8) / 2f;
        int half = 0;
        for (Row r : s.rows()) {
            float h = r.kind() == Kind.ICONS ? 112 : ROW_H;
            if (r.kind() == Kind.TOGGLE) {
                places.add(new float[] {half * (colW + 8), rowY, colW, h});
                if (++half == 2) { half = 0; rowY += h + 8; }
            } else {
                if (half == 1) { half = 0; rowY += ROW_H + 8; }
                places.add(new float[] {0, rowY, w - 36, h});
                rowY += h + 8;
            }
        }
        if (half == 1) rowY += ROW_H + 8;
        float height = 16 + 20 + 12 + Math.max(0, rowY - 8) + 18;
        box(c, x, y, w, height, t.card());
        frame(c, x, y, w, height, t.line());
        MenuType.middle(c, PIXEL, s.title(), x + 18, y + 26, 20, t.tx(), u);
        for (int i = 0; i < s.rows().size(); i++) {
            float[] p = places.get(i);
            row(c, s.rows().get(i), x + 18 + p[0], y + 48 + p[1], p[2], p[3]);
        }
        return y + height;
    }

    private void row(DrawContext c, Row r, float x, float y, float w, float h) {
        DesignTheme t = t();
        box(c, x, y, w, h, t.fill());
        frame(c, x, y, w, h, t.line());
        if (r.kind() == Kind.ICONS) { iconTiles(c, x, y); return; }
        float mid = y + h / 2f, right = x + w - 12;
        float control = switch (r.kind()) {
            case SLIDER -> 220 + 14 + 96;
            case ENUM -> 180;
            case COLOR -> 28;
            case TOGGLE -> 44;
            case KEY -> 140;
            case TEXT -> 240;
            default -> 0;
        };
        MenuType.middle(c, PIXEL, MenuType.fit(PIXEL, r.label(), 16, Math.max(40, w - 24 - control - 14), u), x + 12, mid, 16, t.tx(), u);
        switch (r.kind()) {
            case SLIDER -> slider(c, r.label(), (Slider) r.control(), right, mid);
            case ENUM -> cycle(c, r.label(), (Cycle) r.control(), right - 180, mid - 14);
            case COLOR -> swatch(c, r.label(), (Swatch) r.control(), right - 28, mid - 14);
            case TOGGLE -> {
                Toggle tg = (Toggle) r.control();
                toggle(c, right - 44, mid - 12, tg.get().getAsBoolean(), r.label(), r.label(), () -> {
                    tg.flip().run(); persist();
                    SaviraSounds.play(tg.get().getAsBoolean() ? SaviraSounds.Sound.ON : SaviraSounds.Sound.OFF);
                    SaviraToasts.show(editing != null ? editing.title : "Einstellungen", r.label() + ": " + (tg.get().getAsBoolean() ? "an" : "aus"));
                });
            }
            case KEY -> keyButton(c, r.label(), (KeyBinding) r.control(), right - 140, mid - 14);
            case TEXT -> textBox(c, r.label(), (Field) r.control(), right - 240, mid - 14);
            default -> { }
        }
    }

    /** Track with the accent up to the value, value box with a reset button. */
    private void slider(DrawContext c, String label, Slider s, float right, float mid) {
        DesignTheme t = t();
        double value = s.get().getAsDouble(), pct = Math.clamp((value - s.min()) / (s.max() - s.min()), 0, 1);
        float bx = right - 96, tx = bx - 14 - 220;
        box(c, tx, mid - 3, 220, 6, t.track());
        box(c, tx, mid - 3, (float) (220 * pct), 6, t.ac());
        float knob = (float) (tx + (220 - 12) * pct);
        box(c, knob, mid - 9, 12, 18, t.tx());
        box(c, knob, mid + 6, 12, 3, 0x40000000);
        hit(tx - 4, mid - 11, 228, 22, label, () -> { sliding = s; slideX = tx; slideW = 220; slideTo(mouseX); });
        // Value box with the reset arrow.
        box(c, bx, mid - 14, 96, 28, t.card());
        frame(c, bx, mid - 14, 96, 28, t.line());
        MenuType.middle(c, PIXEL, s.format().apply(value), bx + 8, mid, 16, t.tx(), u);
        box(c, bx + 96 - 27, mid - 14, 1, 28, t.line());
        boolean resetHover = over(bx + 96 - 26, mid - 14, 26, 28);
        icon(c, MenuType.RESET, bx + 96 - 13, mid, 11, resetHover ? t.tx() : t.mu());
        hit(bx + 96 - 26, mid - 14, 26, 28, label + " zurücksetzen", () -> { SaviraSounds.play(SaviraSounds.Sound.CLICK); s.set().accept(s.reset()); persist(); });
    }
    private void slideTo(double mx) {
        Slider s = sliding;
        if (s == null) return;
        double pct = Math.clamp((mx - slideX - 6) / (slideW - 12), 0, 1), raw = s.min() + pct * (s.max() - s.min());
        double snapped = Math.clamp(Math.round((raw - s.min()) / s.step()) * s.step() + s.min(), s.min(), s.max());
        s.set().accept(Math.round(snapped * 1000) / 1000.0);
    }

    private void cycle(DrawContext c, String label, Cycle cy, float x, float y) {
        DesignTheme t = t();
        box(c, x, y, 180, 28, t.card());
        frame(c, x, y, 180, 28, t.line());
        boolean left = over(x, y, 28, 28), right = over(x + 152, y, 28, 28);
        icon(c, MenuType.CARET_LEFT, x + 14, y + 14, 11, left ? t.tx() : t.mu());
        icon(c, MenuType.CARET_RIGHT, x + 166, y + 14, 11, right ? t.tx() : t.mu());
        MenuType.centered(c, SILK, cy.value().get().toUpperCase(Locale.ROOT), x + 90, y + 14, 10, t.tx(), .06f, u);
        hit(x, y, 28, 28, label + " zurück", () -> { SaviraSounds.play(SaviraSounds.Sound.CLICK); cy.step().accept(-1); persist(); });
        hit(x + 28, y, 152, 28, label, () -> { SaviraSounds.play(SaviraSounds.Sound.CLICK); cy.step().accept(1); persist(); });
    }

    private void swatch(DrawContext c, String label, Swatch s, float x, float y) {
        DesignTheme t = t();
        box(c, x, y, 28, 28, 0xFF000000 | s.get().getAsInt());
        box(c, x, y + 25, 28, 3, 0x40000000);
        frame(c, x, y, 28, 28, over(x, y, 28, 28) ? t.tx() : t.line());
        hit(x, y, 28, 28, label, () -> {
            SaviraSounds.play(SaviraSounds.Sound.CLICK);
            typing = null;
            float px0 = Math.clamp(x - ColorPicker.W - 10, mainX + 8, mainX + mainW - ColorPicker.W - 8);
            float py0 = Math.clamp(y - 60, wy + 8, wy + wh - ColorPicker.H - 8);
            picker = new ColorPicker(Math.round(px0), Math.round(py0), s.get().getAsInt(), v -> s.set().accept(v & 0xFFFFFF));
        });
    }

    private void keyButton(DrawContext c, String label, KeyBinding key, float x, float y) {
        DesignTheme t = t();
        boolean wait = listening == key;
        String shown = wait ? "TASTE…" : key.isUnbound() ? "KEINE" : key.getBoundKeyLocalizedText().getString().toUpperCase(Locale.ROOT);
        box(c, x, y, 140, 28, t.card());
        frame(c, x, y, 140, 28, wait ? t.ac() : over(x, y, 140, 28) ? t.tx() : t.line());
        MenuType.centered(c, SILK, MenuType.fit(SILK, shown, 10, 124, u), x + 70, y + 14, 10, t.tx(), .06f, u);
        hit(x, y, 140, 28, label, () -> { SaviraSounds.play(SaviraSounds.Sound.CLICK); listening = listening == key ? null : key; });
    }

    private void textBox(DrawContext c, String label, Field f, float x, float y) {
        DesignTheme t = t();
        boolean focused = typing == f;
        box(c, x, y, 240, 28, t.card());
        frame(c, x, y, 240, 28, focused ? t.ac() : over(x, y, 240, 28) ? t.mu() : t.line());
        inputText(c, focused ? buffer : f.get().get(), f.placeholder(), x + 9, y + 14, 222, focused);
        hit(x, y, 240, 28, label, () -> focus(f));
    }
    /** Typed text (its end stays visible) with a blinking caret, or the placeholder. */
    private void inputText(DrawContext c, String value, String placeholder, float x, float mid, float maxW, boolean focused) {
        DesignTheme t = t();
        String shown = value;
        while (shown.length() > 1 && MenuType.width(INTER, shown, 13, u) > maxW - 4) shown = shown.substring(1);
        if (value.isEmpty() && !focused) MenuType.middle(c, INTER, MenuType.fit(INTER, placeholder, 13, maxW, u), x, mid, 13, t.mu(), u);
        else MenuType.middle(c, INTER, shown, x, mid, 13, t.tx(), u);
        if (focused && Util.getMeasuringTimeMs() / 530 % 2 == 0) box(c, x + MenuType.width(INTER, shown, 13, u) + 1, mid - 8, 1, 16, t.tx());
    }

    /** Icon module: the three icons as tiles. */
    private void iconTiles(DrawContext c, float x, float y) {
        DesignTheme t = t();
        float tile = 72, gx = x + 12;
        for (SaviraIcon.Type type : SaviraIcon.TYPES) {
            boolean chosen = SaviraIcon.current() == type, hover = over(gx, y + 10, tile, tile + 22);
            box(c, gx, y + 10, tile, tile, chosen ? t.acs() : t.card());
            frame(c, gx, y + 10, tile, tile, chosen ? t.ac() : hover ? t.mu() : t.line());
            c.draw();
            c.getMatrices().push();
            c.getMatrices().translate(gx + tile / 2f - 24, y + 10 + tile / 2f - 24, 0);
            c.getMatrices().scale(1.5f, 1.5f, 1);
            if (type.tint() == 0) MenuStyle.logo(c, 0, 0, 2, 0xFFFFFFFF, false);
            else MenuStyle.logoTinted(c, 0, 0, 2, type.tint());
            c.getMatrices().pop();
            MenuType.centered(c, SILK, type.label().toUpperCase(Locale.ROOT), gx + tile / 2f, y + 10 + tile + 11, 9, chosen ? t.act() : t.mu(), .06f, u);
            hit(gx, y + 10, tile, tile + 22, "Icon: " + type.label(), () -> {
                SaviraSounds.play(SaviraSounds.Sound.CLICK);
                SaviraClient.config.iconType = type.id(); persist();
                SaviraToasts.show("Icon", "Icon aktualisiert: " + type.label());
            });
            gx += tile + 12;
        }
    }

    private static boolean previewable(HudModule m) { return m.onHud() || m == HudModule.ICON || m == HudModule.NAMETAG; }
    /** Live preview of the HUD element, or of the name with the icon. */
    private float preview(DrawContext c, HudModule m, float x, float y, float w) {
        DesignTheme t = t();
        float h = 48 + 96 + 18;
        box(c, x, y, w, h, t.card());
        frame(c, x, y, w, h, t.line());
        MenuType.middle(c, PIXEL, "Vorschau", x + 18, y + 26, 20, t.tx(), u);
        float bx = x + 18, by = y + 48, bw = w - 36, bh = 96;
        box(c, bx, by, bw, bh, t.fill());
        frame(c, bx, by, bw, bh, t.line());
        c.draw();
        if (m == HudModule.ICON || m == HudModule.NAMETAG) {
            HudConfig cfg = SaviraClient.config;
            Text name = Text.literal(client.getSession().getUsername());
            Text shown = m == HudModule.ICON
                ? (cfg.icon ? Text.empty().append(SaviraIcon.glyph(SaviraIcon.current())).append(cfg.iconSpace ? " " : "").append(name) : name)
                : SaviraIcon.decorate(name, client.getSession().getUuidOrNull(), false);
            int tw = textRenderer.getWidth(shown);
            c.getMatrices().push();
            c.getMatrices().translate(bx + bw / 2f, by + bh / 2f - 9, 0);
            c.getMatrices().scale(2f, 2f, 1f);
            boolean plain = m == HudModule.NAMETAG && cfg.nametag && cfg.nametagNoBackground;
            if (!plain) c.fill(-tw / 2 - 2, -2, tw / 2 + 2, 9, 0x40000000);
            c.drawText(textRenderer, shown, -tw / 2, 0, 0xFFFFFFFF, m == HudModule.ICON || cfg.nametag && cfg.nametagShadow);
            c.getMatrices().pop();
            if (m == HudModule.NAMETAG && cfg.nametag && !cfg.nametagF5) MenuType.centered(c, INTER, "Dein Nametag ist in F5 ausgeblendet", bx + bw / 2f, by + bh - 14, 12, t.mu(), 0, u);
        } else SaviraHud.renderPreview(c, m, Math.round(bx + 8), Math.round(by + 8), Math.round(bw - 16), Math.round(bh - 16));
        return y + h;
    }

    // ---------- Cosmetics and friends: coming soon ----------
    private void renderSoon(DrawContext c, String kicker, String title, char glyph, String line, String sub) {
        DesignTheme t = t();
        float k = svIn(c, 0);
        float bottom = header(c, kicker, title);
        svOut(c, k);
        float k1 = svIn(c, 1);
        float x = mainX + PAD_X, y = bottom + 18, w = mainW - 2 * PAD_X, h = 220, cx = x + w / 2f;
        box(c, x, y, w, h, t.card());
        frame(c, x, y, w, h, t.line());
        box(c, cx - 32, y + 34, 64, 64, t.acs());
        frame(c, cx - 32, y + 34, 64, 64, t.line());
        icon(c, glyph, cx, y + 66, 34, t.act());
        MenuType.centered(c, PIXEL, line, cx, y + 124, 20, t.tx(), 0, u);
        MenuType.centered(c, INTER, sub, cx, y + 150, 13, t.mu(), 0, u);
        float soonW = width(SILK, "KOMMT BALD", 10) + 16;
        box(c, cx - soonW / 2, y + 172, soonW, 22, t.acs());
        MenuType.centered(c, SILK, "KOMMT BALD", cx, y + 183, 10, t.act(), .06f, u);
        svOut(c, k1);
        if (page != Page.COSMETICS) return;
        // Emotes already exist: a way to the wheel.
        float k2 = svIn(c, 2);
        float ey = y + h + 12;
        box(c, x, ey, w, 64, t.card());
        frame(c, x, ey, w, 64, t.line());
        icon(c, MenuType.SMILEY, x + 30, ey + 32, 20, t.mu());
        MenuType.middle(c, PIXEL, "Emotes", x + 52, ey + 24, 17, t.tx(), u);
        MenuType.middle(c, INTER, "Winken, Tanzen und mehr gibt es schon: im Emote-Rad.", x + 52, ey + 44, 12.5f, t.mu(), u);
        float ew = buttonWidth(MenuType.HAND_WAVING, "EMOTE-RAD");
        button(c, x + w - 14 - ew, ey + 13, 38, MenuType.HAND_WAVING, "EMOTE-RAD", true, "Emote-Rad öffnen", () -> client.setScreen(new EmoteWheelScreen()));
        svOut(c, k2);
    }

    // ---------- Menu settings ----------
    private record Pref(String label, String desc, BooleanSupplier get, Runnable flip) {}
    private void renderSettings(DrawContext c) {
        DesignTheme t = t();
        HudConfig cfg = SaviraClient.config;
        float k = svIn(c, 0);
        float listTop = header(c, "CLIENT", "Einstellungen");
        svOut(c, k);
        startClip(c, mainX, listTop, mainX + mainW, bodyBottom);
        float x = mainX + PAD_X, w = mainW - 2 * PAD_X, y = scrollBody(listTop + 18);
        float colW = (w - 36 - 8) / 2f;

        // Accent: the launcher's first, then the design's thirteen.
        List<DesignTheme.Accent> options = new ArrayList<>();
        options.add(null);
        options.addAll(DesignTheme.ACCENTS);
        int perRow = Math.max(1, (int) ((w - 36 + 8) / 42)), lines = (options.size() + perRow - 1) / perRow;
        float k1 = svIn(c, 1);
        float h1 = 70 + lines * 42 - 8 + 18;
        settingsSection(c, x, y, w, h1, MenuType.PALETTE, "Akzentfarbe", "Buttons, Schalter und Markierungen im Mod-Menü und HUD-Editor.");
        for (int i = 0; i < options.size(); i++) {
            DesignTheme.Accent a = options.get(i);
            float sx = x + 18 + (i % perRow) * 42, sy = y + 70 + (i / perRow) * 42;
            boolean chosen = a == null ? cfg.menuAccent.isEmpty() : a.name().equals(cfg.menuAccent);
            int color = a == null ? MenuStyle.launcherAccent() : DesignTheme.oklch(a.l(), a.c(), a.h(), 1);
            String name = a == null ? "Launcher" : a.name();
            float lift = approach("acc:" + name, over(sx, sy, 34, 34) ? 1 : 0) * 2;
            box(c, sx, sy - lift, 34, 34, color);
            box(c, sx, sy - lift + 31, 34, 3, 0x38000000);
            int ink = DesignTheme.oklch(.18f, .02f, 268, 1);
            if (chosen) { frame(c, sx, sy - lift, 34, 34, t.tx()); frame(c, sx + 1, sy - lift + 1, 32, 32, t.tx()); icon(c, MenuType.CHECK, sx + 17, sy - lift + 16, 14, ink); }
            else if (a == null) MenuType.centered(c, SILK, "L", sx + 17, sy - lift + 16, 11, ink, 0, u);
            hit(sx, sy, 34, 34, "Akzent: " + name, () -> {
                SaviraSounds.play(SaviraSounds.Sound.CLICK);
                cfg.menuAccent = a == null ? "" : a.name(); persist();
            });
        }
        svOut(c, k1);
        y += h1 + 12;

        // Look: dark or light.
        float k2 = svIn(c, 2);
        float h2 = 70 + 54 + 18;
        settingsSection(c, x, y, w, h2, MenuType.CIRCLE_HALF, "Erscheinungsbild", "Dunkel passt zum Launcher, Hell ist besser bei hellen Spielszenen.");
        for (int i = 0; i < 2; i++) {
            boolean dark = i == 0, chosen = cfg.menuDark == dark;
            float mx = x + 18 + i * (colW + 8), my = y + 70;
            boolean hover = over(mx, my, colW, 54);
            box(c, mx, my, colW, 54, chosen ? t.acs() : t.fill());
            frame(c, mx, my, colW, 54, chosen ? t.ac() : hover ? t.mu() : t.line());
            box(c, mx, my + 52, colW, 2, chosen ? t.ac() : t.line());
            box(c, mx + 14, my + 13, 40, 28, dark ? DesignTheme.oklch(.15f, .012f, 268, 1) : DesignTheme.oklch(.95f, .006f, 268, 1));
            frame(c, mx + 14, my + 13, 40, 28, t.line());
            box(c, mx + 18, my + 29, 8, 8, t.ac());
            box(c, mx + 29, my + 34, 21, 3, dark ? DesignTheme.oklch(.29f, .015f, 268, 1) : DesignTheme.oklch(.86f, .01f, 268, 1));
            icon(c, dark ? MenuType.MOON : MenuType.SUN, mx + 75, my + 27, 18, t.mu());
            MenuType.middle(c, PIXEL, dark ? "Dunkel" : "Hell", mx + 96, my + 27, 17, t.tx(), u);
            hit(mx, my, colW, 54, dark ? "Dunkel" : "Hell", () -> {
                SaviraSounds.play(SaviraSounds.Sound.CLICK);
                if (cfg.menuDark != dark) flipTheme();
            });
        }
        svOut(c, k2);
        y += h2 + 12;

        // Behaviour: animations, blur, interface sounds.
        List<Pref> prefs = List.of(
            new Pref("Animationen", "Ein- und Ausblenden, Seitenwechsel und Schalter.", () -> cfg.menuAnimations, () -> cfg.menuAnimations = !cfg.menuAnimations),
            new Pref("Hintergrund-Unschärfe", "Spielszene hinter dem Menü weichzeichnen.", () -> cfg.menuBlur, () -> cfg.menuBlur = !cfg.menuBlur),
            new Pref("UI-Sounds", "Klicks und Töne beim Bedienen des Menüs.", () -> cfg.uiSounds, () -> cfg.uiSounds = !cfg.uiSounds));
        int rows = (prefs.size() + 1) / 2;
        float k3 = svIn(c, 3);
        float h3 = 70 + rows * 72 - 8 + 18;
        settingsSection(c, x, y, w, h3, MenuType.SPARKLE, "Verhalten", "Wie sich das Menü öffnet und über dem Spiel liegt.");
        for (int i = 0; i < prefs.size(); i++) {
            Pref p = prefs.get(i);
            float px0 = x + 18 + (i % 2) * (colW + 8), py0 = y + 70 + (i / 2) * 72;
            box(c, px0, py0, colW, 64, t.fill());
            frame(c, px0, py0, colW, 64, t.line());
            MenuType.middle(c, PIXEL, p.label(), px0 + 14, py0 + 22, 17, t.tx(), u);
            MenuType.middle(c, INTER, MenuType.fit(INTER, p.desc(), 12, colW - 14 - 44 - 28, u), px0 + 14, py0 + 42, 12, t.mu(), u);
            toggle(c, px0 + colW - 14 - 44, py0 + 20, p.get().getAsBoolean(), "pref:" + p.label(), p.label(), () -> {
                p.flip().run(); persist();
                if (p.get().getAsBoolean()) SaviraSounds.play(SaviraSounds.Sound.ON);
                SaviraToasts.show(p.label(), p.get().getAsBoolean() ? "Aktiviert" : "Deaktiviert");
            });
        }
        svOut(c, k3);
        y += h3 + 12;
        endClip(c);
        endBody(c, listTop, y + 12);
    }
    private void settingsSection(DrawContext c, float x, float y, float w, float h, char glyph, String title, String sub) {
        DesignTheme t = t();
        box(c, x, y, w, h, t.card());
        frame(c, x, y, w, h, t.line());
        icon(c, glyph, x + 27, y + 27, 18, t.mu());
        MenuType.middle(c, PIXEL, title, x + 46, y + 26, 20, t.tx(), u);
        MenuType.middle(c, INTER, sub, x + 46, y + 48, 12.5f, t.mu(), u);
    }

    // ---------- HUD editor ----------
    private void renderEditor(DrawContext c, int mx, int my) {
        DesignTheme t = t();
        HudConfig cfg = SaviraClient.config;
        // The design's grid over the slightly darkened game.
        c.fill(0, 0, width, height, 0x40000000);
        float step = 32 * u;
        for (float gx = step; gx < width; gx += step) c.fill(Math.round(gx), 0, Math.round(gx) + 1, height, 0x14FFFFFF);
        for (float gy = step; gy < height; gy += step) c.fill(0, Math.round(gy), width, Math.round(gy) + 1, 0x14FFFFFF);
        if (cfg.snap) {
            c.fill(width / 2, 0, width / 2 + 1, height, DesignTheme.alpha(t.ac(), .5f));
            c.fill(0, height / 2, width, height / 2 + 1, DesignTheme.alpha(t.ac(), .5f));
        }
        SaviraHud.renderModules(c, true);
        for (HudModule module : HudModule.values()) {
            if (!module.enabled() || !module.onHud()) continue;
            SaviraHud.Bounds b = SaviraHud.bounds(module, width, height);
            boolean hover = b.contains(mx, my) || onRemove(b, mx, my), focus = module == selected || module == dragging;
            int color = focus || hover ? t.ac() : DesignTheme.alpha(0xFFFFFFFF, .35f);
            c.drawBorder(b.x() - 3, b.y() - 3, b.width() + 6, b.height() + 6, color);
            c.fill(b.x() + b.width() - 1, b.y() + b.height() - 1, b.x() + b.width() + 4, b.y() + b.height() + 4, color);
            int rx = b.x() + b.width() - 2, ry = b.y() - 7;
            c.fill(rx, ry, rx + 7, ry + 7, onRemove(b, mx, my) ? 0xFFE5484D : 0xC0B23A3E);
            for (int i = 0; i < 5; i++) { c.fill(rx + 1 + i, ry + 1 + i, rx + 2 + i, ry + 2 + i, 0xFFFFFFFF); c.fill(rx + 5 - i, ry + 1 + i, rx + 6 - i, ry + 2 + i, 0xFFFFFFFF); }
            // The element's name beside it, in the accent, as in the design.
            c.getMatrices().push();
            c.getMatrices().translate(0, 0, 300);
            c.getMatrices().scale(u, u, 1);
            String name = module.title.toUpperCase(Locale.ROOT);
            float nw = width(SILK, name, 9) + 10, nx = (b.x() + b.width() + 9) / u, ny = b.y() / u;
            if (nx + nw > sw) nx = (b.x() - 9) / u - nw;
            box(c, nx, ny, nw, 16, t.ac());
            caps(c, name, nx + 5, ny + 8, 9, t.acx(), .06f);
            c.draw();
            c.getMatrices().pop();
        }
        // Toolbar at the top.
        c.getMatrices().push();
        c.getMatrices().translate(0, 0, 400);
        c.getMatrices().scale(u, u, 1);
        String hint = selected == null ? "Elemente ziehen · Mausrad: Größe · R-Shift beendet" : selected.title + " · " + Math.round(cfg.placement(selected).size * 100) + " % · Pfeile: verschieben";
        String grid = cfg.snap ? "RASTER: AN" : "RASTER: AUS";
        float hintW = MenuType.width(INTER, hint, 13, u);
        float barW = 16 + 18 + 12 + MenuType.width(PIXEL, "HUD-Editor", 18, u) + 12 + hintW + 12 + buttonWidth((char) 0, grid) + 8 + buttonWidth(MenuType.RESET, "STANDARD") + 8 + buttonWidth((char) 0, "FERTIG") + 8, barH = 47;
        float bx = sw / 2f - barW / 2f, by = 16, mid = by + barH / 2f;
        box(c, bx, by, barW, barH, DesignTheme.alpha(t.bg(), .9f));
        frame(c, bx, by, barW, barH, t.line());
        float x = bx + 16;
        MenuType.icon(c, MenuType.LIGHTNING, x + 9, mid, 18, t.act(), true, u);
        x += 30;
        MenuType.middle(c, PIXEL, "HUD-Editor", x, mid, 18, t.tx(), u);
        x += MenuType.width(PIXEL, "HUD-Editor", 18, u) + 12;
        MenuType.middle(c, INTER, hint, x, mid, 13, t.mu(), u);
        x += hintW + 12;
        x += button(c, x, by + 8, 31, (char) 0, grid, false, cfg.snap ? "Raster: AN" : "Raster: AUS", () -> { cfg.snap = !cfg.snap; persist(); }) + 8;
        x += button(c, x, by + 8, 31, MenuType.RESET, "STANDARD", false, "Layout resetten", () -> { cfg.layout.clear(); persist(); SaviraToasts.show("HUD", "Layout zurückgesetzt"); }) + 8;
        button(c, x, by + 8, 31, (char) 0, "FERTIG", true, "Fertig", () -> show(Page.MODS));
        c.draw();
        c.getMatrices().pop();
    }
    private static boolean onRemove(SaviraHud.Bounds b, double x, double y) {
        int rx = b.x() + b.width() - 2, ry = b.y() - 7;
        return x >= rx && x < rx + 7 && y >= ry && y < ry + 7;
    }
    private void move(HudModule module, double x, double y, boolean snap) {
        SaviraHud.Bounds b = SaviraHud.bounds(module, width, height);
        if (snap) {
            x = Math.round(x / 4) * 4; y = Math.round(y / 4) * 4;
            if (Math.abs(x + b.width() / 2d - width / 2d) < 6) x = (width - b.width()) / 2d;
            if (Math.abs(y + b.height() / 2d - height / 2d) < 6) y = (height - b.height()) / 2d;
        }
        HudConfig.Placement p = SaviraClient.config.placement(module);
        p.x = (float) Math.clamp(x / Math.max(1, width - b.width()), 0d, 1d);
        p.y = (float) Math.clamp(y / Math.max(1, height - b.height()), 0d, 1d);
    }

    // ---------- Input ----------
    private Hit hitAt(double ux, double uy) {
        for (int i = lastHits.size() - 1; i >= 0; i--) if (lastHits.get(i).contains(ux, uy)) return lastHits.get(i);
        return null;
    }

    @Override
    public boolean mouseClicked(double x, double y, int button) {
        double ux = x / u, uy = y / u;
        mouseX = ux; mouseY = uy;
        listening = null;
        if (picker != null) {
            if (picker.mouseClicked(ux, uy)) return true;
            picker = null; persist();
            return true;
        }
        typing = null;
        Hit hit = hitAt(ux, uy);
        if (hit != null) {
            if (button == 1 && hit.right() != null) hit.right().run();
            else if (button == 0 && hit.left() != null) hit.left().run();
            return true;
        }
        if (page == Page.EDITOR) return editorClick(x, y, button);
        // The scroll bar of the page.
        if (button == 0 && maxScroll > 0 && ux >= mainX + mainW - 12 && ux < mainX + mainW && uy >= bodyTop && uy < bodyBottom) {
            draggingBar = true; scrollToBar(uy); return true;
        }
        // A click beside the window closes the menu, as in the design.
        boolean inside = ux >= wx && ux < wx + ww && uy >= wy && uy < wy + wh;
        if (!inside && button == 0) close();
        return true;
    }
    private void scrollToBar(double uy) { scroll = (float) Math.clamp((uy - bodyTop) / (bodyBottom - bodyTop), 0, 1) * maxScroll; }
    private boolean editorClick(double x, double y, int button) {
        if (button != 0) return false;
        HudModule[] modules = HudModule.values();
        for (int i = modules.length - 1; i >= 0; i--) {
            HudModule module = modules[i];
            if (!module.enabled() || !module.onHud()) continue;
            SaviraHud.Bounds b = SaviraHud.bounds(module, width, height);
            if (onRemove(b, x, y)) {
                module.toggle(); persist();
                SaviraSounds.play(SaviraSounds.Sound.OFF);
                SaviraToasts.show(module.title, "Ausgeblendet");
                if (selected == module) selected = null;
                return true;
            }
            if (x >= b.x() - 3 && x <= b.x() + b.width() + 3 && y >= b.y() - 3 && y <= b.y() + b.height() + 3) {
                selected = dragging = module;
                resizing = x >= b.x() + b.width() - 7 && y >= b.y() + b.height() - 7;
                initialSize = SaviraClient.config.placement(module).size;
                grabX = resizing ? x : x - b.x(); grabY = resizing ? y : y - b.y();
                return true;
            }
        }
        selected = null;
        return false;
    }

    @Override
    public boolean mouseDragged(double x, double y, int button, double dx, double dy) {
        mouseX = x / u; mouseY = y / u;
        if (picker != null) { picker.mouseDragged(x / u, y / u); return true; }
        if (sliding != null) { slideTo(x / u); return true; }
        if (draggingBar) { scrollToBar(y / u); return true; }
        if (dragging != null && button == 0) {
            if (resizing) SaviraClient.config.placement(dragging).size = Math.clamp(initialSize + (float) (x - grabX) / SaviraHud.size(dragging)[0], .5f, 2f);
            else move(dragging, x - grabX, y - grabY, SaviraClient.config.snap);
            return true;
        }
        return false;
    }

    @Override
    public boolean mouseReleased(double x, double y, int button) {
        if (picker != null) picker.mouseReleased();
        if (sliding != null) { sliding = null; persist(); return true; }
        if (draggingBar) { draggingBar = false; return true; }
        if (dragging != null) { dragging = null; persist(); return true; }
        return false;
    }

    @Override
    public boolean mouseScrolled(double x, double y, double horizontal, double vertical) {
        if (page == Page.EDITOR) {
            for (HudModule module : HudModule.values()) {
                if (module.enabled() && module.onHud() && SaviraHud.bounds(module, width, height).contains(x, y)) {
                    selected = module;
                    HudConfig.Placement p = SaviraClient.config.placement(module);
                    p.size = Math.clamp(p.size + (float) vertical * .05f, .5f, 2f); persist(); return true;
                }
            }
            return false;
        }
        if (picker == null) scroll = Math.clamp(scroll - (float) vertical * 48, 0, maxScroll);
        return true;
    }

    @Override
    public boolean charTyped(char chr, int modifiers) {
        if (picker != null && picker.typing()) return picker.charTyped(chr);
        if (typing != null && !Character.isISOControl(chr)) {
            if (buffer.length() < 48) { buffer += chr; typing.set().accept(buffer); }
            if (typing != searchField) persist();
            return true;
        }
        return false;
    }

    @Override
    public boolean keyPressed(int key, int scan, int modifiers) {
        if (listening != null) {
            KeyBinding binding = listening;
            listening = null;
            binding.setBoundKey(key == GLFW.GLFW_KEY_ESCAPE ? InputUtil.UNKNOWN_KEY : InputUtil.fromKeyCode(key, scan));
            KeyBinding.updateKeysByCode();
            client.options.write();
            String title = binding == SaviraClient.lightKey ? "Light Level" : binding == SaviraClient.zoomKey ? "Zoom" : "Emotes";
            SaviraToasts.show(title, binding.isUnbound() ? "Taste entfernt" : "Taste: " + binding.getBoundKeyLocalizedText().getString());
            return true;
        }
        if (picker != null) {
            if (picker.typing() && key == GLFW.GLFW_KEY_BACKSPACE) return picker.backspace();
            if (picker.typing() && (key == GLFW.GLFW_KEY_ENTER || key == GLFW.GLFW_KEY_KP_ENTER)) { picker.stopTyping(); return true; }
            if (key == GLFW.GLFW_KEY_ESCAPE) { if (picker.typing()) picker.stopTyping(); else { picker = null; persist(); } return true; }
        }
        if (typing != null) {
            if (key == GLFW.GLFW_KEY_BACKSPACE) {
                if (!buffer.isEmpty()) { buffer = hasControlDown() ? "" : buffer.substring(0, buffer.length() - 1); typing.set().accept(buffer); }
                if (typing != searchField) persist();
                return true;
            }
            if (key == GLFW.GLFW_KEY_V && hasControlDown()) {
                String next = buffer + client.keyboard.getClipboard().replaceAll("[\\r\\n]", " ");
                buffer = next.substring(0, Math.min(48, next.length()));
                typing.set().accept(buffer);
                if (typing != searchField) persist();
                return true;
            }
            if (key == GLFW.GLFW_KEY_ESCAPE || key == GLFW.GLFW_KEY_ENTER || key == GLFW.GLFW_KEY_KP_ENTER) { typing = null; return true; }
            // Other keys belong to the text field, except the menu key.
            if (SaviraClient.menuKey == null || !SaviraClient.menuKey.matchesKey(key, scan)) return true;
        }
        // Right Shift closes the menu, or leaves the HUD editor.
        if (SaviraClient.menuKey != null && SaviraClient.menuKey.matchesKey(key, scan)) {
            if (page == Page.EDITOR) show(Page.MODS); else close();
            return true;
        }
        if (key == GLFW.GLFW_KEY_ESCAPE) {
            if (page == Page.EDITOR || page == Page.DETAIL) show(Page.MODS);
            else close();
            return true;
        }
        if (page == Page.EDITOR && selected != null && key >= GLFW.GLFW_KEY_RIGHT && key <= GLFW.GLFW_KEY_UP) {
            SaviraHud.Bounds b = SaviraHud.bounds(selected, width, height);
            int step = hasShiftDown() ? 10 : 1;
            move(selected, b.x() + (key == GLFW.GLFW_KEY_RIGHT ? step : key == GLFW.GLFW_KEY_LEFT ? -step : 0), b.y() + (key == GLFW.GLFW_KEY_DOWN ? step : key == GLFW.GLFW_KEY_UP ? -step : 0), false);
            persist(); return true;
        }
        return super.keyPressed(key, scan, modifiers);
    }

    @Override
    public void close() { storeActive(); persist(); super.close(); }
    @Override
    public void removed() { storeActive(); persist(); }
    @Override
    public boolean shouldPause() { return false; }
    @Override
    public boolean shouldCloseOnEsc() { return false; }

    // ---------- For the UI test: controls by their label, as a player would click them ----------
    public boolean has(String label) { return lastHits.stream().anyMatch(h -> h.label().equals(label) || h.label().startsWith(label)); }
    public void click(String label) { find(label).left().run(); }
    public void rightClick(String label) { Hit h = find(label); (h.right() != null ? h.right() : h.left()).run(); }
    private Hit find(String label) {
        return lastHits.stream().filter(h -> h.label().equals(label)).findFirst()
            .or(() -> lastHits.stream().filter(h -> h.label().startsWith(label)).findFirst())
            .orElseThrow(() -> new IllegalStateException("Control missing: " + label + " (page " + page + ")"));
    }
    /** Labels of the controls on screen, in drawing order. */
    public List<String> labels() { return lastHits.stream().map(Hit::label).toList(); }
    public String page() { return page == Page.MODS && profilesTab ? "PROFILES" : page.name(); }
    public void type(String text) { for (char ch : text.toCharArray()) charTyped(ch, 0); }
    public void scrollTo(float y) { scroll = Math.clamp(y, 0, maxScroll); }
    public float scrollMax() { return maxScroll; }
    public float scrollShown() { return scrollPos; }
    /** Centre of a control in screen (gui) coordinates, for clicks and drags in the test. */
    public double[] centerOf(String label) { Hit h = find(label); return new double[] {(h.x() + h.w() / 2) * u, (h.y() + h.h() / 2) * u}; }
}

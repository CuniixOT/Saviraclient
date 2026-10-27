package gg.savira.client;

import com.mojang.blaze3d.systems.RenderSystem;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.client.gui.widget.ClickableWidget;
import net.minecraft.client.gui.widget.TextFieldWidget;
import net.minecraft.item.ItemStack;
import net.minecraft.text.OrderedText;
import net.minecraft.text.Text;
import net.minecraft.util.Util;
import org.lwjgl.glfw.GLFW;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.function.IntConsumer;
import java.util.function.IntSupplier;

/**
 * Savira's Right-Shift menu, built like NoRisk's. The start page edits the HUD directly;
 * "Mod-Menü" opens the window: sidebar, module cards (click toggles, "…" or right click opens the
 * settings), settings pages with NoRisk's controls, light and dark look.
 *
 * Everything in the window is laid out in menu units: NoRisk's pixels at 1280x720. They scale
 * with the window height, so the menu has NoRisk's proportions at every GUI scale. The HUD around
 * it keeps normal screen coordinates.
 */
public final class HudScreen extends Screen {
    private enum Page { HOME, MODS, SETTINGS, FEATURE, EDITOR, EMOTES }
    private record Row(String label, int y, boolean section) {}
    private record Feature(String name, String label, String[] icon, String blurb) {}

    // NoRisk's window in its pixels: sidebar, gap, header, footer, cards.
    private static final int W = 507, H = 330, SIDE = 51, GAP = 7, HEAD = 47, FOOT = 27, CARD_W = 207, CARD_H = 54, CARD_GAP_X = 9, CARD_GAP_Y = 7;
    private static final int NEW_TAG = 0xFFF2C32E, NEW_SHADOW = 0xFF5A4508, REMOVE = 0xFFE5484D;
    /** Coming features in the sidebar; null icon means the Savira logo. */
    private static final List<Feature> FEATURES = List.of(
        new Feature("Savira Plus", "PLUS", null, "Exklusive Cosmetics und Vorteile für Unterstützer."),
        new Feature("Cosmetics", "COSMETICS", PixelIcons.SHIRT, "Capes, Hüte und Effekte für deine Figur."),
        new Feature("Friends", "FRIENDS", PixelIcons.FRIENDS, "Freunde sehen, einladen und zusammen spielen."),
        new Feature("Emotes", "EMOTES", PixelIcons.EMOTE, "Winken, Tanzen und mehr, sichtbar für andere.")
    );

    private Page page = Page.HOME;
    private String feature = "", query = "", saveError = "";
    private HudModule editing;
    /** Gui units per menu unit, screen size in menu units, window position. */
    private float u = 1, slide;
    private int sw, sh, wx, wy, mainX, mainW, contentTop, contentBottom, scroll, maxScroll, rowsEnd;
    /** Shown scroll position: glides towards {@code scroll}, the target. */
    private float scrollPos, alpha = 1f;
    private long lastFrame;
    private boolean draggingBar;
    private double barGrab, lastMouseX, lastMouseY;
    /** Cards fade out over this many units at the top and bottom edge of the list. */
    private static final int FADE = 14;
    private TextFieldWidget search, textField;
    private ColorPicker picker;
    private final List<ClickableWidget> cards = new ArrayList<>();
    private final List<Row> rows = new ArrayList<>();
    // HUD editing (start page, around the window and on the editor page), in screen coordinates.
    private HudModule selected, dragging;
    private boolean resizing, opened;
    private double grabX, grabY;
    private float initialSize;
    // Fade in when the menu opens; the window slides up when it appears.
    private final long openedAt = Util.getMeasuringTimeMs();
    private long windowAt;

    public HudScreen() { super(Text.literal("Savira · Mod-Menü")); }

    /** Gui units per menu unit; tests use it to click widgets, which live in menu units. */
    public float unit() { return u; }
    /** The open colour picker, for tests; null when closed. */
    public ColorPicker picker() { return picker; }
    private static boolean isWindow(Page p) { return p == Page.MODS || p == Page.SETTINGS || p == Page.FEATURE || p == Page.EMOTES; }
    private static float ease(float t) { t = Math.clamp(t, 0f, 1f); return 1 - (1 - t) * (1 - t) * (1 - t); }
    private MenuTheme t() { return MenuTheme.current(); }

    @Override
    protected void init() {
        if (!opened) { opened = true; SaviraSounds.play(SaviraSounds.Sound.OPEN); }
        MenuText.calibrate();
        rebuild();
    }

    private void show(Page next) {
        if (isWindow(next) && !isWindow(page)) { windowAt = Util.getMeasuringTimeMs(); SaviraSounds.play(SaviraSounds.Sound.WINDOW); }
        listeningKey = null;
        persist(); page = next; scroll = 0; scrollPos = 0; draggingBar = false; dragging = null; selected = null; picker = null;
        rebuild();
    }

    private void rebuild() {
        clearChildren(); cards.clear(); rows.clear(); search = null; textField = null; picker = null;
        // NoRisk's menu is 330 of 720 pixels high; keep that share, and fit narrow or tiny windows.
        u = Math.min(height / 720f, Math.min((width - 12) / (float) W, (height - 12) / (float) H));
        sw = (int) (width / u); sh = (int) (height / u);
        wx = (sw - W) / 2; wy = (sh - H) / 2;
        mainX = wx + SIDE + GAP; mainW = W - SIDE - GAP;
        contentTop = wy + 60; contentBottom = wy + H - FOOT - 3;
        switch (page) {
            case HOME -> buildHome();
            case MODS -> { buildFrame(); buildMods(); }
            case SETTINGS -> { buildFrame(); buildSettings(); }
            case FEATURE -> buildFrame();
            case EMOTES -> { buildFrame(); buildEmoteSettings(); }
            case EDITOR -> buildEditor();
        }
    }

    private boolean overWindow(double x, double y) {
        double ux = x / u, uy = y / u;
        return isWindow(page) && ux >= wx && ux < wx + W && uy >= wy && uy < wy + H;
    }

    private static void icon(DrawContext c, String[] glyph, int x, int y, int px, int color) {
        if (glyph == null) {
            // The logo fills 14 of its 16 units: scale it so those 14 cover the 10x10 icon box.
            float scale = 10f * px / 14f;
            c.getMatrices().push();
            c.getMatrices().translate(x - scale, y - scale, 0);
            c.getMatrices().scale(scale, scale, 1);
            MenuStyle.logo(c, 0, 0, 1, color, false);
            c.getMatrices().pop();
        }
        else PixelIcons.draw(c, glyph, x, y, px, color);
    }

    // ---------- Start page: logo, Mod-Menü bar, shortcuts; the HUD around it is editable ----------
    private void buildHome() {
        // NoRisk: bar 262x27 just below the middle, five 36px tiles 7px apart under it.
        int barY = Math.round(sh * .497f), x = sw / 2 - 131;
        addDrawableChild(homeBar(x, barY, 262, 27));
        int size = 36, gap = 7, rowX = sw / 2 - (5 * size + 4 * gap) / 2, rowY = barY + 35;
        // The logo tile sits in the middle, where NoRisk has its yellow bolt.
        String[] order = {"Cosmetics", "Friends", "Savira Plus", "Emotes"};
        for (int i = 0; i < order.length; i++) {
            Feature f = feature(order[i]);
            addDrawableChild(homeTile(rowX + i * (size + gap), rowY, size, f.name(), f.icon(), b -> openFeature(f.name())));
        }
        addDrawableChild(homeTile(rowX + 4 * (size + gap), rowY, size, "HUD-Editor", PixelIcons.HUD, b -> show(Page.EDITOR)));
    }
    private static Feature feature(String name) { return FEATURES.stream().filter(f -> f.name().equals(name)).findFirst().orElse(FEATURES.get(0)); }

    private ButtonWidget homeBar(int x, int y, int w, int h) {
        return new MenuWidgets.Control(x, y, w, h, "Mod-Menü", b -> show(Page.MODS)) {
            @Override
            protected void renderWidget(DrawContext c, int mx, int my, float delta) {
                c.fill(getX(), getY(), getX() + getWidth(), getY() + getHeight(), t().panel());
                if (hover()) { c.fill(getX(), getY(), getX() + getWidth(), getY() + getHeight(), t().cardHover()); c.drawBorder(getX(), getY(), getWidth(), getHeight(), t().cardOnEdge()); }
                MenuText.capsCentered(c, "MOD-MENÜ", getX() + getWidth() / 2f, getY() + getHeight() / 2f, MenuText.LABEL, t().text());
            }
        };
    }

    private ButtonWidget homeTile(int x, int y, int size, String label, String[] glyph, ButtonWidget.PressAction action) {
        return new MenuWidgets.Control(x, y, size, size, label, action) {
            @Override
            protected void renderWidget(DrawContext c, int mx, int my, float delta) {
                c.fill(getX(), getY(), getX() + getWidth(), getY() + getHeight(), t().panel());
                if (hover()) { c.fill(getX(), getY(), getX() + getWidth(), getY() + getHeight(), t().cardHover()); c.drawBorder(getX(), getY(), getWidth(), getHeight(), t().cardOnEdge()); }
                // The logo tile stands out like NoRisk's yellow bolt.
                icon(c, glyph, getX() + (getWidth() - 20) / 2, getY() + (getHeight() - 20) / 2, 2, glyph == null ? MenuStyle.accent() : hover() ? 0xFFFFFFFF : t().text());
            }
        };
    }

    private void openFeature(String name) { feature = name; show(name.equals("Emotes") ? Page.EMOTES : Page.FEATURE); }

    // ---------- Frame: sidebar, header and footer of the window ----------
    private void buildFrame() {
        for (int i = 0; i < FEATURES.size(); i++) {
            Feature f = FEATURES.get(i);
            addDrawableChild(new MenuWidgets.Control(wx, wy + 6 + i * 39, SIDE, 38, f.name(), b -> openFeature(f.name())) {
                @Override
                protected void renderWidget(DrawContext c, int mx, int my, float delta) {
                    boolean current = (page == Page.FEATURE || page == Page.EMOTES) && feature.equals(f.name());
                    if (current) c.fill(getX() + 3, getY(), getX() + getWidth() - 3, getY() + getHeight(), t().cardOn());
                    else if (hover()) c.fill(getX() + 3, getY(), getX() + getWidth() - 3, getY() + getHeight(), t().cardHover());
                    int color = current || hover() ? 0xFFFFFFFF : t().title();
                    icon(c, f.icon(), getX() + (getWidth() - 20) / 2, getY() + 5, 2, f.icon() == null && !current ? MenuStyle.accent() : color);
                    MenuText.capsCentered(c, f.label(), getX() + getWidth() / 2f, getY() + 31, MenuText.TINY, color);
                }
            });
        }
        if (page != Page.SETTINGS && page != Page.EMOTES) addDrawableChild(themeButton(mainX + mainW - (page == Page.MODS ? 132 : 26), wy + 17));
        if (page == Page.SETTINGS || page == Page.EMOTES) return;
        if (page == Page.FEATURE) { addDrawableChild(MenuWidgets.back(mainX + 11, wy + 13, feature, b -> show(Page.MODS))); return; }
        ButtonWidget mods = addDrawableChild(MenuWidgets.tab(mainX + 11, wy + 13, "Mods", true, b -> show(Page.MODS)));
        addDrawableChild(MenuWidgets.tab(mods.getX() + mods.getWidth() + 6, wy + 13, "HUD-Editor", false, b -> show(Page.EDITOR)));
    }

    /** Sun in the light look, moon in the dark one: switches the menu's look. */
    private ButtonWidget themeButton(int x, int y) {
        return MenuWidgets.iconButton(x, y, 14, "Dunkles Design", () -> SaviraClient.config.menuDark ? PixelIcons.MOON : PixelIcons.SUN, () -> t().text(), b -> {
            SaviraClient.config.menuDark = !SaviraClient.config.menuDark; persist(); rebuild();
            SaviraToasts.show("Design", SaviraClient.config.menuDark ? "Dunkel" : "Hell");
        });
    }

    // ---------- Module grid ----------
    private void buildMods() {
        int sx = mainX + mainW - 116;
        search = new TextFieldWidget(textRenderer, sx + 6, wy + 20, 92, 9, Text.literal("Module suchen"));
        search.setDrawsBackground(false); search.setMaxLength(48);
        search.setPlaceholder(Text.literal("Suchen ...")); search.setText(query);
        search.setChangedListener(value -> { query = value; scroll = 0; scrollPos = 0; rebuildCards(); });
        addDrawableChild(search);
        addDrawableChild(soundButton(mainX + mainW - 150, wy + 17));
        rebuildCards();
    }

    /** Headphones left of the search: turns Savira's interface sounds on or off. */
    private ButtonWidget soundButton(int x, int y) {
        return new MenuWidgets.Control(x, y, 14, 14, "UI-Sounds", b -> {
            HudConfig cfg = SaviraClient.config;
            cfg.uiSounds = !cfg.uiSounds; persist();
            if (cfg.uiSounds) SaviraSounds.play(SaviraSounds.Sound.ON);
            SaviraToasts.show("UI-Sounds", cfg.uiSounds ? "Aktiviert" : "Deaktiviert");
        }) {
            @Override public void playDownSound(net.minecraft.client.sound.SoundManager sounds) { /* The toggle plays its own sound. */ }
            @Override
            protected void renderWidget(DrawContext c, int mx, int my, float delta) {
                boolean on = SaviraClient.config.uiSounds;
                PixelIcons.draw(c, PixelIcons.HEADPHONES, getX() + 2, getY() + 2, 1, !on ? t().muted() : hover() ? 0xFFFFFFFF : t().text());
                if (!on) for (int i = 0; i < 11; i++) c.fill(getX() + 1 + i, getY() + 1 + i, getX() + 3 + i, getY() + 2 + i, REMOVE);
            }
        };
    }

    private void rebuildCards() {
        for (ClickableWidget card : cards) remove(card);
        cards.clear();
        if (page != Page.MODS) return;
        String needle = query.strip().toLowerCase(Locale.ROOT);
        List<HudModule> visible = Arrays.stream(HudModule.values())
                .filter(m -> (m.title + " " + m.category + " " + m.description).toLowerCase(Locale.ROOT).contains(needle))
                .sorted(java.util.Comparator.comparing((HudModule m) -> !m.isNew()).thenComparing(m -> m.isNew() ? -m.released().toEpochDay() : 0)).toList();
        int rowsNeeded = (visible.size() + 1) / 2;
        maxScroll = Math.max(0, rowsNeeded * (CARD_H + CARD_GAP_Y) - CARD_GAP_Y - (contentBottom - contentTop));
        scroll = Math.clamp(scroll, 0, maxScroll);
        scrollPos = Math.clamp(scrollPos, 0, maxScroll);
        for (int i = 0; i < visible.size(); i++) {
            int x = mainX + 11 + (i % 2) * (CARD_W + CARD_GAP_X), y = contentTop + (i / 2) * (CARD_H + CARD_GAP_Y);
            cards.add(addDrawableChild(new ModuleCard(x, y, visible.get(i))));
        }
        placeCards();
    }

    /** Moves the cards to the shown scroll position; only the visible ones take clicks. */
    private void placeCards() {
        int whole = (int) Math.floor(scrollPos);
        for (ClickableWidget widget : cards) {
            ModuleCard card = (ModuleCard) widget;
            card.setY(card.baseY - whole);
            card.active = card.getY() < contentBottom && card.getY() + CARD_H > contentTop;
        }
    }

    /** Eases the list towards its target, independent of the frame rate; settles in about 0.2 s. */
    private void animateScroll() {
        long now = Util.getMeasuringTimeMs();
        float dt = lastFrame == 0 ? 0 : Math.min(.1f, (now - lastFrame) / 1000f);
        lastFrame = now;
        if (page != Page.MODS) return;
        if (draggingBar || Math.abs(scroll - scrollPos) < .05f) scrollPos = scroll;
        else scrollPos += (scroll - scrollPos) * (1 - (float) Math.exp(-dt * 16));
        placeCards();
    }

    private int barX() { return mainX + mainW - 8; }
    private int thumbHeight() { int track = contentBottom - contentTop; return Math.max(20, track * track / (track + maxScroll)); }
    private boolean onBar(double ux, double uy) { return maxScroll > 0 && ux >= barX() - 3 && ux < barX() + 6 && uy >= contentTop && uy < contentBottom; }
    private void scrollToBar(double uy) {
        int track = contentBottom - contentTop - thumbHeight();
        scroll = (int) Math.round(Math.clamp((uy - barGrab - contentTop) / Math.max(1, track), 0, 1) * maxScroll);
    }

    private Text moduleLabel(HudModule m) { return Text.literal(m.title + (m.enabled() ? ": aktiviert" : ": deaktiviert")); }

    /** Scissor in menu units (Minecraft's scissor ignores the matrix). */
    private void clip(DrawContext c, int x1, int y1, int x2, int y2) {
        c.enableScissor((int) Math.floor(x1 * u), (int) Math.floor((y1 + slide) * u), (int) Math.ceil(x2 * u), (int) Math.ceil((y2 + slide) * u));
    }

    /** NoRisk card: NEU, item, caps title, two lines of description, "…" for the settings. */
    private final class ModuleCard extends MenuWidgets.Control {
        private final HudModule module;
        private final int baseY;
        ModuleCard(int x, int y, HudModule module) {
            super(x, y, CARD_W, CARD_H, "", b -> {
                module.toggle(); persist();
                SaviraSounds.play(module.enabled() ? SaviraSounds.Sound.ON : SaviraSounds.Sound.OFF);
                SaviraToasts.show(module.title, module.enabled() ? "Aktiviert" : "Deaktiviert");
            });
            this.module = module; this.baseY = y;
            setMessage(moduleLabel(module));
        }
        @Override public void playDownSound(net.minecraft.client.sound.SoundManager sounds) { /* ON/OFF sounds play in the press action. */ }
        @Override public Text getMessage() { return moduleLabel(module); }
        private boolean onDots(double mx) { return mx >= getX() + getWidth() - 26; }
        @Override
        public boolean mouseClicked(double mx, double my, int button) {
            if (!active || !visible || !isMouseOver(mx, my) || my < contentTop || my >= contentBottom) return false;
            if (button == 1 || (button == 0 && onDots(mx))) { SaviraSounds.play(SaviraSounds.Sound.CLICK); openSettings(module); return true; }
            return super.mouseClicked(mx, my, button);
        }
        @Override
        protected void renderWidget(DrawContext c, int mouseX, int mouseY, float delta) {
            if (getY() + getHeight() < contentTop || getY() > contentBottom) return;
            MenuTheme t = t();
            clip(c, mainX, contentTop, mainX + mainW, contentBottom);
            boolean on = module.enabled(), hover = !draggingBar && (isHovered() && mouseY >= contentTop && mouseY < contentBottom || isFocused());
            int x = getX(), y = getY(), w = getWidth(), h = getHeight();
            // Sub-unit offset for a smooth glide, and a soft fade at the top and bottom of the list.
            float frac = scrollPos - (float) Math.floor(scrollPos), shown = y - frac;
            float edge = Math.min((shown + h - contentTop) / FADE, (contentBottom - shown) / FADE);
            RenderSystem.setShaderColor(1f, 1f, 1f, alpha * Math.clamp(edge, 0f, 1f));
            c.getMatrices().push();
            c.getMatrices().translate(0, -frac, 0);
            c.fill(x, y, x + w, y + h, on ? t.cardOn() : t.card());
            if (hover) c.fill(x, y, x + w, y + h, t.cardHover());
            c.drawBorder(x, y, w, h, on ? t.cardOnEdge() : hover ? t.boxHover() : t.cardEdge());
            c.getMatrices().push();
            c.getMatrices().translate(x + 10, y + 16, 0);
            c.getMatrices().scale(1.5f, 1.5f, 1);
            c.drawItem(new ItemStack(module.icon), 0, 0);
            c.getMatrices().pop();
            int textX = x + 40, textW = w - 40 - 26;
            String title = module.title.toUpperCase(Locale.ROOT);
            while (title.length() > 3 && MenuText.width(title, MenuText.TITLE) > textW) title = title.substring(0, title.length() - 4) + "…";
            MenuText.caps(c, title, textX, y + 9, MenuText.TITLE, on || hover ? t.text() : t.title());
            List<OrderedText> lines = textRenderer.wrapLines(Text.literal(module.description), textW);
            for (int i = 0; i < Math.min(2, lines.size()); i++) MenuText.plain(c, lines.get(i), textX, y + 23 + i * 9, 1f, t.muted());
            boolean dots = hover && onDots(mouseX);
            MenuText.plain(c, "...", x + w - 21, y + h / 2f - 2, 1f, dots ? 0xFFFFFFFF : t.muted());
            if (module.isNew()) newTag(c, x + 10, y + 5);
            c.draw();
            c.getMatrices().pop();
            RenderSystem.setShaderColor(1f, 1f, 1f, alpha);
            c.disableScissor();
        }
    }

    /** "NEU" in yellow caps with a dark drop, like NoRisk's "NEW". */
    private void newTag(DrawContext c, int x, int y) {
        c.getMatrices().push();
        c.getMatrices().translate(0, 0, 50);
        MenuText.caps(c, "NEU", x + .6f, y + .6f, 10f, NEW_SHADOW);
        MenuText.caps(c, "NEU", x, y, 10f, NEW_TAG);
        c.getMatrices().pop();
    }

    // ---------- Module settings ----------
    private void openSettings(HudModule module) {
        if (module == HudModule.EMOTES) { feature = "Emotes"; show(Page.EMOTES); return; }
        editing = module; show(Page.SETTINGS);
    }

    private int right() { return mainX + 428; }
    private int rowY;
    private void section(String label) { rowY += 3; rows.add(new Row(label, rowY, true)); rowY += 17; }
    private void row(String label, int height) { rows.add(new Row(label, rowY + height / 2, false)); rowY += Math.max(17, height + 4); }

    private void buildSettings() {
        HudModule m = editing;
        HudConfig cfg = SaviraClient.config;
        addDrawableChild(MenuWidgets.back(mainX + 11, wy + 13, m.title, b -> show(Page.MODS)));
        addDrawableChild(MenuWidgets.labelButton(mainX + 316, wy + 15, 38, 18, "Modul an/aus", () -> m.enabled() ? "AN" : "AUS", () -> m.enabled() ? t().stateOn() : t().stateOff(), b -> {
            m.toggle(); persist();
            SaviraSounds.play(m.enabled() ? SaviraSounds.Sound.ON : SaviraSounds.Sound.OFF);
            SaviraToasts.show(m.title, m.enabled() ? "Aktiviert" : "Deaktiviert");
        }));
        addDrawableChild(MenuWidgets.labelButton(mainX + 361, wy + 15, 57, 18, "Zurücksetzen", () -> "RESET", () -> t().reset(), b -> {
            cfg.styles.remove(m.name());
            cfg.placement(m).size = 1f;
            if (m == HudModule.ICON) { cfg.iconType = "default"; cfg.iconNametag = cfg.iconTablist = cfg.iconSpace = true; }
            if (m == HudModule.NAMETAG) { cfg.nametagF5 = true; cfg.nametagShadow = cfg.nametagNoBackground = false; }
            if (m == HudModule.LIGHT_LEVEL) {
                HudConfig fresh = new HudConfig();
                cfg.lightRange = fresh.lightRange; cfg.lightMode = fresh.lightMode; cfg.lightOnlySpawnable = fresh.lightOnlySpawnable;
                cfg.lightTextSize = fresh.lightTextSize; cfg.lightAlpha = fresh.lightAlpha;
                cfg.lightColorSpawnable = fresh.lightColorSpawnable; cfg.lightColorNight = fresh.lightColorNight; cfg.lightColorSafe = fresh.lightColorSafe;
                LightLevel.rescanNow();
            }
            persist(); rebuild();
            SaviraToasts.show(m.title, "Einstellungen zurückgesetzt");
        }));
        addDrawableChild(themeButton(mainX + 423, wy + 17));
        rowY = wy + 106;
        if (m == HudModule.ICON) buildIconSettings();
        else if (m == HudModule.NAMETAG) buildNametagSettings();
        else if (m == HudModule.LIGHT_LEVEL) buildLightSettings();
        else buildStyleSettings(m);
        rowsEnd = rowY;
    }

    private void buildStyleSettings(HudModule m) {
        HudConfig.Style style = SaviraClient.config.style(m);
        HudBackground bg = HudBackground.parse(style.background);
        int r = right();
        section("Darstellung");
        HudConfig.Placement placement = SaviraClient.config.placement(m);
        addDrawableChild(MenuWidgets.slider(r - MenuWidgets.SLIDER_W, rowY, "HUD-Skalierung", 50, 200, 5, 100, () -> Math.round(placement.size * 100), v -> Math.round(v) + "%", v -> { placement.size = (float) (v / 100); persist(); }));
        row("HUD-Skalierung", MenuWidgets.SLIDER_H);
        addDrawableChild(MenuWidgets.cycle(r - MenuWidgets.CYCLE_W, rowY, () -> HudBackground.parse(style.background).label, step -> {
            style.background = HudBackground.parse(style.background).next(step).name(); persist(); rebuild();
        }));
        row("Hintergrund", MenuWidgets.CYCLE_H);
        if (bg.coloured) {
            addDrawableChild(MenuWidgets.swatch(r - MenuWidgets.SWATCH, rowY, "Hintergrundfarbe", () -> style.backgroundColor, w -> openPicker(w, style.backgroundColor, color -> {
                style.backgroundColor = (style.backgroundColor & 0xFF000000) | (color & 0xFFFFFF); persist();
            })));
            row("Hintergrundfarbe", MenuWidgets.SWATCH);
            if (bg == HudBackground.COLOR) {
                addDrawableChild(MenuWidgets.slider(r - MenuWidgets.SLIDER_W, rowY, "Deckkraft", 10, 100, 5, 70, () -> Math.round((style.backgroundColor >>> 24) / 2.55), v -> Math.round(v) + "%", v -> {
                    style.backgroundColor = ((int) Math.round(v * 2.55) << 24) | (style.backgroundColor & 0xFFFFFF); persist();
                }));
                row("Deckkraft", MenuWidgets.SLIDER_H);
            }
        }
        if (bg.rounded) {
            addDrawableChild(MenuWidgets.slider(r - MenuWidgets.SLIDER_W, rowY, "Ecken", 0, 8, 1, 3, () -> style.radius, v -> Integer.toString((int) v), v -> { style.radius = (int) v; persist(); }));
            row("Ecken", MenuWidgets.SLIDER_H);
        }
        section("Text");
        if (m.textual()) {
            textField = new TextFieldWidget(textRenderer, r - MenuWidgets.SLIDER_W + 4, rowY + 3, MenuWidgets.SLIDER_W - 8, 9, Text.literal("Text"));
            textField.setDrawsBackground(false); textField.setMaxLength(48);
            textField.setText(style.text != null ? style.text : m.defaultText());
            textField.setChangedListener(value -> { style.text = value.isBlank() || value.equals(m.defaultText()) ? null : value; persist(); });
            addDrawableChild(textField);
            row("Text", MenuWidgets.SLIDER_H + 2);
        }
        addDrawableChild(MenuWidgets.swatch(r - MenuWidgets.SWATCH, rowY, "Textfarbe", () -> style.textColor, w -> openPicker(w, style.textColor, color -> { style.textColor = 0xFF000000 | color; persist(); })));
        row("Textfarbe", MenuWidgets.SWATCH);
        addDrawableChild(MenuWidgets.checkbox(r - MenuWidgets.CHECK, rowY, "Textschatten", () -> style.textShadow, () -> { style.textShadow = !style.textShadow; persist(); }));
        row("Textschatten", MenuWidgets.CHECK);
    }

    /** Colour picker beside its swatch, kept inside the window. */
    private void openPicker(ButtonWidget swatch, int color, IntConsumer onChange) {
        int x = Math.clamp(swatch.getX() - ColorPicker.W - 8, mainX + 4, mainX + mainW - ColorPicker.W - 4);
        int y = Math.clamp(swatch.getY() - 30, wy + 4, wy + H - ColorPicker.H - 4);
        picker = new ColorPicker(x, y, color & 0xFFFFFF, onChange);
    }
    private void closePicker() { if (picker != null && getFocused() == picker.hex) setFocused(null); picker = null; persist(); }

    /** Icon module: choose the icon, where it shows, and whether a space follows it. */
    private void buildIconSettings() {
        HudConfig cfg = SaviraClient.config;
        section("Icon");
        int tile = 42, gap = 30, count = SaviraIcon.TYPES.size(), x0 = mainX + 17;
        for (int i = 0; i < count; i++) {
            SaviraIcon.Type type = SaviraIcon.TYPES.get(i);
            addDrawableChild(new MenuWidgets.Control(x0 + i * (tile + gap), rowY, tile, tile, type.label(), b -> {
                cfg.iconType = type.id(); persist();
                SaviraToasts.show("Icon", "Icon aktualisiert: " + type.label());
            }) {
                @Override
                protected void renderWidget(DrawContext c, int mx, int my, float delta) {
                    MenuTheme t = t();
                    boolean chosen = SaviraIcon.current() == type;
                    c.fill(getX(), getY(), getX() + getWidth(), getY() + getHeight(), chosen ? t.cardOn() : t.card());
                    if (hover()) c.fill(getX(), getY(), getX() + getWidth(), getY() + getHeight(), t.cardHover());
                    c.drawBorder(getX(), getY(), getWidth(), getHeight(), chosen ? t.cardOnEdge() : hover() ? t.boxHover() : t.cardEdge());
                    int lx = getX() + (getWidth() - 32) / 2, ly = getY() + (getHeight() - 32) / 2;
                    if (type.tint() == 0) MenuStyle.logo(c, lx, ly, 2, 0xFFFFFFFF, false);
                    else MenuStyle.logoTinted(c, lx, ly, 2, type.tint());
                    MenuText.capsCentered(c, type.label().toUpperCase(Locale.ROOT), getX() + getWidth() / 2f, getY() + getHeight() + 7, MenuText.TINY, chosen ? t.text() : t.muted());
                }
            });
        }
        rowY += tile + 16;
        section("Anzeige");
        String[][] switches = {{"Im Nametag anzeigen", "nametag"}, {"In Tab-Liste anzeigen", "tablist"}, {"Abstand zum Namen", "space"}};
        for (String[] s : switches) {
            java.util.function.BooleanSupplier get = switch (s[1]) { case "nametag" -> () -> cfg.iconNametag; case "tablist" -> () -> cfg.iconTablist; default -> () -> cfg.iconSpace; };
            Runnable flip = switch (s[1]) {
                case "nametag" -> () -> cfg.iconNametag = !cfg.iconNametag;
                case "tablist" -> () -> cfg.iconTablist = !cfg.iconTablist;
                default -> () -> cfg.iconSpace = !cfg.iconSpace;
            };
            addDrawableChild(MenuWidgets.toggle(right() - MenuWidgets.SWITCH_W, rowY, s[0], get, () -> { flip.run(); persist(); SaviraToasts.show("Icon", s[0] + ": " + (get.getAsBoolean() ? "an" : "aus")); }));
            row(s[0], MenuWidgets.SWITCH_H);
        }
    }

    /** The key binding waiting for a key press (Light Level, emote wheel, emote join). */
    private net.minecraft.client.option.KeyBinding listeningKey;
    private MenuWidgets.Control keyRow(int x, String label, net.minecraft.client.option.KeyBinding key) {
        return MenuWidgets.keyButton(x, rowY, 140, label, () -> key.isUnbound() ? "Nicht belegt" : key.getBoundKeyLocalizedText().getString(), () -> listeningKey == key, () -> listeningKey = listeningKey == key ? null : key);
    }

    /** Light Level module: toggle key, range, look, colours, like NoRisk's settings page. */
    private void buildLightSettings() {
        HudConfig cfg = SaviraClient.config;
        int r = right();
        section("Allgemein");
        addDrawableChild(keyRow(r - 140, "Taste", SaviraClient.lightKey));
        row("Taste", MenuWidgets.CYCLE_H);
        addDrawableChild(MenuWidgets.slider(r - MenuWidgets.SLIDER_W, rowY, "Reichweite", 1, 32, 1, 16, () -> cfg.lightRange, v -> Integer.toString((int) v), v -> { cfg.lightRange = (int) v; persist(); LightLevel.rescanNow(); }));
        row("Reichweite", MenuWidgets.SLIDER_H);
        section("Anzeige");
        addDrawableChild(MenuWidgets.cycle(r - MenuWidgets.CYCLE_W, rowY, () -> LightLevel.Mode.parse(cfg.lightMode).label, step -> {
            cfg.lightMode = LightLevel.Mode.parse(cfg.lightMode).next(step).name(); persist(); rebuild();
        }));
        row("Modus", MenuWidgets.CYCLE_H);
        addDrawableChild(MenuWidgets.checkbox(r - MenuWidgets.CHECK, rowY, "Nur Spawnbare", () -> cfg.lightOnlySpawnable, () -> { cfg.lightOnlySpawnable = !cfg.lightOnlySpawnable; persist(); LightLevel.rescanNow(); }));
        row("Nur Spawnbare", MenuWidgets.CHECK);
        LightLevel.Mode mode = LightLevel.Mode.parse(cfg.lightMode);
        if (mode == LightLevel.Mode.NUMBER) {
            addDrawableChild(MenuWidgets.slider(r - MenuWidgets.SLIDER_W, rowY, "Textgröße", .5, 2, .1, 1, () -> cfg.lightTextSize, v -> String.format(Locale.ROOT, "%.1f", v), v -> { cfg.lightTextSize = (float) v; persist(); }));
            row("Textgröße", MenuWidgets.SLIDER_H);
        } else if (mode == LightLevel.Mode.FILL) {
            addDrawableChild(MenuWidgets.slider(r - MenuWidgets.SLIDER_W, rowY, "Deckkraft", .1, 1, .05, .4, () -> cfg.lightAlpha, v -> String.format(Locale.ROOT, "%.2f", v), v -> { cfg.lightAlpha = (float) v; persist(); }));
            row("Deckkraft", MenuWidgets.SLIDER_H);
        }
        section("Farben");
        addDrawableChild(MenuWidgets.swatch(r - MenuWidgets.SWATCH, rowY, "Spawnbar", () -> cfg.lightColorSpawnable, w -> openPicker(w, cfg.lightColorSpawnable, color -> { cfg.lightColorSpawnable = color; persist(); })));
        row("Spawnbar", MenuWidgets.SWATCH);
        addDrawableChild(MenuWidgets.swatch(r - MenuWidgets.SWATCH, rowY, "Nachts spawnbar", () -> cfg.lightColorNight, w -> openPicker(w, cfg.lightColorNight, color -> { cfg.lightColorNight = color; persist(); })));
        row("Nachts spawnbar", MenuWidgets.SWATCH);
        addDrawableChild(MenuWidgets.swatch(r - MenuWidgets.SWATCH, rowY, "Sicher", () -> cfg.lightColorSafe, w -> openPicker(w, cfg.lightColorSafe, color -> { cfg.lightColorSafe = color; persist(); })));
        row("Sicher", MenuWidgets.SWATCH);
    }

    private static String emoteAbout() {
        var key = SaviraClient.emoteKey;
        return "Emote-Rad mit " + (key.isUnbound() ? "deiner Taste" : key.getBoundKeyLocalizedText().getString()) + ": Linksklick spielt ein Emote, Rechtsklick ändert den Slot.";
    }

    /** Emotes: keys, camera, visibility and sounds, like NoRisk's emote settings. */
    private void buildEmoteSettings() {
        HudConfig cfg = SaviraClient.config;
        int r = right();
        addDrawableChild(MenuWidgets.back(mainX + 11, wy + 13, "Emotes", b -> show(Page.MODS)));
        addDrawableChild(MenuWidgets.labelButton(mainX + 223, wy + 15, 86, 18, "Emote-Rad öffnen", () -> "EMOTE-RAD", () -> MenuStyle.accentAlpha(0xC0), b -> client.setScreen(new EmoteWheelScreen())));
        addDrawableChild(MenuWidgets.labelButton(mainX + 316, wy + 15, 38, 18, "Modul an/aus", () -> cfg.emotes ? "AN" : "AUS", () -> cfg.emotes ? t().stateOn() : t().stateOff(), b -> {
            HudModule.EMOTES.toggle(); persist();
            SaviraSounds.play(cfg.emotes ? SaviraSounds.Sound.ON : SaviraSounds.Sound.OFF);
            SaviraToasts.show("Emotes", cfg.emotes ? "Aktiviert" : "Deaktiviert");
        }));
        addDrawableChild(MenuWidgets.labelButton(mainX + 361, wy + 15, 57, 18, "Zurücksetzen", () -> "RESET", () -> t().reset(), b -> {
            HudConfig fresh = new HudConfig();
            cfg.emoteAutoSwitch = fresh.emoteAutoSwitch; cfg.emoteImmersive = fresh.emoteImmersive; cfg.emoteSounds = fresh.emoteSounds;
            cfg.emoteFirstPerson = fresh.emoteFirstPerson; cfg.emoteSoundLimit = fresh.emoteSoundLimit; cfg.emoteAudioRange = fresh.emoteAudioRange;
            cfg.emoteVisibility = fresh.emoteVisibility;
            SaviraClient.emoteKey.setBoundKey(SaviraClient.emoteKey.getDefaultKey());
            SaviraClient.emoteJoinKey.setBoundKey(SaviraClient.emoteJoinKey.getDefaultKey());
            net.minecraft.client.option.KeyBinding.updateKeysByCode(); client.options.write();
            persist(); rebuild();
            SaviraToasts.show("Emotes", "Einstellungen zurückgesetzt");
        }));
        addDrawableChild(themeButton(mainX + 423, wy + 17));
        rowY = wy + 98;
        section("Allgemein");
        addDrawableChild(keyRow(r - 140, "Taste", SaviraClient.emoteKey));
        row("Taste", MenuWidgets.CYCLE_H);
        addDrawableChild(keyRow(r - 140, "Interaktions-Taste", SaviraClient.emoteJoinKey));
        row("Interaktions-Taste", MenuWidgets.CYCLE_H);
        addDrawableChild(MenuWidgets.checkbox(r - MenuWidgets.CHECK, rowY, "Automatisch wechseln", () -> cfg.emoteAutoSwitch, () -> { cfg.emoteAutoSwitch = !cfg.emoteAutoSwitch; persist(); }));
        row("Automatisch wechseln", MenuWidgets.CHECK);
        String[][] seen = {{"ALL", "Alle"}, {"FRIENDS", "Freunde"}, {"NONE", "Niemand"}};
        addDrawableChild(MenuWidgets.cycle(r - MenuWidgets.CYCLE_W, rowY, () -> java.util.Arrays.stream(seen).filter(v -> v[0].equals(cfg.emoteVisibility)).map(v -> v[1]).findFirst().orElse("Alle"), step -> {
            int i = 0;
            for (int k = 0; k < seen.length; k++) if (seen[k][0].equals(cfg.emoteVisibility)) i = k;
            cfg.emoteVisibility = seen[Math.floorMod(i + step, seen.length)][0]; persist();
        }));
        row("Emotes sichtbar für", MenuWidgets.CYCLE_H);
        section("Einstellungen");
        addDrawableChild(MenuWidgets.checkbox(r - MenuWidgets.CHECK, rowY, "Immersive Emotes", () -> cfg.emoteImmersive, () -> { cfg.emoteImmersive = !cfg.emoteImmersive; persist(); }));
        row("Immersive Emotes", MenuWidgets.CHECK);
        addDrawableChild(MenuWidgets.checkbox(r - MenuWidgets.CHECK, rowY, "Emote-Sounds", () -> cfg.emoteSounds, () -> { cfg.emoteSounds = !cfg.emoteSounds; persist(); }));
        row("Emote-Sounds", MenuWidgets.CHECK);
        addDrawableChild(MenuWidgets.slider(r - MenuWidgets.SLIDER_W, rowY, "Sound-Spieler-Limit", 1, 20, 1, 6, () -> cfg.emoteSoundLimit, v -> Integer.toString((int) v), v -> { cfg.emoteSoundLimit = (int) v; persist(); }));
        row("Sound-Spieler-Limit", MenuWidgets.SLIDER_H);
        addDrawableChild(MenuWidgets.slider(r - MenuWidgets.SLIDER_W, rowY, "Audio-Reichweite", 4, 64, 1, 16, () -> cfg.emoteAudioRange, v -> Integer.toString((int) v), v -> { cfg.emoteAudioRange = (int) v; persist(); }));
        row("Audio-Reichweite", MenuWidgets.SLIDER_H);
        addDrawableChild(MenuWidgets.checkbox(r - MenuWidgets.CHECK, rowY, "Ego-Perspektive erlauben", () -> cfg.emoteFirstPerson, () -> { cfg.emoteFirstPerson = !cfg.emoteFirstPerson; persist(); }));
        row("Ego-Perspektive erlauben", MenuWidgets.CHECK);
        rowsEnd = rowY;
    }

    /** Nametag module: own name in F5, shadow and background of player names. */
    private void buildNametagSettings() {
        HudConfig cfg = SaviraClient.config;
        section("Nametag");
        Object[][] switches = {
            {"In F5 anzeigen", (java.util.function.BooleanSupplier) () -> cfg.nametagF5, (Runnable) () -> cfg.nametagF5 = !cfg.nametagF5},
            {"Textschatten", (java.util.function.BooleanSupplier) () -> cfg.nametagShadow, (Runnable) () -> cfg.nametagShadow = !cfg.nametagShadow},
            {"Kein Hintergrund", (java.util.function.BooleanSupplier) () -> cfg.nametagNoBackground, (Runnable) () -> cfg.nametagNoBackground = !cfg.nametagNoBackground}
        };
        for (Object[] s : switches) {
            String label = (String) s[0];
            java.util.function.BooleanSupplier get = (java.util.function.BooleanSupplier) s[1];
            Runnable flip = (Runnable) s[2];
            addDrawableChild(MenuWidgets.toggle(right() - MenuWidgets.SWITCH_W, rowY, label, get, () -> { flip.run(); persist(); SaviraToasts.show("Nametag", label + ": " + (get.getAsBoolean() ? "an" : "aus")); }));
            row(label, MenuWidgets.SWITCH_H);
        }
    }

    // ---------- HUD editor page (grid toggle, reset) ----------
    private void buildEditor() {
        int bw = 110, gap = 8, total = 4 * bw + 3 * gap, x = sw / 2 - total / 2, y = 14;
        IntSupplier glass = () -> t().panel();
        addDrawableChild(MenuWidgets.labelButton(x, y, bw, 24, "< Zurück", () -> "< ZURÜCK", glass, b -> show(Page.MODS)));
        addDrawableChild(MenuWidgets.labelButton(x + bw + gap, y, bw, 24, SaviraClient.config.snap ? "Raster: AN" : "Raster: AUS", () -> SaviraClient.config.snap ? "RASTER: AN" : "RASTER: AUS",
            () -> SaviraClient.config.snap ? t().stateOn() : t().panel(), b -> { SaviraClient.config.snap = !SaviraClient.config.snap; persist(); rebuild(); }));
        addDrawableChild(MenuWidgets.labelButton(x + 2 * (bw + gap), y, bw, 24, "Layout resetten", () -> "LAYOUT RESET", glass, b -> {
            SaviraClient.config.layout.clear(); persist();
            SaviraToasts.show("HUD", "Layout zurückgesetzt");
        }));
        addDrawableChild(MenuWidgets.labelButton(x + 3 * (bw + gap), y, bw, 24, "Fertig", () -> "FERTIG", () -> MenuStyle.accentAlpha(0xC0), b -> show(Page.MODS)));
    }

    private void persist() {
        saveError = SaviraClient.config.save() ? "" : "Speichern fehlgeschlagen. Bitte Spielordner prüfen.";
    }

    // ---------- Rendering ----------
    @Override
    public void renderBackground(DrawContext context, int mouseX, int mouseY, float delta) {
        // Drawn in render() before the HUD preview, so the world blurs but the HUD stays sharp.
    }

    @Override
    public void render(DrawContext c, int mouseX, int mouseY, float delta) {
        if (page == Page.EDITOR) c.fill(0, 0, width, height, 0x55000000);
        else super.renderBackground(c, mouseX, mouseY, delta);
        // The HUD stays visible and editable around the window.
        SaviraHud.renderModules(c, true);
        renderHudHandles(c, mouseX, mouseY);
        long now = Util.getMeasuringTimeMs();
        alpha = 1f;
        slide = 0f;
        animateScroll();
        if (page == Page.HOME) alpha = ease((now - openedAt) / 260f);
        else if (isWindow(page)) { float k = ease((now - windowAt) / 320f); alpha = k; slide = (1 - k) * 40; }
        int mx = (int) Math.floor(mouseX / u), my = (int) Math.floor(mouseY / u);
        lastMouseX = mouseX / u; lastMouseY = mouseY / u;
        RenderSystem.enableBlend();
        RenderSystem.setShaderColor(1f, 1f, 1f, Math.max(.02f, alpha));
        c.getMatrices().push();
        c.getMatrices().translate(0, 0, 400);
        c.getMatrices().scale(u, u, 1);
        c.getMatrices().translate(0, slide, 0);
        switch (page) {
            case HOME -> renderHome(c);
            case MODS, SETTINGS, FEATURE, EMOTES -> renderFrame(c);
            case EDITOR -> renderEditorHint(c);
        }
        super.render(c, picker != null ? -1000 : mx, picker != null ? -1000 : my, delta);
        if (page == Page.SETTINGS) renderSettingsOverlay(c);
        if (picker != null) picker.render(c, mx, my, delta);
        c.draw();
        RenderSystem.setShaderColor(1f, 1f, 1f, 1f);
        if (!saveError.isEmpty()) MenuText.plain(c, saveError, sw / 2f - textRenderer.getWidth(saveError) / 2f, sh - 40, 1f, 0xFFFF9C9C);
        c.getMatrices().pop();
        SaviraToasts.render(c, width);
    }

    private void renderHome(DrawContext c) {
        // "SAVIRA [logo] CLIENT" centred a little above the bar, like NoRisk's logo.
        int center = sw / 2, y = Math.round(sh * .442f) - 10, scale = 3;
        String left = "SAVIRA", right = "CLIENT";
        int lw = textRenderer.getWidth(left) * scale, rw = textRenderer.getWidth(right) * scale, logo = 42, gap = 10;
        int start = center - (lw + gap + logo + gap + rw) / 2;
        drawBig(c, left, start, y, scale, 0xFFFFFFFF);
        MenuStyle.logo(c, start + lw + gap + logo / 2 - 24, y - 13, 3, MenuStyle.accent());
        drawBig(c, right, start + lw + gap + logo + gap, y, scale, 0xFFE6E9EC);
        String hint = selected != null ? selected.title + "  ·  " + Math.round(SaviraClient.config.placement(selected).size * 100) + " %  ·  Pfeile: verschieben"
                : "HUD ziehen: verschieben  ·  Mausrad oder Ecke: Größe  ·  X: ausblenden";
        MenuText.plain(c, hint, center - textRenderer.getWidth(hint) / 2f, sh - 22, 1f, 0xFFDDDBD3);
    }

    private void drawBig(DrawContext c, String text, int x, int y, int scale, int color) {
        c.getMatrices().push();
        c.getMatrices().translate(x, y, 0);
        c.getMatrices().scale(scale, scale, 1);
        c.drawText(textRenderer, text, 0, 1, 0x80000000, false);
        c.drawText(textRenderer, text, 0, 0, color, false);
        c.getMatrices().pop();
    }

    private void renderFrame(DrawContext c) {
        MenuTheme t = t();
        // Sidebar and window, both in the theme's veil.
        c.fill(wx, wy, wx + SIDE, wy + H, t.panel());
        c.fill(mainX, wy, mainX + mainW, wy + H, t.panel());
        c.fill(mainX, wy + HEAD, mainX + mainW, wy + HEAD + 1, t.line());
        c.fill(mainX, wy + H - FOOT, mainX + mainW, wy + H - FOOT + 1, t.line());
        // Footer: "■ 9 / 12 MODULE AKTIV", where NoRisk shows the friends online.
        long active = Arrays.stream(HudModule.values()).filter(HudModule::enabled).count();
        String count = active + " / " + HudModule.values().length + " MODULE AKTIV";
        int cw = MenuText.width(count, MenuText.TINY), fy = wy + H - FOOT / 2;
        MenuText.capsMiddle(c, count, mainX + mainW - 12 - cw, fy, MenuText.TINY, t.muted());
        c.fill(mainX + mainW - 12 - cw - 9, fy - 3, mainX + mainW - 12 - cw - 3, fy + 3, MenuStyle.accent());

        if (page == Page.MODS) {
            int sx = mainX + mainW - 116;
            boolean focused = search != null && search.isFocused();
            c.fill(sx, wy + 13, sx + 104, wy + 34, t.box());
            c.drawBorder(sx, wy + 13, 104, 21, focused ? t.boxHover() : t.boxEdge());
            if (cards.isEmpty()) {
                int cx = mainX + mainW / 2;
                PixelIcons.draw(c, PixelIcons.SEARCH, cx - 10, contentTop + 34, 2, t.muted());
                MenuText.capsCentered(c, "KEINE PASSENDEN MODULE", cx, contentTop + 70, MenuText.TITLE, t.text());
                MenuText.plain(c, "Andere Suche probieren.", cx - textRenderer.getWidth("Andere Suche probieren.") / 2f, contentTop + 82, 1f, t.muted());
            }
            if (maxScroll > 0) {
                int track = contentBottom - contentTop, thumb = thumbHeight(), x = barX();
                float top = contentTop + (track - thumb) * scrollPos / maxScroll;
                boolean grabbed = draggingBar || onBar(lastMouseX, lastMouseY);
                c.fill(x, contentTop, x + 3, contentBottom, 0x14FFFFFF);
                c.getMatrices().push();
                c.getMatrices().translate(0, top - (int) top, 0);
                c.fill(grabbed ? x - 1 : x, (int) top, x + (grabbed ? 4 : 3), (int) top + thumb, grabbed ? 0xFFFFFFFF : t.scroll());
                c.getMatrices().pop();
            }
        } else if (page == Page.SETTINGS && editing != null || page == Page.EMOTES) {
            // Description, separator, then section titles and row labels.
            String about = page == Page.EMOTES ? emoteAbout() : editing.description;
            List<OrderedText> lines = textRenderer.wrapLines(Text.literal(about), 395);
            for (int i = 0; i < Math.min(2, lines.size()); i++) MenuText.plain(c, lines.get(i), mainX + 17, wy + 63 + i * 10, 1f, t.muted());
            c.fill(mainX + 11, wy + 96, mainX + 415, wy + 97, t.line());
            for (Row row : rows) {
                if (row.section()) {
                    String text = row.label().toUpperCase(Locale.ROOT);
                    int tw = MenuText.width(text, MenuText.LABEL), mid = row.y() + 6;
                    c.fill(mainX + 11, mid, mainX + 28, mid + 1, t.line());
                    MenuText.capsMiddle(c, text, mainX + 35, mid + .5f, MenuText.LABEL, t.section());
                    c.fill(mainX + 41 + tw, mid, right(), mid + 1, t.line());
                } else MenuText.capsMiddle(c, row.label().toUpperCase(Locale.ROOT), mainX + 17, row.y() + .5f, MenuText.LABEL, t.text());
            }
            if (textField != null) MenuWidgets.box(c, textField.getX() - 4, textField.getY() - 3, textField.getWidth() + 8, MenuWidgets.SLIDER_H + 2, textField.isFocused());
        } else if (page == Page.FEATURE) {
            Feature f = feature(feature);
            int cx = mainX + mainW / 2, cy = wy + H / 2 - 20;
            c.fill(cx - 24, cy - 46, cx + 24, cy + 2, t.card());
            c.drawBorder(cx - 24, cy - 46, 48, 48, t.cardEdge());
            icon(c, f.icon(), cx - 15, cy - 37, 3, MenuStyle.accent());
            MenuText.capsCentered(c, feature.toUpperCase(Locale.ROOT), cx, cy + 18, MenuText.TITLE, t.text());
            MenuText.plain(c, f.blurb(), cx - textRenderer.getWidth(f.blurb()) / 2f, cy + 30, 1f, t.muted());
            String soon = "KOMMT BALD";
            int w = MenuText.width(soon, MenuText.LABEL) + 14;
            c.fill(cx - w / 2, cy + 46, cx + w / 2, cy + 62, NEW_TAG);
            MenuText.capsCentered(c, soon, cx, cy + 54, MenuText.LABEL, 0xFF2A1F05);
        }
    }

    /** Live preview below the settings rows, if there is room. */
    private void renderSettingsOverlay(DrawContext c) {
        MenuTheme t = t();
        int top = rowsEnd + 4, bottom = contentBottom, x = mainX + 11, w = 417;
        if (editing == null || bottom - top < 34) return;
        c.fill(x, top, x + w, bottom, t.card());
        c.drawBorder(x, top, w, bottom - top, t.cardEdge());
        MenuText.caps(c, "VORSCHAU", x + 6, top + 4, MenuText.TINY, t.section());
        if (editing == HudModule.ICON || editing == HudModule.NAMETAG) {
            HudConfig cfg = SaviraClient.config;
            Text name = Text.literal(client.getSession().getUsername());
            Text shown = editing == HudModule.ICON
                ? (cfg.icon ? Text.empty().append(SaviraIcon.glyph(SaviraIcon.current())).append(cfg.iconSpace ? " " : "").append(name) : name)
                : SaviraIcon.decorate(name, client.getSession().getUuidOrNull(), false);
            int cx = x + w / 2, cy = (top + bottom) / 2 - 7, tw = textRenderer.getWidth(shown);
            c.getMatrices().push();
            c.getMatrices().translate(cx, cy, 0);
            c.getMatrices().scale(2f, 2f, 1f);
            boolean plain = editing == HudModule.NAMETAG && cfg.nametag && cfg.nametagNoBackground;
            if (!plain) c.fill(-tw / 2 - 2, -2, tw / 2 + 2, 9, 0x40000000);
            c.drawText(textRenderer, shown, -tw / 2, 0, 0xFFFFFFFF, editing == HudModule.ICON || cfg.nametag && cfg.nametagShadow);
            c.getMatrices().pop();
            if (editing == HudModule.NAMETAG && cfg.nametag && !cfg.nametagF5) MenuText.plain(c, "Dein Nametag ist in F5 ausgeblendet", cx - textRenderer.getWidth("Dein Nametag ist in F5 ausgeblendet") / 2f, bottom - 12, 1f, t.muted());
        } else SaviraHud.renderPreview(c, editing, x + 6, top + 14, w - 12, bottom - top - 18);
    }

    /** Frames around HUD elements: hover/selected outline, resize corner and a red X to hide. */
    private void renderHudHandles(DrawContext c, int mouseX, int mouseY) {
        boolean editor = page == Page.EDITOR;
        if (editor && SaviraClient.config.snap) {
            c.fill(width / 2, 0, width / 2 + 1, height, MenuStyle.accentAlpha(0x55));
            c.fill(0, height / 2, width, height / 2 + 1, MenuStyle.accentAlpha(0x55));
        }
        for (HudModule module : HudModule.values()) {
            if (!module.enabled() || !module.onHud()) continue;
            SaviraHud.Bounds b = SaviraHud.bounds(module, width, height);
            boolean hover = picker == null && !overWindow(mouseX, mouseY) && (b.contains(mouseX, mouseY) || onRemove(b, mouseX, mouseY)), focus = module == selected || module == dragging;
            if (!editor && !hover && !focus) continue;
            int color = focus || hover ? MenuStyle.accent() : 0x80909090;
            c.drawBorder(b.x() - 2, b.y() - 2, b.width() + 4, b.height() + 4, color);
            c.fill(b.x() + b.width() - 1, b.y() + b.height() - 1, b.x() + b.width() + 3, b.y() + b.height() + 3, color);
            // Red X on the top right corner, like NoRisk: hides the element.
            int rx = b.x() + b.width() - 2, ry = b.y() - 6;
            boolean xHover = onRemove(b, mouseX, mouseY);
            c.fill(rx, ry, rx + 7, ry + 7, xHover ? REMOVE : 0xC0B23A3E);
            for (int i = 0; i < 5; i++) { c.fill(rx + 1 + i, ry + 1 + i, rx + 2 + i, ry + 2 + i, 0xFFFFFFFF); c.fill(rx + 5 - i, ry + 1 + i, rx + 6 - i, ry + 2 + i, 0xFFFFFFFF); }
            if (editor && (focus || hover)) c.drawTextWithShadow(textRenderer, module.title, b.x(), Math.max(40, b.y() - 14), MenuStyle.TEXT);
        }
    }

    private static boolean onRemove(SaviraHud.Bounds b, double x, double y) {
        int rx = b.x() + b.width() - 2, ry = b.y() - 6;
        return x >= rx && x < rx + 7 && y >= ry && y < ry + 7;
    }

    private void renderEditorHint(DrawContext c) {
        MenuTheme t = t();
        String hint = selected == null ? "Ziehen: verschieben  /  Ecke oder Mausrad: Größe  /  X: ausblenden" : selected.title + "  /  " + Math.round(SaviraClient.config.placement(selected).size * 100) + "%  /  Pfeile: verschieben";
        int hw = textRenderer.getWidth(hint) + 24, x = sw / 2 - hw / 2, y = sh - 34;
        c.fill(x, y, x + hw, y + 22, t.panel());
        c.drawBorder(x, y, hw, 22, t.cardEdge());
        MenuText.plain(c, hint, x + 12, y + 7, 1f, t.text());
    }

    // ---------- Input: window widgets get menu units, the HUD gets screen coordinates ----------
    @Override
    public boolean mouseClicked(double x, double y, int button) {
        double ux = x / u, uy = y / u;
        if (picker != null) {
            if (picker.hex.isMouseOver(ux, uy)) { setFocused(picker.hex); picker.hex.mouseClicked(ux, uy, button); return true; }
            if (picker.mouseClicked(ux, uy)) return true;
            if (!picker.contains(ux, uy)) closePicker();
            return true;
        }
        if (page == Page.MODS && button == 0 && onBar(ux, uy)) {
            float track = contentBottom - contentTop - thumbHeight(), top = contentTop + track * scrollPos / Math.max(1, maxScroll);
            // On the thumb: keep the grab point; on the track: jump so the thumb centres under the mouse.
            barGrab = uy >= top && uy < top + thumbHeight() ? uy - top : thumbHeight() / 2d;
            draggingBar = true; scrollToBar(uy); return true;
        }
        if (super.mouseClicked(ux, uy, button)) return true;
        if (button == 0 && !overWindow(x, y)) {
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
        }
        return false;
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

    @Override
    public boolean mouseDragged(double x, double y, int button, double dx, double dy) {
        if (dragging != null && button == 0) {
            if (resizing) SaviraClient.config.placement(dragging).size = Math.clamp(initialSize + (float) (x - grabX) / SaviraHud.size(dragging)[0], .5f, 2f);
            else move(dragging, x - grabX, y - grabY, SaviraClient.config.snap);
            return true;
        }
        if (draggingBar) { scrollToBar(y / u); return true; }
        if (picker != null) { picker.mouseDragged(x / u, y / u); return true; }
        return super.mouseDragged(x / u, y / u, button, dx / u, dy / u);
    }

    @Override
    public boolean mouseReleased(double x, double y, int button) {
        if (dragging != null) { dragging = null; persist(); return true; }
        if (draggingBar) { draggingBar = false; return true; }
        if (picker != null) { picker.mouseReleased(); return true; }
        return super.mouseReleased(x / u, y / u, button);
    }

    @Override
    public boolean mouseScrolled(double x, double y, double horizontal, double vertical) {
        double ux = x / u, uy = y / u;
        if (page == Page.MODS && picker == null && ux >= mainX && ux < mainX + mainW && uy >= contentTop && uy < contentBottom) {
            scroll = Math.clamp(scroll - (int) Math.round(vertical * 40), 0, maxScroll); return true;
        }
        if (picker == null && !overWindow(x, y)) {
            for (HudModule module : HudModule.values()) {
                if (module.enabled() && module.onHud() && SaviraHud.bounds(module, width, height).contains(x, y)) {
                    selected = module;
                    HudConfig.Placement p = SaviraClient.config.placement(module);
                    p.size = Math.clamp(p.size + (float) vertical * .05f, .5f, 2f); persist(); return true;
                }
            }
        }
        return super.mouseScrolled(ux, uy, horizontal, vertical);
    }

    @Override
    public boolean keyPressed(int key, int scan, int modifiers) {
        if (listeningKey != null) {
            var binding = listeningKey;
            listeningKey = null;
            binding.setBoundKey(key == GLFW.GLFW_KEY_ESCAPE ? net.minecraft.client.util.InputUtil.UNKNOWN_KEY : net.minecraft.client.util.InputUtil.fromKeyCode(key, scan));
            net.minecraft.client.option.KeyBinding.updateKeysByCode();
            client.options.write();
            String title = binding == SaviraClient.lightKey ? "Light Level" : "Emotes";
            SaviraToasts.show(title, binding.isUnbound() ? "Taste entfernt" : "Taste: " + binding.getBoundKeyLocalizedText().getString());
            return true;
        }
        if (key == GLFW.GLFW_KEY_ESCAPE && picker != null) { closePicker(); return true; }
        if (key == GLFW.GLFW_KEY_ESCAPE && page != Page.HOME) { show(page == Page.SETTINGS || page == Page.EMOTES ? Page.MODS : Page.HOME); return true; }
        if (picker == null && selected != null && !(getFocused() instanceof TextFieldWidget) && key >= GLFW.GLFW_KEY_RIGHT && key <= GLFW.GLFW_KEY_UP) {
            SaviraHud.Bounds b = SaviraHud.bounds(selected, width, height);
            int step = hasShiftDown() ? 10 : 1;
            move(selected, b.x() + (key == GLFW.GLFW_KEY_RIGHT ? step : key == GLFW.GLFW_KEY_LEFT ? -step : 0), b.y() + (key == GLFW.GLFW_KEY_DOWN ? step : key == GLFW.GLFW_KEY_UP ? -step : 0), false);
            persist(); return true;
        }
        return super.keyPressed(key, scan, modifiers);
    }

    @Override
    public void close() { persist(); super.close(); }
    @Override
    public void removed() { persist(); }
    @Override
    public boolean shouldPause() { return false; }
}

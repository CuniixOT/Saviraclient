package gg.savira.client;

import com.mojang.blaze3d.systems.RenderSystem;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.tooltip.Tooltip;
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

/**
 * Savira's Right-Shift menu, laid out like NoRisk's: on the start page the HUD can be moved,
 * resized and hidden right away; "Mod-Menü" opens a window with a sidebar, a searchable grid of
 * module cards (click toggles, "…" opens the settings, NEU on modules not used yet) and the editor.
 */
public final class HudScreen extends Screen {
    private enum Page { HOME, MODS, SETTINGS, FEATURE, EDITOR }
    private record Row(String label, int y) {}
    private record Feature(String name, String[] icon, String blurb) {}

    private static final int[] TEXT_COLORS = {0xFFFFFF, 0xC9D1D9, 0x8A939D, 0x5CCF95, 0x22B07D, 0x22B8E6, 0x4F8DFF, 0x8F72F2, 0xE36BB5, 0xE5484D, 0xF07F2D, 0xF2C35B};
    private static final int[] BG_COLORS = {0x000000, 0x1A1E24, 0x3A4250, 0x5CCF95, 0x22B8E6, 0x4F8DFF, 0x8F72F2, 0xE36BB5, 0xE5484D, 0xF07F2D, 0xF2C35B, 0xFFFFFF};
    // NoRisk-like frosted grey: translucent panels over the blurred world, square corners.
    private static final int C = MenuStyle.CORNER, PANEL = 0x9A2A2F38, CARD = 0x70141820, CARD_HOVER = 0x9A1C222B, CARD_EDGE = 0x38FFFFFF;
    private static final int NEW_TAG = 0xFFF2C35B, REMOVE = 0xFFE5484D;
    private static final int SIDEBAR = 44, GAP = 6, HEADER = 30, FOOTER = 18;
    /** Coming features in the sidebar; null icon means the Savira logo. */
    private static final List<Feature> FEATURES = List.of(
        new Feature("Savira Plus", null, "Exklusive Cosmetics und Vorteile für Unterstützer."),
        new Feature("Cosmetics", PixelIcons.SHIRT, "Capes, Hüte und Effekte für deine Figur."),
        new Feature("Friends", PixelIcons.FRIENDS, "Freunde sehen, einladen und zusammen spielen."),
        new Feature("Emotes", PixelIcons.EMOTE, "Winken, Tanzen und mehr, sichtbar für andere.")
    );

    private Page page = Page.HOME;
    private String feature = "", query = "", saveError = "";
    private HudModule editing;
    private int px, py, pw, ph, mainX, mainW, contentTop, contentBottom, scroll, maxScroll;
    private TextFieldWidget search, textField;
    private final List<ClickableWidget> cards = new ArrayList<>();
    private final List<Row> rows = new ArrayList<>();
    // HUD editing (start page and editor page)
    private HudModule selected, dragging;
    private boolean resizing;
    private double grabX, grabY;
    private float initialSize;

    // Fade in when the menu opens; the window slides up when it appears.
    private final long openedAt = Util.getMeasuringTimeMs();
    private long windowAt;

    public HudScreen() { super(Text.literal("Savira · Mod-Menü")); }

    private static boolean isWindow(Page p) { return p == Page.MODS || p == Page.SETTINGS || p == Page.FEATURE; }
    private static float ease(float t) { t = Math.clamp(t, 0f, 1f); return 1 - (1 - t) * (1 - t) * (1 - t); }

    private boolean opened;

    @Override
    protected void init() {
        if (!opened) { opened = true; SaviraSounds.play(SaviraSounds.Sound.OPEN); }
        rebuild();
    }

    private void show(Page next) {
        if (isWindow(next) && !isWindow(page)) { windowAt = Util.getMeasuringTimeMs(); SaviraSounds.play(SaviraSounds.Sound.WINDOW); }
        persist(); page = next; scroll = 0; dragging = null; selected = null;
        rebuild();
    }

    private void rebuild() {
        clearChildren(); cards.clear(); rows.clear(); search = null; textField = null;
        pw = Math.min(470, width - 16); ph = Math.min(270, height - 24);
        px = (width - pw) / 2; py = (height - ph) / 2;
        mainX = px + SIDEBAR + GAP; mainW = pw - SIDEBAR - GAP;
        switch (page) {
            case HOME -> buildHome();
            case MODS -> { buildFrame(); buildMods(); }
            case SETTINGS -> { buildFrame(); buildSettings(); }
            case FEATURE -> buildFrame();
            case EDITOR -> buildEditor();
        }
    }

    /** The HUD can be edited on every page, just not through the window itself. */
    private boolean editsHud() { return true; }
    private boolean overWindow(double x, double y) { return page != Page.HOME && page != Page.EDITOR && x >= px && x < px + pw && y >= py && y < py + ph; }

    private static void icon(DrawContext c, String[] glyph, int x, int y, int px, int color) {
        if (glyph == null) {
            // The logo fills 14 of its 16 units; size it like a 10x10 icon and centre it in that box.
            int unit = Math.max(1, px - 1), offset = (10 * px - 14 * unit) / 2;
            MenuStyle.logo(c, x + offset - unit, y + offset - unit, unit, color, false);
        }
        else PixelIcons.draw(c, glyph, x, y, px, color);
    }

    // ---------- Start page: logo, Mod-Menü button, shortcuts; the HUD around it is editable ----------
    private void buildHome() {
        int w = Math.min(206, width - 24), x = (width - w) / 2, y = height / 2 - 6;
        addDrawableChild(glassButton(x, y, w, 20, "MOD-MENÜ", b -> show(Page.MODS)));
        int size = 28, gap = 6, rowX = (width - (5 * size + 4 * gap)) / 2, rowY = y + 26;
        addDrawableChild(homeTile(rowX, rowY, size, "HUD-Editor", PixelIcons.HUD, b -> show(Page.EDITOR)));
        for (int i = 0; i < FEATURES.size(); i++) {
            Feature f = FEATURES.get(i);
            addDrawableChild(homeTile(rowX + (i + 1) * (size + gap), rowY, size, f.name(), f.icon(), b -> openFeature(f.name())));
        }
    }

    /** Frosted button like NoRisk's "MOD-MENÜ". */
    private ButtonWidget glassButton(int x, int y, int w, int h, String label, ButtonWidget.PressAction action) {
        return new ButtonWidget(x, y, w, h, Text.literal("Mod-Menü"), action, n -> n.get()) {
            @Override
            public void playDownSound(net.minecraft.client.sound.SoundManager sounds) { SaviraSounds.play(SaviraSounds.Sound.CLICK); }
            @Override
            protected void renderWidget(DrawContext c, int mouseX, int mouseY, float delta) {
                boolean hover = isHovered() || isFocused();
                c.fill(getX(), getY(), getX() + getWidth(), getY() + getHeight(), hover ? 0xB0303640 : 0x90262B33);
                if (hover) c.drawBorder(getX(), getY(), getWidth(), getHeight(), MenuStyle.accentAlpha(0xC0));
                c.drawCenteredTextWithShadow(textRenderer, label, getX() + getWidth() / 2, getY() + (getHeight() - 8) / 2, hover ? MenuStyle.TEXT : 0xFFC4CAD1);
            }
        };
    }

    private ButtonWidget homeTile(int x, int y, int size, String label, String[] glyph, ButtonWidget.PressAction action) {
        ButtonWidget button = new ButtonWidget(x, y, size, size, Text.literal(label), action, n -> n.get()) {
            @Override
            public void playDownSound(net.minecraft.client.sound.SoundManager sounds) { SaviraSounds.play(SaviraSounds.Sound.CLICK); }
            @Override
            protected void renderWidget(DrawContext c, int mouseX, int mouseY, float delta) {
                boolean hover = isHovered() || isFocused();
                c.fill(getX(), getY(), getX() + getWidth(), getY() + getHeight(), hover ? 0xB0303640 : 0x90262B33);
                if (hover) c.drawBorder(getX(), getY(), getWidth(), getHeight(), MenuStyle.accentAlpha(0xC0));
                icon(c, glyph, getX() + (getWidth() - 20) / 2, getY() + (getHeight() - 20) / 2, 2, hover ? MenuStyle.accent() : 0xFFD7DCE1);
            }
        };
        button.setTooltip(Tooltip.of(Text.literal(label)));
        return button;
    }

    private void openFeature(String name) { feature = name; show(Page.FEATURE); }

    // ---------- Frame: sidebar box + main box ----------
    private void buildFrame() {
        for (int i = 0; i < FEATURES.size(); i++) {
            Feature f = FEATURES.get(i);
            int y = py + 6 + i * 44;
            ButtonWidget b = new ButtonWidget(px + 2, y, SIDEBAR - 4, 40, Text.literal(f.name()), x -> openFeature(f.name()), n -> n.get()) {
                @Override
                public void playDownSound(net.minecraft.client.sound.SoundManager sounds) { SaviraSounds.play(SaviraSounds.Sound.CLICK); }
                @Override
                protected void renderWidget(DrawContext c, int mouseX, int mouseY, float delta) {
                    boolean hover = isHovered() || isFocused(), current = page == Page.FEATURE && feature.equals(f.name());
                    if (current) c.fill(getX(), getY(), getX() + getWidth(), getY() + getHeight(), 0x30FFFFFF);
                    else if (hover) c.fill(getX(), getY(), getX() + getWidth(), getY() + getHeight(), 0x18FFFFFF);
                    int color = current ? MenuStyle.accent() : hover ? 0xFFFFFFFF : 0xFFD0D5DB;
                    icon(c, f.icon(), getX() + (getWidth() - 20) / 2, getY() + 5, 2, color);
                    c.getMatrices().push();
                    c.getMatrices().translate(getX() + getWidth() / 2f, getY() + 30, 0);
                    c.getMatrices().scale(.5f, .5f, 1);
                    String label = f.name().toUpperCase(Locale.ROOT);
                    c.drawText(textRenderer, label, -textRenderer.getWidth(label) / 2, 0, current ? MenuStyle.accent() : 0xFFB4BCC5, false);
                    c.getMatrices().pop();
                }
            };
            b.setTooltip(Tooltip.of(Text.literal(f.name())));
            addDrawableChild(b);
        }
        // Settings show "< Module" in place of the tabs; a feature page shows its name.
        if (page == Page.SETTINGS) return;
        if (page == Page.FEATURE) { addDrawableChild(backButton(mainX + 8, py + 7, feature, b -> show(Page.MODS))); return; }
        ButtonWidget mods = tab(mainX + 8, py + 7, "Mods", page == Page.MODS, x -> show(Page.MODS));
        addDrawableChild(mods);
        addDrawableChild(tab(mods.getX() + mods.getWidth() + 4, py + 7, "HUD-Editor", false, x -> show(Page.EDITOR)));
    }

    /** Header tab: the selected one sits in a light box, like NoRisk's "MODS". */
    private ButtonWidget tab(int x, int y, String label, boolean selected, ButtonWidget.PressAction action) {
        // Named "selected": inside the anonymous class the inherited field "active" would shadow it.
        int w = textRenderer.getWidth(label.toUpperCase(Locale.ROOT)) + 16;
        return new ButtonWidget(x, y, w, 17, Text.literal(label), action, n -> n.get()) {
            @Override
            public void playDownSound(net.minecraft.client.sound.SoundManager sounds) { SaviraSounds.play(SaviraSounds.Sound.CLICK); }
            @Override
            protected void renderWidget(DrawContext c, int mouseX, int mouseY, float delta) {
                boolean hover = isHovered() || isFocused();
                if (selected) c.fill(getX(), getY(), getX() + getWidth(), getY() + getHeight(), 0x40FFFFFF);
                else if (hover) c.fill(getX(), getY(), getX() + getWidth(), getY() + getHeight(), 0x18FFFFFF);
                String text = label.toUpperCase(Locale.ROOT);
                c.drawText(textRenderer, text, getX() + 8, getY() + 5, selected ? 0xFF8A939D : hover ? MenuStyle.TEXT : 0xFFC4CAD1, false);
            }
        };
    }

    // ---------- Module grid ----------
    private void buildMods() {
        int sw = Math.min(110, mainW / 3);
        search = new TextFieldWidget(textRenderer, mainX + mainW - sw - 8 + 5, py + 12, sw - 10, 10, Text.literal("Module suchen"));
        search.setDrawsBackground(false); search.setMaxLength(48);
        search.setPlaceholder(Text.literal("Suchen ...")); search.setText(query);
        search.setChangedListener(value -> { query = value; scroll = 0; rebuildCards(); });
        addDrawableChild(search);
        addDrawableChild(soundButton(mainX + mainW - sw - 8 - 21, py + 7));
        contentTop = py + HEADER + 6; contentBottom = py + ph - FOOTER - 3;
        rebuildCards();
    }

    /** Headphones left of the search: turns Savira's interface sounds on or off. */
    private ButtonWidget soundButton(int x, int y) {
        ButtonWidget button = new ButtonWidget(x, y, 17, 17, Text.literal("UI-Sounds"), b -> {
            HudConfig cfg = SaviraClient.config;
            cfg.uiSounds = !cfg.uiSounds; persist();
            if (cfg.uiSounds) SaviraSounds.play(SaviraSounds.Sound.ON);
            SaviraToasts.show("UI-Sounds", cfg.uiSounds ? "Aktiviert" : "Deaktiviert");
            b.setTooltip(Tooltip.of(Text.literal(cfg.uiSounds ? "UI-Sounds ausschalten" : "UI-Sounds einschalten")));
        }, n -> n.get()) {
            @Override
            public void playDownSound(net.minecraft.client.sound.SoundManager sounds) { /* The toggle plays its own sound. */ }
            @Override
            protected void renderWidget(DrawContext c, int mouseX, int mouseY, float delta) {
                boolean hover = isHovered() || isFocused(), on = SaviraClient.config.uiSounds;
                c.fill(getX(), getY(), getX() + getWidth(), getY() + getHeight(), hover ? 0x70000000 : 0x50000000);
                c.drawBorder(getX(), getY(), getWidth(), getHeight(), hover ? MenuStyle.accent() : 0x40FFFFFF);
                int color = !on ? 0xFF6C757F : hover ? MenuStyle.accent() : 0xFFD0D5DB;
                PixelIcons.draw(c, PixelIcons.HEADPHONES, getX() + 4, getY() + 4, 1, color);
                // Muted: a red diagonal stroke across the headphones.
                if (!on) for (int i = 0; i < 11; i++) c.fill(getX() + 3 + i, getY() + 3 + i, getX() + 5 + i, getY() + 4 + i, 0xFFE5484D);
            }
        };
        button.setTooltip(Tooltip.of(Text.literal(SaviraClient.config.uiSounds ? "UI-Sounds ausschalten" : "UI-Sounds einschalten")));
        return button;
    }

    private void rebuildCards() {
        for (ClickableWidget card : cards) remove(card);
        cards.clear();
        if (page != Page.MODS) return;
        String needle = query.strip().toLowerCase(Locale.ROOT);
        List<HudModule> visible = Arrays.stream(HudModule.values())
                .filter(m -> (m.title + " " + m.category + " " + m.description).toLowerCase(Locale.ROOT).contains(needle))
                .sorted(java.util.Comparator.comparing((HudModule m) -> !m.isNew()).thenComparing(m -> m.isNew() ? -m.released().toEpochDay() : 0)).toList();
        int gap = 6, area = mainW - 18, cardW = (area - gap) / 2, cardH = 42;
        int rowsNeeded = (visible.size() + 1) / 2;
        maxScroll = Math.max(0, rowsNeeded * (cardH + gap) - gap - (contentBottom - contentTop));
        scroll = Math.clamp(scroll, 0, maxScroll);
        for (int i = 0; i < visible.size(); i++) {
            HudModule module = visible.get(i);
            int x = mainX + 8 + (i % 2) * (cardW + gap), y = contentTop + (i / 2) * (cardH + gap) - scroll;
            ModuleCard card = new ModuleCard(x, y, cardW, cardH, module);
            card.active = y < contentBottom && y + cardH > contentTop;
            cards.add(addDrawableChild(card));
        }
    }

    private Text moduleLabel(HudModule m) { return Text.literal(m.title + (m.enabled() ? ": aktiviert" : ": deaktiviert")); }

    /** NoRisk card: item, title, short description; click toggles, "…" (or right click) opens the settings. */
    private final class ModuleCard extends ButtonWidget {
        private final HudModule module;
        ModuleCard(int x, int y, int w, int h, HudModule module) {
            super(x, y, w, h, moduleLabel(module), b -> {
                module.toggle(); b.setMessage(moduleLabel(module)); persist();
                SaviraSounds.play(module.enabled() ? SaviraSounds.Sound.ON : SaviraSounds.Sound.OFF);
                SaviraToasts.show(module.title, module.enabled() ? "Aktiviert" : "Deaktiviert");
            }, n -> n.get());
            // No tooltip: the description is on the card, and a tooltip would clash with the NEU tags.
            this.module = module;
        }
        @Override
        public void playDownSound(net.minecraft.client.sound.SoundManager sounds) { /* ON/OFF sounds play in the press action. */ }
        private boolean onDots(double mx, double my) { return mx >= getX() + getWidth() - 22; }
        @Override
        public boolean mouseClicked(double mx, double my, int button) {
            if (!active || !visible || !isMouseOver(mx, my) || my < contentTop || my >= contentBottom) return false;
            if (button == 1 || (button == 0 && onDots(mx, my))) { SaviraSounds.play(SaviraSounds.Sound.CLICK); openSettings(module); return true; }
            return super.mouseClicked(mx, my, button);
        }
        @Override
        protected void renderWidget(DrawContext c, int mouseX, int mouseY, float delta) {
            if (getY() + getHeight() < contentTop || getY() > contentBottom) return;
            c.enableScissor(mainX + 1, contentTop, mainX + mainW - 1, contentBottom);
            boolean on = module.enabled(), hover = (isHovered() && mouseY >= contentTop && mouseY < contentBottom) || isFocused();
            int x = getX(), y = getY(), w = getWidth(), h = getHeight();
            // Enabled cards are lit, disabled ones stay dim.
            c.fill(x, y, x + w, y + h, hover ? CARD_HOVER : CARD);
            if (on) c.fill(x, y, x + w, y + h, MenuStyle.accentAlpha(hover ? 0x30 : 0x20));
            c.drawBorder(x, y, w, h, on ? MenuStyle.accentAlpha(hover ? 0xE0 : 0x90) : hover ? 0x60FFFFFF : CARD_EDGE);
            // Item in front, a bit larger than inventory size.
            c.getMatrices().push();
            c.getMatrices().translate(x + 8, y + (h - 20) / 2f, 0);
            c.getMatrices().scale(1.25f, 1.25f, 1);
            c.drawItem(new ItemStack(module.icon), 0, 0);
            c.getMatrices().pop();
            int textX = x + 36, textW = w - 36 - 24;
            c.drawText(textRenderer, textRenderer.trimToWidth(module.title.toUpperCase(Locale.ROOT), textW), textX, y + 10, on ? MenuStyle.TEXT : 0xFFB4BCC5, false);
            c.getMatrices().push();
            c.getMatrices().translate(textX, y + 22, 0);
            c.getMatrices().scale(.75f, .75f, 1);
            List<OrderedText> lines = textRenderer.wrapLines(Text.literal(module.description), (int) (textW / .75f));
            for (int i = 0; i < Math.min(2, lines.size()); i++) c.drawText(textRenderer, lines.get(i), 0, i * 10, on ? 0xFFB4BCC5 : 0xFF8A939D, false);
            c.getMatrices().pop();
            boolean dotsHover = hover && onDots(mouseX, mouseY);
            if (dotsHover) c.fill(x + w - 20, y + h / 2 - 6, x + w - 4, y + h / 2 + 6, 0x30FFFFFF);
            c.drawText(textRenderer, "...", x + w - 17, y + h / 2 - 5, dotsHover ? MenuStyle.TEXT : 0xFF8A939D, false);
            if (module.isNew()) newTag(c, x + 4, y + 3);
            c.disableScissor();
        }
    }

    /** "NEU": yellow tag that pulses and gets a light sweep every few seconds. */
    private void newTag(DrawContext c, int x, int y) {
        long now = Util.getMeasuringTimeMs();
        float pulse = .75f + .25f * (float) Math.sin(now / 260.0);
        int w = 16, h = 7;
        c.getMatrices().push();
        c.getMatrices().translate(0, 0, 50);
        c.fill(x - 1, y - 1, x + w + 1, y + h + 1, ((int) (0x50 * pulse) << 24) | (NEW_TAG & 0xFFFFFF));
        c.fill(x, y, x + w, y + h, MenuStyle.shade(NEW_TAG, .85f + .15f * pulse));
        long cycle = now % 2400;
        if (cycle < 600) {
            int sx = x - 4 + (int) ((w + 8) * cycle / 600f);
            c.fill(Math.max(x, sx), y, Math.min(x + w, sx + 3), y + h, 0x90FFFFFF);
        }
        c.getMatrices().translate(x + 2, y + 1.5f, 0);
        c.getMatrices().scale(.5f, .5f, 1);
        c.drawText(textRenderer, "NEU", 0, 0, 0xFF2A1F05, false);
        c.getMatrices().pop();
    }

    // ---------- Module settings ----------
    private void openSettings(HudModule module) { editing = module; show(Page.SETTINGS); }

    private void buildSettings() {
        HudModule m = editing;
        HudConfig.Style style = SaviraClient.config.style(m);
        HudBackground bg = HudBackground.parse(style.background);
        addDrawableChild(backButton(mainX + 8, py + 7, m.title, b -> show(Page.MODS)));
        int right = mainX + mainW - 10;
        addDrawableChild(MenuStyle.button(right - 86, py + 7, 86, 16, "Zurücksetzen", false, b -> {
            SaviraClient.config.styles.remove(m.name());
            SaviraClient.config.placement(m).size = 1f;
            if (m == HudModule.ICON) { SaviraClient.config.iconType = "default"; SaviraClient.config.iconNametag = SaviraClient.config.iconTablist = SaviraClient.config.iconSpace = true; }
            if (m == HudModule.NAMETAG) { SaviraClient.config.nametagF5 = true; SaviraClient.config.nametagShadow = SaviraClient.config.nametagNoBackground = false; }
            persist(); rebuild();
            SaviraToasts.show(m.title, "Einstellungen zurückgesetzt");
        }));
        addDrawableChild(MenuWidgets.toggle(right - 86 - 32, py + 9, "Modul an/aus", m::enabled, () -> { m.toggle(); persist(); SaviraToasts.show(m.title, m.enabled() ? "Aktiviert" : "Deaktiviert"); }));
        if (m == HudModule.ICON) { buildIconSettings(right); return; }
        if (m == HudModule.NAMETAG) { buildNametagSettings(right); return; }

        int controlW = Math.min(160, mainW / 2), cx = right - controlW, rowH = 18;
        int[] y = {py + 56};
        java.util.function.Consumer<String> row = label -> { rows.add(new Row(label, y[0])); y[0] += rowH; };

        HudConfig.Placement placement = SaviraClient.config.placement(m);
        addDrawableChild(MenuWidgets.slider(cx, y[0], controlW, 14, 50, 200, 5, Math.round(placement.size * 100), v -> Math.round(v) + " %", v -> { placement.size = (float) (v / 100); persist(); }));
        row.accept("HUD-Skalierung");

        addDrawableChild(MenuWidgets.cycle(cx, y[0], controlW, 14, () -> HudBackground.parse(style.background).label, step -> {
            style.background = HudBackground.parse(style.background).next(step).name(); persist(); rebuild();
        }));
        row.accept("Background");

        if (bg.coloured) {
            addDrawableChild(MenuWidgets.palette(cx, y[0], controlW, 12, BG_COLORS, () -> style.backgroundColor, color -> {
                style.backgroundColor = (style.backgroundColor & 0xFF000000) | (color & 0xFFFFFF); persist();
            }));
            row.accept("Hintergrundfarbe");
            if (bg == HudBackground.COLOR) {
                addDrawableChild(MenuWidgets.slider(cx, y[0], controlW, 14, 10, 100, 5, Math.round((style.backgroundColor >>> 24) / 2.55), v -> Math.round(v) + " %", v -> {
                    int alpha = (int) Math.round(v * 2.55);
                    style.backgroundColor = (alpha << 24) | (style.backgroundColor & 0xFFFFFF); persist();
                }));
                row.accept("Deckkraft");
            }
        }
        if (bg.rounded) {
            addDrawableChild(MenuWidgets.slider(cx, y[0], controlW, 14, 0, 8, 1, style.radius, v -> Integer.toString((int) v), v -> { style.radius = (int) v; persist(); }));
            row.accept("Ecken");
        }
        if (m.textual()) {
            textField = new TextFieldWidget(textRenderer, cx + 5, y[0] + 3, controlW - 10, 10, Text.literal("Text"));
            textField.setDrawsBackground(false); textField.setMaxLength(48);
            textField.setText(style.text != null ? style.text : m.defaultText());
            textField.setTooltip(Tooltip.of(Text.literal("Platzhalter: " + m.placeholders() + "\nLeer lassen für den Standard: " + m.defaultText())));
            textField.setChangedListener(value -> {
                style.text = value.isBlank() || value.equals(m.defaultText()) ? null : value; persist();
            });
            addDrawableChild(textField);
            row.accept("Text");
        }
        addDrawableChild(MenuWidgets.palette(cx, y[0], controlW, 12, TEXT_COLORS, () -> style.textColor, color -> { style.textColor = 0xFF000000 | color; persist(); }));
        row.accept("Textfarbe");
        addDrawableChild(MenuWidgets.toggle(right - 22, y[0] + 1, "Textschatten", () -> style.textShadow, () -> { style.textShadow = !style.textShadow; persist(); }));
        row.accept("Textschatten");
    }

    /** Icon module: choose the icon, where it shows, and whether a space follows it. */
    private void buildIconSettings(int right) {
        HudConfig cfg = SaviraClient.config;
        int tile = 42, gap = 8, count = SaviraIcon.TYPES.size(), x0 = mainX + (mainW - (count * tile + (count - 1) * gap)) / 2, ty = py + 70;
        for (int i = 0; i < count; i++) {
            SaviraIcon.Type type = SaviraIcon.TYPES.get(i);
            addDrawableChild(new ButtonWidget(x0 + i * (tile + gap), ty, tile, tile, Text.literal(type.label()), b -> {
                cfg.iconType = type.id(); persist();
                SaviraToasts.show("Icon", "Icon aktualisiert: " + type.label());
            }, n -> n.get()) {
                @Override
                public void playDownSound(net.minecraft.client.sound.SoundManager sounds) { SaviraSounds.play(SaviraSounds.Sound.CLICK); }
                @Override
                protected void renderWidget(DrawContext c, int mouseX, int mouseY, float delta) {
                    boolean hover = isHovered() || isFocused(), chosen = SaviraIcon.current() == type;
                    c.fill(getX(), getY(), getX() + getWidth(), getY() + getHeight(), chosen ? MenuStyle.accentAlpha(0x30) : hover ? CARD_HOVER : CARD);
                    c.drawBorder(getX(), getY(), getWidth(), getHeight(), chosen ? MenuStyle.accent() : hover ? 0x60FFFFFF : CARD_EDGE);
                    // Sharp, large logo in the icon's colour (the in-name glyph itself is only 8px).
                    int lx = getX() + (getWidth() - 32) / 2, ly = getY() + (getHeight() - 32) / 2;
                    if (type.tint() == 0) MenuStyle.logo(c, lx, ly, 2, 0xFFFFFFFF, false);
                    else MenuStyle.logoTinted(c, lx, ly, 2, type.tint());
                    String label = type.label().toUpperCase(Locale.ROOT);
                    c.getMatrices().push();
                    c.getMatrices().translate(getX() + getWidth() / 2f, getY() + getHeight() + 4, 0);
                    c.getMatrices().scale(.75f, .75f, 1);
                    c.drawText(textRenderer, label, -textRenderer.getWidth(label) / 2, 0, chosen ? MenuStyle.accent() : 0xFFC4CAD1, false);
                    c.getMatrices().pop();
                }
            });
        }
        rows.add(new Row("Icon-Auswahl", py + 50));
        int y = ty + tile + 18;
        String[][] switches = {{"Im Nametag anzeigen", "nametag"}, {"In Tab-Liste anzeigen", "tablist"}, {"Abstand zum Namen", "space"}};
        for (String[] s : switches) {
            java.util.function.BooleanSupplier get = switch (s[1]) { case "nametag" -> () -> cfg.iconNametag; case "tablist" -> () -> cfg.iconTablist; default -> () -> cfg.iconSpace; };
            Runnable flip = switch (s[1]) {
                case "nametag" -> () -> cfg.iconNametag = !cfg.iconNametag;
                case "tablist" -> () -> cfg.iconTablist = !cfg.iconTablist;
                default -> () -> cfg.iconSpace = !cfg.iconSpace;
            };
            addDrawableChild(MenuWidgets.toggle(right - 22, y + 1, s[0], get, () -> { flip.run(); persist(); SaviraToasts.show("Icon", s[0] + ": " + (get.getAsBoolean() ? "an" : "aus")); }));
            rows.add(new Row(s[0], y));
            y += 18;
        }
    }

    /** Nametag module: own name in F5, shadow and background of player names. */
    private void buildNametagSettings(int right) {
        HudConfig cfg = SaviraClient.config;
        int y = py + 56;
        Object[][] switches = {
            {"In F5 anzeigen", (java.util.function.BooleanSupplier) () -> cfg.nametagF5, (Runnable) () -> cfg.nametagF5 = !cfg.nametagF5},
            {"Textschatten", (java.util.function.BooleanSupplier) () -> cfg.nametagShadow, (Runnable) () -> cfg.nametagShadow = !cfg.nametagShadow},
            {"Kein Hintergrund", (java.util.function.BooleanSupplier) () -> cfg.nametagNoBackground, (Runnable) () -> cfg.nametagNoBackground = !cfg.nametagNoBackground}
        };
        for (Object[] s : switches) {
            String label = (String) s[0];
            java.util.function.BooleanSupplier get = (java.util.function.BooleanSupplier) s[1];
            Runnable flip = (Runnable) s[2];
            addDrawableChild(MenuWidgets.toggle(right - 22, y + 1, label, get, () -> { flip.run(); persist(); SaviraToasts.show("Nametag", label + ": " + (get.getAsBoolean() ? "an" : "aus")); }));
            rows.add(new Row(label, y));
            y += 18;
        }
    }

    /** "< Name": back arrow and title, leading back to the grid. */
    private ButtonWidget backButton(int x, int y, String label, ButtonWidget.PressAction action) {
        int w = textRenderer.getWidth(label.toUpperCase(Locale.ROOT)) + 26;
        return new ButtonWidget(x, y, w, 17, Text.literal("< " + label), action, n -> n.get()) {
            @Override
            public void playDownSound(net.minecraft.client.sound.SoundManager sounds) { SaviraSounds.play(SaviraSounds.Sound.CLICK); }
            @Override
            protected void renderWidget(DrawContext c, int mouseX, int mouseY, float delta) {
                boolean hover = isHovered() || isFocused();
                if (hover) c.fill(getX(), getY(), getX() + getWidth(), getY() + getHeight(), 0x18FFFFFF);
                PixelIcons.draw(c, PixelIcons.BACK, getX() + 4, getY() + 3, 1, hover ? MenuStyle.accent() : 0xFFC4CAD1);
                c.drawText(textRenderer, label.toUpperCase(Locale.ROOT), getX() + 19, getY() + 5, MenuStyle.TEXT, false);
            }
        };
    }

    // ---------- HUD editor page (grid toggle, reset) ----------
    private void buildEditor() {
        int total = Math.min(420, width - 16), x = (width - total) / 2, unit = (total - 18) / 4;
        addDrawableChild(MenuStyle.button(x, 10, unit, 20, "< Zurück", false, b -> show(Page.MODS)));
        addDrawableChild(MenuStyle.button(x + unit + 6, 10, unit, 20, SaviraClient.config.snap ? "Raster: AN" : "Raster: AUS", SaviraClient.config.snap, b -> {
            SaviraClient.config.snap = !SaviraClient.config.snap; persist(); rebuild();
        }));
        addDrawableChild(MenuStyle.button(x + 2 * (unit + 6), 10, unit, 20, "Layout resetten", false, b -> {
            SaviraClient.config.layout.clear(); persist();
            SaviraToasts.show("HUD", "Layout zurückgesetzt");
        }));
        addDrawableChild(MenuStyle.button(x + 3 * (unit + 6), 10, unit, 20, "Fertig", true, b -> show(Page.MODS)));
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
        // The HUD stays visible and editable around the mod menu window too.
        if (editsHud()) {
            SaviraHud.renderModules(c, true);
            renderHudHandles(c, mouseX, mouseY);
        }
        long now = Util.getMeasuringTimeMs();
        float alpha = 1f, slide = 0f;
        if (page == Page.HOME) alpha = ease((now - openedAt) / 260f);
        else if (isWindow(page)) { float k = ease((now - windowAt) / 320f); alpha = k; slide = (1 - k) * 36; }
        RenderSystem.enableBlend();
        RenderSystem.setShaderColor(1f, 1f, 1f, Math.max(.02f, alpha));
        c.getMatrices().push();
        c.getMatrices().translate(0, slide, 400);
        switch (page) {
            case HOME -> renderHome(c);
            case MODS, SETTINGS, FEATURE -> renderFrame(c);
            case EDITOR -> renderEditorHint(c);
        }
        super.render(c, mouseX, mouseY, delta);
        c.draw();
        RenderSystem.setShaderColor(1f, 1f, 1f, 1f);
        if (!saveError.isEmpty()) c.drawCenteredTextWithShadow(textRenderer, saveError, width / 2, height - 38, 0xFFFF9C9C);
        c.getMatrices().pop();
        SaviraToasts.render(c, width);
    }

    private void renderHome(DrawContext c) {
        int center = width / 2, y = height / 2 - 50, scale = 2;
        String left = "SAVIRA", right = "CLIENT";
        int lw = textRenderer.getWidth(left) * scale, rw = textRenderer.getWidth(right) * scale, logo = 26, gap = 8;
        int start = center - (lw + gap + logo + gap + rw) / 2;
        drawBig(c, left, start, y + 9, scale, MenuStyle.TEXT);
        // The logo is taller than wide: a 3-unit box centred on its slot and on the words.
        MenuStyle.logo(c, start + lw + gap + logo / 2 - 24, y - 7, 3, MenuStyle.accent());
        drawBig(c, right, start + lw + gap + logo + gap, y + 9, scale, 0xFFE6E9EC);
        String hint = selected != null ? selected.title + "  ·  " + Math.round(SaviraClient.config.placement(selected).size * 100) + " %  ·  Pfeile: verschieben"
                : "HUD ziehen: verschieben  ·  Mausrad oder Ecke: Größe  ·  X: ausblenden";
        c.drawCenteredTextWithShadow(textRenderer, textRenderer.trimToWidth(hint, width - 20), center, height - 16, 0xFF9AA3AD);
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
        // Two frosted boxes like NoRisk: the sidebar and the main window.
        c.fill(px, py, px + SIDEBAR, py + ph, PANEL);
        c.fill(mainX, py, mainX + mainW, py + ph, PANEL);
        c.fill(mainX + 1, py + HEADER, mainX + mainW - 1, py + HEADER + 1, 0x30FFFFFF);
        c.fill(mainX + 1, py + ph - FOOTER, mainX + mainW - 1, py + ph - FOOTER + 1, 0x30FFFFFF);
        long active = Arrays.stream(HudModule.values()).filter(HudModule::enabled).count();
        String count = active + " / " + HudModule.values().length + " MODULE AKTIV";
        c.getMatrices().push();
        c.getMatrices().translate(mainX + mainW - 8, py + ph - 11, 0);
        c.getMatrices().scale(.75f, .75f, 1);
        int cw = textRenderer.getWidth(count);
        c.fill(-cw - 9, 1, -cw - 4, 6, MenuStyle.accent());
        c.drawText(textRenderer, count, -cw, 0, MenuStyle.accent(), false);
        c.getMatrices().pop();

        if (page == Page.MODS) {
            int sw = Math.min(110, mainW / 3), sx = mainX + mainW - sw - 8;
            boolean focused = search != null && search.isFocused();
            c.fill(sx, py + 7, sx + sw, py + 24, 0x50000000);
            c.drawBorder(sx, py + 7, sw, 17, focused ? MenuStyle.accent() : 0x40FFFFFF);
            if (cards.isEmpty()) {
                int cx = mainX + mainW / 2;
                PixelIcons.draw(c, PixelIcons.SEARCH, cx - 10, contentTop + 24, 2, 0xFF6C757F);
                c.drawCenteredTextWithShadow(textRenderer, "Keine passenden Module", cx, contentTop + 52, MenuStyle.TEXT);
                c.drawCenteredTextWithShadow(textRenderer, "Andere Suche probieren.", cx, contentTop + 66, 0xFFB4BCC5);
            }
            if (maxScroll > 0) {
                int track = contentBottom - contentTop, thumb = Math.max(18, track * track / (track + maxScroll));
                int top = contentTop + (track - thumb) * scroll / maxScroll;
                c.fill(mainX + mainW - 5, contentTop, mainX + mainW - 4, contentBottom, 0x20FFFFFF);
                c.fill(mainX + mainW - 6, top, mainX + mainW - 3, top + thumb, 0xC0FFFFFF);
            }
        } else if (page == Page.SETTINGS && editing != null) {
            c.getMatrices().push();
            c.getMatrices().translate(mainX + 10, py + HEADER + 6, 0);
            c.getMatrices().scale(.75f, .75f, 1);
            c.drawItem(new ItemStack(editing.icon), 0, 0);
            c.getMatrices().pop();
            c.drawText(textRenderer, textRenderer.trimToWidth(editing.description, mainW - 40), mainX + 26, py + HEADER + 8, 0xFFD0D5DB, false);
            for (int i = 0; i < rows.size(); i++) {
                Row row = rows.get(i);
                if (i % 2 == 0) c.fill(mainX + 6, row.y() - 2, mainX + mainW - 6, row.y() + 16, 0x14FFFFFF);
                c.drawText(textRenderer, row.label().toUpperCase(Locale.ROOT), mainX + 12, row.y() + 3, 0xFFC4CAD1, false);
            }
            int top = rows.isEmpty() ? py + 58 : rows.get(rows.size() - 1).y() + 20, bottom = py + ph - FOOTER - 4;
            if (editing == HudModule.ICON && bottom - top >= 22) {
                c.fill(mainX + 8, top, mainX + mainW - 8, bottom, 0x50000000);
                c.drawBorder(mainX + 8, top, mainW - 16, bottom - top, 0x30FFFFFF);
                c.getMatrices().push();
                c.getMatrices().translate(mainX + 13, top + 4, 0);
                c.getMatrices().scale(.5f, .5f, 1);
                c.drawText(textRenderer, "VORSCHAU", 0, 0, MenuStyle.accent(), false);
                c.getMatrices().pop();
                Text name = Text.literal(client.getSession().getUsername());
                Text shown = SaviraClient.config.icon ? Text.empty().append(SaviraIcon.glyph(SaviraIcon.current())).append(SaviraClient.config.iconSpace ? " " : "").append(name) : name;
                int cx = mainX + mainW / 2, cy = (top + bottom) / 2 - 4, tw = textRenderer.getWidth(shown) * 2;
                c.fill(cx - tw / 2 - 6, cy - 5, cx + tw / 2 + 6, cy + 19, 0x60000000);
                c.getMatrices().push();
                c.getMatrices().translate(cx - tw / 2f, cy, 0);
                c.getMatrices().scale(2f, 2f, 1f);
                c.drawTextWithShadow(textRenderer, shown, 0, 0, 0xFFFFFFFF);
                c.getMatrices().pop();
            } else if (editing == HudModule.NAMETAG && bottom - top >= 22) {
                HudConfig cfg = SaviraClient.config;
                c.fill(mainX + 8, top, mainX + mainW - 8, bottom, 0x50000000);
                c.drawBorder(mainX + 8, top, mainW - 16, bottom - top, 0x30FFFFFF);
                c.getMatrices().push();
                c.getMatrices().translate(mainX + 13, top + 4, 0);
                c.getMatrices().scale(.5f, .5f, 1);
                c.drawText(textRenderer, "VORSCHAU", 0, 0, MenuStyle.accent(), false);
                c.getMatrices().pop();
                Text name = SaviraIcon.decorate(Text.literal(client.getSession().getUsername()), client.getSession().getUuidOrNull(), false);
                int cx = mainX + mainW / 2, cy = (top + bottom) / 2 - 6, tw = textRenderer.getWidth(name);
                c.getMatrices().push();
                c.getMatrices().translate(cx, cy, 0);
                c.getMatrices().scale(2f, 2f, 1f);
                boolean on = cfg.nametag;
                if (!(on && cfg.nametagNoBackground)) c.fill(-tw / 2 - 1, -1, tw / 2 + 1, 9, 0x40000000);
                c.drawText(textRenderer, name, -tw / 2, 0, 0xFFFFFFFF, on && cfg.nametagShadow);
                c.getMatrices().pop();
                if (on && !cfg.nametagF5) c.drawCenteredTextWithShadow(textRenderer, "Dein Nametag ist in F5 ausgeblendet", cx, bottom - 12, 0xFF8A939D);
            } else if (bottom - top >= 22) {
                c.fill(mainX + 8, top, mainX + mainW - 8, bottom, 0x50000000);
                c.drawBorder(mainX + 8, top, mainW - 16, bottom - top, 0x30FFFFFF);
                c.getMatrices().push();
                c.getMatrices().translate(mainX + 13, top + 4, 0);
                c.getMatrices().scale(.5f, .5f, 1);
                c.drawText(textRenderer, "VORSCHAU", 0, 0, MenuStyle.accent(), false);
                c.getMatrices().pop();
                SaviraHud.renderPreview(c, editing, mainX + 12, top + 3, mainW - 24, bottom - top - 6);
            }
            if (textField != null) {
                boolean focused = textField.isFocused();
                MenuStyle.outlined(c, textField.getX() - 5, textField.getY() - 3, textField.getWidth() + 10, 14, C, focused ? MenuStyle.accent() : 0x40FFFFFF, 0xC0000000);
            }
        } else if (page == Page.FEATURE) {
            Feature f = FEATURES.stream().filter(x -> x.name().equals(feature)).findFirst().orElse(FEATURES.get(0));
            int cx = mainX + mainW / 2, cy = py + ph / 2 - 14;
            c.fill(cx - 22, cy - 40, cx + 22, cy + 4, 0x30FFFFFF);
            icon(c, f.icon(), cx - 15, cy - 33, 3, MenuStyle.accent());
            c.drawCenteredTextWithShadow(textRenderer, feature, cx, cy + 14, MenuStyle.TEXT);
            c.drawCenteredTextWithShadow(textRenderer, f.blurb(), cx, cy + 28, 0xFFC4CAD1);
            String soon = "KOMMT BALD";
            int sw = textRenderer.getWidth(soon) + 12;
            c.fill(cx - sw / 2, cy + 42, cx + sw / 2, cy + 56, NEW_TAG);
            c.drawText(textRenderer, soon, cx - sw / 2 + 6, cy + 45, 0xFF2A1F05, false);
        }
    }

    /** Frames around HUD elements: hover/selected outline, resize corner and a red X to hide. */
    private void renderHudHandles(DrawContext c, int mouseX, int mouseY) {
        boolean editor = page == Page.EDITOR;
        if (editor && SaviraClient.config.snap) {
            c.fill(width / 2, 37, width / 2 + 1, height - 30, MenuStyle.accentAlpha(0x55));
            c.fill(0, height / 2, width, height / 2 + 1, MenuStyle.accentAlpha(0x55));
        }
        for (HudModule module : HudModule.values()) {
            if (!module.enabled() || !module.onHud()) continue;
            SaviraHud.Bounds b = SaviraHud.bounds(module, width, height);
            boolean hover = !overWindow(mouseX, mouseY) && (b.contains(mouseX, mouseY) || onRemove(b, mouseX, mouseY)), focus = module == selected || module == dragging;
            if (!editor && !hover && !focus) continue;
            int color = focus || hover ? MenuStyle.accent() : 0x80909090;
            c.drawBorder(b.x() - 2, b.y() - 2, b.width() + 4, b.height() + 4, color);
            c.fill(b.x() + b.width() - 1, b.y() + b.height() - 1, b.x() + b.width() + 3, b.y() + b.height() + 3, color);
            // Red X on the top right corner, like NoRisk: hides the element.
            int rx = b.x() + b.width() - 2, ry = b.y() - 6;
            boolean xHover = onRemove(b, mouseX, mouseY);
            c.fill(rx, ry, rx + 7, ry + 7, xHover ? REMOVE : 0xC0B23A3E);
            for (int i = 0; i < 5; i++) { c.fill(rx + 1 + i, ry + 1 + i, rx + 2 + i, ry + 2 + i, 0xFFFFFFFF); c.fill(rx + 5 - i, ry + 1 + i, rx + 6 - i, ry + 2 + i, 0xFFFFFFFF); }
            if (editor && (focus || hover)) c.drawTextWithShadow(textRenderer, module.title, b.x(), Math.max(36, b.y() - 14), MenuStyle.TEXT);
        }
    }

    private static boolean onRemove(SaviraHud.Bounds b, double x, double y) {
        int rx = b.x() + b.width() - 2, ry = b.y() - 6;
        return x >= rx && x < rx + 7 && y >= ry && y < ry + 7;
    }

    private void renderEditorHint(DrawContext c) {
        String hint = selected == null ? "Ziehen: verschieben  /  Ecke oder Mausrad: Größe  /  X: ausblenden" : selected.title + "  /  " + Math.round(SaviraClient.config.placement(selected).size * 100) + "%  /  Pfeile: verschieben";
        int hw = Math.min(width - 12, textRenderer.getWidth(hint) + 20);
        MenuStyle.outlined(c, width / 2 - hw / 2, height - 25, hw, 19, C, MenuStyle.EDGE, MenuStyle.GLASS);
        c.drawCenteredTextWithShadow(textRenderer, textRenderer.trimToWidth(hint, width - 20), width / 2, height - 19, MenuStyle.TEXT);
    }

    // ---------- Input ----------
    @Override
    public boolean mouseClicked(double x, double y, int button) {
        if (super.mouseClicked(x, y, button)) return true;
        if (editsHud() && button == 0 && !overWindow(x, y)) {
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
        return super.mouseDragged(x, y, button, dx, dy);
    }

    @Override
    public boolean mouseReleased(double x, double y, int button) {
        if (dragging != null) { dragging = null; persist(); return true; }
        return super.mouseReleased(x, y, button);
    }

    @Override
    public boolean mouseScrolled(double x, double y, double horizontal, double vertical) {
        if (page == Page.MODS && x >= mainX && x < mainX + mainW && y >= contentTop && y < contentBottom) {
            scroll = Math.clamp(scroll - (int) (vertical * 28), 0, maxScroll); rebuildCards(); return true;
        }
        if (editsHud() && !overWindow(x, y)) {
            for (HudModule module : HudModule.values()) {
                if (module.enabled() && module.onHud() && SaviraHud.bounds(module, width, height).contains(x, y)) {
                    selected = module;
                    HudConfig.Placement p = SaviraClient.config.placement(module);
                    p.size = Math.clamp(p.size + (float) vertical * .05f, .5f, 2f); persist(); return true;
                }
            }
        }
        return super.mouseScrolled(x, y, horizontal, vertical);
    }

    @Override
    public boolean keyPressed(int key, int scan, int modifiers) {
        if (key == GLFW.GLFW_KEY_ESCAPE && page != Page.HOME) { show(page == Page.SETTINGS ? Page.MODS : Page.HOME); return true; }
        if (editsHud() && selected != null && !(getFocused() instanceof TextFieldWidget) && key >= GLFW.GLFW_KEY_RIGHT && key <= GLFW.GLFW_KEY_UP) {
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

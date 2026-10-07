package gg.savira.client;

import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.tooltip.Tooltip;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.client.gui.widget.ClickableWidget;
import net.minecraft.client.gui.widget.TextFieldWidget;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.text.OrderedText;
import net.minecraft.text.Text;
import org.lwjgl.glfw.GLFW;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/**
 * Savira's Right-Shift menu, NoRisk style: a start page, a searchable module grid with a
 * sidebar, per-module settings (background, colours, corners, text) and the HUD editor.
 */
public final class HudScreen extends Screen {
    private enum Page { HOME, MODS, SETTINGS, FEATURE, EDITOR }
    private record Row(String label, int y) {}

    private static final int[] TEXT_COLORS = {0xFFFFFF, 0xC9D1D9, 0x8A939D, 0x5CCF95, 0x22B07D, 0x22B8E6, 0x4F8DFF, 0x8F72F2, 0xE36BB5, 0xE5484D, 0xF07F2D, 0xF2C35B};
    private static final int[] BG_COLORS = {0x000000, 0x1A1E24, 0x3A4250, 0x5CCF95, 0x22B8E6, 0x4F8DFF, 0x8F72F2, 0xE36BB5, 0xE5484D, 0xF07F2D, 0xF2C35B, 0xFFFFFF};

    private Page page = Page.HOME;
    private String feature = "", query = "", saveError = "";
    private HudModule editing;
    private int px, py, pw, ph, mainX, mainW, contentTop, contentBottom, scroll, maxScroll;
    private TextFieldWidget search, textField;
    private final List<ClickableWidget> cards = new ArrayList<>();
    private final List<Row> rows = new ArrayList<>();
    // HUD editor state
    private HudModule selected, dragging;
    private boolean resizing;
    private double grabX, grabY;
    private float initialSize;

    public HudScreen() { super(Text.literal("Savira · Mod-Menü")); }

    @Override
    protected void init() { rebuild(); }

    private void show(Page next) {
        persist(); page = next; scroll = 0; dragging = null;
        rebuild();
    }

    private void rebuild() {
        clearChildren(); cards.clear(); rows.clear(); search = null; textField = null;
        pw = Math.min(420, width - 16); ph = Math.min(250, height - 24);
        px = (width - pw) / 2; py = (height - ph) / 2;
        mainX = px + 50; mainW = pw - 50;
        switch (page) {
            case HOME -> buildHome();
            case MODS -> { buildFrame(); buildMods(); }
            case SETTINGS -> { buildFrame(); buildSettings(); }
            case FEATURE -> buildFrame();
            case EDITOR -> buildEditor();
        }
    }

    // ---------- Start page ----------
    private void buildHome() {
        int w = Math.min(206, width - 24), x = (width - w) / 2, y = height / 2 - 6;
        addDrawableChild(MenuStyle.button(x, y, w, 20, "Mod-Menü", false, b -> show(Page.MODS)));
        int size = 28, gap = 6, rowX = (width - (5 * size + 4 * gap)) / 2, rowY = y + 28;
        addDrawableChild(homeIcon(rowX, rowY, size, "HUD-Editor", Items.ITEM_FRAME, false, b -> show(Page.EDITOR)));
        addDrawableChild(homeIcon(rowX + (size + gap), rowY, size, "Cosmetics", Items.LEATHER_CHESTPLATE, false, b -> openFeature("Cosmetics")));
        addDrawableChild(homeIcon(rowX + 2 * (size + gap), rowY, size, "Savira Plus", null, true, b -> openFeature("Savira Plus")));
        addDrawableChild(homeIcon(rowX + 3 * (size + gap), rowY, size, "Emotes", Items.ARMOR_STAND, false, b -> openFeature("Emotes")));
        addDrawableChild(homeIcon(rowX + 4 * (size + gap), rowY, size, "Friends", Items.PLAYER_HEAD, false, b -> openFeature("Friends")));
    }

    private ButtonWidget homeIcon(int x, int y, int size, String label, Item icon, boolean accent, ButtonWidget.PressAction action) {
        ButtonWidget button = new ButtonWidget(x, y, size, size, Text.literal(label), action, n -> n.get()) {
            @Override
            protected void renderWidget(DrawContext c, int mouseX, int mouseY, float delta) {
                boolean hover = isHovered() || isFocused();
                MenuStyle.outlined(c, getX(), getY(), getWidth(), getHeight(), 4, hover ? MenuStyle.accentAlpha(0xC0) : 0x60FFFFFF, hover ? 0x60202630 : 0x40000000);
                if (accent) MenuStyle.logo(c, getX() + (getWidth() - 12) / 2 - 2, getY() + (getHeight() - 15) / 2 - 1, 1, MenuStyle.accent(), true);
                else c.drawItem(new ItemStack(icon), getX() + (getWidth() - 16) / 2, getY() + (getHeight() - 16) / 2);
            }
        };
        button.setTooltip(Tooltip.of(Text.literal(label)));
        return button;
    }

    private void openFeature(String name) { feature = name; show(Page.FEATURE); }

    // ---------- Frame: sidebar + top bar ----------
    private void buildFrame() {
        String[][] side = {{"Savira Plus", ""}, {"Cosmetics", "c"}, {"Friends", "f"}, {"Emotes", "e"}};
        Item[] icons = {null, Items.LEATHER_CHESTPLATE, Items.PLAYER_HEAD, Items.ARMOR_STAND};
        for (int i = 0; i < side.length; i++) {
            String name = side[i][0]; Item icon = icons[i];
            int y = py + 8 + i * 40;
            ButtonWidget b = new ButtonWidget(px + 3, y, 38, 36, Text.literal(name), x -> openFeature(name), n -> n.get()) {
                @Override
                protected void renderWidget(DrawContext c, int mouseX, int mouseY, float delta) {
                    boolean hover = isHovered() || isFocused(), current = page == Page.FEATURE && feature.equals(name);
                    if (current || hover) MenuStyle.round(c, getX(), getY(), getWidth(), getHeight(), 4, current ? MenuStyle.accentAlpha(0x30) : 0x14FFFFFF);
                    if (icon == null) MenuStyle.logo(c, getX() + 11, getY() + 3, 1, MenuStyle.accent(), true);
                    else c.drawItem(new ItemStack(icon), getX() + 11, getY() + 4);
                    c.getMatrices().push();
                    c.getMatrices().translate(getX() + getWidth() / 2f, getY() + 25, 0);
                    c.getMatrices().scale(.5f, .5f, 1);
                    String label = name.toUpperCase(Locale.ROOT);
                    c.drawText(textRenderer, label, -textRenderer.getWidth(label) / 2, 0, current ? MenuStyle.accent() : hover ? MenuStyle.TEXT : MenuStyle.MUTED, false);
                    c.getMatrices().pop();
                }
            };
            b.setTooltip(Tooltip.of(Text.literal(name)));
            addDrawableChild(b);
        }
        if (page == Page.SETTINGS) return; // the settings page shows "< Module" in place of the tabs
        int tabY = py + 7;
        addDrawableChild(tab(mainX + 8, tabY, "Mods", page == Page.MODS || page == Page.SETTINGS, x -> show(Page.MODS)));
        addDrawableChild(tab(mainX + 52, tabY, "HUD-Editor", false, x -> show(Page.EDITOR)));
    }

    private ButtonWidget tab(int x, int y, String label, boolean active, ButtonWidget.PressAction action) {
        int w = textRenderer.getWidth(label.toUpperCase(Locale.ROOT)) + 14;
        return new ButtonWidget(x, y, w, 16, Text.literal(label), action, n -> n.get()) {
            @Override
            protected void renderWidget(DrawContext c, int mouseX, int mouseY, float delta) {
                boolean hover = isHovered() || isFocused();
                if (active) MenuStyle.round(c, getX(), getY(), getWidth(), getHeight(), 3, 0x30FFFFFF);
                else if (hover) MenuStyle.round(c, getX(), getY(), getWidth(), getHeight(), 3, 0x14FFFFFF);
                String text = label.toUpperCase(Locale.ROOT);
                c.drawText(textRenderer, text, getX() + 7, getY() + 4, active ? MenuStyle.TEXT : hover ? MenuStyle.TEXT : MenuStyle.MUTED, false);
            }
        };
    }

    // ---------- Module grid ----------
    private void buildMods() {
        int sw = Math.min(110, mainW / 3);
        search = new TextFieldWidget(textRenderer, mainX + mainW - sw - 2, py + 11, sw - 8, 10, Text.literal("Module suchen"));
        search.setDrawsBackground(false); search.setMaxLength(48);
        search.setPlaceholder(Text.literal("Suchen ...")); search.setText(query);
        search.setChangedListener(value -> { query = value; scroll = 0; rebuildCards(); });
        addDrawableChild(search);
        contentTop = py + 32; contentBottom = py + ph - 20;
        rebuildCards();
    }

    private void rebuildCards() {
        for (ClickableWidget card : cards) remove(card);
        cards.clear();
        if (page != Page.MODS) return;
        String needle = query.strip().toLowerCase(Locale.ROOT);
        List<HudModule> visible = Arrays.stream(HudModule.values())
                .filter(m -> (m.title + " " + m.category + " " + m.description).toLowerCase(Locale.ROOT).contains(needle)).toList();
        int gap = 5, area = mainW - 16, cardW = (area - gap) / 2, cardH = 42;
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

    /** Card: click toggles, the "…" button (or right click) opens the module settings. */
    private final class ModuleCard extends ButtonWidget {
        private final HudModule module;
        ModuleCard(int x, int y, int w, int h, HudModule module) {
            super(x, y, w, h, moduleLabel(module), b -> { module.toggle(); b.setMessage(moduleLabel(module)); persist(); }, n -> n.get());
            this.module = module;
            setTooltip(Tooltip.of(Text.literal(module.description + "\nRechtsklick oder … : Einstellungen")));
        }
        private boolean onDots(double mx, double my) { return mx >= getX() + getWidth() - 20 && my >= getY() + getHeight() - 16; }
        @Override
        public boolean mouseClicked(double mx, double my, int button) {
            if (!active || !visible || !isMouseOver(mx, my) || my < contentTop || my >= contentBottom) return false;
            if (button == 1 || (button == 0 && onDots(mx, my))) { playDownSound(client.getSoundManager()); openSettings(module); return true; }
            return super.mouseClicked(mx, my, button);
        }
        @Override
        protected void renderWidget(DrawContext c, int mouseX, int mouseY, float delta) {
            if (getY() + getHeight() < contentTop || getY() > contentBottom) return;
            c.enableScissor(mainX + 2, contentTop, mainX + mainW - 2, contentBottom);
            boolean on = module.enabled(), hover = (isHovered() && mouseY >= contentTop && mouseY < contentBottom) || isFocused();
            MenuStyle.outlined(c, getX(), getY(), getWidth(), getHeight(), 4, hover ? MenuStyle.accentAlpha(0xB0) : on ? MenuStyle.accentAlpha(0x60) : 0xFF262B33, hover ? 0xE0181C22 : 0xD0101317);
            c.drawItem(new ItemStack(module.icon), getX() + 7, getY() + (getHeight() - 16) / 2);
            int textX = getX() + 29, textW = getWidth() - 29 - 30;
            c.drawText(textRenderer, textRenderer.trimToWidth(module.title.toUpperCase(Locale.ROOT), textW), textX, getY() + 7, on ? MenuStyle.TEXT : MenuStyle.MUTED, false);
            c.getMatrices().push();
            c.getMatrices().translate(textX, getY() + 19, 0);
            c.getMatrices().scale(.75f, .75f, 1);
            List<OrderedText> lines = textRenderer.wrapLines(Text.literal(module.description), (int) (textW / .75f));
            for (int i = 0; i < Math.min(2, lines.size()); i++) c.drawText(textRenderer, lines.get(i), 0, i * 10, 0xFF7A838D, false);
            c.getMatrices().pop();
            MenuStyle.toggle(c, getX() + getWidth() - 28, getY() + 7, on);
            boolean dotsHover = hover && onDots(mouseX, mouseY);
            if (dotsHover) MenuStyle.round(c, getX() + getWidth() - 20, getY() + getHeight() - 15, 15, 11, 3, 0x30FFFFFF);
            c.drawText(textRenderer, "...", getX() + getWidth() - 17, getY() + getHeight() - 15, dotsHover ? MenuStyle.TEXT : MenuStyle.MUTED, false);
            c.disableScissor();
        }
    }

    // ---------- Module settings ----------
    private void openSettings(HudModule module) { editing = module; show(Page.SETTINGS); }

    private void buildSettings() {
        HudModule m = editing;
        HudConfig.Style style = SaviraClient.config.style(m);
        HudBackground bg = HudBackground.parse(style.background);
        addDrawableChild(tab(mainX + 8, py + 7, "< " + m.title, false, b -> show(Page.MODS)));
        int right = mainX + mainW - 10;
        addDrawableChild(MenuStyle.button(right - 82, py + 7, 82, 16, "Zurücksetzen", false, b -> {
            SaviraClient.config.styles.remove(m.name());
            SaviraClient.config.placement(m).size = 1f;
            persist(); rebuild();
        }));
        addDrawableChild(MenuWidgets.toggle(right - 82 - 32, py + 9, "Modul an/aus", m::enabled, () -> { m.toggle(); persist(); }));

        int controlW = Math.min(160, mainW / 2), cx = right - controlW, rowH = 18;
        int[] y = {py + 51};
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

    // ---------- HUD editor ----------
    private void buildEditor() {
        int total = Math.min(410, width - 16), x = (width - total) / 2, unit = (total - 18) / 4;
        addDrawableChild(MenuStyle.button(x, 10, unit, 22, "< Zurück", false, b -> show(Page.MODS)));
        addDrawableChild(MenuStyle.button(x + unit + 6, 10, unit, 22, SaviraClient.config.snap ? "Raster: AN" : "Raster: AUS", SaviraClient.config.snap, b -> {
            SaviraClient.config.snap = !SaviraClient.config.snap; persist(); rebuild();
        }));
        addDrawableChild(MenuStyle.button(x + 2 * (unit + 6), 10, unit, 22, "Layout resetten", false, b -> {
            SaviraClient.config.layout.clear(); persist();
        }));
        addDrawableChild(MenuStyle.button(x + 3 * (unit + 6), 10, unit, 22, "Fertig", true, b -> show(Page.MODS)));
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
        // The full HUD only shows where it matters; inside the panel it would shine through.
        if (page == Page.HOME || page == Page.EDITOR) SaviraHud.renderModules(c, true);
        c.getMatrices().push();
        c.getMatrices().translate(0, 0, 400);
        switch (page) {
            case HOME -> renderHome(c);
            case MODS, SETTINGS, FEATURE -> renderFrame(c, mouseX, mouseY);
            case EDITOR -> renderEditor(c, mouseX, mouseY);
        }
        super.render(c, mouseX, mouseY, delta);
        if (!saveError.isEmpty()) c.drawCenteredTextWithShadow(textRenderer, saveError, width / 2, height - 38, 0xFFFF9C9C);
        c.getMatrices().pop();
    }

    private void renderHome(DrawContext c) {
        int center = width / 2, y = height / 2 - 52, scale = 2;
        String left = "SAVIRA", right = "CLIENT";
        int lw = textRenderer.getWidth(left) * scale, rw = textRenderer.getWidth(right) * scale, logo = 26, gap = 8;
        int start = center - (lw + gap + logo + gap + rw) / 2;
        drawBig(c, left, start, y + 9, scale, MenuStyle.TEXT);
        MenuStyle.logo(c, start + lw + gap - 1, y + 2, 2, MenuStyle.accent());
        drawBig(c, right, start + lw + gap + logo + gap, y + 9, scale, 0xFFB9C1C9);
        c.drawCenteredTextWithShadow(textRenderer, "Rechts-Shift öffnet dieses Menü  ·  ESC zurück ins Spiel", center, height - 16, 0xFF8A939D);
    }

    private void drawBig(DrawContext c, String text, int x, int y, int scale, int color) {
        c.getMatrices().push();
        c.getMatrices().translate(x, y, 0);
        c.getMatrices().scale(scale, scale, 1);
        c.drawText(textRenderer, text, 0, 1, 0x80000000, false);
        c.drawText(textRenderer, text, 0, 0, color, false);
        c.getMatrices().pop();
    }

    private void renderFrame(DrawContext c, int mouseX, int mouseY) {
        // Sidebar and main panel as two separate frosted boxes.
        MenuStyle.outlined(c, px, py, 44, ph, 5, 0x40FFFFFF, 0xB0101317);
        MenuStyle.outlined(c, mainX, py, mainW, ph, 5, 0x40FFFFFF, 0xB0101317);
        c.fill(mainX + 6, py + 28, mainX + mainW - 6, py + 29, 0x30FFFFFF);
        c.fill(mainX + 1, py + ph - 17, mainX + mainW - 1, py + ph - 16, 0x30FFFFFF);
        long active = Arrays.stream(HudModule.values()).filter(HudModule::enabled).count();
        c.fill(mainX + mainW - 72, py + ph - 11, mainX + mainW - 68, py + ph - 7, MenuStyle.accent());
        c.drawText(textRenderer, active + " / " + HudModule.values().length + " aktiv", mainX + mainW - 64, py + ph - 12, MenuStyle.MUTED, false);

        if (page == Page.MODS) {
            int sw = Math.min(110, mainW / 3), sx = mainX + mainW - sw - 6;
            MenuStyle.outlined(c, sx, py + 7, sw, 16, 3, search != null && search.isFocused() ? MenuStyle.accent() : 0x30FFFFFF, 0x80000000);
            if (cards.isEmpty()) {
                int cx = mainX + mainW / 2;
                c.drawCenteredTextWithShadow(textRenderer, "Keine passenden Module", cx, contentTop + 40, MenuStyle.TEXT);
                c.drawCenteredTextWithShadow(textRenderer, "Andere Suche probieren.", cx, contentTop + 56, MenuStyle.MUTED);
            }
            if (maxScroll > 0) {
                int track = contentBottom - contentTop, thumb = Math.max(18, track * track / (track + maxScroll));
                int top = contentTop + (track - thumb) * scroll / maxScroll;
                c.fill(mainX + mainW - 4, contentTop, mainX + mainW - 3, contentBottom, 0x20FFFFFF);
                c.fill(mainX + mainW - 4, top, mainX + mainW - 3, top + thumb, MenuStyle.accent());
            }
        } else if (page == Page.SETTINGS && editing != null) {
            c.getMatrices().push();
            c.getMatrices().translate(mainX + 12, py + 35, 0);
            c.getMatrices().scale(.85f, .85f, 1);
            c.drawText(textRenderer, editing.description, 0, 0, 0xFFB9C1C9, false);
            c.getMatrices().pop();
            c.fill(mainX + 8, py + 47, mainX + mainW - 8, py + 48, 0x30FFFFFF);
            for (int i = 0; i < rows.size(); i++) {
                Row row = rows.get(i);
                if (i % 2 == 1) c.fill(mainX + 6, row.y() - 2, mainX + mainW - 6, row.y() + 16, 0x0CFFFFFF);
                c.drawText(textRenderer, row.label().toUpperCase(Locale.ROOT), mainX + 12, row.y() + 3, 0xFF9AA3AD, false);
            }
            int top = rows.isEmpty() ? py + 52 : rows.get(rows.size() - 1).y() + 19, bottom = py + ph - 21;
            if (bottom - top >= 22) {
                MenuStyle.outlined(c, mainX + 8, top, mainW - 16, bottom - top, 4, 0x20FFFFFF, 0x50000000);
                c.getMatrices().push();
                c.getMatrices().translate(mainX + 13, top + 4, 0);
                c.getMatrices().scale(.5f, .5f, 1);
                c.drawText(textRenderer, "VORSCHAU", 0, 0, MenuStyle.MUTED, false);
                c.getMatrices().pop();
                SaviraHud.renderPreview(c, editing, mainX + 12, top + 3, mainW - 24, bottom - top - 6);
            }
            if (textField != null) {
                boolean focused = textField.isFocused();
                MenuStyle.outlined(c, textField.getX() - 5, textField.getY() - 3, textField.getWidth() + 10, 14, 3, focused ? MenuStyle.accent() : MenuStyle.LINE, 0xFF0A0C0F);
            }
        } else if (page == Page.FEATURE) {
            int cx = mainX + mainW / 2, cy = py + ph / 2 - 20;
            MenuStyle.logo(c, cx - 15, cy - 26, 2, MenuStyle.accent());
            c.drawCenteredTextWithShadow(textRenderer, feature.toUpperCase(Locale.ROOT), cx, cy + 14, MenuStyle.TEXT);
            c.drawCenteredTextWithShadow(textRenderer, "Kommt bald zu Savira.", cx, cy + 28, MenuStyle.MUTED);
        }
    }

    private void renderEditor(DrawContext c, int mouseX, int mouseY) {
        if (SaviraClient.config.snap) {
            c.fill(width / 2, 37, width / 2 + 1, height - 30, MenuStyle.accentAlpha(0x55));
            c.fill(0, height / 2, width, height / 2 + 1, MenuStyle.accentAlpha(0x55));
        }
        for (HudModule module : HudModule.values()) {
            if (!module.enabled()) continue;
            SaviraHud.Bounds b = SaviraHud.bounds(module, width, height);
            boolean hover = b.contains(mouseX, mouseY);
            int color = module == selected || hover ? MenuStyle.accent() : 0x80909090;
            c.drawBorder(b.x() - 2, b.y() - 2, b.width() + 4, b.height() + 4, color);
            c.fill(b.x() + b.width() - 3, b.y() + b.height() - 3, b.x() + b.width() + 3, b.y() + b.height() + 3, color);
            if (module == selected || hover) c.drawTextWithShadow(textRenderer, module.title, b.x(), Math.max(36, b.y() - 12), MenuStyle.TEXT);
        }
        String hint = selected == null ? "Ziehen: verschieben  /  Ecke oder Mausrad: Größe" : selected.title + "  /  " + Math.round(SaviraClient.config.placement(selected).size * 100) + "%  /  Pfeile: verschieben";
        int hw = Math.min(width - 12, textRenderer.getWidth(hint) + 20);
        MenuStyle.outlined(c, width / 2 - hw / 2, height - 25, hw, 19, 5, MenuStyle.LINE, MenuStyle.PANEL);
        c.drawCenteredTextWithShadow(textRenderer, textRenderer.trimToWidth(hint, width - 20), width / 2, height - 19, MenuStyle.TEXT);
    }

    // ---------- Input ----------
    @Override
    public boolean mouseClicked(double x, double y, int button) {
        if (super.mouseClicked(x, y, button)) return true;
        if (page == Page.EDITOR && button == 0) {
            HudModule[] modules = HudModule.values();
            for (int i = modules.length - 1; i >= 0; i--) {
                HudModule module = modules[i];
                SaviraHud.Bounds b = SaviraHud.bounds(module, width, height);
                if (module.enabled() && x >= b.x() - 3 && x <= b.x() + b.width() + 3 && y >= b.y() - 3 && y <= b.y() + b.height() + 3) {
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
        if (page == Page.EDITOR) {
            for (HudModule module : HudModule.values()) {
                if (module.enabled() && SaviraHud.bounds(module, width, height).contains(x, y)) {
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
        if (page == Page.EDITOR && selected != null && key >= GLFW.GLFW_KEY_RIGHT && key <= GLFW.GLFW_KEY_UP) {
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

package gg.savira.client;

import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.tooltip.Tooltip;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.client.gui.widget.TextFieldWidget;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.text.Text;
import org.lwjgl.glfw.GLFW;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

public final class HudScreen extends Screen {
    private enum Page { HOME, MODULES, EDITOR }
    private static final String[] CATEGORIES = {"Alle", "PvP", "Performance", "Welt", "Gameplay"};
    private static final int SIDEBAR = 112;
    private Page page = Page.HOME;
    private String saveError = "", query = "", category = "Alle";
    private boolean list = false;
    private int px, py, pw, ph, scroll, maxScroll, contentLeft, contentRight, contentTop, contentBottom, homeX, homeY;
    private TextFieldWidget search;
    private final List<ButtonWidget> cards = new ArrayList<>();
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
        clearChildren(); cards.clear(); search = null;
        pw = Math.min(560, width - 20); ph = Math.min(340, height - 24);
        px = (width - pw) / 2; py = (height - ph) / 2;
        if (page == Page.HOME) {
            int dockWidth = Math.min(260, width - 24);
            homeX = (width - dockWidth) / 2;
            homeY = Math.min(height - 100, height / 2 + 4);
            addDrawableChild(MenuStyle.button(homeX, homeY, dockWidth, 24, "Mod-Menü", true, b -> show(Page.MODULES)));
            int gap = 6, size = (dockWidth - gap * 3) / 4;
            int iconY = homeY + 32;
            addDrawableChild(MenuStyle.iconButton(homeX, iconY, size, 44, "Module", Items.COMPASS, b -> show(Page.MODULES)));
            addDrawableChild(MenuStyle.iconButton(homeX + size + gap, iconY, size, 44, "HUD", Items.NETHERITE_CHESTPLATE, b -> show(Page.EDITOR)));
            addDrawableChild(MenuStyle.iconButton(homeX + 2 * (size + gap), iconY, size, 44, "Reset", Items.CLOCK, b -> {
                SaviraClient.config.layout.clear(); persist();
            }));
            addDrawableChild(MenuStyle.iconButton(homeX + 3 * (size + gap), iconY, size, 44, "Spiel", Items.BARRIER, b -> close()));
        } else if (page == Page.MODULES) {
            // Sidebar: categories, then the editor shortcut pinned to the bottom.
            for (int i = 0; i < CATEGORIES.length; i++) {
                String tab = CATEGORIES[i];
                long count = tab.equals("Alle") ? HudModule.values().length : Arrays.stream(HudModule.values()).filter(m -> m.category.equals(tab)).count();
                addDrawableChild(MenuStyle.navButton(px + 6, py + 40 + i * 22, SIDEBAR - 12, 20, tab, Long.toString(count), category.equals(tab), b -> { category = tab; scroll = 0; rebuild(); }));
            }
            addDrawableChild(MenuStyle.button(px + 8, py + ph - 30, SIDEBAR - 16, 20, "HUD bearbeiten", true, b -> show(Page.EDITOR)));

            contentLeft = px + SIDEBAR + 10; contentRight = px + pw - 12;
            addDrawableChild(MenuStyle.button(contentRight - 20, py + 10, 20, 20, "X", false, b -> show(Page.HOME)));
            addDrawableChild(MenuStyle.button(contentRight - 76, py + 10, 52, 20, list ? "Liste" : "Raster", false, b -> { list = !list; scroll = 0; rebuild(); }));
            search = new TextFieldWidget(textRenderer, contentLeft + 22, py + 16, contentRight - 86 - contentLeft - 26, 12, Text.literal("Module suchen"));
            search.setDrawsBackground(false); search.setMaxLength(64);
            search.setPlaceholder(Text.literal("Module suchen ...")); search.setText(query);
            search.setChangedListener(value -> { query = value; scroll = 0; rebuildCards(); });
            addDrawableChild(search);
            contentTop = py + 40; contentBottom = py + ph - 8;
            rebuildCards();
        } else {
            int total = Math.min(410, width - 16), x = (width - total) / 2, unit = (total - 18) / 4;
            addDrawableChild(MenuStyle.button(x, 10, unit, 22, "< Zurück", false, b -> show(Page.HOME)));
            addDrawableChild(MenuStyle.button(x + unit + 6, 10, unit, 22, SaviraClient.config.snap ? "Raster: AN" : "Raster: AUS", SaviraClient.config.snap, b -> {
                SaviraClient.config.snap = !SaviraClient.config.snap; persist(); rebuild();
            }));
            addDrawableChild(MenuStyle.button(x + 2 * (unit + 6), 10, unit, 22, "Layout resetten", false, b -> {
                SaviraClient.config.layout.clear(); persist();
            }));
            addDrawableChild(MenuStyle.button(x + 3 * (unit + 6), 10, unit, 22, "Fertig", true, b -> show(Page.HOME)));
        }
    }

    private void rebuildCards() {
        for (ButtonWidget card : cards) remove(card);
        cards.clear();
        if (page != Page.MODULES) return;
        String needle = query.strip().toLowerCase(Locale.ROOT);
        List<HudModule> visible = Arrays.stream(HudModule.values()).filter(m -> (category.equals("Alle") || m.category.equals(category))
                && (m.title + " " + m.category + " " + m.description).toLowerCase(Locale.ROOT).contains(needle)).toList();
        int area = contentRight - contentLeft - 6;
        int columns = list ? 1 : Math.max(2, Math.min(4, area / 100));
        int gap = 6, cardWidth = (area - (columns - 1) * gap) / columns;
        int cardHeight = list ? 32 : 74;
        int rows = (visible.size() + columns - 1) / columns;
        maxScroll = Math.max(0, rows * (cardHeight + gap) - gap - (contentBottom - contentTop));
        scroll = Math.clamp(scroll, 0, maxScroll);
        for (int i = 0; i < visible.size(); i++) {
            HudModule module = visible.get(i);
            int x = contentLeft + (i % columns) * (cardWidth + gap);
            int y = contentTop + (i / columns) * (cardHeight + gap) - scroll;
            ButtonWidget card = new ButtonWidget(x, y, cardWidth, cardHeight, moduleLabel(module), b -> {
                module.toggle(); b.setMessage(moduleLabel(module)); persist();
            }, narration -> narration.get()) {
                @Override
                protected void renderWidget(DrawContext c, int mouseX, int mouseY, float delta) {
                    if (getY() + getHeight() < contentTop || getY() > contentBottom) return;
                    c.enableScissor(contentLeft - 2, contentTop, contentRight, contentBottom);
                    boolean hover = isHovered() && mouseY >= contentTop && mouseY < contentBottom || isFocused();
                    boolean on = module.enabled();
                    MenuStyle.outlined(c, getX(), getY(), getWidth(), getHeight(), 6, hover ? MenuStyle.accentAlpha(0xC0) : on ? MenuStyle.accentAlpha(0x70) : MenuStyle.LINE, hover ? MenuStyle.SURFACE_HOVER : MenuStyle.SURFACE);
                    if (list) {
                        icon(c, module, getX() + 6, getY() + 5, on);
                        c.drawTextWithShadow(textRenderer, module.title, getX() + 34, getY() + 7, MenuStyle.TEXT);
                        c.drawText(textRenderer, module.category, getX() + 34, getY() + 18, MenuStyle.MUTED, false);
                        MenuStyle.toggle(c, getX() + getWidth() - 30, getY() + 10, on);
                    } else {
                        icon(c, module, getX() + 7, getY() + 7, on);
                        c.drawTextWithShadow(textRenderer, textRenderer.trimToWidth(module.title, getWidth() - 14), getX() + 7, getY() + 37, MenuStyle.TEXT);
                        c.fill(getX() + 7, getY() + getHeight() - 21, getX() + getWidth() - 7, getY() + getHeight() - 20, MenuStyle.LINE);
                        c.drawText(textRenderer, textRenderer.trimToWidth(module.category, getWidth() - 14), getX() + 7, getY() + getHeight() - 13, MenuStyle.MUTED, false);
                        MenuStyle.toggle(c, getX() + getWidth() - 29, getY() + 12, on);
                    }
                    c.disableScissor();
                }
                @Override
                public boolean mouseClicked(double mx, double my, int button) {
                    return my >= contentTop && my < contentBottom && super.mouseClicked(mx, my, button);
                }
            };
            card.setTooltip(Tooltip.of(Text.literal(module.description)));
            // Fully clipped rows must not steal keyboard navigation.
            card.active = y < contentBottom && y + cardHeight > contentTop;
            cards.add(addDrawableChild(card));
        }
    }

    /** Item icon on a rounded tile that fills with the accent when the module is on. */
    private void icon(DrawContext c, HudModule module, int x, int y, boolean on) {
        MenuStyle.raised(c, x, y, 22, 22, 4, on ? MenuStyle.accent() : 0xFF242930, false);
        c.drawItem(new ItemStack(module.icon), x + 3, y + 2);
    }

    private Text moduleLabel(HudModule m) { return Text.literal(m.title + (m.enabled() ? ": aktiviert" : ": deaktiviert")); }

    private void persist() {
        saveError = SaviraClient.config.save() ? "" : "Speichern fehlgeschlagen. Bitte Spielordner prüfen.";
    }

    @Override
    public void renderBackground(DrawContext context, int mouseX, int mouseY, float delta) {
        // Our transparent overlay is rendered before the widgets; vanilla's blur would blur our own HUD and branding.
    }

    @Override
    public void render(DrawContext c, int mouseX, int mouseY, float delta) {
        c.fillGradient(0, 0, width, height, page == Page.MODULES ? 0x90000000 : 0x50000000, page == Page.MODULES ? 0xB8000000 : 0x88000000);
        SaviraHud.renderModules(c, true);
        // Item icons use their own depth offsets. Keep the menu above every HUD layer.
        c.getMatrices().push();
        c.getMatrices().translate(0, 0, 400);
        if (page == Page.HOME) renderHome(c);
        else if (page == Page.MODULES) renderModulesPanel(c);
        else renderEditor(c, mouseX, mouseY);
        super.render(c, mouseX, mouseY, delta);
        if (!saveError.isEmpty()) c.drawCenteredTextWithShadow(textRenderer, saveError, width / 2, height - 38, 0xFFFF9C9C);
        c.getMatrices().pop();
    }

    private void renderHome(DrawContext c) {
        int center = width / 2, y = homeY - 70;
        c.getMatrices().push();
        c.getMatrices().translate(center, y, 0);
        c.getMatrices().scale(3.4f, 3.4f, 1);
        int tw = textRenderer.getWidth("savira");
        // Hard 1px drop in the darker accent gives the wordmark the same 3D edge as the launcher logo.
        c.drawText(textRenderer, "savira", -tw / 2, 1, MenuStyle.accentDark(), false);
        c.drawText(textRenderer, "savira", -tw / 2, 0, MenuStyle.accent(), false);
        c.getMatrices().pop();
        c.drawCenteredTextWithShadow(textRenderer, "client  ·  1.21.1", center, y + 40, MenuStyle.MUTED);
        String hint = "Rechts-Shift öffnet dieses Menü  ·  ESC zurück ins Spiel";
        c.drawCenteredTextWithShadow(textRenderer, textRenderer.trimToWidth(hint, width - 16), center, height - 16, 0xFF6C757F);
    }

    private void renderModulesPanel(DrawContext c) {
        MenuStyle.panel(c, px, py, pw, ph);
        MenuStyle.round(c, px + 1, py + 1, SIDEBAR, ph - 2, 8, MenuStyle.SIDEBAR);
        c.fill(px + SIDEBAR, py + 1, px + SIDEBAR + 1, py + ph - 1, MenuStyle.LINE);
        c.getMatrices().push();
        c.getMatrices().translate(px + 12, py + 13, 0);
        c.getMatrices().scale(1.5f, 1.5f, 1);
        c.drawText(textRenderer, "savira", 0, 1, MenuStyle.accentDark(), false);
        c.drawText(textRenderer, "savira", 0, 0, MenuStyle.accent(), false);
        c.getMatrices().pop();
        long enabled = Arrays.stream(HudModule.values()).filter(HudModule::enabled).count();
        c.drawText(textRenderer, enabled + " / " + HudModule.values().length + " aktiv", px + 12, py + ph - 44, MenuStyle.MUTED, false);

        boolean focused = search != null && search.isFocused();
        MenuStyle.outlined(c, contentLeft, py + 10, contentRight - 82 - contentLeft, 20, 5, focused ? MenuStyle.accent() : MenuStyle.LINE, 0xFF0A0C0F);
        // Pixel magnifier, drawn rather than using a texture so it follows the theme.
        int mx = contentLeft + 8, my = py + 15;
        c.fill(mx + 1, my, mx + 5, my + 1, MenuStyle.MUTED); c.fill(mx + 1, my + 6, mx + 5, my + 7, MenuStyle.MUTED);
        c.fill(mx, my + 1, mx + 1, my + 6, MenuStyle.MUTED); c.fill(mx + 5, my + 1, mx + 6, my + 6, MenuStyle.MUTED);
        c.fill(mx + 6, my + 6, mx + 8, my + 8, MenuStyle.MUTED); c.fill(mx + 8, my + 8, mx + 10, my + 10, MenuStyle.MUTED);

        if (cards.isEmpty()) {
            int cx = (contentLeft + contentRight) / 2;
            c.drawCenteredTextWithShadow(textRenderer, "Keine passenden Module", cx, contentTop + 40, MenuStyle.TEXT);
            c.drawCenteredTextWithShadow(textRenderer, "Andere Suche oder Kategorie wählen.", cx, contentTop + 56, MenuStyle.MUTED);
        }
        if (maxScroll > 0) {
            int track = contentBottom - contentTop;
            int thumb = Math.max(18, track * track / (track + maxScroll));
            c.fill(px + pw - 7, contentTop, px + pw - 5, contentBottom, 0xFF1C2026);
            int top = contentTop + (track - thumb) * scroll / maxScroll;
            c.fill(px + pw - 7, top, px + pw - 5, top + thumb, MenuStyle.accent());
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
            if (resizing) SaviraClient.config.placement(dragging).size = Math.clamp(initialSize + (float) (x - grabX) / dragging.width, .5f, 2f);
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
        if (page == Page.MODULES && x >= contentLeft && x < px + pw && y >= contentTop && y < contentBottom) {
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
        if (key == GLFW.GLFW_KEY_ESCAPE && page != Page.HOME) { show(Page.HOME); return true; }
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

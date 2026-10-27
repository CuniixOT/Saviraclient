package gg.savira.client;

import com.mojang.blaze3d.systems.RenderSystem;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.text.Text;
import net.minecraft.util.Util;
import org.lwjgl.glfw.GLFW;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import static gg.savira.client.MenuType.Face.INTER;
import static gg.savira.client.MenuType.Face.PIXEL;
import static gg.savira.client.MenuType.Face.SILK;

/**
 * Emote list for one wheel slot, in the look of the Right-Shift menu (design "Rshift Menu v5"):
 * its glass window, lines, Pixelify, Silkscreen and Inter, light or dark, with the menu's accent.
 * Emotes are grouped by rarity, each card tinted in its rarity's colour (Classic grey, Random green,
 * Special blue, Episch purple, Legendär gold) and showing you in its pose, playing it on hover.
 * Search, shop and close at the top; a click puts the emote in the slot.
 * Laid out in the design's pixels, like the Right-Shift menu.
 */
public final class EmotePickerScreen extends Screen {
    private static final int W = 700, H = 560, COLS = 6, CARD = 96, GAP_X = 10, LABEL = 20, GAP_Y = 12, HEAD = 52, FOOT = 52, PAD = 24;
    private record Card(Emote emote, float x, float y) {}
    private record Header(Emote.Rarity rarity, int count, float y) {}

    private final int slot;
    private float u = 1, sw, sh, x0, y0, contentTop, contentBottom;
    private int hovered = -1;
    private float scroll, scrollPos, maxScroll;
    private long openedAt = Util.getMeasuringTimeMs(), hoverAt, lastFrame;
    private String query = "";
    private final List<Card> cards = new ArrayList<>();
    private final List<Header> headers = new ArrayList<>();
    private final float[] hover = new float[Emote.ALL.size()];

    public EmotePickerScreen(int slot) { super(Text.literal("Emote wählen")); this.slot = slot; }

    private DesignTheme t() { return DesignTheme.current(); }
    private int slotNumber() { return slot % Emotes.SLOTS + 1; }
    private float px() { return Paint.pixels(u); }

    @Override
    protected void init() {
        u = HudScreen.unitFor(width, height);
        sw = width / u; sh = height / u;
        float w = Math.min(W, sw - 40), h = Math.min(H, sh - 40);
        x0 = (sw - w) / 2f; y0 = (sh - h) / 2f;
        contentTop = y0 + HEAD + 1; contentBottom = y0 + h - FOOT;
        layout();
    }
    private float winW() { return Math.min(W, sw - 40); }
    private float winH() { return Math.min(H, sh - 40); }

    private void layout() {
        cards.clear(); headers.clear();
        String needle = query.strip().toLowerCase(Locale.ROOT);
        int cols = Math.max(1, Math.min(COLS, (int) ((winW() - 2 * PAD + GAP_X) / (CARD + GAP_X))));
        float left = x0 + (winW() - cols * CARD - (cols - 1) * GAP_X) / 2f, y = contentTop + 18;
        for (Emote.Rarity rarity : Emote.Rarity.values()) {
            List<Emote> list = Emote.ALL.stream().filter(e -> e.rarity() == rarity && (needle.isEmpty() || e.name().toLowerCase(Locale.ROOT).contains(needle) || e.id().contains(needle))).toList();
            if (list.isEmpty()) continue;
            headers.add(new Header(rarity, list.size(), y));
            y += 26;
            for (int i = 0; i < list.size(); i++) cards.add(new Card(list.get(i), left + (i % cols) * (CARD + GAP_X), y + LABEL + (i / cols) * (CARD + LABEL + GAP_Y)));
            y += ((list.size() + cols - 1) / cols) * (CARD + LABEL + GAP_Y) + 8;
        }
        maxScroll = Math.max(0, y - contentBottom + 8);
        scroll = Math.clamp(scroll, 0, maxScroll);
    }

    private int cardAt(double mx, double my) {
        if (my < contentTop || my >= contentBottom) return -1;
        for (int i = 0; i < cards.size(); i++) {
            Card card = cards.get(i);
            float y = card.y() - scrollPos;
            if (mx >= card.x() && mx < card.x() + CARD && my >= y - LABEL && my < y + CARD) return i;
        }
        return -1;
    }
    // Top bar: search, SHOP, close, like the menu's top bar.
    private float closeX() { return x0 + winW() - 10 - 36; }
    private float shopW() { return 28 + MenuType.width(SILK, "SHOP", 11, .06f, u) + 21; }
    private float shopX() { return closeX() - 10 - shopW(); }
    private float searchX() { return shopX() - 10 - 220; }
    private boolean in(double mx, double my, float x, float y, float w, float h) { return mx >= x && mx < x + w && my >= y && my < y + h; }
    private boolean onShop(double mx, double my) { return in(mx, my, shopX(), y0 + 8, shopW(), 36); }
    private boolean onClose(double mx, double my) { return in(mx, my, closeX(), y0 + 8, 36, 36); }
    private float clearW() { return 28 + MenuType.width(SILK, "SLOT LEEREN", 11, .06f, u) + 21; }
    private boolean onClear(double mx, double my) { return Emotes.slot(slot) != null && in(mx, my, x0 + PAD, y0 + winH() - FOOT + 9, clearW(), 34); }
    private static float ease(float t) { t = Math.clamp(t, 0f, 1f); return 1 - (1 - t) * (1 - t) * (1 - t); }

    private void box(DrawContext c, float x, float y, float w, float h, int color) { if (w > 0 && h > 0) Paint.round(c, x, y, w, h, 0, color, px()); }
    private void frame(DrawContext c, float x, float y, float w, float h, int color) { HudScreen.frame(c, x, y, w, h, color, px()); }

    @Override
    public void renderBackground(DrawContext c, int mouseX, int mouseY, float delta) { }

    @Override
    public void render(DrawContext c, int mouseX, int mouseY, float delta) {
        DesignTheme t = t();
        if (client.world == null || SaviraClient.config.menuBlur) super.renderBackground(c, mouseX, mouseY, delta);
        c.fill(0, 0, width, height, t.scrim());
        long now = Util.getMeasuringTimeMs();
        float dt = lastFrame == 0 ? 0 : Math.min(.1f, (now - lastFrame) / 1000f);
        lastFrame = now;
        scrollPos += (scroll - scrollPos) * (1 - (float) Math.exp(-dt * 16));
        if (Math.abs(scroll - scrollPos) < .05f) scrollPos = scroll;
        double mx = mouseX / u, my = mouseY / u;
        int over = cardAt(mx, my);
        if (over != hovered) { hovered = over; hoverAt = now; }
        float k = SaviraClient.config.menuAnimations ? ease((now - openedAt) / 220f) : 1, ww = winW(), wh = winH();

        RenderSystem.enableBlend();
        c.draw();
        RenderSystem.setShaderColor(1f, 1f, 1f, Math.max(.02f, k));
        c.getMatrices().push();
        c.getMatrices().translate(0, 0, 400);
        c.getMatrices().scale(u, u, 1);
        c.getMatrices().translate(0, (1 - k) * 14, 0);
        box(c, x0, y0, ww, wh, t.glass());
        box(c, x0, y0, ww, wh, DesignTheme.alpha(t.bg(), .45f));
        frame(c, x0, y0, ww, wh, t.line());
        box(c, x0, y0 + HEAD, ww, 1, t.line());
        box(c, x0, y0 + wh - FOOT, ww, 1, t.line());

        // Top bar: "Slot 3", the page, search, SHOP, close.
        float mid = y0 + HEAD / 2f;
        MenuType.icon(c, MenuType.SMILEY, x0 + 18 + 11, mid, 22, t.act(), false, u);
        String title = "Slot " + slotNumber();
        MenuType.middle(c, PIXEL, title, x0 + 50, mid, 24, t.tx(), u);
        String page = "SEITE " + (slot / Emotes.SLOTS + 1) + " / " + Emotes.PAGES;
        float pw = MenuType.width(SILK, page, 9, .06f, u) + 12, px0 = x0 + 50 + MenuType.width(PIXEL, title, 24, u) + 10;
        box(c, px0, mid - 9, pw, 18, t.hi());
        frame(c, px0, mid - 9, pw, 18, t.line());
        MenuType.middle(c, SILK, page, px0 + 6, mid, 9, t.mu(), .06f, u);
        float sx = searchX();
        box(c, sx, y0 + 8, 220, 36, t.fill());
        frame(c, sx, y0 + 8, 220, 36, !query.isEmpty() ? t.ac() : in(mx, my, sx, y0 + 8, 220, 36) ? t.mu() : t.line());
        MenuType.icon(c, MenuType.SEARCH, sx + 19.5f, mid, 15, t.mu(), false, u);
        String shown = query;
        while (shown.length() > 1 && MenuType.width(INTER, shown, 13, u) > 168) shown = shown.substring(1);
        MenuType.middle(c, INTER, query.isEmpty() ? "Zum Suchen tippen …" : shown, sx + 35, mid, 13, query.isEmpty() ? t.mu() : t.tx(), u);
        if (now / 530 % 2 == 0) box(c, sx + 35 + (query.isEmpty() ? 0 : MenuType.width(INTER, shown, 13, u) + 1), mid - 8, 1, 16, t.tx());
        boolean shop = onShop(mx, my), close = onClose(mx, my);
        float bx = shopX();
        box(c, bx, y0 + 8, shopW(), 36, shop ? Paint.lerp(t.ac(), 0xFFFFFFFF, .08f) : t.ac());
        box(c, bx, y0 + 41, shopW(), 3, t.acd());
        MenuType.icon(c, MenuType.LOCK, bx + 21, mid - 1, 14, t.acx(), false, u);
        MenuType.middle(c, SILK, "SHOP", bx + 35, mid - 1, 11, t.acx(), .06f, u);
        if (close) box(c, closeX(), y0 + 8, 36, 36, t.hi());
        MenuType.icon(c, MenuType.X, closeX() + 18, mid, 16, close ? t.tx() : t.mu(), false, u);

        // Sections per rarity, cards below their names; the list scrolls softly.
        var m = c.getMatrices().peek().getPositionMatrix();
        var a = m.transformPosition(x0, contentTop, 0, new org.joml.Vector3f()); var b = m.transformPosition(x0 + ww, contentBottom, 0, new org.joml.Vector3f());
        c.enableScissor((int) Math.floor(a.x), (int) Math.floor(a.y), (int) Math.ceil(b.x), (int) Math.ceil(b.y));
        for (Header header : headers) {
            float y = header.y() - scrollPos;
            if (y < contentTop - 26 || y > contentBottom) continue;
            String text = header.rarity().label.toUpperCase(Locale.ROOT), count = Integer.toString(header.count());
            float tw = MenuType.width(SILK, text, 11, .08f, u), cw = MenuType.width(SILK, count, 9, .06f, u);
            box(c, x0 + PAD, y + 6, 8, 8, header.rarity().color);
            MenuType.middle(c, SILK, text, x0 + PAD + 16, y + 10, 11, header.rarity().color, .08f, u);
            MenuType.middle(c, SILK, count, x0 + PAD + 24 + tw, y + 10, 9, t.mu(), .06f, u);
            box(c, x0 + PAD + 34 + tw + cw, y + 10, ww - 2 * PAD - 34 - tw - cw, 1, t.line());
        }
        Emote current = Emotes.slot(slot);
        for (int i = 0; i < cards.size(); i++) {
            Card card = cards.get(i);
            int index = Emote.ALL.indexOf(card.emote());
            hover[index] += ((i == hovered ? 1 : 0) - hover[index]) * (1 - (float) Math.exp(-dt * 16));
            float y = card.y() - scrollPos;
            if (y + CARD < contentTop || y - LABEL > contentBottom) continue;
            drawCard(c, card.emote(), card.x(), y, hover[index], card.emote() == current, i == hovered ? (now - hoverAt) / 1000f : -1);
        }
        c.disableScissor();
        if (cards.isEmpty()) {
            float cx = x0 + ww / 2, cy = (contentTop + contentBottom) / 2;
            MenuType.icon(c, MenuType.SEARCH, cx, cy - 22, 28, t.mu(), false, u);
            MenuType.centered(c, INTER, "Keine Emotes für „" + query.strip() + "“ gefunden.", cx, cy + 14, 14, t.mu(), 0, u);
        }
        if (maxScroll > 0) {
            float track = contentBottom - contentTop - 8, thumb = Math.max(30, track * track / (track + maxScroll));
            box(c, x0 + ww - 8, contentTop + 4 + (track - thumb) * scrollPos / maxScroll, 4, thumb, t.line());
        }

        // Footer: empty the slot on the left, the hint on the right.
        float fy = y0 + wh - FOOT / 2f;
        if (current != null) {
            boolean clear = onClear(mx, my);
            float cx = x0 + PAD;
            box(c, cx, fy - 17, clearW(), 34, t.card());
            frame(c, cx, fy - 17, clearW(), 34, clear ? 0xFFE5484D : t.line());
            MenuType.icon(c, MenuType.TRASH, cx + 21, fy, 14, clear ? 0xFFE5484D : t.mu(), false, u);
            MenuType.middle(c, SILK, "SLOT LEEREN", cx + 35, fy, 11, t.tx(), .06f, u);
        }
        String hint = "KLICK: IN SLOT " + slotNumber() + " LEGEN  ·  ESC: ZURÜCK";
        MenuType.middle(c, SILK, hint, x0 + ww - PAD - MenuType.width(SILK, hint, 9, .06f, u), fy, 9, t.mu(), .06f, u);
        c.draw();
        c.getMatrices().pop();
        RenderSystem.setShaderColor(1f, 1f, 1f, 1f);
        SaviraToasts.render(c, width);
    }

    /** Name above, the card in its rarity's tint below with you in the emote's pose; plays on hover. */
    private void drawCard(DrawContext c, Emote emote, float x, float y, float h, boolean chosen, float playing) {
        DesignTheme t = t();
        int color = emote.rarity().color & 0xFFFFFF;
        MenuType.middle(c, PIXEL, MenuType.fit(PIXEL, emote.name(), 15, CARD, u), x, y - LABEL / 2f - 1, 15, h > .5f || chosen ? t.tx() : DesignTheme.mix(t.tx(), t.mu(), .5f), u);
        box(c, x, y, CARD, CARD, t.card());
        // The rarity's colour rises from the bottom; stronger on hover.
        Paint.gradient(c, x, y, CARD, CARD, 0, (Math.round(0x10 + 0x18 * h) << 24) | color, (Math.round(0x55 + 0x40 * h) << 24) | color, px());
        frame(c, x, y, CARD, CARD, chosen ? t.ac() : h > .5f ? t.mu() : (0x99 << 24) | color);
        c.draw();
        Emotes.drawFigure(c, x + CARD / 2f, y + CARD - 8, 42, 20, emote, playing >= 0 ? playing : emote.length() * .4f, 0, 0);
        c.getMatrices().push();
        c.getMatrices().translate(0, 0, 300);
        if (chosen) {
            float bw = MenuType.width(SILK, "AKTIV", 8, .06f, u) + 10;
            box(c, x + 5, y + 5, bw, 14, t.acs());
            box(c, x + 5, y + 5, bw, 14, DesignTheme.alpha(t.bg(), .6f));
            MenuType.middle(c, SILK, "AKTIV", x + 10, y + 12, 8, t.act(), .06f, u);
        }
        // Looping emotes run until you move.
        if (emote.loop()) MenuType.middle(c, SILK, "LOOP", x + CARD - 6 - MenuType.width(SILK, "LOOP", 8, .06f, u), y + 12, 8, DesignTheme.alpha(t.tx(), .7f), .06f, u);
        c.draw();
        c.getMatrices().pop();
    }

    private void choose(Emote emote) {
        Emotes.setSlot(slot, emote);
        SaviraSounds.play(SaviraSounds.Sound.ON);
        SaviraToasts.show("Emotes", emote == null ? "Slot " + slotNumber() + " geleert" : emote.name() + " in Slot " + slotNumber());
        client.setScreen(new EmoteWheelScreen(true));
    }

    @Override
    public boolean mouseClicked(double mouseX, double mouseY, int button) {
        double mx = mouseX / u, my = mouseY / u;
        if (onClose(mx, my)) { SaviraSounds.play(SaviraSounds.Sound.CLICK); close(); return true; }
        if (onShop(mx, my)) { SaviraSounds.play(SaviraSounds.Sound.CLICK); SaviraToasts.show("Emote-Shop", "Neue Emotes kaufst du hier bald."); return true; }
        if (onClear(mx, my)) { choose(null); return true; }
        int card = cardAt(mx, my);
        if (card >= 0) { choose(cards.get(card).emote()); return true; }
        if (!in(mx, my, x0, y0, winW(), winH())) { close(); return true; }
        return true;
    }
    @Override
    public boolean mouseScrolled(double mouseX, double mouseY, double horizontal, double vertical) {
        scroll = Math.clamp(scroll - (float) vertical * 48, 0, maxScroll);
        return true;
    }
    @Override
    public boolean keyPressed(int key, int scan, int modifiers) {
        if (key == GLFW.GLFW_KEY_ESCAPE) { close(); return true; }
        if (key == GLFW.GLFW_KEY_BACKSPACE && !query.isEmpty()) {
            setQuery(hasControlDown() ? "" : query.substring(0, query.length() - 1)); return true;
        }
        return super.keyPressed(key, scan, modifiers);
    }
    @Override
    public boolean charTyped(char chr, int modifiers) {
        if (query.length() >= 24 || Character.isISOControl(chr)) return false;
        setQuery(query + chr);
        return true;
    }
    private void setQuery(String value) { query = value; scroll = scrollPos = 0; layout(); }
    /** Esc and the X go back to the wheel. */
    @Override
    public void close() { client.setScreen(new EmoteWheelScreen(true)); }
    @Override
    public boolean shouldPause() { return false; }

    /** For the UI test. */
    public int cardCount() { return cards.size(); }
    public void chooseForTest(String id) { choose(Emote.byId(id)); }
}

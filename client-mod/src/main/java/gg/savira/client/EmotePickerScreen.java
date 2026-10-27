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

/**
 * Emote list for one wheel slot, in the look of the Right-Shift menu (NoRisk's emote picker):
 * the menu's veil and lines, caps font for titles, Minecraft's font for names, light or dark
 * theme. Emotes are grouped by rarity, each card tinted in its rarity's colour (Classic grey,
 * Random green, Special blue, Episch purple, Legendär gold) and showing you in its pose, playing
 * it on hover. Search, shop and close at the top; a click puts the emote in the slot.
 * Laid out in menu units like the Right-Shift menu: NoRisk's pixels at 1280x720.
 */
public final class EmotePickerScreen extends Screen {
    private static final int W = 470, H = 380, COLS = 5, CARD = 78, GAP_X = 9, LABEL = 12, GAP_Y = 10, HEAD = 40, FOOT = 27;
    private record Card(Emote emote, float x, float y) {}
    private record Header(Emote.Rarity rarity, int count, float y) {}

    private final int slot;
    private float u = 1;
    private int sw, sh, x0, y0, contentTop, contentBottom, hovered = -1;
    private float scroll, scrollPos, maxScroll;
    private long openedAt = Util.getMeasuringTimeMs(), hoverAt, lastFrame;
    private String query = "";
    private final List<Card> cards = new ArrayList<>();
    private final List<Header> headers = new ArrayList<>();
    private final float[] hover = new float[Emote.ALL.size()];

    public EmotePickerScreen(int slot) { super(Text.literal("Emote wählen")); this.slot = slot; }

    private MenuTheme t() { return MenuTheme.current(); }
    private int slotNumber() { return slot % Emotes.SLOTS + 1; }

    @Override
    protected void init() {
        MenuText.calibrate();
        u = Math.min(height / 720f, Math.min((width - 12) / (float) W, (height - 12) / (float) H));
        sw = Math.round(width / u); sh = Math.round(height / u);
        x0 = (sw - W) / 2; y0 = (sh - H) / 2;
        contentTop = y0 + HEAD + 1; contentBottom = y0 + H - FOOT;
        layout();
    }

    private void layout() {
        cards.clear(); headers.clear();
        String needle = query.strip().toLowerCase(Locale.ROOT);
        float left = x0 + (W - COLS * CARD - (COLS - 1) * GAP_X) / 2f, y = contentTop + 8;
        for (Emote.Rarity rarity : Emote.Rarity.values()) {
            List<Emote> list = Emote.ALL.stream().filter(e -> e.rarity() == rarity && (needle.isEmpty() || e.name().toLowerCase(Locale.ROOT).contains(needle) || e.id().contains(needle))).toList();
            if (list.isEmpty()) continue;
            headers.add(new Header(rarity, list.size(), y));
            y += 18;
            for (int i = 0; i < list.size(); i++) cards.add(new Card(list.get(i), left + (i % COLS) * (CARD + GAP_X), y + LABEL + (i / COLS) * (CARD + LABEL + GAP_Y)));
            y += ((list.size() + COLS - 1) / COLS) * (CARD + LABEL + GAP_Y) + 4;
        }
        maxScroll = Math.max(0, y - contentBottom + 4);
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
    // Header: search box, SHOP, close, all 20 high like the menu's header buttons.
    private int searchX() { return x0 + W - 222; }
    private boolean onSearch(double mx, double my) { return mx >= searchX() && mx < searchX() + 124 && my >= y0 + 10 && my < y0 + 30; }
    private boolean onShop(double mx, double my) { return mx >= x0 + W - 92 && mx < x0 + W - 40 && my >= y0 + 10 && my < y0 + 30; }
    private boolean onClose(double mx, double my) { return mx >= x0 + W - 34 && mx < x0 + W - 14 && my >= y0 + 10 && my < y0 + 30; }
    private boolean onClear(double mx, double my) { return Emotes.slot(slot) != null && mx >= x0 + 12 && mx < x0 + 92 && my >= y0 + H - 21 && my < y0 + H - 6; }
    private static float ease(float t) { t = Math.clamp(t, 0f, 1f); return 1 - (1 - t) * (1 - t) * (1 - t); }

    @Override
    public void render(DrawContext c, int mouseX, int mouseY, float delta) {
        super.renderBackground(c, mouseX, mouseY, delta);
        MenuTheme t = t();
        long now = Util.getMeasuringTimeMs();
        float dt = lastFrame == 0 ? 0 : Math.min(.1f, (now - lastFrame) / 1000f);
        lastFrame = now;
        scrollPos += (scroll - scrollPos) * (1 - (float) Math.exp(-dt * 16));
        if (Math.abs(scroll - scrollPos) < .05f) scrollPos = scroll;
        double mx = mouseX / u, my = mouseY / u;
        int over = cardAt(mx, my);
        if (over != hovered) { hovered = over; hoverAt = now; }
        // Fades in and slides up like the menu's window.
        float k = ease((now - openedAt) / 320f);

        RenderSystem.enableBlend();
        RenderSystem.setShaderColor(1f, 1f, 1f, Math.max(.02f, k));
        c.getMatrices().push();
        c.getMatrices().scale(u, u, 1);
        c.getMatrices().translate(0, (1 - k) * 40, 0);
        c.fill(x0, y0, x0 + W, y0 + H, t.panel());
        c.fill(x0, y0 + HEAD, x0 + W, y0 + HEAD + 1, t.line());
        c.fill(x0, y0 + H - FOOT, x0 + W, y0 + H - FOOT + 1, t.line());

        // "SLOT 3" and the page it belongs to.
        String title = "SLOT " + slotNumber();
        MenuText.capsMiddle(c, title, x0 + 14, y0 + 20.5f, 17f, t.text());
        MenuText.capsMiddle(c, "SEITE " + (slot / Emotes.SLOTS + 1) + " / " + Emotes.PAGES, x0 + 22 + MenuText.width(title, 17f), y0 + 21f, MenuText.TINY, t.muted());

        // Search: typing goes straight into it.
        boolean searchHover = onSearch(mx, my);
        MenuWidgets.box(c, searchX(), y0 + 10, 124, 20, searchHover || !query.isEmpty());
        String shown = query.isEmpty() ? "Zum Suchen tippen ..." : query;
        while (shown.length() > 1 && textRenderer.getWidth(shown) > 112) shown = shown.substring(1);
        MenuText.plain(c, shown, searchX() + 6, y0 + 16.5f, 1f, query.isEmpty() ? t.muted() : t.text());
        if (now / 530 % 2 == 0) {
            int cx = searchX() + 6 + (query.isEmpty() ? 0 : textRenderer.getWidth(shown) + 1);
            c.fill(cx, y0 + 15, cx + 1, y0 + 25, t.text());
        }
        // SHOP and close, like the menu's header buttons.
        boolean shop = onShop(mx, my), close = onClose(mx, my);
        c.fill(x0 + W - 92, y0 + 10, x0 + W - 40, y0 + 30, shop ? t.cardHover() : t.box());
        c.drawBorder(x0 + W - 92, y0 + 10, 52, 20, shop ? t.boxHover() : t.boxEdge());
        MenuText.capsCentered(c, "SHOP", x0 + W - 66, y0 + 20.5f, MenuText.TITLE, shop ? 0xFFFFFFFF : t.text());
        c.fill(x0 + W - 34, y0 + 10, x0 + W - 14, y0 + 30, close ? t.cardHover() : t.box());
        c.drawBorder(x0 + W - 34, y0 + 10, 20, 20, close ? t.boxHover() : t.boxEdge());
        int xc = close ? 0xFFFFFFFF : t.text();
        for (int i = 0; i < 7; i++) { c.fill(x0 + W - 27 + i, y0 + 17 + i, x0 + W - 26 + i, y0 + 18 + i, xc); c.fill(x0 + W - 21 - i, y0 + 17 + i, x0 + W - 20 - i, y0 + 18 + i, xc); }

        // Sections per rarity, cards below their names; the list scrolls softly.
        clip(c, x0, contentTop, x0 + W, contentBottom);
        c.getMatrices().push();
        c.getMatrices().translate(0, -scrollPos, 0);
        for (Header header : headers) {
            float y = header.y();
            if (y - scrollPos < contentTop - 20 || y - scrollPos > contentBottom) continue;
            // "──  CLASSIC  ──────", the label in the rarity's colour, like the menu's sections.
            String text = header.rarity().label.toUpperCase(Locale.ROOT);
            int tw = MenuText.width(text, MenuText.LABEL), mid = Math.round(y + 6);
            c.fill(x0 + 14, mid, x0 + 31, mid + 1, t.line());
            MenuText.capsMiddle(c, text, x0 + 38, mid + .5f, MenuText.LABEL, header.rarity().color);
            String count = Integer.toString(header.count());
            MenuText.capsMiddle(c, count, x0 + 44 + tw, mid + .5f, MenuText.TINY, t.muted());
            c.fill(x0 + 52 + tw + MenuText.width(count, MenuText.TINY), mid, x0 + W - 14, mid + 1, t.line());
        }
        Emote current = Emotes.slot(slot);
        for (int i = 0; i < cards.size(); i++) {
            Card card = cards.get(i);
            int index = Emote.ALL.indexOf(card.emote());
            hover[index] += ((i == hovered ? 1 : 0) - hover[index]) * (1 - (float) Math.exp(-dt * 16));
            float y = card.y() - scrollPos;
            if (y + CARD < contentTop || y - LABEL > contentBottom) continue;
            drawCard(c, card.emote(), card.x(), card.y(), hover[index], card.emote() == current, i == hovered ? (now - hoverAt) / 1000f : -1);
        }
        c.getMatrices().pop();
        c.disableScissor();
        if (cards.isEmpty()) {
            int cx = x0 + W / 2, cy = (contentTop + contentBottom) / 2;
            PixelIcons.draw(c, PixelIcons.SEARCH, cx - 10, cy - 30, 2, t.muted());
            MenuText.capsCentered(c, "KEINE PASSENDEN EMOTES", cx, cy + 4, MenuText.TITLE, t.text());
        }
        if (maxScroll > 0) {
            int track = contentBottom - contentTop - 8, thumb = Math.max(20, track * track / (track + (int) maxScroll)), bx = x0 + W - 6;
            float top = contentTop + 4 + (track - thumb) * scrollPos / maxScroll;
            c.fill(bx, contentTop + 4, bx + 3, contentBottom - 4, 0x14FFFFFF);
            c.fill(bx, Math.round(top), bx + 3, Math.round(top) + thumb, t.scroll());
        }

        // Footer: empty the slot on the left, the hint on the right.
        int fy = y0 + H - FOOT / 2;
        if (current != null) {
            boolean clear = onClear(mx, my);
            c.fill(x0 + 12, fy - 7, x0 + 92, fy + 8, clear ? 0xB3B23A3E : 0x66B23A3E);
            if (clear) c.drawBorder(x0 + 12, fy - 7, 80, 15, 0xFFE5484D);
            MenuText.capsCentered(c, "SLOT LEEREN", x0 + 52, fy + .5f, MenuText.TINY, 0xFFFFFFFF);
        }
        String hint = "KLICK: IN SLOT " + slotNumber() + " LEGEN  ·  ESC: ZURÜCK";
        MenuText.capsMiddle(c, hint, x0 + W - 12 - MenuText.width(hint, MenuText.TINY), fy + .5f, MenuText.TINY, t.muted());
        c.getMatrices().pop();
        RenderSystem.setShaderColor(1f, 1f, 1f, 1f);
        SaviraToasts.render(c, width);
    }

    /** Name above, the card in its rarity's tint below with you in the emote's pose; plays on hover. */
    private void drawCard(DrawContext c, Emote emote, float fx, float fy, float h, boolean chosen, float playing) {
        MenuTheme t = t();
        int x = Math.round(fx), y = Math.round(fy), color = emote.rarity().color & 0xFFFFFF;
        String name = emote.name();
        while (name.length() > 2 && textRenderer.getWidth(name) > CARD) name = name.substring(0, name.length() - 2) + "…";
        MenuText.plain(c, name, x + 1, y - LABEL + 1, 1f, h > .5f || chosen ? 0xFFFFFFFF : t.text());
        c.fill(x, y, x + CARD, y + CARD, t.card());
        // The rarity's colour rises from the bottom; stronger on hover.
        c.fillGradient(x, y, x + CARD, y + CARD, (Math.round(0x10 + 0x18 * h) << 24) | color, (Math.round(0x55 + 0x40 * h) << 24) | color);
        c.drawBorder(x, y, CARD, CARD, chosen ? 0xFFFFFFFF : h > .5f ? t.boxHover() : (0x99 << 24) | color);
        Emotes.drawFigure(c, x + CARD / 2f, y + CARD - 6, 34, 20, emote, playing >= 0 ? playing : emote.length() * .4f, 0, 0);
        c.getMatrices().push();
        c.getMatrices().translate(0, 0, 300);
        if (chosen) {
            int tw = MenuText.width("AKTIV", MenuText.TINY) + 8;
            c.fill(x + 3, y + 3, x + 3 + tw, y + 13, 0xF2FFFFFF);
            MenuText.capsCentered(c, "AKTIV", x + 3 + tw / 2f, y + 8.5f, MenuText.TINY, 0xFF15161A);
        }
        // Looping emotes run until you move.
        if (emote.loop()) MenuText.capsMiddle(c, "LOOP", x + CARD - 4 - MenuText.width("LOOP", MenuText.TINY), y + 8.5f, MenuText.TINY, 0xB3FFFFFF);
        c.getMatrices().pop();
    }

    /** Scissor in menu units, following the window's slide-in. */
    private void clip(DrawContext c, int x1, int y1, int x2, int y2) {
        float slide = (1 - ease((Util.getMeasuringTimeMs() - openedAt) / 320f)) * 40;
        c.enableScissor((int) Math.floor(x1 * u), (int) Math.floor((y1 + slide) * u), (int) Math.ceil(x2 * u), (int) Math.ceil((y2 + slide) * u));
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
        if (!(mx >= x0 && mx < x0 + W && my >= y0 && my < y0 + H)) { close(); return true; }
        return true;
    }
    @Override
    public boolean mouseScrolled(double mouseX, double mouseY, double horizontal, double vertical) {
        scroll = Math.clamp(scroll - (float) vertical * 40, 0, maxScroll);
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

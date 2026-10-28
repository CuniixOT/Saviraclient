package gg.savira.client;

import com.mojang.blaze3d.systems.RenderSystem;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.SharedConstants;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.PlayerSkinDrawer;
import net.minecraft.client.gui.RotatingCubeMapRenderer;
import net.minecraft.client.gui.screen.ConfirmLinkScreen;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.screen.multiplayer.ConnectScreen;
import net.minecraft.client.gui.screen.multiplayer.MultiplayerScreen;
import net.minecraft.client.gui.screen.option.AccessibilityOptionsScreen;
import net.minecraft.client.gui.screen.option.LanguageOptionsScreen;
import net.minecraft.client.gui.screen.option.OptionsScreen;
import net.minecraft.client.gui.screen.world.SelectWorldScreen;
import net.minecraft.client.network.MultiplayerServerListPinger;
import net.minecraft.client.network.ServerAddress;
import net.minecraft.client.network.ServerInfo;
import net.minecraft.client.render.DiffuseLighting;
import net.minecraft.client.render.OverlayTexture;
import net.minecraft.client.render.RenderLayer;
import net.minecraft.client.render.entity.model.EntityModelLayers;
import net.minecraft.client.render.entity.model.PlayerEntityModel;
import net.minecraft.client.util.SkinTextures;
import net.minecraft.entity.LivingEntity;
import net.minecraft.text.Text;
import net.minecraft.util.Identifier;
import net.minecraft.util.Util;
import net.minecraft.util.math.RotationAxis;
import org.joml.Vector3f;
import java.io.File;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

import static gg.savira.client.MenuType.Face.INTER;
import static gg.savira.client.MenuType.Face.PIXEL;
import static gg.savira.client.MenuType.Face.SILK;

/**
 * Savira's main menu in place of the vanilla title screen, built after the design "Hauptmenü":
 * account and socials top left; coins, light/dark, background and quit top right; the logo with
 * Einzelspieler, Mehrspieler, Mod-Menü, Store and the Discord banner (your own player standing in
 * it) in the middle; quick join with live player counts bottom left, the tool bar bottom centre,
 * the news bottom right, version and Mojang's notice along the bottom edge.
 *
 * Laid out in the design's CSS pixels for a 900 high screen; u is gui units per design pixel.
 * Colours, accent, light/dark, animations and blur follow the Right-Shift menu's settings.
 * Controls are drawn directly and register their click areas each frame.
 */
public final class SaviraTitleScreen extends Screen {
    private static final Pattern DISCORD = Pattern.compile("^https://(discord\\.gg|(www\\.)?discord\\.com/invite)/[A-Za-z0-9-]{2,32}$");
    private static final String GITHUB = "https://github.com/CuniixOT/Saviraclient";
    private static final long NEWS_INTERVAL = 6500, NEWS_FADE = 550;
    private static final float COLUMN = 414, NEWS_W = 352, NEWS_H = 180, JOIN_W = 320;

    /** Same entries and pictures as the launcher's start page (src/news.ts); textures, 640x360, from `npm run menu-art`. */
    private static final int ART_W = 640, ART_H = 360;
    private record News(String kicker, String date, String title, String art) {
        Identifier texture() { return Identifier.of("savira", "textures/gui/news/" + art + ".png"); }
    }
    private static final List<News> NEWS = List.of(
        new News("GARDEROBE", "12. OKT", "Skins und Capes im Launcher.", "wardrobe"),
        new News("SAVIRA", "12. OKT", "Neues Logo, neues Gesicht.", "brand"),
        new News("LAUNCHER", "11. OKT", "Mehrere Konten und Discord.", "accounts"),
        new News("MOD-MENÜ", "07. OKT", "Jedes HUD-Element nach deinem Stil.", "modmenu"));

    /** Quick join: real servers, pinged for their player count and latency. */
    private record Server(String name, String address, int tile) {}
    private static final List<Server> SERVERS = List.of(
        new Server("Hypixel", "mc.hypixel.net", DesignTheme.oklch(.62f, .16f, 60, 1)),
        new Server("GommeHD", "gommehd.net", DesignTheme.oklch(.55f, .14f, 25, 1)),
        new Server("Cytooxien", "cytooxien.de", DesignTheme.oklch(.55f, .15f, 250, 1)));
    private static final ExecutorService PINGS = Executors.newFixedThreadPool(2, r -> { Thread t = new Thread(r, "Savira server ping"); t.setDaemon(true); return t; });
    private final MultiplayerServerListPinger pinger = new MultiplayerServerListPinger();
    private final List<ServerInfo> serverInfos = new ArrayList<>();
    private long lastPing;

    /** Menu backgrounds: this version's own panorama, or one of earlier updates (see SaviraPanoramas). */
    private record Backdrop(String id, String label) {}
    private static final Backdrop CURRENT = new Backdrop("current", "Tricky Trials");
    private static final Identifier PANORAMA_THUMB = Identifier.ofVanilla("textures/gui/title/background/panorama_0.png");
    private List<Backdrop> backdrops = List.of(CURRENT);

    private enum Popover { NONE, ACCOUNT, LINKS, PICKER }
    private record Link(String label, String sub, char glyph, int tile, String url) {}
    private record Tool(String title, String sub, char glyph, boolean fill, Runnable action) {}
    private record Hit(float x, float y, float w, float h, String label, Runnable action) {
        boolean contains(double mx, double my) { return mx >= x && mx < x + w && my >= y && my < y + h; }
    }
    /** The title screen's own glass: a little denser than the Right-Shift menu's, as in the design. */
    private record Look(int glass, int line, int hi, int mu, int veil) {}

    private final String modVersion = FabricLoader.getInstance().getModContainer("savira").map(m -> m.getMetadata().getVersion().getFriendlyString()).orElse("");
    private final long openedAt = Util.getMeasuringTimeMs();
    private float u = 1, sw, sh, dt;
    private long lastFrame;
    private double mouseX, mouseY;
    private int newsIndex, previousNews = -1;
    private long newsSince = Util.getMeasuringTimeMs(), newsPausedAt = -1;
    private boolean showNews, newsHover, bannerPreview;
    private Popover popover = Popover.NONE;
    private List<Link> links = List.of();
    private List<Tool> tools = List.of();
    private final List<Hit> hits = new ArrayList<>();
    private List<Hit> lastHits = List.of();
    private final Map<String, Float> anims = new HashMap<>();
    private float alpha = 1;

    public SaviraTitleScreen() { super(Text.literal("Savira")); }

    private Backdrop backdrop() {
        String id = SaviraClient.config.menuBackground;
        return backdrops.stream().filter(b -> b.id().equals(id)).findFirst().orElse(CURRENT);
    }
    private String launcherVersion() {
        String v = SaviraClient.config.launcherVersion;
        return v == null || v.isBlank() ? modVersion : v;
    }
    private DesignTheme t() { return DesignTheme.current(); }
    private Look look() {
        return SaviraClient.config.menuDark
            ? new Look(DesignTheme.oklch(.16f, .012f, 268, .72f), DesignTheme.oklch(.32f, .015f, 268, .9f), DesignTheme.oklch(.24f, .016f, 268, .88f), DesignTheme.oklch(.72f, .012f, 268, 1), 0x38000000)
            : new Look(DesignTheme.oklch(.975f, .004f, 268, .78f), DesignTheme.oklch(.86f, .01f, 268, 1), DesignTheme.oklch(.99f, .004f, 268, .92f), DesignTheme.oklch(.47f, .015f, 268, 1), 0x1FF0F2F8);
    }
    private boolean anim() { return SaviraClient.config.menuAnimations; }
    private float px() { return Paint.pixels(u); }
    private static float ease(float t) { t = Math.clamp(t, 0f, 1f); return 1 - (1 - t) * (1 - t) * (1 - t); }

    @Override
    protected void init() {
        u = Math.max(.2f, Math.min(height / 1080f, width / 1720f));
        sw = width / u; sh = height / u;
        // News and quick join only where they do not run into the buttons (the design's rule).
        showNews = sw - 18 - NEWS_W > sw / 2 + COLUMN / 2 + 24 && sh - 46 - 206 > sh / 2 + 290 - 110;

        String discord = discordUrl();
        boolean ready = DISCORD.matcher(discord).matches();
        links = List.of(
            new Link("Discord", ready ? "Community beitreten" : "Bald verfügbar", MenuType.CHAT_DOTS, DesignTheme.oklch(.58f, .19f, 275, 1), ready ? discord : null),
            new Link("GitHub", "Savira Client", MenuType.GITHUB, DesignTheme.oklch(.3f, .015f, 268, 1), GITHUB));
        tools = List.of(
            new Tool("Savira-Einstellungen", "Savira", MenuType.LIGHTNING, true, () -> client.setScreen(new HudScreen())),
            new Tool("Cosmetics", "Savira", MenuType.SHIRT, false, () -> toast("Cosmetics", "Capes, Hüte und Effekte kommen bald.")),
            new Tool("Freunde", "Savira", MenuType.CHAT_TEXT, false, () -> toast("Freunde", "Freunde und Chat kommen bald.")),
            new Tool("Minecraft-Einstellungen", "Minecraft", MenuType.GEAR, false, () -> client.setScreen(new OptionsScreen(this, client.options))),
            new Tool("Sprache", "Minecraft", MenuType.TRANSLATE, false, () -> client.setScreen(new LanguageOptionsScreen(this, client.options, client.getLanguageManager()))),
            new Tool("Barrierefreiheit", "Minecraft", MenuType.EYE, false, () -> client.setScreen(new AccessibilityOptionsScreen(this, client.options))),
            new Tool("Screenshots", "Ordner öffnen", MenuType.IMAGE, false, this::openScreenshots));

        List<Backdrop> list = new ArrayList<>(List.of(CURRENT));
        SaviraPanoramas.list().forEach(entry -> list.add(new Backdrop(entry.id(), entry.label())));
        backdrops = list;
        if (serverInfos.isEmpty()) for (Server s : SERVERS) serverInfos.add(new ServerInfo(s.name(), s.address(), ServerInfo.ServerType.OTHER));
    }
    private String discordUrl() { return SaviraClient.config.discordUrl == null ? "" : SaviraClient.config.discordUrl.trim(); }

    private void toast(String title, String text) { SaviraToasts.show(title, text); }
    private void openScreenshots() {
        File dir = new File(client.runDirectory, "screenshots");
        if (!dir.exists() && !dir.mkdirs()) return;
        Util.getOperatingSystem().open(dir);
        toast("Screenshots", "Ordner wird geöffnet.");
    }
    private void showNews(int index) { previousNews = newsIndex; newsIndex = Math.floorMod(index, NEWS.size()); newsSince = Util.getMeasuringTimeMs(); }
    private void pop(Popover next) { SaviraSounds.play(SaviraSounds.Sound.CLICK); popover = popover == next ? Popover.NONE : next; }

    // ---------- Quick join: ping the servers in the background ----------
    private void pingServers() {
        // A ping that hangs for half a minute is started again.
        long since = lastPing == 0 ? Long.MAX_VALUE : Util.getMeasuringTimeMs() - lastPing;
        lastPing = Util.getMeasuringTimeMs();
        for (ServerInfo info : serverInfos) {
            if (info.getStatus() == ServerInfo.Status.PINGING && since < 30000) continue;
            info.setStatus(ServerInfo.Status.PINGING);
            PINGS.submit(() -> {
                // Minecraft leaves the result to the caller, as its own server list does.
                try { pinger.add(info, () -> { }, () -> info.setStatus(info.protocolVersion == SharedConstants.getProtocolVersion() ? ServerInfo.Status.SUCCESSFUL : ServerInfo.Status.INCOMPATIBLE)); }
                catch (Exception e) { info.setStatus(ServerInfo.Status.UNREACHABLE); org.slf4j.LoggerFactory.getLogger("Savira").warn("Server-Abfrage fehlgeschlagen: {}", info.address, e); }
            });
        }
    }
    private void join(int index) {
        SaviraSounds.play(SaviraSounds.Sound.CLICK);
        Server s = SERVERS.get(index);
        toast(s.name(), "Verbinde mit " + s.address() + " …");
        ConnectScreen.connect(this, client, ServerAddress.parse(s.address()), serverInfos.get(index), false, null);
    }

    @Override
    public void tick() {
        pinger.tick();
        if (lastPing == 0 || Util.getMeasuringTimeMs() - lastPing > 15000) pingServers();
        // News turn by themselves, but not while the mouse rests on the card.
        if (newsHover) { if (newsPausedAt < 0) newsPausedAt = Util.getMeasuringTimeMs(); }
        else {
            if (newsPausedAt >= 0) { newsSince += Util.getMeasuringTimeMs() - newsPausedAt; newsPausedAt = -1; }
            if (Util.getMeasuringTimeMs() - newsSince > NEWS_INTERVAL) showNews(newsIndex + 1);
        }
    }
    @Override
    public void removed() { pinger.cancel(); }

    // ---------- Drawing helpers ----------
    private float approach(String key, float target) {
        float v = anims.getOrDefault(key, target);
        v = anim() ? v + (target - v) * (1 - (float) Math.exp(-dt * 16)) : target;
        if (Math.abs(target - v) < .002f) v = target;
        anims.put(key, v);
        return v;
    }
    private void box(DrawContext c, float x, float y, float w, float h, int color) { if (w > 0 && h > 0) Paint.round(c, x, y, w, h, 0, color, px()); }
    private void frame(DrawContext c, float x, float y, float w, float h, int color) { HudScreen.frame(c, x, y, w, h, color, px()); }
    private boolean over(float x, float y, float w, float h) { return mouseX >= x && mouseX < x + w && mouseY >= y && mouseY < y + h; }
    private void hit(float x, float y, float w, float h, String label, Runnable action) { hits.add(new Hit(x, y, w, h, label, action)); }
    private void icon(DrawContext c, char glyph, float cx, float cy, float size, int color, boolean fill) { MenuType.icon(c, glyph, cx, cy, size, color, fill, u); }
    private void pixel(DrawContext c, String s, float x, float middle, float size, int color) { MenuType.middle(c, PIXEL, s, x, middle, size, color, u); }
    private void caps(DrawContext c, String s, float x, float middle, float size, int color, float spacing) { MenuType.middle(c, SILK, s, x, middle, size, color, spacing, u); }
    private void inter(DrawContext c, String s, float x, float middle, float size, int color) { MenuType.middle(c, INTER, s, x, middle, size, color, u); }
    private float width(MenuType.Face face, String s, float size, float spacing) { return MenuType.width(face, s, size, spacing, u); }
    /** The design's svIn: fades in and rises 8 px, group by group 60 ms apart. */
    private float group(DrawContext c, int index) {
        if (!anim()) return 1;
        float k = ease((Util.getMeasuringTimeMs() - openedAt - index * 60) / 520f);
        if (k >= 1) return 1;
        c.draw();
        RenderSystem.setShaderColor(1f, 1f, 1f, Math.max(.01f, k));
        c.getMatrices().push();
        c.getMatrices().translate(0, (1 - k) * 8, 0);
        return k;
    }
    private void endGroup(DrawContext c, float k) {
        if (k >= 1) return;
        c.draw();
        c.getMatrices().pop();
        RenderSystem.setShaderColor(1f, 1f, 1f, 1f);
    }
    /** Lift on hover, eased: returns the hover amount (0..1). */
    private float hover(DrawContext c, String key, float x, float y, float w, float h) {
        float k = approach("h:" + key, popover == Popover.NONE && over(x, y, w, h) ? 1 : 0);
        c.getMatrices().push();
        c.getMatrices().translate(0, -2 * k, 0);
        return k;
    }
    private void unhover(DrawContext c) { c.getMatrices().pop(); }

    // ---------- Rendering ----------
    @Override
    public void renderBackground(DrawContext c, int mouseX, int mouseY, float delta) {
        // The chosen panorama turns like Minecraft's own one, blurred; a light veil for readability.
        Backdrop current = backdrop();
        RotatingCubeMapRenderer custom = current == CURRENT ? null : SaviraPanoramas.renderer(current.id());
        if (custom != null) custom.render(c, width, height, 1f, delta);
        else renderPanoramaBackground(c, delta);
        if (SaviraClient.config.menuBlur) applyBlur(delta);
        c.fill(0, 0, width, height, look().veil());
        c.fillGradient(0, Math.round(height * .78f), width, height, 0, 0x73000000);
    }

    @Override
    public void render(DrawContext c, int mx, int my, float delta) {
        long now = Util.getMeasuringTimeMs();
        dt = lastFrame == 0 ? 0 : Math.min(.1f, (now - lastFrame) / 1000f);
        lastFrame = now;
        renderBackground(c, mx, my, delta);
        mouseX = mx / u; mouseY = my / u;
        lastHits = new ArrayList<>(hits);
        hits.clear();
        RenderSystem.enableBlend();
        c.getMatrices().push();
        c.getMatrices().scale(u, u, 1);

        renderTopLeft(c);
        renderTopRight(c);
        renderCentre(c);
        if (showNews) { renderQuickJoin(c); renderNews(c); }
        else newsHover = false;
        renderTools(c);
        Look l = look();
        inter(c, "Savira Client " + SharedConstants.getGameVersion().getName() + " (v" + launcherVersion() + ")", 18, sh - 16 - 8, 13, 0xB3FFFFFF);
        if (sw >= 900) {
            String notice = "Not affiliated with Mojang or Microsoft. Do not distribute!";
            inter(c, notice, sw - 18 - width(INTER, notice, 13, 0), sh - 16 - 8, 13, 0x99FFFFFF);
        }
        // Popovers above everything, their clicks first.
        if (popover != Popover.NONE) renderPopover(c, l);
        c.draw();
        c.getMatrices().pop();
        SaviraToasts.render(c, width, 76, true);
    }

    // ---------- Top left: account and socials ----------
    private float accountW() { return 7 + 28 + 10 + 18 + 10 + width(PIXEL, client.getSession().getUsername(), 19, 0) + 10 + 12 + 14; }
    private void renderTopLeft(DrawContext c) {
        DesignTheme t = t(); Look l = look();
        float k = group(c, 0);
        float x = 20, y = 20, w = accountW();
        boolean open = popover == Popover.ACCOUNT, hov = over(x, y, w, 42);
        box(c, x, y, w, 42, open ? l.hi() : l.glass());
        frame(c, x, y, w, 42, hov ? l.mu() : l.line());
        c.draw();
        PlayerSkinDrawer.draw(c, client.getSkinProvider().getSkinTextures(client.getGameProfile()), Math.round(x + 7), Math.round(y + 7), 28);
        icon(c, MenuType.LIGHTNING, x + 7 + 28 + 10 + 9, y + 21, 18, t.act(), true);
        String name = client.getSession().getUsername();
        pixel(c, name, x + 7 + 28 + 10 + 18 + 10, y + 21, 19, t.tx());
        icon(c, MenuType.CARET_DOWN, x + w - 14 - 6, y + 21, 12, l.mu(), true);
        hit(x, y, w, 42, "Konto: " + name, () -> pop(Popover.ACCOUNT));
        float lx = x + w + 10;
        boolean linksOpen = popover == Popover.LINKS;
        box(c, lx, y, 42, 42, linksOpen ? l.hi() : l.glass());
        frame(c, lx, y, 42, 42, over(lx, y, 42, 42) ? l.mu() : l.line());
        icon(c, MenuType.LINK, lx + 21, y + 21, 19, t.tx(), false);
        hit(lx, y, 42, 42, "Socials", () -> pop(Popover.LINKS));
        endGroup(c, k);
    }

    // ---------- Top right: coins, light/dark, background, quit ----------
    private float quitX() { return sw - 20 - 42; }
    private float pickerX() { return quitX() - 10 - 42; }
    private void renderTopRight(DrawContext c) {
        DesignTheme t = t(); Look l = look();
        float k = group(c, 0);
        float y = 20, qx = quitX();
        boolean quitHover = over(qx, y, 42, 42);
        box(c, qx, y, 42, 42, l.glass());
        frame(c, qx, y, 42, 42, quitHover ? DesignTheme.oklch(.6f, .16f, 25, 1) : l.line());
        icon(c, MenuType.X, qx + 21, y + 21, 18, quitHover ? DesignTheme.oklch(.7f, .18f, 25, 1) : t.tx(), false);
        hit(qx, y, 42, 42, "Spiel beenden", () -> client.scheduleStop());

        float bx = pickerX();
        box(c, bx, y, 42, 42, popover == Popover.PICKER ? l.hi() : l.glass());
        frame(c, bx, y, 42, 42, over(bx, y, 42, 42) ? l.mu() : l.line());
        icon(c, MenuType.BRUSH, bx + 21, y + 21, 19, t.tx(), false);
        hit(bx, y, 42, 42, "Hintergrund wählen", () -> pop(Popover.PICKER));

        float mx = bx - 10 - 42;
        boolean dark = SaviraClient.config.menuDark;
        box(c, mx, y, 42, 42, l.glass());
        frame(c, mx, y, 42, 42, over(mx, y, 42, 42) ? l.mu() : l.line());
        icon(c, dark ? MenuType.SUN : MenuType.MOON, mx + 21, y + 21, 19, t.tx(), false);
        hit(mx, y, 42, 42, dark ? "Heller Modus" : "Dunkler Modus", () -> {
            SaviraSounds.play(SaviraSounds.Sound.CLICK);
            SaviraClient.config.menuDark = !dark; SaviraClient.config.save();
        });

        int gold = DesignTheme.oklch(.82f, .14f, 82, 1);
        float cw = 14 + 19 + 8 + width(PIXEL, "0", 19, 0) + 14, cx = mx - 10 - cw;
        boolean coinHover = over(cx, y, cw, 42);
        box(c, cx, y, cw, 42, coinHover ? DesignTheme.oklch(.36f, .07f, 80, .9f) : DesignTheme.oklch(.3f, .06f, 80, .75f));
        frame(c, cx, y, cw, 42, DesignTheme.oklch(.5f, .09f, 80, .6f));
        icon(c, MenuType.COIN, cx + 14 + 9.5f, y + 21, 19, gold, false);
        pixel(c, "0", cx + 14 + 19 + 8, y + 21, 19, gold);
        box(c, cx + cw - 6, y - 4, 10, 10, gold);
        hit(cx, y, cw, 42, "Savira Coins", () -> { SaviraSounds.play(SaviraSounds.Sound.CLICK); toast("Savira Coins", "Mit Coins kaufst du bald Cosmetics im Store."); });
        endGroup(c, k);
    }

    // ---------- Centre: logo, buttons, Discord banner ----------
    private float columnTop() { return (sh - 20 - 442) / 2f; }
    private void renderCentre(DrawContext c) {
        DesignTheme t = t(); Look l = look();
        float x = sw / 2 - COLUMN / 2, y = columnTop();
        // Logo, 120 px.
        float k = group(c, 0);
        c.draw();
        c.getMatrices().push();
        c.getMatrices().translate(sw / 2 - 60, y, 0);
        c.getMatrices().scale(7.5f, 7.5f, 1);
        MenuStyle.logo(c, 0, 0, 1, 0xFFFFFFFF);
        c.getMatrices().pop();
        endGroup(c, k);
        y += 120 + 26 + 10;
        // Einzelspieler and Mehrspieler.
        String[] labels = {"Einzelspieler", "Mehrspieler"};
        char[] glyphs = {MenuType.USER, MenuType.USERS};
        Runnable[] actions = {() -> client.setScreen(new SelectWorldScreen(this)), () -> client.setScreen(new MultiplayerScreen(this))};
        for (int i = 0; i < 2; i++) {
            float kg = group(c, i + 1), h = hover(c, labels[i], x, y, COLUMN, 46);
            box(c, x, y, COLUMN, 46, Paint.lerp(l.glass(), l.hi(), h));
            frame(c, x, y, COLUMN, 46, Paint.lerp(l.line(), l.mu(), h));
            float tw = 19 + 12 + width(PIXEL, labels[i], 21, 0), sx = x + (COLUMN - tw) / 2;
            icon(c, glyphs[i], sx + 9.5f, y + 23, 19, t.tx(), true);
            pixel(c, labels[i], sx + 31, y + 23, 21, t.tx());
            unhover(c);
            Runnable run = actions[i];
            hit(x, y, COLUMN, 46, labels[i], () -> { SaviraSounds.play(SaviraSounds.Sound.CLICK); run.run(); });
            endGroup(c, kg);
            y += 46 + 10;
        }
        // Mod-Menü (accent) and Store (green), side by side.
        float kr = group(c, 3), half = (COLUMN - 10) / 2;
        float hm = hover(c, "Mod-Menü", x, y, half, 48);
        box(c, x, y, half, 48, hm > 0 ? Paint.lerp(t.ac(), 0xFFFFFFFF, .08f * hm) : t.ac());
        box(c, x, y + 44, half, 4, t.acd());
        float mw = 19 + 10 + width(PIXEL, "Mod-Menü", 21, 0), mx0 = x + (half - mw) / 2;
        icon(c, MenuType.LIGHTNING, mx0 + 9.5f, y + 22, 19, t.acx(), true);
        pixel(c, "Mod-Menü", mx0 + 29, y + 22, 21, t.acx());
        unhover(c);
        hit(x, y, half, 48, "Mod-Menü", () -> { SaviraSounds.play(SaviraSounds.Sound.CLICK); client.setScreen(new HudScreen()); });
        float sx = x + half + 10, hs = hover(c, "Store", sx, y, half, 48);
        int green = DesignTheme.oklch(.84f, .17f, 148, 1);
        box(c, sx, y, half, 48, hs > 0 ? Paint.lerp(DesignTheme.oklch(.3f, .08f, 148, .78f), DesignTheme.oklch(.36f, .09f, 148, .9f), hs) : DesignTheme.oklch(.3f, .08f, 148, .78f));
        frame(c, sx, y, half, 48, DesignTheme.oklch(.55f, .14f, 148, .55f));
        float stw = 19 + 10 + width(PIXEL, "Store", 21, 0), stx = sx + (half - stw) / 2;
        icon(c, MenuType.CART, stx + 9.5f, y + 24, 19, green, false);
        pixel(c, "Store", stx + 29, y + 24, 21, green);
        unhover(c);
        hit(sx, y, half, 48, "Store", () -> { SaviraSounds.play(SaviraSounds.Sound.CLICK); toast("Savira-Store", "Der Store mit Cosmetics kommt bald."); });
        endGroup(c, kr);
        y += 48 + 10 + 14;
        renderBanner(c, x, y);
    }

    /** The Discord banner with your own player at the right, floating; waving while hovered. */
    private void renderBanner(DrawContext c, float x, float y) {
        float k = group(c, 4);
        String url = discordUrl();
        boolean ready = DISCORD.matcher(url).matches();
        float h = Math.max(hover(c, "Discord", x, y, COLUMN, 102), bannerPreview ? 1 : 0);
        int top = DesignTheme.oklch(.6f, .19f, 275, 1), bottom = DesignTheme.oklch(.5f, .2f, 272, 1);
        // 120° gradient: drawn as a horizontal blend, brighter on hover.
        int steps = 24;
        for (int i = 0; i < steps; i++) {
            float a = i / (float) (steps - 1);
            int col = Paint.lerp(top, bottom, a);
            if (h > 0) col = Paint.lerp(col, 0xFFFFFFFF, .1f * h);
            box(c, x + COLUMN * i / steps, y, COLUMN / steps + .5f, 102, col);
        }
        box(c, x, y + 98, COLUMN, 4, DesignTheme.oklch(.42f, .18f, 272, 1));
        frame(c, x, y, COLUMN, 102, 0x2EFFFFFF);
        int white = DesignTheme.oklch(.98f, .005f, 275, 1);
        caps(c, "COMMUNITY", x + 24, y + 30, 10, DesignTheme.alpha(white, .85f), .08f);
        pixel(c, "Discord beitreten", x + 24, y + 52, 28, white);
        inter(c, ready ? "Neuigkeiten, Hilfe und Events" : "Der Link folgt bald", x + 24, y + 75, 13, DesignTheme.alpha(white, .85f));
        // Your player: 84 x 130, its feet on the banner's bottom edge, the head above it.
        float t = (Util.getMeasuringTimeMs() - openedAt) / 1000f, bob = anim() ? -4 * (.5f - .5f * (float) Math.cos(t * 2 * Math.PI / 3.4f)) : 0;
        var m = c.getMatrices().peek().getPositionMatrix();
        Vector3f a = m.transformPosition(x, y - 40, 0, new Vector3f()), b = m.transformPosition(x + COLUMN, y + 98, 0, new Vector3f());
        c.enableScissor((int) Math.floor(a.x), (int) Math.floor(a.y), (int) Math.ceil(b.x), (int) Math.ceil(b.y));
        bannerPlayer(c, x + COLUMN - 22 - 42, y + 102 - 98 + bob, h);
        c.disableScissor();
        unhover(c);
        hit(x, y, COLUMN, 102, "Discord beitreten", () -> {
            SaviraSounds.play(SaviraSounds.Sound.CLICK);
            if (ready) ConfirmLinkScreen.open(this, url, true); else toast("Discord", "Der Einladungslink folgt bald.");
        });
        endGroup(c, k);
    }
    private PlayerEntityModel<LivingEntity> wideModel, slimModel;
    /** Your skin as a 3D figure: breathing, head following the mouse; waving while hovered. */
    private void bannerPlayer(DrawContext c, float x, float neck, float wave) {
        SkinTextures skin = client.getSkinProvider().getSkinTextures(client.getGameProfile());
        if (wideModel == null) {
            wideModel = new PlayerEntityModel<>(client.getEntityModelLoader().getModelPart(EntityModelLayers.PLAYER), false);
            slimModel = new PlayerEntityModel<>(client.getEntityModelLoader().getModelPart(EntityModelLayers.PLAYER_SLIM), true);
        }
        PlayerEntityModel<LivingEntity> model = skin.model() == SkinTextures.Model.SLIM ? slimModel : wideModel;
        float t = Util.getMeasuringTimeMs() / 1000f, size = 62;
        model.child = false;
        model.head.resetTransform(); model.body.resetTransform();
        model.rightArm.resetTransform(); model.leftArm.resetTransform();
        model.rightLeg.resetTransform(); model.leftLeg.resetTransform();
        model.head.yaw = -Math.clamp((float) (mouseX - x) / 300f, -.5f, .5f) * (1 - wave * .5f);
        model.head.pitch = Math.clamp((float) (mouseY - neck) / 300f, -.3f, .3f) * (1 - wave) - .12f * wave;
        model.head.roll = -.08f * wave;
        float breath = (float) Math.sin(t * 1.7f);
        model.rightArm.roll = .07f + breath * .03f;
        model.leftArm.roll = -.07f - breath * .03f;
        // Waving with the arm turned towards the viewer: raised, swinging from the shoulder.
        model.rightArm.roll += (2.5f - .07f + (float) Math.sin(t * 9) * .32f) * wave;
        model.rightArm.yaw = .2f * wave;
        model.leftArm.pitch = .1f * wave;
        model.hat.copyTransform(model.head);
        model.jacket.copyTransform(model.body);
        model.leftSleeve.copyTransform(model.leftArm); model.rightSleeve.copyTransform(model.rightArm);
        model.leftPants.copyTransform(model.leftLeg); model.rightPants.copyTransform(model.rightLeg);

        c.draw();
        c.getMatrices().push();
        c.getMatrices().translate(x, neck + breath * .5f, 120);
        c.getMatrices().scale(size, size, -size);
        c.getMatrices().multiply(RotationAxis.POSITIVE_Y.rotationDegrees(-22 + 10 * wave));
        DiffuseLighting.method_34742();
        model.render(c.getMatrices(), c.getVertexConsumers().getBuffer(RenderLayer.getEntityTranslucent(skin.texture())), 0xF000F0, OverlayTexture.DEFAULT_UV, -1);
        c.draw();
        DiffuseLighting.enableGuiDepthLighting();
        c.getMatrices().pop();
    }

    // ---------- Bottom left: quick join ----------
    private void renderQuickJoin(DrawContext c) {
        DesignTheme t = t(); Look l = look();
        float k = group(c, 6);
        // Folds up to its header; the list slides open and closed.
        boolean open = SaviraClient.config.quickJoinOpen;
        float fold = approach("join", open ? 1 : 0);
        float rows = SERVERS.size(), list = 6 + rows * 54 + (rows - 1) * 6, h = 12 + 22 + list * fold + 12, x = 18, y = sh - 46 - h;
        box(c, x, y, JOIN_W, h, l.glass());
        frame(c, x, y, JOIN_W, h, l.line());
        boolean headHover = popover == Popover.NONE && over(x, y, JOIN_W, 12 + 22 + 6);
        caps(c, "SCHNELL BEITRETEN", x + 16, y + 12 + 9, 10, headHover ? t.tx() : l.mu(), .08f);
        float liveW = width(SILK, "LIVE", 9, .06f), arrowX = x + JOIN_W - 16 - 6;
        box(c, arrowX - 14 - liveW - 13, y + 12 + 5.5f, 7, 7, DesignTheme.ONLINE);
        caps(c, "LIVE", arrowX - 14 - liveW, y + 12 + 9, 9, l.mu(), .06f);
        icon(c, open ? MenuType.CARET_DOWN : MenuType.CARET_UP, arrowX, y + 12 + 9, 12, headHover ? t.tx() : l.mu(), true);
        hit(x, y, JOIN_W, 12 + 22 + 6, open ? "Schnell beitreten zuklappen" : "Schnell beitreten aufklappen", () -> {
            SaviraSounds.play(SaviraSounds.Sound.CLICK);
            SaviraClient.config.quickJoinOpen = !SaviraClient.config.quickJoinOpen; SaviraClient.config.save();
        });
        if (fold <= .01f) { endGroup(c, k); return; }
        var m = c.getMatrices().peek().getPositionMatrix();
        Vector3f from = m.transformPosition(x, y + 12 + 22, 0, new Vector3f()), to = m.transformPosition(x + JOIN_W, y + h - 6, 0, new Vector3f());
        c.enableScissor((int) Math.floor(from.x), (int) Math.floor(from.y), (int) Math.ceil(to.x), (int) Math.ceil(to.y));
        float ry = y + 12 + 22 + 6;
        for (int i = 0; i < SERVERS.size(); i++) {
            Server s = SERVERS.get(i);
            ServerInfo info = serverInfos.get(i);
            float rx = x + 12, rw = JOIN_W - 24;
            boolean hov = popover == Popover.NONE && over(rx, ry, rw, 54);
            if (hov) { box(c, rx, ry, rw, 54, l.hi()); frame(c, rx, ry, rw, 54, l.line()); }
            box(c, rx + 8, ry + 8, 38, 38, s.tile());
            box(c, rx + 8, ry + 43, 38, 3, 0x40000000);
            MenuType.centered(c, SILK, s.name().substring(0, 1), rx + 27, ry + 26, 14, DesignTheme.oklch(.98f, .005f, 268, 1), 0, u);
            pixel(c, s.name(), rx + 58, ry + 19, 17, t.tx());
            String status;
            int quality;
            ServerInfo.Status st = info.getStatus();
            if (st == ServerInfo.Status.SUCCESSFUL && info.players != null) {
                status = String.format(Locale.GERMANY, "%,d Spieler · %d ms", info.players.online(), info.ping);
                quality = info.ping < 60 ? 4 : info.ping < 120 ? 3 : info.ping < 250 ? 2 : 1;
            } else if (st == ServerInfo.Status.UNREACHABLE || st == ServerInfo.Status.INCOMPATIBLE) { status = "Nicht erreichbar"; quality = 0; }
            else { status = "Wird abgefragt …"; quality = 0; }
            inter(c, status, rx + 58, ry + 37, 12, l.mu());
            // Signal bars, then the play arrow.
            float bx = rx + rw - 8 - 13 - 10 - 18;
            for (int b = 0; b < 4; b++) {
                float bh = 4 + b * 3;
                box(c, bx + b * 5, ry + 27 + 7 - bh, 3, bh, b < quality ? DesignTheme.ONLINE : t.track());
            }
            icon(c, MenuType.PLAY, rx + rw - 8 - 6.5f, ry + 27, 13, t.act(), false);
            int index = i;
            if (open) hit(rx, ry, rw, 54, "Beitreten: " + s.name(), () -> join(index));
            ry += 54 + 6;
        }
        c.disableScissor();
        endGroup(c, k);
    }

    // ---------- Bottom centre: tool bar with labels ----------
    private void renderTools(DrawContext c) {
        DesignTheme t = t(); Look l = look();
        float k = group(c, 5);
        float total = tools.size() * 44 + (tools.size() - 1) * 6, x = sw / 2 - total / 2, y = sh - 44 - 44;
        Tool tipTool = null; float tipX = 0, tipK = 0;
        for (int i = 0; i < tools.size(); i++) {
            Tool tool = tools.get(i);
            float bx = x + i * 50;
            boolean hov = popover == Popover.NONE && over(bx, y, 44, 44);
            float tk = approach("tip:" + i, hov ? 1 : 0);
            if (tk > tipK) { tipK = tk; tipTool = tool; tipX = bx + 22; }
            float h = hover(c, "tool:" + i, bx, y, 44, 44);
            box(c, bx, y, 44, 44, Paint.lerp(l.glass(), l.hi(), h));
            frame(c, bx, y, 44, 44, Paint.lerp(l.line(), l.mu(), h));
            icon(c, tool.glyph(), bx + 22, y + 22, 20, i == 0 ? t.act() : t.tx(), tool.fill());
            unhover(c);
            hit(bx, y, 44, 44, tool.title(), () -> { SaviraSounds.play(SaviraSounds.Sound.CLICK); tool.action().run(); });
        }
        endGroup(c, k);
        if (tipTool == null || tipK <= .01f) return;
        // The label above the hovered tool: title and where it belongs, fading and rising in.
        String sub = tipTool.sub().toUpperCase(Locale.ROOT);
        float tw = Math.max(width(PIXEL, tipTool.title(), 16, 0), width(SILK, sub, 9, .06f)) + 24, th = 9 + 16 + 5 + 9 + 9;
        float tx = tipX - tw / 2, ty = y - 10 - th + (1 - tipK) * 4;
        c.draw();
        RenderSystem.setShaderColor(1f, 1f, 1f, tipK);
        box(c, tx, ty, tw, th, l.glass());
        box(c, tx, ty, tw, th, DesignTheme.alpha(t.bg(), .4f));
        frame(c, tx, ty, tw, th, l.line());
        pixel(c, tipTool.title(), tx + 12, ty + 9 + 8, 16, t.tx());
        caps(c, sub, tx + 12, ty + 9 + 16 + 5 + 4.5f, 9, l.mu(), .06f);
        c.draw();
        RenderSystem.setShaderColor(1f, 1f, 1f, 1f);
    }

    // ---------- Bottom right: news ----------
    private void renderNews(DrawContext c) {
        DesignTheme t = t(); Look l = look();
        float k = group(c, 6);
        float x = sw - 18 - NEWS_W, y = sh - 46 - (NEWS_H + 10 + 6);
        newsHover = popover == Popover.NONE && over(x, y, NEWS_W, NEWS_H);
        box(c, x, y, NEWS_W, NEWS_H, t.fill());
        var m = c.getMatrices().peek().getPositionMatrix();
        Vector3f a = m.transformPosition(x, y, 0, new Vector3f()), b = m.transformPosition(x + NEWS_W, y + NEWS_H, 0, new Vector3f());
        c.enableScissor((int) Math.floor(a.x), (int) Math.floor(a.y), (int) Math.ceil(b.x), (int) Math.ceil(b.y));
        long age = Util.getMeasuringTimeMs() - newsSince - (newsPausedAt >= 0 ? Util.getMeasuringTimeMs() - newsPausedAt : 0);
        float fade = anim() ? Math.clamp(age / (float) NEWS_FADE, 0f, 1f) : 1;
        if (previousNews >= 0 && fade < 1) newsSlide(c, NEWS.get(previousNews), x, y, 1 - fade, -16 * ease(fade), 1.08f);
        newsSlide(c, NEWS.get(newsIndex), x, y, previousNews < 0 ? 1 : fade, 16 * (1 - ease(fade)), 1.04f + .04f * Math.clamp(age / (float) NEWS_INTERVAL, 0f, 1f));
        c.disableScissor();
        frame(c, x, y, NEWS_W, NEWS_H, newsHover ? l.mu() : l.line());
        hit(x, y, NEWS_W, NEWS_H, "Nächste Neuigkeit", () -> { SaviraSounds.play(SaviraSounds.Sound.CLICK); showNews(newsIndex + 1); });
        // Dots under the card, right aligned; the current one fills up until the next turn.
        float progress = Math.clamp(age / (float) NEWS_INTERVAL, 0f, 1f);
        float total = (NEWS.size() - 1) * (6 + 6) + 28, dx = x + NEWS_W - total, dy = y + NEWS_H + 10;
        for (int i = 0; i < NEWS.size(); i++) {
            boolean current = i == newsIndex;
            float w = approach("dot:" + i, current ? 28 : 6);
            box(c, dx, dy, w, 6, current ? 0x4DFFFFFF : 0x73FFFFFF);
            if (current) box(c, dx, dy, w * progress, 6, 0xEBFFFFFF);
            int index = i;
            hit(dx - 2, dy - 4, w + 4, 14, "Neuigkeit " + (i + 1), () -> { SaviraSounds.play(SaviraSounds.Sound.CLICK); showNews(index); });
            dx += w + 6;
        }
        endGroup(c, k);
    }
    private void newsSlide(DrawContext c, News news, float x, float y, float alpha, float shift, float zoom) {
        DesignTheme t = t();
        c.draw();
        RenderSystem.setShaderColor(1f, 1f, 1f, alpha);
        // The picture fills the card and slowly zooms in while shown.
        float scale = Math.max(NEWS_W / (float) ART_W, NEWS_H / (float) ART_H) * zoom, dw = ART_W * scale, dh = ART_H * scale;
        c.getMatrices().push();
        c.getMatrices().translate(x + (NEWS_W - dw) / 2, y + (NEWS_H - dh) / 2, 0);
        c.getMatrices().scale(dw / ART_W, dh / ART_H, 1);
        c.drawTexture(news.texture(), 0, 0, 0, 0, ART_W, ART_H, ART_W, ART_H);
        c.getMatrices().pop();
        // Shade from 35 % down, then the kicker, date and title, sliding in sideways.
        Paint.gradient(c, x, y + NEWS_H * .35f, NEWS_W, NEWS_H * .65f, 0, 0x00080A0C, 0xE608090C, px());
        c.getMatrices().push();
        c.getMatrices().translate(shift, 0, 0);
        float kw = width(SILK, news.kicker(), 9, .06f) + 14, base = y + NEWS_H - 16;
        box(c, x + 16, base - 23 - 15, kw, 15, t.ac());
        caps(c, news.kicker(), x + 23, base - 23 - 7.5f, 9, t.acx(), .06f);
        caps(c, news.date(), x + 16 + kw + 10, base - 23 - 7.5f, 9, DesignTheme.oklch(.78f, .01f, 268, 1), .06f);
        pixel(c, MenuType.fit(PIXEL, news.title(), 21, NEWS_W - 32, u), x + 16, base - 11, 21, DesignTheme.oklch(.98f, .005f, 268, 1));
        c.getMatrices().pop();
        c.draw();
        RenderSystem.setShaderColor(1f, 1f, 1f, 1f);
    }

    // ---------- Popovers ----------
    private float[] popRect() {
        return switch (popover) {
            case ACCOUNT -> new float[] {20, 72, 280, 14 + 11 + 6 + 22 + 6 + 16 + 14};
            case LINKS -> new float[] {20 + accountW() + 10, 72, 300, 12 + 26 + links.size() * 50 + (links.size() - 1) * 4 + 12};
            case PICKER -> {
                int rows = (backdrops.size() + 2) / 3;
                yield new float[] {pickerX() + 42 + 62 - 420, 72, 420, 14 + 20 + 12 + rows * 95 + (rows - 1) * 10 + 12 + 16 + 14};
            }
            default -> new float[] {0, 0, 0, 0};
        };
    }
    private void renderPopover(DrawContext c, Look l) {
        DesignTheme t = t();
        float[] r = popRect();
        float x = r[0], y = r[1], w = r[2], h = r[3];
        float k = anim() ? ease((Util.getMeasuringTimeMs() - popAt) / 200f) : 1;
        c.draw();
        RenderSystem.setShaderColor(1f, 1f, 1f, Math.max(.01f, k));
        c.getMatrices().push();
        c.getMatrices().translate(0, (1 - k) * 8, 300);
        box(c, x, y, w, h, l.glass());
        box(c, x, y, w, h, DesignTheme.alpha(t.bg(), .5f));
        frame(c, x, y, w, h, l.line());
        switch (popover) {
            case ACCOUNT -> {
                caps(c, "ANGEMELDET ALS", x + 16, y + 14 + 5.5f, 9, l.mu(), .08f);
                pixel(c, client.getSession().getUsername(), x + 16, y + 14 + 11 + 6 + 11, 22, t.tx());
                inter(c, "Konten wechselst du im Launcher.", x + 16, y + 14 + 11 + 6 + 22 + 6 + 8, 12.5f, l.mu());
            }
            case LINKS -> {
                pixel(c, "Socials", x + 16, y + 12 + 12, 20, t.tx());
                float ry = y + 12 + 26;
                for (Link link : links) {
                    boolean hov = over(x + 12, ry, w - 24, 50);
                    if (hov) box(c, x + 12, ry, w - 24, 50, l.hi());
                    box(c, x + 20, ry + 8, 34, 34, link.tile());
                    box(c, x + 20, ry + 39, 34, 3, 0x40000000);
                    icon(c, link.glyph(), x + 37, ry + 24, 18, DesignTheme.KNOB, true);
                    pixel(c, link.label(), x + 66, ry + 17, 17, t.tx());
                    inter(c, link.sub(), x + 66, ry + 35, 12, l.mu());
                    icon(c, MenuType.CARET_RIGHT, x + w - 12 - 14, ry + 25, 12, l.mu(), false);
                    hit(x + 12, ry, w - 24, 50, "Link: " + link.label(), () -> {
                        popover = Popover.NONE;
                        SaviraSounds.play(SaviraSounds.Sound.CLICK);
                        if (link.url() != null) ConfirmLinkScreen.open(this, link.url(), true);
                        else toast("Discord", "Der Einladungslink folgt bald.");
                    });
                    ry += 54;
                }
            }
            case PICKER -> {
                pixel(c, "Hintergrund", x + 14, y + 14 + 10, 20, t.tx());
                float cellW = (w - 28 - 20) / 3, gy = y + 14 + 20 + 12;
                for (int i = 0; i < backdrops.size(); i++) {
                    Backdrop option = backdrops.get(i);
                    float cx = x + 14 + (i % 3) * (cellW + 10), cy = gy + (i / 3) * 105;
                    boolean chosen = option == backdrop(), hov = over(cx, cy, cellW, 95);
                    box(c, cx, cy, cellW, 72, t.fill());
                    Identifier thumb = option == CURRENT ? PANORAMA_THUMB : SaviraPanoramas.thumbnail(option.id());
                    if (thumb != null) {
                        var m = c.getMatrices().peek().getPositionMatrix();
                        Vector3f a = m.transformPosition(cx + 2, cy + 2, 0, new Vector3f()), b = m.transformPosition(cx + cellW - 2, cy + 70, 0, new Vector3f());
                        c.enableScissor((int) Math.floor(a.x), (int) Math.floor(a.y), (int) Math.ceil(b.x), (int) Math.ceil(b.y));
                        float s = Math.max(cellW / 128f, 72 / 128f);
                        c.getMatrices().push();
                        c.getMatrices().translate(cx + (cellW - 128 * s) / 2, cy + (72 - 128 * s) / 2, 0);
                        c.getMatrices().scale(s, s, 1);
                        c.drawTexture(thumb, 0, 0, 0, 0, 128, 128, 128, 128);
                        c.getMatrices().pop();
                        c.disableScissor();
                    } else icon(c, MenuType.MOUNTAINS, cx + cellW / 2, cy + 36, 24, l.mu(), false);
                    frame(c, cx, cy, cellW, 72, chosen ? t.ac() : hov ? l.mu() : l.line());
                    frame(c, cx + 1, cy + 1, cellW - 2, 70, chosen ? t.ac() : 0);
                    MenuType.centered(c, PIXEL, MenuType.fit(PIXEL, option.label(), 15, cellW, u), cx + cellW / 2, cy + 72 + 8 + 7, 15, chosen ? t.act() : l.mu(), 0, u);
                    hit(cx, cy, cellW, 95, "Panorama: " + option.label(), () -> choosePanorama(option.label()));
                }
                int rows = (backdrops.size() + 2) / 3;
                inter(c, backdrops.size() == 1 ? "Weitere Panoramen lädt der Launcher." : "Panoramen früherer Updates, vom Launcher geladen.", x + 14, gy + rows * 105 - 10 + 12 + 8, 12, l.mu());
            }
            default -> { }
        }
        c.draw();
        c.getMatrices().pop();
        RenderSystem.setShaderColor(1f, 1f, 1f, 1f);
    }
    private long popAt;

    // ---------- Input ----------
    @Override
    public boolean mouseClicked(double x, double y, int button) {
        double mx = x / u, my = y / u;
        mouseX = mx; mouseY = my;
        Popover before = popover;
        for (int i = lastHits.size() - 1; i >= 0; i--) {
            Hit h = lastHits.get(i);
            if (!h.contains(mx, my)) continue;
            // While a popover is open only its own controls and the button that opened it react.
            if (popover != Popover.NONE && !insidePopover(mx, my) && !isOpener(h.label())) continue;
            if (button == 0) h.action().run();
            if (popover != before && popover != Popover.NONE) popAt = Util.getMeasuringTimeMs();
            return true;
        }
        // A click elsewhere closes the open popover.
        if (popover != Popover.NONE && !insidePopover(mx, my)) { popover = Popover.NONE; return true; }
        return true;
    }
    private boolean insidePopover(double mx, double my) {
        float[] r = popRect();
        return popover != Popover.NONE && mx >= r[0] && mx < r[0] + r[2] && my >= r[1] && my < r[1] + r[3];
    }
    private boolean isOpener(String label) {
        return popover == Popover.ACCOUNT && label.startsWith("Konto: ") || popover == Popover.LINKS && label.equals("Socials") || popover == Popover.PICKER && label.equals("Hintergrund wählen");
    }
    @Override
    public boolean keyPressed(int keyCode, int scanCode, int modifiers) {
        if (keyCode == 256 && popover != Popover.NONE) { popover = Popover.NONE; return true; }
        return super.keyPressed(keyCode, scanCode, modifiers);
    }
    @Override
    public boolean shouldCloseOnEsc() { return false; }

    // ---------- For the UI test ----------
    public int newsIndex() { return newsIndex; }
    public boolean newsVisible() { return showNews; }
    public String backgroundId() { return backdrop().id(); }
    public boolean pickerOpen() { return popover == Popover.PICKER; }
    /** Shows the Discord banner as if hovered, for the screenshot. */
    public void previewBanner(boolean on) { bannerPreview = on; }
    /** Chooses a panorama by its label as a click would. */
    public boolean choosePanorama(String label) {
        for (Backdrop option : backdrops) if (option.label().equals(label)) {
            SaviraSounds.play(SaviraSounds.Sound.CLICK);
            SaviraClient.config.menuBackground = option.id(); SaviraClient.config.save();
            popover = Popover.NONE;
            return true;
        }
        return false;
    }
    public boolean has(String label) { return lastHits.stream().anyMatch(h -> h.label().equals(label)); }
    public void click(String label) {
        lastHits.stream().filter(h -> h.label().equals(label)).findFirst().orElseThrow(() -> new IllegalStateException("Control missing: " + label)).action().run();
        if (popover != Popover.NONE) popAt = Util.getMeasuringTimeMs();
    }
    /** Servers that answered the ping, for the test log. */
    public String serverStatus() {
        StringBuilder out = new StringBuilder();
        for (ServerInfo info : serverInfos) out.append(info.name).append('=').append(info.getStatus()).append(info.players != null ? " " + info.players.online() + " Spieler, " + info.ping + " ms" : "").append("; ");
        return out.toString();
    }
}

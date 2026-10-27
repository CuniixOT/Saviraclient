package gg.savira.client;

import com.mojang.blaze3d.systems.RenderSystem;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.SharedConstants;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.PlayerSkinDrawer;
import net.minecraft.client.gui.RotatingCubeMapRenderer;
import net.minecraft.client.gui.screen.ConfirmLinkScreen;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.screen.multiplayer.MultiplayerScreen;
import net.minecraft.client.gui.screen.option.AccessibilityOptionsScreen;
import net.minecraft.client.gui.screen.option.LanguageOptionsScreen;
import net.minecraft.client.gui.screen.option.OptionsScreen;
import net.minecraft.client.gui.screen.world.SelectWorldScreen;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.client.render.DiffuseLighting;
import net.minecraft.client.render.OverlayTexture;
import net.minecraft.client.render.RenderLayer;
import net.minecraft.client.render.entity.model.EntityModelLayers;
import net.minecraft.client.render.entity.model.PlayerEntityModel;
import net.minecraft.client.util.SkinTextures;
import net.minecraft.entity.LivingEntity;
import net.minecraft.client.toast.SystemToast;
import net.minecraft.text.Style;
import net.minecraft.text.Text;
import net.minecraft.util.Identifier;
import net.minecraft.util.Util;
import net.minecraft.util.math.RotationAxis;
import org.joml.Vector3f;
import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Savira's main menu in place of the vanilla title screen, laid out like Lunar Client's:
 * account and links top left, coins, background and close top right, logo with the play buttons
 * and a Discord banner in the middle, a tool bar at the bottom, version bottom left and the
 * news with the Mojang notice bottom right.
 *
 * Laid out in reference units: a 720 high screen. They scale with the window height, so the menu
 * keeps its proportions at every GUI scale. The background stays in screen coordinates.
 */
public final class SaviraTitleScreen extends Screen {
    private static final Pattern DISCORD = Pattern.compile("^https://(discord\\.gg|(www\\.)?discord\\.com/invite)/[A-Za-z0-9-]{2,32}$");
    private static final String GITHUB = "https://github.com/CuniixOT/Saviraclient";
    private static final int DISCORD_BLURPLE = 0xFF5865F2;
    // Lunar's flat dark glass: buttons, chips and cards.
    private static final int GLASS = 0xC0141517, GLASS_HOVER = 0xE0222428, EDGE = 0x24FFFFFF, TEXT = 0xFFF2F3F5, MUTED = 0xFF9EA3AB, FAINT = 0xFF6E747C;
    private static final int STORE = 0xC8173A1C, STORE_HOVER = 0xE0205026, STORE_TEXT = 0xFF4BE36A, COIN = 0xFFF2B93B;
    private static final int R = 3, BUTTON_W = 207, BUTTON_H = 21;
    private static final long NEWS_INTERVAL = 6500, NEWS_SLIDE = 550, INTRO = 520;

    /** Same entries as the launcher's start page (src/news.ts); pictures from `npm run menu-art`. */
    private record News(String kicker, String date, String title, String body, String art) {
        Identifier texture() { return Identifier.of("savira", "textures/gui/news/" + art + ".png"); }
    }
    private static final List<News> NEWS = List.of(
        new News("Garderobe", "12. Okt", "Skins und Capes im Launcher.", "Skins verwalten, Capes wechseln und eigene Capes tragen.", "wardrobe"),
        new News("Savira", "12. Okt", "Neues Logo, neues Gesicht.", "Im Launcher, im Spiel, auf dem Desktop und in Discord.", "brand"),
        new News("Launcher", "11. Okt", "Mehrere Konten und Discord.", "Konten per Klick wechseln, dazu Discord-Präsenz.", "accounts"),
        new News("Mod-Menü", "07. Okt", "Jedes HUD-Element nach deinem Stil.", "Hintergrund, Farben und Text für jede Anzeige.", "modmenu")
    );

    /** Menu backgrounds: this version's own panorama, or one of earlier updates (see SaviraPanoramas). */
    private record Backdrop(String id, String label) {}
    private static final Backdrop CURRENT = new Backdrop("current", "Tricky Trials");
    private static final Identifier PANORAMA_THUMB = Identifier.ofVanilla("textures/gui/title/background/panorama_0.png");
    private List<Backdrop> backdrops = List.of(CURRENT);
    private static final int THUMB_W = 96, THUMB_H = 70, THUMB_GAP = 8;

    private enum Popover { NONE, ACCOUNT, LINKS }
    private record Link(String label, String sub, String url) {}

    private final String modVersion = FabricLoader.getInstance().getModContainer("savira").map(m -> m.getMetadata().getVersion().getFriendlyString()).orElse("");
    private final long openedAt = Util.getMeasuringTimeMs();
    private float u = 1, px = 1;
    private int sw, sh, newsIndex, previousNews = -1, newsX, newsY, newsW, newsH;
    private long newsSince = Util.getMeasuringTimeMs();
    private boolean showNews, pickerOpen;
    private int pickerX, pickerY, pickerW, pickerH, pickerCols;
    private Popover popover = Popover.NONE;
    private int popX, popY, popW;
    private List<Link> links = List.of();
    /** Tool bar entry under the mouse, for the label above it. */
    private Tool hoveredTool;
    private float toolFade;

    public SaviraTitleScreen() { super(Text.literal("Savira")); }

    private Backdrop backdrop() {
        String id = SaviraClient.config.menuBackground;
        return backdrops.stream().filter(b -> b.id().equals(id)).findFirst().orElse(CURRENT);
    }
    private String launcherVersion() {
        String v = SaviraClient.config.launcherVersion;
        return v == null || v.isBlank() ? modVersion : v;
    }
    private static float ease(float t) { t = Math.clamp(t, 0f, 1f); return 1 - (1 - t) * (1 - t) * (1 - t); }

    // ---------- Text in reference units: sharp Inter (see UiText) ----------
    private void text(DrawContext c, String s, float x, float y, float scale, int color, boolean shadow) { UiText.draw(c, s, x, y, scale, color, shadow, false, u); }
    private void text(DrawContext c, String s, float x, float y, float scale, int color, boolean shadow, boolean bold) { UiText.draw(c, s, x, y, scale, color, shadow, bold, u); }
    private float width(String s, float scale) { return UiText.width(s, scale, u); }
    private String trim(String s, float maxWidth, float scale) { return UiText.trim(s, maxWidth, scale, u); }
    private void box(DrawContext c, float x, float y, float w, float h, float r, int color) { Paint.round(c, x, y, w, h, r, color, px); }
    private void centered(DrawContext c, String s, float cx, float cy, float scale, int color) { text(c, s, cx - width(s, scale) / 2f, cy - 3.5f * scale, scale, color, false); }
    private static void icon(DrawContext c, String[] glyph, float x, float y, float px, int color) {
        c.getMatrices().push();
        c.getMatrices().translate(x, y, 0);
        c.getMatrices().scale(px, px, 1);
        PixelIcons.draw(c, glyph, 0, 0, 1, color);
        c.getMatrices().pop();
    }

    /** Base for every control: a hover value that eases in and out, and the intro fade by group. */
    private abstract class Control extends ButtonWidget {
        float hover;
        long lastFrame;
        final int order;
        Control(int x, int y, int w, int h, String label, int order, PressAction action) { super(x, y, w, h, Text.literal(label), action, n -> n.get()); this.order = order; }
        @Override
        protected void renderWidget(DrawContext c, int mx, int my, float delta) {
            boolean over = popover == Popover.NONE && !pickerOpen && (isHovered() || isFocused());
            long now = Util.getMeasuringTimeMs();
            float dt = lastFrame == 0 ? 0 : Math.min(.1f, (now - lastFrame) / 1000f);
            lastFrame = now;
            hover += ((over ? 1 : 0) - hover) * (1 - (float) Math.exp(-dt * 14));
            // Intro: each group fades in and rises a little, one after the other.
            float k = ease((Util.getMeasuringTimeMs() - openedAt - order * 60) / (float) INTRO);
            RenderSystem.setShaderColor(1f, 1f, 1f, Math.max(.01f, k));
            c.getMatrices().push();
            c.getMatrices().translate(0, (1 - k) * 8 - lift() * hover, 0);
            draw(c, mx, my);
            c.draw();
            c.getMatrices().pop();
            RenderSystem.setShaderColor(1f, 1f, 1f, 1f);
        }
        abstract void draw(DrawContext c, int mx, int my);
        /** How far the control rises on hover. */
        float lift() { return 0; }
        int mix(int a, int b) { return MenuTheme.mix(a, b, hover) & 0x00FFFFFF | (int) (((a >>> 24) * (1 - hover) + (b >>> 24) * hover)) << 24; }
    }

    @Override
    protected void init() {
        u = height / 720f; px = Paint.pixels(u);
        sw = Math.round(width / u); sh = Math.round(height / u);
        int cx = sw / 2, left = cx - BUTTON_W / 2;
        // Centre: logo, two wide buttons, two half buttons, the Discord banner.
        int top = Math.max(150, sh / 2 - 61);
        addDrawableChild(wideButton(left, top, "Einzelspieler", PixelIcons.PLAYER, 1, b -> client.setScreen(new SelectWorldScreen(this))));
        addDrawableChild(wideButton(left, top + 25, "Mehrspieler", PixelIcons.FRIENDS, 2, b -> client.setScreen(new MultiplayerScreen(this))));
        int half = (BUTTON_W - 5) / 2;
        addDrawableChild(halfButton(left, top + 50, half, "Mod-Menü", false, 3, b -> client.setScreen(new HudScreen())));
        addDrawableChild(halfButton(left + half + 5, top + 50, BUTTON_W - half - 5, "Store", true, 3, b -> toast("Savira-Store", "Der Store mit Cosmetics kommt bald.")));
        addDrawableChild(banner(left, top + 83, BUTTON_W, 51, 4));

        // Top left: account and links. Top right: coins, background, close.
        String name = client.getSession().getUsername();
        int chipW = Math.round(width(name, 1.15f)) + 52;
        addDrawableChild(accountChip(10, 10, chipW, 21, name));
        addDrawableChild(square(10 + chipW + 6, 10, "Socials", PixelIcons.LINK, 0, b -> toggle(Popover.LINKS, 10 + chipW + 6)));
        addDrawableChild(square(sw - 31, 10, "Spiel beenden", PixelIcons.CLOSE, 0, b -> client.scheduleStop()));
        addDrawableChild(square(sw - 58, 10, "Hintergrund wählen", PixelIcons.BRUSH, 0, b -> pickerOpen = !pickerOpen));
        addDrawableChild(coins(sw - 98, 10, 34, 21));

        // Bottom: tool bar in the middle, version left, news and notice right.
        List<Tool> tools = List.of(
            new Tool("Savira-Einstellungen", "Savira", null, () -> client.setScreen(new HudScreen())),
            new Tool("Cosmetics", "Savira", PixelIcons.SHIRT, () -> toast("Cosmetics", "Capes, Hüte und Effekte kommen bald.")),
            new Tool("Freunde", "Savira", PixelIcons.CHAT, () -> toast("Freunde", "Freunde und Chat kommen bald.")),
            new Tool("Minecraft-Einstellungen", "Minecraft", PixelIcons.GEAR, () -> client.setScreen(new OptionsScreen(this, client.options))),
            new Tool("Sprache", "Minecraft", PixelIcons.LANGUAGE, () -> client.setScreen(new LanguageOptionsScreen(this, client.options, client.getLanguageManager()))),
            new Tool("Barrierefreiheit", "Minecraft", PixelIcons.EYE, () -> client.setScreen(new AccessibilityOptionsScreen(this, client.options))),
            new Tool("Screenshots", "Ordner öffnen", PixelIcons.IMAGE, this::openScreenshots)
        );
        int size = 21, gap = 3, barX = cx - (tools.size() * size + (tools.size() - 1) * gap) / 2, barY = sh - 33;
        for (int i = 0; i < tools.size(); i++) addDrawableChild(new ToolButton(barX + i * (size + gap), barY, size, tools.get(i)));
        newsW = 176; newsH = 90; newsX = sw - newsW - 8; newsY = sh - 22 - 8 - newsH;
        showNews = newsX > left + BUTTON_W + 12 && newsY > top + 150;
        if (showNews) addDrawableChild(newsCard());

        // Socials: Discord from the launcher, the project page on GitHub.
        String discord = SaviraClient.config.discordUrl == null ? "" : SaviraClient.config.discordUrl.trim();
        links = List.of(new Link("Discord", DISCORD.matcher(discord).matches() ? "Community beitreten" : "Bald verfügbar", DISCORD.matcher(discord).matches() ? discord : null),
            new Link("GitHub", "Savira Client", GITHUB));

        List<Backdrop> list = new ArrayList<>(List.of(CURRENT));
        SaviraPanoramas.list().forEach(entry -> list.add(new Backdrop(entry.id(), entry.label())));
        backdrops = list;
        pickerCols = Math.max(1, Math.min(4, (sw - 60 + THUMB_GAP) / (THUMB_W + THUMB_GAP)));
        int rows = (backdrops.size() + pickerCols - 1) / pickerCols;
        pickerW = pickerCols * (THUMB_W + THUMB_GAP) - THUMB_GAP + 16;
        pickerH = rows * (THUMB_H + THUMB_GAP) - THUMB_GAP + 30 + (backdrops.size() == 1 ? 14 : 0);
        pickerX = sw - pickerW - 10; pickerY = 37;
    }

    private void toggle(Popover next, int x) { popover = popover == next ? Popover.NONE : next; popX = x; popY = 37; popW = 150; }
    private void toast(String title, String text) { SystemToast.add(client.getToastManager(), SystemToast.Type.PERIODIC_NOTIFICATION, Text.literal(title), Text.literal(text)); }
    private void openScreenshots() {
        File dir = new File(client.runDirectory, "screenshots");
        if (!dir.exists() && !dir.mkdirs()) return;
        Util.getOperatingSystem().open(dir);
    }
    private void showNews(int index) { previousNews = newsIndex; newsIndex = Math.floorMod(index, NEWS.size()); newsSince = Util.getMeasuringTimeMs(); }

    // ---------- Controls ----------
    private ButtonWidget wideButton(int x, int y, String label, String[] glyph, int order, ButtonWidget.PressAction action) {
        return new Control(x, y, BUTTON_W, BUTTON_H, label, order, action) {
            @Override
            float lift() { return 1; }
            @Override
            void draw(DrawContext c, int mx, int my) {
                box(c, getX(), getY(), getWidth(), getHeight(), R, mix(GLASS, GLASS_HOVER));
                float tw = width(label, 1.15f), sx = getX() + (getWidth() - tw - 14) / 2f;
                icon(c, glyph, sx, getY() + 6, .9f, TEXT);
                text(c, label, sx + 14, getY() + 6.5f, 1.15f, TEXT, false);
            }
        };
    }
    private ButtonWidget halfButton(int x, int y, int w, String label, boolean store, int order, ButtonWidget.PressAction action) {
        return new Control(x, y, w, BUTTON_H + 2, label, order, action) {
            @Override
            float lift() { return 1; }
            @Override
            void draw(DrawContext c, int mx, int my) {
                box(c, getX(), getY(), getWidth(), getHeight(), R, store ? mix(STORE, STORE_HOVER) : mix(GLASS, GLASS_HOVER));
                float tw = width(label, 1.15f), sx = getX() + (getWidth() - tw - 14) / 2f;
                if (store) icon(c, PixelIcons.CART, sx, getY() + 7, .9f, STORE_TEXT);
                else MenuStyle.logo(c, Math.round(sx) - 2, getY() + 4, 1, MenuStyle.launcherAccent(), false);
                text(c, label, sx + 14, getY() + 7.5f, 1.15f, store ? STORE_TEXT : TEXT, false);
            }
        };
    }
    /** "Werbung": the Discord banner, your own player standing in it and waving on hover, like Lunar's. */
    private ButtonWidget banner(int x, int y, int w, int h, int order) {
        String url = SaviraClient.config.discordUrl == null ? "" : SaviraClient.config.discordUrl.trim();
        boolean ready = DISCORD.matcher(url).matches();
        return new Control(x, y, w, h, "Discord beitreten", order, b -> {
            if (ready) ConfirmLinkScreen.open(this, url, true); else toast("Discord", "Der Einladungslink folgt bald.");
        }) {
            @Override
            float lift() { return 1; }
            @Override
            void draw(DrawContext c, int mx, int my) {
                float glow = Math.max(hover, bannerPreview ? 1 : 0);
                int x0 = getX(), y0 = getY(), x1 = x0 + getWidth(), y1 = y0 + getHeight();
                Paint.gradient(c, x0, y0, getWidth(), getHeight(), 6, Paint.lerp(0xF25865F2, 0xF26B77FF, glow), Paint.lerp(0xF2404AC4, 0xF24A55D6, glow), px);
                Paint.outline(c, x0, y0, getWidth(), getHeight(), 6, Paint.lerp(0x26FFFFFF, 0x4DFFFFFF, glow), px);
                text(c, "COMMUNITY", x0 + 12, y0 + 10, .85f, 0xD2FFFFFF, false);
                text(c, "Discord beitreten", x0 + 12, y0 + 20, 1.5f, 0xFFFFFFFF, false, true);
                text(c, ready ? "Neuigkeiten, Hilfe und Events" : "Der Link folgt bald", x0 + 12, y0 + 35, .95f, 0xD9FFFFFF, false);
                // The player stands at the right, head above the banner, legs cut off at its bottom edge.
                clipHere(c, x0, y0 - 40, x1, y1);
                bannerPlayer(c, x1 - 32, y0 + 16 - 2 * glow, glow, mx, my);
                c.disableScissor();
            }
        };
    }
    private PlayerEntityModel<LivingEntity> wideModel, slimModel;
    private boolean bannerPreview;
    /** Your skin as a 3D figure: breathing, head following the mouse; waving while hovered. */
    private void bannerPlayer(DrawContext c, float x, float neck, float wave, int mx, int my) {
        SkinTextures skin = client.getSkinProvider().getSkinTextures(client.getGameProfile());
        boolean slim = skin.model() == SkinTextures.Model.SLIM;
        if (wideModel == null) {
            wideModel = new PlayerEntityModel<>(client.getEntityModelLoader().getModelPart(EntityModelLayers.PLAYER), false);
            slimModel = new PlayerEntityModel<>(client.getEntityModelLoader().getModelPart(EntityModelLayers.PLAYER_SLIM), true);
        }
        PlayerEntityModel<LivingEntity> model = slim ? slimModel : wideModel;
        float t = Util.getMeasuringTimeMs() / 1000f, size = 38;
        model.child = false;
        model.head.resetTransform(); model.body.resetTransform();
        model.rightArm.resetTransform(); model.leftArm.resetTransform();
        model.rightLeg.resetTransform(); model.leftLeg.resetTransform();
        model.head.yaw = -Math.clamp((mx - x) / 220f, -.5f, .5f) * (1 - wave * .5f);
        model.head.pitch = Math.clamp((my - neck) / 220f, -.3f, .3f) * (1 - wave) - .12f * wave;
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
        c.getMatrices().translate(x, neck + breath * .35f, 120);
        c.getMatrices().scale(size, size, -size);
        c.getMatrices().multiply(RotationAxis.POSITIVE_Y.rotationDegrees(-22 + 10 * wave));
        DiffuseLighting.method_34742();
        model.render(c.getMatrices(), c.getVertexConsumers().getBuffer(RenderLayer.getEntityTranslucent(skin.texture())), 0xF000F0, OverlayTexture.DEFAULT_UV, -1);
        c.draw();
        DiffuseLighting.enableGuiDepthLighting();
        c.getMatrices().pop();
    }
    private ButtonWidget accountChip(int x, int y, int w, int h, String name) {
        return new Control(x, y, w, h, "Konto: " + name, 0, b -> toggle(Popover.ACCOUNT, x)) {
            @Override
            void draw(DrawContext c, int mx, int my) {
                box(c, getX(), getY(), getWidth(), getHeight(), R, mix(GLASS, GLASS_HOVER));
                PlayerSkinDrawer.draw(c, client.getSkinProvider().getSkinTextures(client.getGameProfile()), getX() + 6, getY() + 5, 11);
                MenuStyle.logo(c, getX() + 18, getY() + 3, 1, 0xFFFFFFFF, false);
                text(c, name, getX() + 34, getY() + 6.5f, 1.15f, TEXT, false);
                int ax = getX() + getWidth() - 10, ay = getY() + 9;
                for (int i = 0; i < 3; i++) c.fill(ax + i, ay + i, ax + 5 - i, ay + i + 1, MUTED);
            }
        };
    }
    private ButtonWidget square(int x, int y, String label, String[] glyph, int order, ButtonWidget.PressAction action) {
        return new Control(x, y, 21, 21, label, order, action) {
            @Override
            void draw(DrawContext c, int mx, int my) {
                boolean open = label.equals("Socials") && popover == Popover.LINKS || label.startsWith("Hintergrund") && pickerOpen;
                box(c, getX(), getY(), 21, 21, R, open ? GLASS_HOVER : mix(GLASS, GLASS_HOVER));
                icon(c, glyph, getX() + 5.5f, getY() + 5.5f, 1f, label.equals("Spiel beenden") ? mix(TEXT, 0xFFFF7A7A) : TEXT);
            }
        };
    }
    private ButtonWidget coins(int x, int y, int w, int h) {
        return new Control(x, y, w, h, "Savira Coins", 0, b -> toast("Savira Coins", "Mit Coins kaufst du bald Cosmetics im Store.")) {
            @Override
            void draw(DrawContext c, int mx, int my) {
                box(c, getX(), getY(), getWidth(), getHeight(), R, mix(0xC03A2A0C, 0xE0503A10));
                icon(c, PixelIcons.COIN, getX() + 6, getY() + 5.5f, 1f, COIN);
                text(c, "0", getX() + 21, getY() + 7, 1f, COIN, false);
                c.fill(getX() + getWidth() - 4, getY() - 2, getX() + getWidth() + 2, getY() + 4, COIN);
            }
        };
    }

    private record Tool(String title, String sub, String[] icon, Runnable action) {}
    private final class ToolButton extends Control {
        private final Tool tool;
        ToolButton(int x, int y, int size, Tool tool) { super(x, y, size, size, tool.title(), 5, b -> tool.action().run()); this.tool = tool; }
        @Override
        void draw(DrawContext c, int mx, int my) {
            if (hover > .02f && (hoveredTool == null || hover > toolFade)) { hoveredTool = tool; toolFade = hover; }
            box(c, getX(), getY(), getWidth(), getHeight(), R, mix(GLASS, GLASS_HOVER));
            if (tool.icon() == null) MenuStyle.logo(c, getX() + 3, getY() + 2, 1, TEXT, false);
            else icon(c, tool.icon(), getX() + 5.5f, getY() + 5.5f, 1f, TEXT);
        }
    }

    /**
     * News bottom right: a rounded card with the picture, the kicker and the title, cross-fading to
     * the next one every few seconds; small dots below, the current one a pill that fills up.
     */
    private ButtonWidget newsCard() {
        return new Control(newsX, newsY, newsW, newsH, "Nächste Neuigkeit", 6, b -> showNews(newsIndex + 1)) {
            @Override
            void draw(DrawContext c, int mx, int my) {
                int x0 = getX(), y0 = getY(), w = getWidth(), h = getHeight();
                float raw = Math.clamp((Util.getMeasuringTimeMs() - newsSince) / (float) NEWS_SLIDE, 0f, 1f);
                float t = raw < .5f ? 4 * raw * raw * raw : 1 - (float) Math.pow(-2 * raw + 2, 3) / 2;
                box(c, x0, y0, w, h, 6, 0xF0101114);
                if (previousNews >= 0 && t < 1) newsSlide(c, NEWS.get(previousNews), x0, y0, w, h, 1 - t, -8 * t, false);
                newsSlide(c, NEWS.get(newsIndex), x0, y0, w, h, previousNews < 0 ? 1 : t, 8 * (1 - t), true);
                Paint.outline(c, x0, y0, w, h, 6, mix(0x1FFFFFFF, 0x47FFFFFF), px);
                // Dots below, right aligned; the current one is a pill filling up until the next turn.
                float progress = Math.min(1f, (Util.getMeasuringTimeMs() - newsSince) / (float) NEWS_INTERVAL);
                float dot = 3, pill = 14, gap = 3, total = (NEWS.size() - 1) * (dot + gap) + pill, dx = x0 + w - total, dy = y0 + h + 5;
                for (int i = 0; i < NEWS.size(); i++) {
                    float dw = i == newsIndex ? pill : dot;
                    box(c, dx, dy, dw, dot, 1.5f, i == newsIndex ? 0x40FFFFFF : 0x66FFFFFF);
                    if (i == newsIndex && progress > .05f) box(c, dx, dy, Math.max(dot, dw * progress), dot, 1.5f, 0xE6FFFFFF);
                    dx += dw + gap;
                }
            }
        };
    }
    private void newsSlide(DrawContext c, News news, int x, int y, int w, int h, float alpha, float shift, boolean current) {
        RenderSystem.enableBlend();
        c.setShaderColor(1f, 1f, 1f, alpha);
        // The picture fills the card, a little zoomed, and slowly zooms further while shown.
        float age = Math.min(1f, (Util.getMeasuringTimeMs() - newsSince) / (float) NEWS_INTERVAL);
        float scale = Math.max(w / 600f, h / 184f) * (1.04f + .04f * (current ? age : 1));
        float dw = 600 * scale, dh = 184 * scale;
        Paint.roundTexture(c, news.texture(), x, y, w, h, 6, x + (w - dw) / 2 + shift * .5f, y + (h - dh) / 2, dw, dh, px);
        c.setShaderColor(1f, 1f, 1f, 1f);
        // Shade under the text, then kicker and title rising in with the picture.
        Paint.gradient(c, x, y + h * .35f, w, h * .65f, 6, 0, Math.round(alpha * 0xE6) << 24 | 0x0A0B0D, px);
        int a = Math.max(4, Math.round(alpha * 255)) << 24;
        c.getMatrices().push();
        c.getMatrices().translate(shift, 0, 0);
        String kicker = news.kicker().toUpperCase(java.util.Locale.ROOT);
        float kw = width(kicker, .8f) + 10;
        box(c, x + 8, y + h - 33, kw, 10, 3, Math.round(alpha * 0xE6) << 24 | MenuStyle.launcherAccent() & 0xFFFFFF);
        text(c, kicker, x + 12.5f, y + h - 30.8f, .8f, a | 0xFFFFFF, false, true);
        text(c, news.date(), x + 8 + kw + 6, y + h - 30.8f, .8f, a | 0xB4B9C0, false);
        text(c, trim(news.title(), w - 16, 1.1f), x + 8, y + h - 18, 1.1f, a | 0xFFFFFF, false, true);
        c.getMatrices().pop();
    }
    /** Scissor for a rectangle in the current drawing position (follows hover lift and intro). */
    private void clipHere(DrawContext c, int x1, int y1, int x2, int y2) {
        var m = c.getMatrices().peek().getPositionMatrix();
        Vector3f a = m.transformPosition(x1, y1, 0, new Vector3f()), b = m.transformPosition(x2, y2, 0, new Vector3f());
        c.enableScissor((int) Math.floor(a.x), (int) Math.floor(a.y), (int) Math.ceil(b.x), (int) Math.ceil(b.y));
    }

    // ---------- Background picker and popovers ----------
    private int thumbAt(double mx, double my) {
        for (int i = 0; i < backdrops.size(); i++) {
            int x = pickerX + 8 + (i % pickerCols) * (THUMB_W + THUMB_GAP), y = pickerY + 22 + (i / pickerCols) * (THUMB_H + THUMB_GAP);
            if (mx >= x && mx < x + THUMB_W && my >= y && my < y + THUMB_H) return i;
        }
        return -1;
    }
    private void renderPicker(DrawContext c, int mx, int my) {
        box(c, pickerX, pickerY, pickerW, pickerH, R, 0xF20F1012);
        c.drawBorder(pickerX, pickerY, pickerW, pickerH, EDGE);
        text(c, "Hintergrund", pickerX + 9, pickerY + 8, 1.1f, TEXT, false);
        int hovered = thumbAt(mx, my);
        for (int i = 0; i < backdrops.size(); i++) {
            Backdrop option = backdrops.get(i);
            int x = pickerX + 8 + (i % pickerCols) * (THUMB_W + THUMB_GAP), y = pickerY + 22 + (i / pickerCols) * (THUMB_H + THUMB_GAP), imageH = THUMB_H - 16;
            boolean selected = option == backdrop();
            c.fill(x - 1, y - 1, x + THUMB_W + 1, y + imageH + 1, selected ? MenuStyle.launcherAccent() : i == hovered ? 0xFF8A939D : 0x30FFFFFF);
            clipHere(c, x, y, x + THUMB_W, y + imageH);
            Identifier thumb = option == CURRENT ? PANORAMA_THUMB : SaviraPanoramas.thumbnail(option.id());
            if (thumb != null) {
                float scale = Math.max(THUMB_W / 128f, imageH / 128f);
                c.drawTexture(thumb, x + (THUMB_W - Math.round(128 * scale)) / 2, y + (imageH - Math.round(128 * scale)) / 2, Math.round(128 * scale), Math.round(128 * scale), 0, 0, 128, 128, 128, 128);
            } else c.fill(x, y, x + THUMB_W, y + imageH, 0xFF161A1F);
            c.disableScissor();
            String label = trim(option.label(), THUMB_W, .9f);
            centered(c, label, x + THUMB_W / 2f, y + imageH + 8, .9f, selected ? MenuStyle.launcherAccent() : i == hovered ? TEXT : MUTED);
        }
        if (backdrops.size() == 1) text(c, "Weitere Panoramen lädt der Launcher …", pickerX + 9, pickerY + pickerH - 13, .85f, MUTED, false);
    }
    private int linkAt(double mx, double my) {
        if (popover != Popover.LINKS) return -1;
        for (int i = 0; i < links.size(); i++) if (mx >= popX && mx < popX + popW && my >= popY + 24 + i * 26 && my < popY + 48 + i * 26) return i;
        return -1;
    }
    private int popHeight() { return popover == Popover.LINKS ? 30 + links.size() * 26 : 50; }
    private void renderPopover(DrawContext c, int mx, int my) {
        int h = popHeight();
        box(c, popX, popY, popW, h, R, 0xF20F1012);
        c.drawBorder(popX, popY, popW, h, EDGE);
        if (popover == Popover.ACCOUNT) {
            text(c, "Angemeldet als", popX + 9, popY + 9, .85f, MUTED, false);
            text(c, client.getSession().getUsername(), popX + 9, popY + 20, 1.15f, TEXT, false);
            text(c, "Konten wechselst du im Launcher.", popX + 9, popY + 35, .8f, FAINT, false);
            return;
        }
        text(c, "Socials", popX + 9, popY + 9, 1.1f, TEXT, false);
        int hovered = linkAt(mx, my);
        for (int i = 0; i < links.size(); i++) {
            Link link = links.get(i);
            int y = popY + 24 + i * 26;
            if (i == hovered && link.url() != null) box(c, popX + 4, y, popW - 8, 24, R, 0x18FFFFFF);
            box(c, popX + 9, y + 4, 16, 16, R, link.label().equals("Discord") ? DISCORD_BLURPLE : 0xFF2B2F36);
            icon(c, link.label().equals("Discord") ? PixelIcons.CHAT : PixelIcons.LINK, popX + 12, y + 7, 1f, 0xFFFFFFFF);
            text(c, link.label(), popX + 31, y + 5, 1f, TEXT, false);
            text(c, link.sub(), popX + 31, y + 15, .8f, MUTED, false);
            if (link.url() != null) text(c, ">", popX + popW - 14, y + 8, 1f, i == hovered ? TEXT : FAINT, false);
        }
    }

    // ---------- Input in reference units ----------
    @Override
    public boolean mouseClicked(double mouseX, double mouseY, int button) {
        double mx = mouseX / u, my = mouseY / u;
        if (pickerOpen) {
            int index = thumbAt(mx, my);
            if (index >= 0) {
                SaviraClient.config.menuBackground = backdrops.get(index).id();
                SaviraClient.config.save();
                SaviraSounds.play(SaviraSounds.Sound.CLICK);
            }
            if (index >= 0 || !(mx >= pickerX && mx < pickerX + pickerW && my >= pickerY && my < pickerY + pickerH)) pickerOpen = false;
            return true;
        }
        if (popover != Popover.NONE) {
            int index = linkAt(mx, my);
            if (index >= 0 && links.get(index).url() != null) { ConfirmLinkScreen.open(this, links.get(index).url(), true); popover = Popover.NONE; return true; }
            boolean inside = mx >= popX && mx < popX + popW && my >= popY && my < popY + popHeight();
            if (!inside) popover = Popover.NONE;
            if (inside) return true;
        }
        return super.mouseClicked(mx, my, button);
    }
    @Override public boolean mouseReleased(double x, double y, int button) { return super.mouseReleased(x / u, y / u, button); }
    @Override public boolean mouseDragged(double x, double y, int button, double dx, double dy) { return super.mouseDragged(x / u, y / u, button, dx / u, dy / u); }
    @Override
    public boolean keyPressed(int keyCode, int scanCode, int modifiers) {
        if (keyCode == 256 && (pickerOpen || popover != Popover.NONE)) { pickerOpen = false; popover = Popover.NONE; return true; }
        return super.keyPressed(keyCode, scanCode, modifiers);
    }
    @Override
    public void tick() {
        // News turn by themselves, but not while the mouse rests on the card.
        double mx = client.mouse.getX() * width / client.getWindow().getWidth() / u, my = client.mouse.getY() * height / client.getWindow().getHeight() / u;
        boolean hovered = showNews && mx >= newsX && mx < newsX + newsW && my >= newsY && my < newsY + newsH;
        if (hovered) newsSince = Math.max(newsSince, Util.getMeasuringTimeMs() - NEWS_INTERVAL + 1500);
        else if (Util.getMeasuringTimeMs() - newsSince > NEWS_INTERVAL) showNews(newsIndex + 1);
    }

    // ---------- Rendering ----------
    @Override
    public void renderBackground(DrawContext c, int mouseX, int mouseY, float delta) {
        // The chosen panorama turns like Minecraft's own one, blurred; only a light veil for readability.
        Backdrop current = backdrop();
        RotatingCubeMapRenderer custom = current == CURRENT ? null : SaviraPanoramas.renderer(current.id());
        if (custom != null) custom.render(c, width, height, 1f, delta);
        else renderPanoramaBackground(c, delta);
        applyBlur(delta);
        c.fill(0, 0, width, height, 0x38000000);
        c.fillGradient(0, height - height / 5, width, height, 0, 0x70000000);
    }

    @Override
    public void render(DrawContext c, int mouseX, int mouseY, float delta) {
        renderBackground(c, mouseX, mouseY, delta);
        int mx = (int) Math.floor(mouseX / u), my = (int) Math.floor(mouseY / u);
        boolean overlay = pickerOpen || popover != Popover.NONE;
        hoveredTool = null; toolFade = 0;
        c.getMatrices().push();
        c.getMatrices().scale(u, u, 1);
        // Logo above the buttons, fading in first.
        float k = ease((Util.getMeasuringTimeMs() - openedAt) / (float) INTRO);
        int top = Math.max(150, sh / 2 - 61);
        RenderSystem.enableBlend();
        RenderSystem.setShaderColor(1f, 1f, 1f, Math.max(.01f, k));
        MenuStyle.logo(c, sw / 2 - 32, top - 82 + Math.round((1 - k) * 8), 4, 0xFFFFFFFF);
        c.draw();
        RenderSystem.setShaderColor(1f, 1f, 1f, 1f);
        for (var child : children()) if (child instanceof ButtonWidget b) b.render(c, overlay ? -1000 : mx, overlay ? -1000 : my, delta);
        // Label above the hovered tool, like Lunar's "Minecraft Settings · Minecraft".
        if (hoveredTool != null) {
            ButtonWidget tool = children().stream().filter(w -> w instanceof ToolButton t && t.tool == hoveredTool).map(w -> (ButtonWidget) w).findFirst().orElse(null);
            if (tool != null) {
                float tw = Math.max(width(hoveredTool.title(), 1f), width(hoveredTool.sub(), .8f) + 10) + 14;
                int bx = Math.round(tool.getX() + tool.getWidth() / 2f - tw / 2f), by = tool.getY() - 32;
                c.getMatrices().push();
                c.getMatrices().translate(0, (1 - toolFade) * 4, 0);
                RenderSystem.setShaderColor(1f, 1f, 1f, toolFade);
                box(c, bx, by, tw, 27, 4, 0xF00F1012);
                text(c, hoveredTool.title(), bx + 7, by + 6, 1f, TEXT, false);
                icon(c, hoveredTool.icon() == null ? PixelIcons.LINK : hoveredTool.icon(), bx + 7, by + 17.5f, .6f, MUTED);
                text(c, hoveredTool.sub(), bx + 15, by + 17, .8f, MUTED, false);
                c.draw();
                RenderSystem.setShaderColor(1f, 1f, 1f, 1f);
                c.getMatrices().pop();
            }
        }
        // Bottom left: client and version. Bottom right: the notice Mojang asks for.
        String version = "Savira Client " + SharedConstants.getGameVersion().getName() + " (v" + launcherVersion() + ")";
        text(c, version, 8, sh - 14, .95f, 0xB0FFFFFF, false);
        String notice = "Not affiliated with Mojang or Microsoft. Do not distribute!";
        text(c, notice, sw - 8 - width(notice, .95f), sh - 14, .95f, 0x99FFFFFF, false);
        if (pickerOpen) renderPicker(c, mx, my);
        if (popover != Popover.NONE) renderPopover(c, mx, my);
        c.getMatrices().pop();
    }

    /** For the UI test. */
    public int newsIndex() { return newsIndex; }
    public boolean newsVisible() { return showNews; }
    public String backgroundId() { return backdrop().id(); }
    public boolean pickerOpen() { return pickerOpen; }
    /** For the UI test: shows the Discord banner as if hovered, for the screenshot. */
    public void previewBanner(boolean on) { bannerPreview = on; }
    /** For the UI test: chooses a panorama by its label as a click would. */
    public boolean choosePanorama(String label) {
        for (Backdrop option : backdrops) if (option.label().equals(label)) { SaviraClient.config.menuBackground = option.id(); SaviraClient.config.save(); pickerOpen = false; return true; }
        return false;
    }

    @Override
    public boolean shouldCloseOnEsc() { return false; }
}

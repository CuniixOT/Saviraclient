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
import net.minecraft.client.gui.tooltip.Tooltip;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.client.toast.SystemToast;
import net.minecraft.text.Text;
import net.minecraft.util.Identifier;
import net.minecraft.util.Util;
import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Savira's main menu in place of the vanilla title screen, in the launcher's style:
 * slim top bar, logo and greeting, flat buttons with pixel icons, rotating news bottom left,
 * Discord bottom right and a picker for the panoramas of earlier Minecraft updates.
 */
public final class SaviraTitleScreen extends Screen {
    private static final Pattern DISCORD = Pattern.compile("^https://(discord\\.gg|(www\\.)?discord\\.com/invite)/[A-Za-z0-9-]{2,32}$");
    private static final int DISCORD_BLURPLE = 0xFF5865F2;
    private static final int GLASS = 0xC80C0F13, GLASS_HOVER = 0xE0141920, EDGE = 0xFF252A32, ICON = 0xFFD7DCE1;
    /** Nearly square corners everywhere in this menu, for a flat, sharp look. */
    private static final int CORNER = 1;
    private static final long NEWS_INTERVAL = 6500, NEWS_FADE = 450;

    // 10x10 pixel icons, drawn in one colour like the launcher's line icons.
    private static final String[] ICON_PLAYER = { "...####...", "..######..", "..######..", "..######..", "...####...", "..........", ".########.", "##########", "##########", "##########" };
    private static final String[] ICON_GLOBE = { "...####...", ".##.##.##.", ".#..##..#.", "##########", "#...##...#", "#...##...#", "##########", ".#..##..#.", ".##.##.##.", "...####..." };
    private static final String[] ICON_GEAR = { "....##....", ".#.####.#.", "..######..", ".###..###.", "####..####", "####..####", ".###..###.", "..######..", ".#.####.#.", "....##...." };
    private static final String[] ICON_LANGUAGE = { "#########.", "#.......#.", "#..###..#.", "#.#...#.#.", "#.#####.#.", "#.#...#.#.", "#.......#.", "#########.", "..##......", ".#........" };
    private static final String[] ICON_EYE = { "..........", "..######..", ".#......#.", "#...##...#", "#..####..#", "#..####..#", "#...##...#", ".#......#.", "..######..", ".........." };
    private static final String[] ICON_IMAGE = { "##########", "#........#", "#.##.....#", "#.##.....#", "#......#.#", "#.....####", "#..#.#####", "#.########", "##########", ".........." };

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

    private final String version = FabricLoader.getInstance().getModContainer("savira").map(m -> m.getMetadata().getVersion().getFriendlyString()).orElse("");
    private int heroY, newsIndex, previousNews = -1;
    private long newsSince = Util.getMeasuringTimeMs();
    private boolean showNews, pickerOpen;
    private int newsX, newsY, newsW, newsH, pickerX, pickerY, pickerW, pickerH, pickerCols;
    private static final int THUMB_W = 84, THUMB_H = 62, THUMB_GAP = 6;

    public SaviraTitleScreen() { super(Text.literal("Savira")); }

    static void icon(DrawContext c, String[] rows, int x, int y, int px, int color) {
        for (int row = 0; row < rows.length; row++) {
            String line = rows[row];
            for (int col = 0; col < line.length(); col++) if (line.charAt(col) == '#') c.fill(x + col * px, y + row * px, x + (col + 1) * px, y + (row + 1) * px, color);
        }
    }

    private Backdrop backdrop() {
        String id = SaviraClient.config.menuBackground;
        return backdrops.stream().filter(b -> b.id().equals(id)).findFirst().orElse(CURRENT);
    }

    @Override
    protected void init() {
        // Centre block: logo + greeting, two play tiles, two buttons, quit link.
        int tileW = Math.min(124, (width - 46) / 2), blockW = tileW * 2 + 6, left = (width - blockW) / 2;
        int blockH = 46 + 44 + 6 + 22 + 22;
        heroY = Math.max(34, (height - blockH) / 2 - 10);
        int tilesY = heroY + 50;
        addDrawableChild(playTile(left, tilesY, tileW, 44, "Einzelspieler", "Deine Welten", ICON_PLAYER, b -> client.setScreen(new SelectWorldScreen(this))));
        addDrawableChild(playTile(left + tileW + 6, tilesY, tileW, 44, "Mehrspieler", "Online spielen", ICON_GLOBE, b -> client.setScreen(new MultiplayerScreen(this))));
        int rowY = tilesY + 50;
        addDrawableChild(wideButton(left, rowY, tileW, 22, "Mod-Menü", null, true, b -> client.setScreen(new HudScreen())));
        addDrawableChild(wideButton(left + tileW + 6, rowY, tileW, 22, "Einstellungen", ICON_GEAR, false, b -> client.setScreen(new OptionsScreen(this, client.options))));
        String quit = "Spiel beenden";
        int quitW = textRenderer.getWidth(quit) + 16;
        addDrawableChild(textButton((width - quitW) / 2, rowY + 28, quitW, 14, quit, b -> client.scheduleStop()));

        // Top bar right: account chip and small tools.
        int size = 18, barY = 8, right = width - 10;
        right -= size; addDrawableChild(toolButton(right, barY, size, "Screenshots-Ordner", ICON_IMAGE, b -> openScreenshots()));
        right -= size + 4; addDrawableChild(toolButton(right, barY, size, "Barrierefreiheit", ICON_EYE, b -> client.setScreen(new AccessibilityOptionsScreen(this, client.options))));
        right -= size + 4; addDrawableChild(toolButton(right, barY, size, "Sprache", ICON_LANGUAGE, b -> client.setScreen(new LanguageOptionsScreen(this, client.options, client.getLanguageManager()))));
        String name = client.getSession().getUsername();
        int chipW = textRenderer.getWidth(name) + 30;
        right -= chipW + 6;
        addDrawableChild(accountChip(right, barY, chipW, size, name));

        // Bottom corners: news (narrows on small windows, hides when there is no room) and Discord.
        int cardH = 36, cardW = 142;
        addDrawableChild(discordCard(width - cardW - 12, height - cardH - 22, cardW, cardH));
        newsW = Math.min(196, left - 24); newsH = 60 + 54; newsX = 12; newsY = height - newsH - 22;
        showNews = newsW >= 150 && newsY > heroY + 40;
        if (showNews) {
            addDrawableChild(newsCard());
            addDrawableChild(newsArrow(newsX + newsW - 36, newsY + newsH - 16, "<", -1));
            addDrawableChild(newsArrow(newsX + newsW - 20, newsY + newsH - 16, ">", 1));
        }

        // Bottom centre: background picker, opening upwards.
        String label = "Hintergrund";
        int bgW = textRenderer.getWidth(label) + 28, bgY = height - 40;
        addDrawableChild(backgroundButton((width - bgW) / 2, bgY, bgW, 16, label));
        List<Backdrop> list = new ArrayList<>(List.of(CURRENT));
        SaviraPanoramas.list().forEach(entry -> list.add(new Backdrop(entry.id(), entry.label())));
        backdrops = list;
        // The picker is an overlay drawn above everything (see render); at most four per row.
        // The panel keeps the width of four columns even with fewer panoramas, so nothing spills out.
        pickerCols = Math.max(1, Math.min(4, (width - 40 + THUMB_GAP) / (THUMB_W + THUMB_GAP)));
        int rows = (backdrops.size() + pickerCols - 1) / pickerCols;
        pickerW = pickerCols * (THUMB_W + THUMB_GAP) - THUMB_GAP + 12;
        pickerH = rows * (THUMB_H + THUMB_GAP) - THUMB_GAP + 24 + (backdrops.size() == 1 ? 14 : 0);
        pickerX = (width - pickerW) / 2;
        pickerY = Math.max(30, bgY - pickerH - 6);
    }

    private void openScreenshots() {
        File dir = new File(client.runDirectory, "screenshots");
        if (!dir.exists() && !dir.mkdirs()) return;
        Util.getOperatingSystem().open(dir);
    }

    private void showNews(int index) {
        previousNews = newsIndex;
        newsIndex = Math.floorMod(index, NEWS.size());
        newsSince = Util.getMeasuringTimeMs();
    }

    private void setPicker(boolean open) { pickerOpen = open; }

    /** Index of the panorama under the mouse in the open picker, or -1. */
    private int thumbAt(double mx, double my) {
        for (int i = 0; i < backdrops.size(); i++) {
            int x = pickerX + 6 + (i % pickerCols) * (THUMB_W + THUMB_GAP), y = pickerY + 18 + (i / pickerCols) * (THUMB_H + THUMB_GAP);
            if (mx >= x && mx < x + THUMB_W && my >= y && my < y + THUMB_H) return i;
        }
        return -1;
    }

    @Override
    public void tick() {
        // News turn by themselves, but not while the mouse rests on the card.
        double mx = client.mouse.getX() * width / client.getWindow().getWidth(), my = client.mouse.getY() * height / client.getWindow().getHeight();
        boolean hovered = showNews && mx >= newsX && mx < newsX + newsW && my >= newsY && my < newsY + newsH;
        if (hovered) newsSince = Math.max(newsSince, Util.getMeasuringTimeMs() - NEWS_INTERVAL + 1500);
        else if (Util.getMeasuringTimeMs() - newsSince > NEWS_INTERVAL) showNews(newsIndex + 1);
    }

    @Override
    public boolean mouseClicked(double mouseX, double mouseY, int button) {
        // While the picker is open it takes every click: choose a panorama, or close it.
        if (pickerOpen) {
            int index = thumbAt(mouseX, mouseY);
            if (index >= 0) {
                SaviraClient.config.menuBackground = backdrops.get(index).id();
                SaviraClient.config.save();
                client.getSoundManager().play(net.minecraft.client.sound.PositionedSoundInstance.master(net.minecraft.sound.SoundEvents.UI_BUTTON_CLICK, 1f));
            }
            boolean inside = mouseX >= pickerX && mouseX < pickerX + pickerW && mouseY >= pickerY && mouseY < pickerY + pickerH;
            if (index >= 0 || !inside) setPicker(false);
            return true;
        }
        return super.mouseClicked(mouseX, mouseY, button);
    }

    /** For the UI test: chooses a panorama by its label as a click would. */
    public boolean choosePanorama(String label) {
        for (Backdrop option : backdrops) if (option.label().equals(label)) { SaviraClient.config.menuBackground = option.id(); SaviraClient.config.save(); setPicker(false); return true; }
        return false;
    }
    public boolean pickerOpen() { return pickerOpen; }

    @Override
    public boolean keyPressed(int keyCode, int scanCode, int modifiers) {
        if (keyCode == 256 && pickerOpen) { setPicker(false); return true; }
        return super.keyPressed(keyCode, scanCode, modifiers);
    }

    private ButtonWidget playTile(int x, int y, int w, int h, String label, String sub, String[] glyph, ButtonWidget.PressAction action) {
        return new ButtonWidget(x, y, w, h, Text.literal(label), action, n -> n.get()) {
            @Override
            protected void renderWidget(DrawContext c, int mouseX, int mouseY, float delta) {
                boolean hover = isHovered() || isFocused();
                int top = getY() - (hover ? 1 : 0);
                MenuStyle.outlined(c, getX(), top, getWidth(), getHeight(), CORNER, hover ? MenuStyle.launcherAccentAlpha(0xD0) : EDGE, hover ? GLASS_HOVER : GLASS);
                // Accent bar on the left, icon, then label and subline.
                c.fill(getX() + 1, top + 1, getX() + 3, top + getHeight() - 1, hover ? MenuStyle.launcherAccent() : 0x30FFFFFF);
                icon(c, glyph, getX() + 13, top + (getHeight() - 20) / 2, 2, hover ? MenuStyle.launcherAccent() : ICON);
                c.drawTextWithShadow(textRenderer, textRenderer.trimToWidth(label, getWidth() - 50), getX() + 42, top + 12, MenuStyle.TEXT);
                c.drawText(textRenderer, textRenderer.trimToWidth(sub, getWidth() - 50), getX() + 42, top + 24, hover ? 0xFFB4BCC5 : MenuStyle.MUTED, false);
            }
        };
    }

    private ButtonWidget wideButton(int x, int y, int w, int h, String label, String[] glyph, boolean accent, ButtonWidget.PressAction action) {
        return new ButtonWidget(x, y, w, h, Text.literal(label), action, n -> n.get()) {
            @Override
            protected void renderWidget(DrawContext c, int mouseX, int mouseY, float delta) {
                boolean hover = isHovered() || isFocused();
                int contentW = textRenderer.getWidth(label) + 16, cx = getX() + (getWidth() - contentW) / 2, ty = getY() + (getHeight() - 8) / 2;
                if (accent) {
                    MenuStyle.raised(c, getX(), getY(), getWidth(), getHeight(), CORNER, hover ? MenuStyle.shade(MenuStyle.launcherAccent(), 1.08f) : MenuStyle.launcherAccent(), false);
                    MenuStyle.logo(c, cx - 3, getY() + (getHeight() - 16) / 2 - 1, 1, MenuStyle.ON_ACCENT, false);
                    c.drawText(textRenderer, label, cx + 16, ty, MenuStyle.ON_ACCENT, false);
                    return;
                }
                MenuStyle.outlined(c, getX(), getY(), getWidth(), getHeight(), CORNER, hover ? MenuStyle.launcherAccentAlpha(0xD0) : EDGE, hover ? GLASS_HOVER : GLASS);
                icon(c, glyph, cx, getY() + (getHeight() - 10) / 2, 1, hover ? MenuStyle.launcherAccent() : ICON);
                c.drawTextWithShadow(textRenderer, label, cx + 16, ty, MenuStyle.TEXT);
            }
        };
    }

    private ButtonWidget textButton(int x, int y, int w, int h, String label, ButtonWidget.PressAction action) {
        return new ButtonWidget(x, y, w, h, Text.literal(label), action, n -> n.get()) {
            @Override
            protected void renderWidget(DrawContext c, int mouseX, int mouseY, float delta) {
                boolean hover = isHovered() || isFocused();
                int color = hover ? 0xFFFF8F8F : 0xFF79828C;
                c.drawCenteredTextWithShadow(textRenderer, label, getX() + getWidth() / 2, getY() + (getHeight() - 8) / 2, color);
                if (hover) c.fill(getX() + 8, getY() + getHeight() - 2, getX() + getWidth() - 8, getY() + getHeight() - 1, 0x80FF8F8F);
            }
        };
    }

    private ButtonWidget toolButton(int x, int y, int size, String label, String[] glyph, ButtonWidget.PressAction action) {
        ButtonWidget button = new ButtonWidget(x, y, size, size, Text.literal(label), action, n -> n.get()) {
            @Override
            protected void renderWidget(DrawContext c, int mouseX, int mouseY, float delta) {
                boolean hover = isHovered() || isFocused();
                MenuStyle.outlined(c, getX(), getY(), getWidth(), getHeight(), CORNER, hover ? MenuStyle.launcherAccentAlpha(0xC0) : EDGE, hover ? GLASS_HOVER : GLASS);
                icon(c, glyph, getX() + (getWidth() - 10) / 2, getY() + (getHeight() - 10) / 2, 1, hover ? MenuStyle.launcherAccent() : 0xFFC4CAD1);
            }
        };
        button.setTooltip(Tooltip.of(Text.literal(label)));
        return button;
    }

    private ButtonWidget accountChip(int x, int y, int w, int h, String name) {
        ButtonWidget chip = new ButtonWidget(x, y, w, h, Text.literal(name), b -> {}, n -> n.get()) {
            @Override
            protected void renderWidget(DrawContext c, int mouseX, int mouseY, float delta) {
                MenuStyle.outlined(c, getX(), getY(), getWidth(), getHeight(), CORNER, EDGE, GLASS);
                PlayerSkinDrawer.draw(c, client.getSkinProvider().getSkinTextures(client.getGameProfile()), getX() + 4, getY() + 3, 12);
                c.drawTextWithShadow(textRenderer, name, getX() + 22, getY() + (getHeight() - 8) / 2, MenuStyle.TEXT);
            }
        };
        chip.setTooltip(Tooltip.of(Text.literal("Angemeldet als " + name)));
        return chip;
    }

    private ButtonWidget backgroundButton(int x, int y, int w, int h, String label) {
        ButtonWidget button = new ButtonWidget(x, y, w, h, Text.literal(label), b -> setPicker(!pickerOpen), n -> n.get()) {
            @Override
            protected void renderWidget(DrawContext c, int mouseX, int mouseY, float delta) {
                boolean hover = isHovered() || isFocused() || pickerOpen;
                MenuStyle.outlined(c, getX(), getY(), getWidth(), getHeight(), CORNER, hover ? MenuStyle.launcherAccentAlpha(0xC0) : EDGE, hover ? GLASS_HOVER : GLASS);
                icon(c, ICON_IMAGE, getX() + 6, getY() + 3, 1, hover ? MenuStyle.launcherAccent() : 0xFFC4CAD1);
                c.drawText(textRenderer, label, getX() + 21, getY() + 4, hover ? MenuStyle.TEXT : 0xFFB4BCC5, false);
            }
        };
        button.setTooltip(Tooltip.of(Text.literal("Minecraft-Panorama für das Hauptmenü wählen")));
        return button;
    }

    private void renderPicker(DrawContext c, int mouseX, int mouseY) {
        c.getMatrices().push();
        c.getMatrices().translate(0, 0, 300);
        c.fill(0, 0, width, height, 0x60000000);
        MenuStyle.outlined(c, pickerX, pickerY, pickerW, pickerH, CORNER, MenuStyle.launcherAccentAlpha(0x90), 0xF20C0F13);
        c.drawText(textRenderer, "MINECRAFT-PANORAMA", pickerX + 7, pickerY + 6, MenuStyle.launcherAccent(), false);
        int hovered = thumbAt(mouseX, mouseY);
        for (int i = 0; i < backdrops.size(); i++) {
            Backdrop option = backdrops.get(i);
            int x = pickerX + 6 + (i % pickerCols) * (THUMB_W + THUMB_GAP), y = pickerY + 18 + (i / pickerCols) * (THUMB_H + THUMB_GAP), imageH = THUMB_H - 16;
            boolean hover = i == hovered, selected = option == backdrop();
            c.fill(x - 1, y - 1, x + THUMB_W + 1, y + imageH + 1, selected ? MenuStyle.launcherAccent() : hover ? 0xFF8A939D : EDGE);
            c.enableScissor(x, y, x + THUMB_W, y + imageH);
            Identifier thumb = option == CURRENT ? PANORAMA_THUMB : SaviraPanoramas.thumbnail(option.id());
            if (thumb != null) drawPicture(c, thumb, 128, 128, x, y, THUMB_W, imageH, 1f);
            else c.fill(x, y, x + THUMB_W, y + imageH, 0xFF161A1F);
            c.disableScissor();
            int color = selected ? MenuStyle.launcherAccent() : hover ? MenuStyle.TEXT : MenuStyle.MUTED;
            c.drawCenteredTextWithShadow(textRenderer, textRenderer.trimToWidth(option.label(), THUMB_W), x + THUMB_W / 2, y + imageH + 5, color);
        }
        if (backdrops.size() == 1) c.drawText(textRenderer, textRenderer.trimToWidth("Weitere Panoramen lädt der Launcher …", pickerW - 14), pickerX + 7, pickerY + pickerH - 13, MenuStyle.MUTED, false);
        c.getMatrices().pop();
    }

    /** Bottom left: the latest news with its picture, turning every few seconds. Click: next. */
    private ButtonWidget newsCard() {
        ButtonWidget card = new ButtonWidget(newsX, newsY, newsW, newsH, Text.literal("Neuigkeiten"), b -> showNews(newsIndex + 1), n -> n.get()) {
            @Override
            protected void renderWidget(DrawContext c, int mouseX, int mouseY, float delta) {
                boolean hover = isHovered() || isFocused();
                MenuStyle.outlined(c, getX(), getY(), getWidth(), getHeight(), CORNER, hover ? MenuStyle.launcherAccentAlpha(0x90) : EDGE, hover ? GLASS_HOVER : GLASS);
                int ix = getX() + 4, iy = getY() + 4, iw = getWidth() - 8, ih = 56;
                float fade = Math.min(1f, (Util.getMeasuringTimeMs() - newsSince) / (float) NEWS_FADE);
                c.enableScissor(ix, iy, ix + iw, iy + ih);
                if (previousNews >= 0 && fade < 1f) drawPicture(c, NEWS.get(previousNews).texture(), 600, 184, ix, iy, iw, ih, 1f);
                drawPicture(c, NEWS.get(newsIndex).texture(), 600, 184, ix, iy, iw, ih, fade);
                c.disableScissor();
                News news = NEWS.get(newsIndex);
                int tx = getX() + 9, ty = iy + ih + 6;
                int textAlpha = Math.max(0x10, (int) (fade * 255)) << 24;
                c.drawText(textRenderer, news.kicker().toUpperCase(java.util.Locale.ROOT), tx, ty, textAlpha | (MenuStyle.launcherAccent() & 0xFFFFFF), false);
                c.drawText(textRenderer, news.date(), getX() + getWidth() - 9 - textRenderer.getWidth(news.date()), ty, textAlpha | 0x6C757F, false);
                c.drawTextWithShadow(textRenderer, textRenderer.trimToWidth(news.title(), getWidth() - 18), tx, ty + 12, textAlpha | 0xEEF1F4);
                c.drawText(textRenderer, textRenderer.trimToWidth(news.body(), getWidth() - 18), tx, ty + 24, textAlpha | 0x8A939D, false);
                // Page dots, the current one long, plus a thin progress line under the picture.
                for (int i = 0; i < NEWS.size(); i++) {
                    int dw = i == newsIndex ? 8 : 3;
                    int dx = tx + i * 6 + (i > newsIndex ? 5 : 0);
                    c.fill(dx, getY() + getHeight() - 11, dx + dw, getY() + getHeight() - 9, i == newsIndex ? MenuStyle.launcherAccent() : 0x50FFFFFF);
                }
                float progress = Math.min(1f, (Util.getMeasuringTimeMs() - newsSince) / (float) NEWS_INTERVAL);
                c.fill(ix, iy + ih - 2, ix + (int) (iw * progress), iy + ih, MenuStyle.launcherAccentAlpha(0xC0));
            }
        };
        card.setTooltip(Tooltip.of(Text.literal("Neuigkeiten · Klick für die nächste")));
        return card;
    }

    /** Draws a picture so that it covers the slot, centred, with the given opacity. */
    private static void drawPicture(DrawContext c, Identifier texture, int texW, int texH, int x, int y, int w, int h, float alpha) {
        RenderSystem.enableBlend();
        RenderSystem.defaultBlendFunc();
        c.setShaderColor(1f, 1f, 1f, alpha);
        float scale = Math.max(w / (float) texW, h / (float) texH);
        int dw = Math.round(texW * scale), dh = Math.round(texH * scale);
        c.drawTexture(texture, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh, 0, 0, texW, texH, texW, texH);
        c.setShaderColor(1f, 1f, 1f, 1f);
    }

    private ButtonWidget newsArrow(int x, int y, String label, int step) {
        return new ButtonWidget(x, y, 14, 12, Text.literal(step < 0 ? "Vorherige Neuigkeit" : "Nächste Neuigkeit"), b -> showNews(newsIndex + step), n -> n.get()) {
            @Override
            protected void renderWidget(DrawContext c, int mouseX, int mouseY, float delta) {
                boolean hover = isHovered() || isFocused();
                MenuStyle.round(c, getX(), getY(), getWidth(), getHeight(), CORNER, hover ? MenuStyle.launcherAccentAlpha(0x50) : 0x18FFFFFF);
                c.drawCenteredTextWithShadow(textRenderer, label, getX() + getWidth() / 2 + 1, getY() + 2, hover ? MenuStyle.TEXT : MenuStyle.MUTED);
            }
        };
    }

    private ButtonWidget discordCard(int x, int y, int w, int h) {
        String url = SaviraClient.config.discordUrl == null ? "" : SaviraClient.config.discordUrl.trim();
        boolean ready = DISCORD.matcher(url).matches();
        ButtonWidget card = new ButtonWidget(x, y, w, h, Text.literal("Discord beitreten"), b -> {
            if (ready) ConfirmLinkScreen.open(this, url, true);
            else SystemToast.add(client.getToastManager(), SystemToast.Type.PERIODIC_NOTIFICATION, Text.literal("Discord"), Text.literal("Der Einladungslink folgt bald."));
        }, n -> n.get()) {
            @Override
            protected void renderWidget(DrawContext c, int mouseX, int mouseY, float delta) {
                boolean hover = isHovered() || isFocused();
                int top = getY() - (hover ? 1 : 0);
                MenuStyle.outlined(c, getX(), top, getWidth(), getHeight(), CORNER, hover ? DISCORD_BLURPLE : EDGE, hover ? 0xE8171A2E : GLASS);
                int ix = getX() + 8, iy = top + 8;
                MenuStyle.raised(c, ix, iy, 20, 20, CORNER, DISCORD_BLURPLE, false);
                c.fill(ix + 5, iy + 6, ix + 15, iy + 13, 0xFFFFFFFF);
                c.fill(ix + 4, iy + 8, ix + 16, iy + 13, 0xFFFFFFFF);
                c.fill(ix + 6, iy + 13, ix + 8, iy + 14, 0xFFFFFFFF);
                c.fill(ix + 12, iy + 13, ix + 14, iy + 14, 0xFFFFFFFF);
                c.fill(ix + 7, iy + 9, ix + 9, iy + 11, DISCORD_BLURPLE);
                c.fill(ix + 11, iy + 9, ix + 13, iy + 11, DISCORD_BLURPLE);
                c.drawTextWithShadow(textRenderer, "Discord", ix + 28, top + 9, MenuStyle.TEXT);
                c.drawText(textRenderer, ready ? "Community beitreten" : "Bald verfügbar", ix + 28, top + 20, MenuStyle.MUTED, false);
                c.drawText(textRenderer, ">", getX() + getWidth() - 12, top + (getHeight() - 8) / 2, hover ? 0xFF8C96FF : 0xFF5D656F, false);
            }
        };
        card.setTooltip(Tooltip.of(Text.literal(ready ? "Öffnet die Savira-Community auf Discord" : "Der Discord-Link wird noch eingerichtet")));
        return card;
    }

    @Override
    public void renderBackground(DrawContext c, int mouseX, int mouseY, float delta) {
        // The chosen panorama turns like Minecraft's own one, blurred and darkened for readability.
        Backdrop current = backdrop();
        RotatingCubeMapRenderer custom = current == CURRENT ? null : SaviraPanoramas.renderer(current.id());
        if (custom != null) custom.render(c, width, height, 1f, delta);
        else renderPanoramaBackground(c, delta);
        applyBlur(delta);
        c.fillGradient(0, 0, width, height, 0x90080A0D, 0xC8080A0D);
        c.fillGradient(0, 0, width, 34, 0x70000000, 0x00000000);
        c.fillGradient(0, height - 90, width, height, 0x00000000, 0xA0000000);
    }

    @Override
    public void render(DrawContext c, int mouseX, int mouseY, float delta) {
        super.render(c, mouseX, mouseY, delta);
        // Top bar left: small mark and name, like the launcher's title bar.
        MenuStyle.logo(c, 8, 7, 1, MenuStyle.launcherAccent(), false);
        c.drawTextWithShadow(textRenderer, "Savira", 26, 13, MenuStyle.TEXT);
        String shown = SaviraClient.config.launcherVersion == null || SaviraClient.config.launcherVersion.isBlank() ? version : SaviraClient.config.launcherVersion;
        int vx = 26 + textRenderer.getWidth("Savira") + 6, vw = textRenderer.getWidth("v" + shown) + 8;
        MenuStyle.round(c, vx, 11, vw, 12, CORNER, 0x18FFFFFF);
        c.drawText(textRenderer, "v" + shown, vx + 4, 13, 0xFF9AA3AD, false);

        // Hero: mark and wordmark centred, greeting below.
        int scale = 3, wordW = textRenderer.getWidth("SAVIRA") * scale, markW = 30, gap = 8;
        int total = markW + gap + wordW, left = (width - total) / 2;
        MenuStyle.logo(c, left - 2, heroY - 3, 2, MenuStyle.launcherAccent());
        c.getMatrices().push();
        c.getMatrices().translate(left + markW + gap, heroY + 3, 0);
        c.getMatrices().scale(scale, scale, 1);
        c.drawText(textRenderer, "SAVIRA", 0, 1, MenuStyle.shade(MenuStyle.launcherAccent(), .4f), false);
        c.drawText(textRenderer, "SAVIRA", 0, 0, MenuStyle.TEXT, false);
        c.getMatrices().pop();
        String greeting = "Willkommen zurück, " + client.getSession().getUsername();
        c.drawCenteredTextWithShadow(textRenderer, greeting, width / 2, heroY + 34, 0xFFA7B0BA);

        // Footer: versions and the required Mojang notice, small and centred.
        String footer = "Savira " + shown + "  ·  Minecraft " + SharedConstants.getGameVersion().getName() + "  ·  Copyright Mojang AB. Nicht verbreiten!";
        c.drawCenteredTextWithShadow(textRenderer, footer, width / 2, height - 12, 0xFF59616A);
        if (pickerOpen) renderPicker(c, mouseX, mouseY);
    }

    /** For the UI test. */
    public int newsIndex() { return newsIndex; }
    public boolean newsVisible() { return showNews; }
    public String backgroundId() { return backdrop().id(); }

    @Override
    public boolean shouldCloseOnEsc() { return false; }
}

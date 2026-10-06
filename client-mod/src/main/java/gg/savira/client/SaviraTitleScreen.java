package gg.savira.client;

import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.SharedConstants;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.PlayerSkinDrawer;
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
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.text.Text;
import net.minecraft.util.Util;
import java.io.File;
import java.util.regex.Pattern;

/** Savira's main menu in place of the vanilla title screen (FastClient/Feather style). */
public final class SaviraTitleScreen extends Screen {
    private static final Pattern DISCORD = Pattern.compile("^https://(discord\\.gg|(www\\.)?discord\\.com/invite)/[A-Za-z0-9-]{2,32}$");
    private static final int DISCORD_BLURPLE = 0xFF5865F2;
    private final String version = FabricLoader.getInstance().getModContainer("savira").map(m -> m.getMetadata().getVersion().getFriendlyString()).orElse("");
    private int logoY, quitBottom;

    public SaviraTitleScreen() { super(Text.literal("Savira")); }

    @Override
    protected void init() {
        int buttonWidth = Math.min(170, width - 40), x = (width - buttonWidth) / 2, h = 20, gap = 4;
        int stackHeight = 4 * h + 3 * gap + 14 + h;
        int top = Math.max(64, (height - stackHeight) / 2 + 18);
        logoY = top - 44;
        addDrawableChild(MenuStyle.menuButton(x, top, buttonWidth, h, "Einzelspieler", Items.GRASS_BLOCK, MenuStyle.Variant.NORMAL, b -> client.setScreen(new SelectWorldScreen(this))));
        addDrawableChild(MenuStyle.menuButton(x, top + (h + gap), buttonWidth, h, "Mehrspieler", Items.ENDER_PEARL, MenuStyle.Variant.NORMAL, b -> client.setScreen(new MultiplayerScreen(this))));
        addDrawableChild(MenuStyle.menuButton(x, top + 2 * (h + gap), buttonWidth, h, "Mod-Menü", Items.COMPASS, MenuStyle.Variant.ACCENT, b -> client.setScreen(new HudScreen())));
        addDrawableChild(MenuStyle.menuButton(x, top + 3 * (h + gap), buttonWidth, h, "Einstellungen", Items.COMPARATOR, MenuStyle.Variant.NORMAL, b -> client.setScreen(new OptionsScreen(this, client.options))));
        int quitWidth = Math.min(110, buttonWidth), quitY = top + 4 * (h + gap) + 10;
        addDrawableChild(MenuStyle.menuButton((width - quitWidth) / 2, quitY, quitWidth, h, "Spiel beenden", null, MenuStyle.Variant.DANGER, b -> client.scheduleStop()));
        quitBottom = quitY + h;

        // Toolbar top right: account chip plus icon buttons, like the reference clients.
        int size = 18, toolbarY = 8, right = width - 8;
        right -= size; addDrawableChild(toolbarButton(right, toolbarY, size, "Mod-Menü", null, true, b -> client.setScreen(new HudScreen())));
        right -= size + 4; addDrawableChild(toolbarButton(right, toolbarY, size, "Screenshots-Ordner", Items.PAINTING, false, b -> openScreenshots()));
        right -= size + 4; addDrawableChild(toolbarButton(right, toolbarY, size, "Barrierefreiheit", Items.SPYGLASS, false, b -> client.setScreen(new AccessibilityOptionsScreen(this, client.options))));
        right -= size + 4; addDrawableChild(toolbarButton(right, toolbarY, size, "Sprache", Items.BOOK, false, b -> client.setScreen(new LanguageOptionsScreen(this, client.options, client.getLanguageManager()))));
        String name = client.getSession().getUsername();
        int chipWidth = textRenderer.getWidth(name) + 30;
        right -= chipWidth + 4;
        addDrawableChild(accountChip(right, toolbarY, chipWidth, size, name));

        // Discord card bottom right.
        int cardWidth = 132, cardHeight = 34;
        addDrawableChild(discordCard(width - cardWidth - 10, height - cardHeight - 10, cardWidth, cardHeight));
    }

    private void openScreenshots() {
        File dir = new File(client.runDirectory, "screenshots");
        if (!dir.exists() && !dir.mkdirs()) return;
        Util.getOperatingSystem().open(dir);
    }

    private ButtonWidget toolbarButton(int x, int y, int size, String label, Item icon, boolean accent, ButtonWidget.PressAction action) {
        ButtonWidget button = new ButtonWidget(x, y, size, size, Text.literal(label), action, narration -> narration.get()) {
            @Override
            protected void renderWidget(DrawContext c, int mouseX, int mouseY, float delta) {
                boolean hover = isHovered() || isFocused();
                if (accent) {
                    MenuStyle.raised(c, getX(), getY(), getWidth(), getHeight(), 4, hover ? MenuStyle.shade(MenuStyle.launcherAccent(), 1.1f) : MenuStyle.launcherAccent(), false);
                    // The S spans x 2..14 and y 1..16 (with its shadow) on the 16 grid; centre that box.
                    MenuStyle.logo(c, getX() + (getWidth() - 12) / 2 - 2, getY() + (getHeight() - 2 - 14) / 2 - 1, 1, MenuStyle.ON_ACCENT, false);
                    return;
                }
                MenuStyle.outlined(c, getX(), getY(), getWidth(), getHeight(), 4, hover ? MenuStyle.launcherAccentAlpha(0xC0) : 0xFF2A2F37, hover ? 0xF0222831 : 0xD8101317);
                c.getMatrices().push();
                c.getMatrices().translate(getX() + 3, getY() + 3, 0);
                c.getMatrices().scale(.75f, .75f, 1);
                c.drawItem(new ItemStack(icon), 0, 0);
                c.getMatrices().pop();
            }
        };
        button.setTooltip(Tooltip.of(Text.literal(label)));
        return button;
    }

    private ButtonWidget accountChip(int x, int y, int w, int h, String name) {
        ButtonWidget chip = new ButtonWidget(x, y, w, h, Text.literal(name), b -> {}, narration -> narration.get()) {
            @Override
            protected void renderWidget(DrawContext c, int mouseX, int mouseY, float delta) {
                MenuStyle.outlined(c, getX(), getY(), getWidth(), getHeight(), 4, 0xFF2A2F37, 0xD8101317);
                PlayerSkinDrawer.draw(c, client.getSkinProvider().getSkinTextures(client.getGameProfile()), getX() + 4, getY() + 3, 12);
                c.drawTextWithShadow(textRenderer, name, getX() + 22, getY() + (getHeight() - 8) / 2, MenuStyle.TEXT);
            }
        };
        chip.setTooltip(Tooltip.of(Text.literal("Angemeldet als " + name)));
        return chip;
    }

    private ButtonWidget discordCard(int x, int y, int w, int h) {
        String url = SaviraClient.config.discordUrl == null ? "" : SaviraClient.config.discordUrl.trim();
        boolean ready = DISCORD.matcher(url).matches();
        ButtonWidget card = new ButtonWidget(x, y, w, h, Text.literal("Discord beitreten"), b -> {
            if (ready) ConfirmLinkScreen.open(this, url, true);
            else SystemToast.add(client.getToastManager(), SystemToast.Type.PERIODIC_NOTIFICATION, Text.literal("Discord"), Text.literal("Der Einladungslink folgt bald."));
        }, narration -> narration.get()) {
            @Override
            protected void renderWidget(DrawContext c, int mouseX, int mouseY, float delta) {
                boolean hover = isHovered() || isFocused();
                int lift = hover ? -1 : 0, top = getY() + lift;
                MenuStyle.outlined(c, getX(), top, getWidth(), getHeight(), 6, hover ? 0xFF5865F2 : 0xFF2A2F37, hover ? 0xF0171A2E : 0xD8101317);
                // Discord mark: blurple tile with the controller-face silhouette in white pixels.
                int ix = getX() + 7, iy = top + 7;
                MenuStyle.raised(c, ix, iy, 20, 20, 5, DISCORD_BLURPLE, false);
                c.fill(ix + 5, iy + 6, ix + 15, iy + 13, 0xFFFFFFFF);
                c.fill(ix + 4, iy + 8, ix + 16, iy + 13, 0xFFFFFFFF);
                c.fill(ix + 6, iy + 13, ix + 8, iy + 14, 0xFFFFFFFF);
                c.fill(ix + 12, iy + 13, ix + 14, iy + 14, 0xFFFFFFFF);
                c.fill(ix + 7, iy + 9, ix + 9, iy + 11, DISCORD_BLURPLE);
                c.fill(ix + 11, iy + 9, ix + 13, iy + 11, DISCORD_BLURPLE);
                c.drawTextWithShadow(textRenderer, "Discord", ix + 27, top + 8, MenuStyle.TEXT);
                c.drawText(textRenderer, ready ? "Community beitreten" : "Bald verfügbar", ix + 27, top + 19, MenuStyle.MUTED, false);
                c.drawText(textRenderer, ">", getX() + getWidth() - 11, top + (getHeight() - 8) / 2, hover ? 0xFF8C96FF : 0xFF5D656F, false);
            }
        };
        card.setTooltip(Tooltip.of(Text.literal(ready ? "Öffnet die Savira-Community auf Discord" : "Der Discord-Link wird noch eingerichtet")));
        return card;
    }

    @Override
    public void renderBackground(DrawContext c, int mouseX, int mouseY, float delta) {
        // Vanilla's rotating panorama, blurred, then a vignette so the menu stays readable.
        renderPanoramaBackground(c, delta);
        applyBlur(delta);
        c.fillGradient(0, 0, width, height, 0x88000000, 0xB0000000);
        c.fillGradient(0, height - 60, width, height, 0x00000000, 0x90000000);
    }

    @Override
    public void render(DrawContext c, int mouseX, int mouseY, float delta) {
        super.render(c, mouseX, mouseY, delta);
        // Logo: pixel "S" plus wordmark, centred above the buttons.
        int scale = 2, wordWidth = textRenderer.getWidth("SAVIRA") * scale, logoSize = 26, gap = 8;
        int total = logoSize + gap + wordWidth, left = (width - total) / 2;
        MenuStyle.logo(c, left - 1, logoY - 2, 2, MenuStyle.launcherAccent());
        c.getMatrices().push();
        c.getMatrices().translate(left + logoSize + gap, logoY + 3, 0);
        c.getMatrices().scale(scale, scale, 1);
        c.drawText(textRenderer, "SAVIRA", 0, 1, MenuStyle.shade(MenuStyle.launcherAccent(), .45f), false);
        c.drawText(textRenderer, "SAVIRA", 0, 0, MenuStyle.TEXT, false);
        c.getMatrices().pop();
        c.drawText(textRenderer, "CLIENT", left + logoSize + gap + 1, logoY + 23, MenuStyle.launcherAccent(), false);

        String shown = SaviraClient.config.launcherVersion == null || SaviraClient.config.launcherVersion.isBlank() ? version : SaviraClient.config.launcherVersion;
        String footer = "Savira " + shown + "  ·  Minecraft " + SharedConstants.getGameVersion().getName();
        c.drawCenteredTextWithShadow(textRenderer, footer, width / 2, quitBottom + 8, 0xFF6C757F);
        c.drawTextWithShadow(textRenderer, "Copyright Mojang AB. Nicht verbreiten!", 8, height - 14, 0xFF59616A);
    }

    @Override
    public boolean shouldCloseOnEsc() { return false; }
}

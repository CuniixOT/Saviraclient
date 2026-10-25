package gg.savira.test;

import gg.savira.client.HudConfig;
import gg.savira.client.HudModule;
import gg.savira.client.HudScreen;
import gg.savira.client.SaviraClient;
import gg.savira.client.SaviraHud;
import gg.savira.client.SaviraTitleScreen;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.screen.TitleScreen;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.client.gui.widget.TextFieldWidget;
import net.minecraft.client.util.ScreenshotRecorder;
import org.lwjgl.glfw.GLFW;
import org.slf4j.LoggerFactory;

public final class MenuSmokeTest implements ClientModInitializer {
    private int ticks, stage, scrolledFrom;
    private Screen screen;
    private void check(boolean value, String message) { if (!value) throw new IllegalStateException(message); }
    private void button(String text) {
        ButtonWidget button = screen.children().stream().filter(w -> w instanceof ButtonWidget b && b.getMessage().getString().startsWith(text)).map(w -> (ButtonWidget) w).findFirst().orElseThrow();
        button.onPress();
    }
    private ButtonWidget widget(String text) {
        return screen.children().stream().filter(w -> w instanceof ButtonWidget b && b.getMessage().getString().startsWith(text)).map(w -> (ButtonWidget) w).findFirst().orElseThrow(() -> new IllegalStateException("Widget missing: " + text));
    }
    private boolean widgetExists(String text) {
        return screen.children().stream().anyMatch(w -> w instanceof ButtonWidget b && b.getMessage().getString().startsWith(text));
    }
    /** Window widgets live in menu units; the screen takes gui coordinates. */
    private void click(ButtonWidget widget, double dx, double dy, int mouse) {
        float u = ((HudScreen) screen).unit();
        screen.mouseClicked((widget.getX() + dx) * u, (widget.getY() + dy) * u, mouse);
    }
    private void screenshot(MinecraftClient mc, String name) {
        ScreenshotRecorder.saveScreenshot(mc.runDirectory, name + ".png", mc.getFramebuffer(), message -> {});
    }
    @Override
    public void onInitializeClient() {
        ClientTickEvents.END_CLIENT_TICK.register(mc -> {
            if (stage == -1) return;
            if (stage == 0 && (mc.getOverlay() != null || !(mc.currentScreen instanceof TitleScreen || mc.currentScreen instanceof SaviraTitleScreen))) return;
            if (++ticks % 25 != 0) return;
            try {
                switch (stage++) {
                    case 0 -> {
                        check(mc.currentScreen instanceof SaviraTitleScreen, "Savira title screen not shown");
                        // A loud launcher accent: the main menu must follow it, the mod menu must stay mint.
                        SaviraClient.config.accent = 0xE5566B;
                        // Own cape from the launcher: config/savira-cape.png must become a texture.
                        SaviraClient.config.customCape = true;
                        check(gg.savira.client.SaviraCape.texture() != null, "Custom cape texture not loaded");
                        // GUI scale 2 on the big test window: room for the news card bottom left.
                        mc.options.getGuiScale().setValue(2);
                        mc.onResolutionChanged();
                        SaviraTitleScreen title = (SaviraTitleScreen) mc.currentScreen;
                        check(title.newsVisible(), "News card hidden on a wide screen");
                        int shown = title.newsIndex();
                        screen = title; button("Nächste Neuigkeit");
                        check(title.newsIndex() == (shown + 1) % 4, "News arrow did not turn the page");
                        check(widgetExists("Einzelspieler") && widgetExists("Mehrspieler") && widgetExists("Discord"), "Main menu buttons missing");
                        // Panorama picker: choose the Nether Update panorama (downloaded from Mojang), it must stick.
                        button("Hintergrund");
                        check(title.pickerOpen(), "Panorama picker did not open");
                        check(title.choosePanorama("Nether Update"), "Nether Update missing in the picker");
                        check(title.backgroundId().equals("nether") && "nether".equals(SaviraClient.config.menuBackground), "Panorama choice not applied");
                        check(gg.savira.client.SaviraPanoramas.renderer("nether") != null, "Nether panorama not loaded");
                        button("Hintergrund");
                    }
                    case 1 -> {
                        screenshot(mc, "savira-menu-title");
                        check(gg.savira.client.MenuStyle.launcherAccent() == 0xFFE5566B, "Main menu does not use the launcher accent");
                        check(gg.savira.client.MenuStyle.accent() == 0xFFE5566B, "Mod menu must follow the launcher accent");
                        SaviraClient.config = new HudConfig(); SaviraClient.config.accent = 0xE5566B; screen = new HudScreen(); mc.setScreen(screen);
                    }
                    case 2 -> {
                        screenshot(mc, "savira-menu-home");
                        // The start page edits the HUD directly: drag RAM, then hide it with its red X.
                        SaviraHud.Bounds ram = SaviraHud.bounds(HudModule.RAM, screen.width, screen.height);
                        float ramX = SaviraClient.config.placement(HudModule.RAM).x;
                        screen.mouseClicked(ram.x() + 8, ram.y() + 8, 0);
                        screen.mouseDragged(ram.x() - 60, ram.y() + 30, 0, -68, 22);
                        screen.mouseReleased(ram.x() - 60, ram.y() + 30, 0);
                        check(SaviraClient.config.placement(HudModule.RAM).x != ramX, "Start page drag failed");
                        ram = SaviraHud.bounds(HudModule.RAM, screen.width, screen.height);
                        screen.mouseClicked(ram.x() + ram.width() + 1, ram.y() - 3, 0);
                        check(!HudModule.RAM.enabled(), "Red X did not hide the module");
                        HudModule.RAM.toggle();
                        // NEU follows the release date: Icon is new, FPS (released earlier) is not.
                        check(HudModule.NAMETAG.isNew() && HudModule.ICON.isNew() && !HudModule.FPS.isNew(), "NEU tag does not follow the release date");
                        button("Mod-Menü");
                    }
                    case 3 -> {
                        screenshot(mc, "savira-menu-modules");
                        check(HudModule.values().length == 12, "Module count");
                        button("FPS-Anzeige"); check(!HudModule.FPS.enabled(), "Module toggle failed");
                        check(gg.savira.client.SaviraToasts.any(), "No notification after toggling a module");
                        // Headphones button: UI sounds off and on again, saved.
                        button("UI-Sounds"); check(!SaviraClient.config.uiSounds && !HudConfig.load().uiSounds, "UI sounds not turned off");
                        button("UI-Sounds"); check(SaviraClient.config.uiSounds, "UI sounds not turned back on");
                        // New modules come first in the grid.
                        ButtonWidget first = screen.children().stream().filter(w -> w instanceof ButtonWidget b && b.getMessage().getString().contains(": ")).map(w -> (ButtonWidget) w).findFirst().orElseThrow();
                        check(first.getMessage().getString().startsWith("Nametag"), "Newest module not on top: " + first.getMessage().getString());
                        LoggerFactory.getLogger("SaviraUITest").info("Savira-Sounds bereit: " + gg.savira.client.SaviraSounds.ready());
                        button("FPS-Anzeige"); check(HudModule.FPS.enabled(), "Module re-enable failed");
                        button("Effekte"); check(!HudModule.POTIONS.enabled(), "Potion toggle failed");
                        button("Effekte"); check(HudModule.POTIONS.enabled(), "Potion re-enable failed");
                        // The HUD stays editable around the mod menu window: drag the FPS display.
                        SaviraHud.Bounds fps = SaviraHud.bounds(HudModule.FPS, screen.width, screen.height);
                        float fpsY = SaviraClient.config.placement(HudModule.FPS).y;
                        screen.mouseClicked(fps.x() + 6, fps.y() + 6, 0);
                        screen.mouseDragged(fps.x() + 6, fps.y() + 40, 0, 0, 34);
                        screen.mouseReleased(fps.x() + 6, fps.y() + 40, 0);
                        check(SaviraClient.config.placement(HudModule.FPS).y != fpsY, "HUD not draggable behind the mod menu");
                        // Right click on a card opens its settings page.
                        click(widget("FPS-Anzeige"), 12, 12, 1);
                    }
                    case 4 -> {
                        screenshot(mc, "savira-menu-settings");
                        check(widgetExists("HUD-Skalierung") || widgetExists("Dark Panel"), "Settings page not opened");
                        // DARK_PANEL -> TOOLTIP -> BLUR -> COLOR
                        for (int i = 0; i < 3; i++) {
                            ButtonWidget cycle = widget(gg.savira.client.HudBackground.parse(SaviraClient.config.style(HudModule.FPS).background).label);
                            click(cycle, cycle.getWidth() - 6, 5, 0);
                        }
                        check(SaviraClient.config.style(HudModule.FPS).background.equals("COLOR"), "Background cycle failed: " + SaviraClient.config.style(HudModule.FPS).background);
                        check(widgetExists("Hintergrundfarbe") && widgetExists("Textfarbe") && widgetExists("Deckkraft"), "Colour swatches missing for COLOR background: " + screen.children().stream().map(w -> w instanceof ButtonWidget b ? b.getMessage().getString() : w.getClass().getSimpleName()).toList());
                        // Slider: the reset "x" brings the scale back to 100 %.
                        SaviraClient.config.placement(HudModule.FPS).size = 1.5f;
                        click(widget("HUD-Skalierung"), 55, 6, 0);
                        check(SaviraClient.config.placement(HudModule.FPS).size == 1f, "Slider reset failed");
                        // Colour picker: open it from the text colour swatch and pick on the hue bar.
                        button("Textfarbe");
                        gg.savira.client.ColorPicker picker = ((HudScreen) screen).picker();
                        check(picker != null, "Colour picker did not open");
                        int before = SaviraClient.config.style(HudModule.FPS).textColor;
                        float u = ((HudScreen) screen).unit();
                        screen.mouseClicked((picker.x + 19 + 30) * u, (picker.y + 68) * u, 0);
                        screen.mouseReleased((picker.x + 19 + 30) * u, (picker.y + 68) * u, 0);
                        check(SaviraClient.config.style(HudModule.FPS).textColor != before, "Picking a colour did not change the text colour");
                        TextFieldWidget text = screen.children().stream().filter(w -> w instanceof TextFieldWidget).map(w -> (TextFieldWidget) w).findFirst().orElseThrow();
                        text.setText("{value} Bilder");
                        check("{value} Bilder".equals(SaviraClient.config.style(HudModule.FPS).text), "Text template not stored");
                        check("{value} Bilder".equals(HudConfig.load().style(HudModule.FPS).text), "Style persistence failed");
                    }
                    case 5 -> {
                        screenshot(mc, "savira-menu-settings-color");
                        screen.keyPressed(GLFW.GLFW_KEY_ESCAPE, 0, 0);
                        check(((HudScreen) screen).picker() == null, "Escape did not close the colour picker");
                        // Dark look: sun/moon button, saved, then the settings and grid in dark.
                        button("Dunkles Design");
                        check(SaviraClient.config.menuDark && HudConfig.load().menuDark, "Dark menu not stored");
                    }
                    case 6 -> {
                        screenshot(mc, "savira-menu-settings-dark");
                        screen.keyPressed(GLFW.GLFW_KEY_ESCAPE, 0, 0);
                        check(widgetExists("FPS-Anzeige"), "Escape from settings did not return to mods");
                        TextFieldWidget search = screen.children().stream().filter(w -> w instanceof TextFieldWidget).map(w -> (TextFieldWidget) w).findFirst().orElseThrow();
                        search.setText("KeineTreffer123");
                    }
                    case 7 -> {
                        screenshot(mc, "savira-menu-empty");
                        check(screen.children().stream().filter(w -> w instanceof ButtonWidget b && b.getMessage().getString().contains(": aktiviert")).count() == 0, "Search failed");
                        TextFieldWidget search = screen.children().stream().filter(w -> w instanceof TextFieldWidget).map(w -> (TextFieldWidget) w).findFirst().orElseThrow();
                        search.setText("");
                        // Smooth scrolling: wheel down over the grid, the cards glide there over the next frames.
                        float u = ((HudScreen) screen).unit();
                        ButtonWidget first = widget("Nametag");
                        scrolledFrom = first.getY();
                        screen.mouseScrolled((first.getX() + 40) * u, (first.getY() + 20) * u, 0, -3);
                    }
                    case 8 -> {
                        ButtonWidget first = widget("Nametag");
                        check(first.getY() < scrolledFrom - 40, "Grid did not scroll smoothly: " + scrolledFrom + " -> " + first.getY());
                        screenshot(mc, "savira-menu-scrolled");
                        button("HUD-Editor");
                    }
                    case 9 -> {
                        button("Raster");
                        screenshot(mc, "savira-menu-editor");
                        SaviraHud.Bounds b = SaviraHud.bounds(HudModule.CPS, screen.width, screen.height);
                        float oldX = SaviraClient.config.placement(HudModule.CPS).x;
                        screen.mouseClicked(b.x() + 10, b.y() + 10, 0);
                        screen.mouseDragged(b.x() + 60, b.y() + 50, 0, 50, 40);
                        screen.mouseReleased(b.x() + 60, b.y() + 50, 0);
                        check(SaviraClient.config.placement(HudModule.CPS).x != oldX, "Drag failed");
                        b = SaviraHud.bounds(HudModule.CPS, screen.width, screen.height);
                        screen.mouseScrolled(b.x() + 8, b.y() + 8, 0, 1);
                        check(SaviraClient.config.placement(HudModule.CPS).size > 1, "Scale failed");
                        screen.keyPressed(GLFW.GLFW_KEY_RIGHT, 0, 0);
                        check(HudConfig.load().placement(HudModule.CPS).size > 1, "Persistence failed");
                        screen.keyPressed(GLFW.GLFW_KEY_ESCAPE, 0, 0);
                    }
                    case 10 -> {
                        check(widgetExists("Mod-Menü"), "Escape navigation failed");
                        button("Cosmetics");
                    }
                    case 11 -> {
                        screenshot(mc, "savira-menu-feature");
                        screen.keyPressed(GLFW.GLFW_KEY_ESCAPE, 0, 0);
                        check(widgetExists("Mod-Menü"), "Escape from feature page failed");
                        button("Mod-Menü");
                        screen.children().stream().filter(w -> w instanceof TextFieldWidget).map(w -> (TextFieldWidget) w).findFirst().orElseThrow().setText("Icon");
                    }
                    case 12 -> {
                        // Icon module: right click opens its own settings page.
                        click(widget("Icon"), 12, 12, 1);
                    }
                    case 13 -> {
                        check(widgetExists("Creator Code") && widgetExists("Im Nametag anzeigen"), "Icon settings not shown");
                        button("Creator Code");
                        check("creator".equals(SaviraClient.config.iconType), "Icon choice not stored");
                        java.util.UUID self = mc.getSession().getUuidOrNull();
                        if (self != null) check(gg.savira.client.SaviraIcon.decorate(net.minecraft.text.Text.literal("Name"), self, true).getString().startsWith("\uE002"), "Icon not in front of the name");
                    }
                    case 14 -> {
                        screenshot(mc, "savira-menu-icon");
                        screen.keyPressed(GLFW.GLFW_KEY_ESCAPE, 0, 0);
                        screen.children().stream().filter(w -> w instanceof TextFieldWidget).map(w -> (TextFieldWidget) w).findFirst().orElseThrow().setText("Nametag");
                    }
                    case 15 -> {
                        // Nametag module: own settings page with the F5, shadow and background switches.
                        click(widget("Nametag"), 12, 12, 1);
                    }
                    case 16 -> {
                        check(widgetExists("In F5 anzeigen") && widgetExists("Textschatten") && widgetExists("Kein Hintergrund"), "Nametag settings not shown");
                        button("Textschatten"); button("Kein Hintergrund");
                        check(SaviraClient.config.nametagShadow && SaviraClient.config.nametagNoBackground, "Nametag switches not stored");
                        check(HudConfig.load().nametagNoBackground, "Nametag setting not saved");
                    }
                    case 17 -> {
                        screenshot(mc, "savira-menu-nametag");
                        // Closing the mod menu without a world calls setScreen(null); that must land on Savira's menu.
                        screen.close();
                    }
                    case 18 -> {
                        check(mc.currentScreen instanceof SaviraTitleScreen, "Closing the mod menu returned to the vanilla title screen: " + mc.currentScreen);
                        LoggerFactory.getLogger("SaviraUITest").info("SAVIRA_UI_SMOKE_OK: title, news, background, cape, home, home-drag, hide, new-tag, new-first, toasts, ui-sounds, icon, nametag, modules(12), settings, background, slider-reset, color-picker, dark-theme, smooth-scroll, text, search, editor, drag, scale, persistence, feature, back-to-title");
                        stage = -1;
                    }
                }
            } catch (Throwable failure) {
                LoggerFactory.getLogger("SaviraUITest").error("SAVIRA_UI_SMOKE_FAILED", failure); stage = -1;
            }
        });
    }
}

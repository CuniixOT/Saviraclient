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
import net.minecraft.client.util.ScreenshotRecorder;
import org.lwjgl.glfw.GLFW;
import org.slf4j.LoggerFactory;

public final class MenuSmokeTest implements ClientModInitializer {
    private int ticks, stage, scrolledFrom, lightWaits;
    private Screen screen;
    private void check(boolean value, String message) { if (!value) throw new IllegalStateException(message); }
    /** Widgets of the title screen, which uses Minecraft's buttons. */
    private void button(String text) {
        screen.children().stream().filter(w -> w instanceof net.minecraft.client.gui.widget.ButtonWidget b && b.getMessage().getString().startsWith(text))
            .map(w -> (net.minecraft.client.gui.widget.ButtonWidget) w).findFirst().orElseThrow(() -> new IllegalStateException("Widget missing: " + text)).onPress();
    }
    private boolean widgetExists(String text) {
        return screen.children().stream().anyMatch(w -> w instanceof net.minecraft.client.gui.widget.ButtonWidget b && b.getMessage().getString().startsWith(text));
    }
    private HudScreen menu() { return (HudScreen) screen; }
    /**
     * A stone platform high up (open sky: unlit blocks spawn at night), a torch in the middle and a closed
     * stone room on one side (no light at all: spawnable any time). Built again while it has not reached the client.
     */
    private void buildPlatform(net.minecraft.server.integrated.IntegratedServer server) {
        server.execute(() -> {
            var world = server.getOverworld();
            var player = server.getPlayerManager().getPlayerList().get(0);
            int y = 200;
            for (int x = -12; x <= 12; x++) for (int z = -12; z <= 12; z++) {
                world.setBlockState(new net.minecraft.util.math.BlockPos(x, y - 1, z), net.minecraft.block.Blocks.STONE.getDefaultState());
                for (int h = 0; h < 6; h++) world.setBlockState(new net.minecraft.util.math.BlockPos(x, y + h, z), net.minecraft.block.Blocks.AIR.getDefaultState());
            }
            for (int x = 1; x <= 8; x++) for (int z = -4; z <= 4; z++) for (int h = 0; h <= 3; h++) {
                boolean shell = h == 3 || x == 1 || x == 8 || z == -4 || z == 4;
                if (shell) world.setBlockState(new net.minecraft.util.math.BlockPos(x, y + h, z), net.minecraft.block.Blocks.STONE.getDefaultState());
            }
            world.setBlockState(new net.minecraft.util.math.BlockPos(-5, y, 0), net.minecraft.block.Blocks.TORCH.getDefaultState());
            world.setTimeOfDay(6000);
            // Hovering over the corner, looking at the torch and the room.
            player.getAbilities().allowFlying = true; player.getAbilities().flying = true; player.sendAbilitiesUpdate();
            player.teleport(world, -12.5, y + 7, -10.5, -48f, 38f);
        });
    }
    private void screenshot(MinecraftClient mc, String name) {
        ScreenshotRecorder.saveScreenshot(mc.runDirectory, name + ".png", mc.getFramebuffer(), message -> {});
    }
    private void erase(int count) { for (int i = 0; i < count; i++) screen.keyPressed(GLFW.GLFW_KEY_BACKSPACE, 0, 0); }
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
                        screenshot(mc, "savira-menu-title-idle");
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
                        screen = title; title.click("Nächste Neuigkeit");
                        check(title.newsIndex() == (shown + 1) % 4, "News arrow did not turn the page");
                        check(title.has("Einzelspieler") && title.has("Mehrspieler") && title.has("Discord beitreten") && title.has("Mod-Menü") && title.has("Store") && title.has("Beitreten: Hypixel"), "Main menu buttons missing");
                        LoggerFactory.getLogger("SaviraUITest").info("Schnell beitreten: " + title.serverStatus());
                        // Quick join folds up and opens again, remembered.
                        title.click("Schnell beitreten zuklappen");
                        check(!SaviraClient.config.quickJoinOpen && !HudConfig.load().quickJoinOpen, "Quick join did not fold up");
                        SaviraClient.config.quickJoinOpen = true;
                        // Panorama picker: choose the Nether Update panorama (downloaded from Mojang), it must stick.
                        title.click("Hintergrund wählen");
                        check(title.pickerOpen(), "Panorama picker did not open");
                        check(title.choosePanorama("Nether Update"), "Nether Update missing in the picker");
                        check(title.backgroundId().equals("nether") && "nether".equals(SaviraClient.config.menuBackground), "Panorama choice not applied");
                        check(gg.savira.client.SaviraPanoramas.renderer("nether") != null, "Nether panorama not loaded");
                        check(!title.pickerOpen(), "Picker still open after choosing");
                        title.previewBanner(true);
                    }
                    case 1 -> {
                        screenshot(mc, "savira-menu-title");
                        LoggerFactory.getLogger("SaviraUITest").info("Schnell beitreten (später): " + ((SaviraTitleScreen) mc.currentScreen).serverStatus());
                        check(gg.savira.client.MenuStyle.launcherAccent() == 0xFFE5566B, "Main menu does not use the launcher accent");
                        check(gg.savira.client.MenuStyle.accent() == 0xFFE5566B, "Mod menu must follow the launcher accent");
                        SaviraClient.config = new HudConfig(); SaviraClient.config.accent = 0xE5566B; screen = new HudScreen(); mc.setScreen(screen);
                    }
                    case 2 -> {
                        // The Right-Shift menu opens straight on the mod grid.
                        screenshot(mc, "savira-menu-modules");
                        HudScreen h = menu();
                        check(h.page().equals("MODS"), "Menu did not open on the mods: " + h.page());
                        check(HudModule.values().length == 14, "Module count");
                        check(HudModule.NAMETAG.isNew() && HudModule.ICON.isNew() && !HudModule.FPS.isNew(), "NEU tag does not follow the release date");
                        // New modules come first in the grid.
                        java.util.List<String> titles = java.util.Arrays.stream(HudModule.values()).map(m -> m.title).toList();
                        String first = h.labels().stream().filter(titles::contains).findFirst().orElse("");
                        check(first.equals("Emotes"), "Newest module not on top: " + first);
                        // The switch on a card turns the module off and on, with a notification.
                        h.click("FPS-Anzeige: An/Aus"); check(!HudModule.FPS.enabled(), "Module toggle failed");
                        check(gg.savira.client.SaviraToasts.any(), "No notification after toggling a module");
                        h.click("FPS-Anzeige: An/Aus"); check(HudModule.FPS.enabled(), "Module re-enable failed");
                        h.click("Effekte: An/Aus"); check(!HudModule.POTIONS.enabled(), "Potion toggle failed");
                        h.click("Effekte: An/Aus"); check(HudModule.POTIONS.enabled(), "Potion re-enable failed");
                        // A click on the card opens its settings.
                        h.click("FPS-Anzeige");
                        check(h.page().equals("DETAIL"), "Card click did not open the settings");
                    }
                    case 3 -> {
                        screenshot(mc, "savira-menu-settings");
                        HudScreen h = menu();
                        check(h.has("HUD-Skalierung") && h.has("Hintergrund") && h.has("Textfarbe") && h.has("Textschatten"), "Settings page incomplete: " + h.labels());
                        // DARK_PANEL -> TOOLTIP -> BLUR -> COLOR
                        for (int i = 0; i < 3; i++) h.click("Hintergrund");
                        check(SaviraClient.config.style(HudModule.FPS).background.equals("COLOR"), "Background cycle failed: " + SaviraClient.config.style(HudModule.FPS).background);
                    }
                    case 4 -> {
                        HudScreen h = menu();
                        check(h.has("Hintergrundfarbe") && h.has("Deckkraft"), "Colour rows missing for the COLOR background: " + h.labels());
                        // The reset arrow brings the scale back to 100 %.
                        SaviraClient.config.placement(HudModule.FPS).size = 1.5f;
                        h.click("HUD-Skalierung zurücksetzen");
                        check(SaviraClient.config.placement(HudModule.FPS).size == 1f, "Slider reset failed");
                        // Dragging the slider sets the scale.
                        double[] track = h.centerOf("HUD-Skalierung");
                        float u = h.unit();
                        screen.mouseClicked(track[0] + 90 * u, track[1], 0);
                        screen.mouseReleased(track[0] + 90 * u, track[1], 0);
                        check(SaviraClient.config.placement(HudModule.FPS).size > 1.5f, "Slider drag failed: " + SaviraClient.config.placement(HudModule.FPS).size);
                        // Text template: clear it and type a new one.
                        h.click("Text");
                        erase(20);
                        h.type("{value} Bilder");
                        check("{value} Bilder".equals(SaviraClient.config.style(HudModule.FPS).text), "Text template not stored");
                        check("{value} Bilder".equals(HudConfig.load().style(HudModule.FPS).text), "Style persistence failed");
                        // Colour picker: open it from the text colour and pick on the hue bar.
                        h.click("Textfarbe");
                        gg.savira.client.ColorPicker picker = h.picker();
                        check(picker != null, "Colour picker did not open");
                        int before = SaviraClient.config.style(HudModule.FPS).textColor;
                        screen.mouseClicked((picker.x + 14 + 70) * u, (picker.y + 109) * u, 0);
                        screen.mouseReleased((picker.x + 14 + 70) * u, (picker.y + 109) * u, 0);
                        check(SaviraClient.config.style(HudModule.FPS).textColor != before, "Picking a colour did not change the text colour");
                    }
                    case 5 -> {
                        screenshot(mc, "savira-menu-settings-color");
                        screen.keyPressed(GLFW.GLFW_KEY_ESCAPE, 0, 0);
                        check(menu().picker() == null, "Escape did not close the colour picker");
                        screen.keyPressed(GLFW.GLFW_KEY_ESCAPE, 0, 0);
                        check(menu().page().equals("MODS"), "Escape from the settings did not return to the mods");
                        // Dark look from the rail, saved.
                        menu().click("Dunkler Modus");
                        check(SaviraClient.config.menuDark && HudConfig.load().menuDark, "Dark menu not stored");
                    }
                    case 6 -> {
                        screenshot(mc, "savira-menu-dark");
                        HudScreen h = menu();
                        h.click("Mods suchen");
                        h.type("KeineTreffer123");
                    }
                    case 7 -> {
                        screenshot(mc, "savira-menu-empty");
                        HudScreen h = menu();
                        check(!h.has("FPS-Anzeige"), "Search failed");
                        erase(20);
                        check(SaviraClient.config != null, "");
                    }
                    case 8 -> {
                        HudScreen h = menu();
                        check(h.has("FPS-Anzeige"), "Clearing the search did not bring the mods back");
                        // The FPS settings are longer than the window: they scroll.
                        h.click("FPS-Anzeige");
                    }
                    case 9 -> {
                        // Smooth scrolling: wheel down over the page, it glides there over the next frames.
                        HudScreen h = menu();
                        check(h.scrollMax() > 0, "Settings page does not scroll");
                        double[] row = h.centerOf("HUD-Skalierung");
                        screen.mouseScrolled(row[0], row[1], 0, -3);
                    }
                    case 10 -> {
                        HudScreen h = menu();
                        check(h.scrollShown() > 40, "Page did not scroll smoothly: " + h.scrollShown());
                        screenshot(mc, "savira-menu-scrolled");
                        h.click("HUD-Editor");
                        check(h.page().equals("EDITOR"), "HUD editor did not open");
                    }
                    case 11 -> {
                        HudScreen h = menu();
                        boolean snap = SaviraClient.config.snap;
                        h.click("Raster");
                        check(SaviraClient.config.snap != snap, "Grid toggle failed");
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
                        // The red X hides RAM.
                        SaviraHud.Bounds ram = SaviraHud.bounds(HudModule.RAM, screen.width, screen.height);
                        screen.mouseClicked(ram.x() + ram.width() + 1, ram.y() - 4, 0);
                        check(!HudModule.RAM.enabled(), "Red X did not hide the module");
                        HudModule.RAM.toggle();
                        screen.keyPressed(GLFW.GLFW_KEY_ESCAPE, 0, 0);
                        check(h.page().equals("MODS"), "Escape did not leave the HUD editor");
                    }
                    case 12 -> { menu().click("Cosmetics"); }
                    case 13 -> {
                        screenshot(mc, "savira-menu-feature");
                        HudScreen h = menu();
                        check(h.page().equals("COSMETICS") && h.has("Emote-Rad öffnen"), "Cosmetics page incomplete");
                        h.click("Mods");
                    }
                    case 14 -> { menu().rightClick("Icon"); }
                    case 15 -> {
                        HudScreen h = menu();
                        check(h.has("Icon: Creator Code") && h.has("Im Nametag anzeigen"), "Icon settings not shown: " + h.labels());
                        h.click("Icon: Creator Code");
                        check("creator".equals(SaviraClient.config.iconType), "Icon choice not stored");
                        java.util.UUID self = mc.getSession().getUuidOrNull();
                        if (self != null) check(gg.savira.client.SaviraIcon.decorate(net.minecraft.text.Text.literal("Name"), self, true).getString().startsWith("\uE002"), "Icon not in front of the name");
                    }
                    case 16 -> {
                        screenshot(mc, "savira-menu-icon");
                        screen.keyPressed(GLFW.GLFW_KEY_ESCAPE, 0, 0);
                    }
                    case 17 -> {
                        HudScreen h = menu();
                        h.click("Mods suchen");
                        erase(10);
                        h.type("Nametag");
                    }
                    case 18 -> { menu().rightClick("Nametag"); }
                    case 19 -> {
                        HudScreen h = menu();
                        check(h.has("In F5 anzeigen") && h.has("Textschatten") && h.has("Kein Hintergrund"), "Nametag settings not shown");
                        h.click("Textschatten"); h.click("Kein Hintergrund");
                        check(SaviraClient.config.nametagShadow && SaviraClient.config.nametagNoBackground, "Nametag switches not stored");
                        check(HudConfig.load().nametagNoBackground, "Nametag setting not saved");
                        h.click("Einstellungen");
                    }
                    case 20 -> {
                        screenshot(mc, "savira-menu-nametag");
                        HudScreen h = menu();
                        check(h.page().equals("SETTINGS"), "Settings page did not open");
                        h.click("Akzent: Mint");
                        check("Mint".equals(SaviraClient.config.menuAccent) && "Mint".equals(HudConfig.load().menuAccent), "Accent not stored");
                        check(gg.savira.client.MenuStyle.accent() == 0xFFE5566B, "The HUD must keep the launcher accent");
                        h.click("UI-Sounds"); check(!SaviraClient.config.uiSounds && !HudConfig.load().uiSounds, "UI sounds not turned off");
                        h.click("UI-Sounds"); check(SaviraClient.config.uiSounds, "UI sounds not turned back on");
                        h.click("Animationen"); check(!SaviraClient.config.menuAnimations, "Animations not turned off");
                        h.click("Animationen");
                        h.click("Profile");
                    }
                    case 21 -> {
                        screenshot(mc, "savira-menu-preferences");
                        HudScreen h = menu();
                        check(h.page().equals("PROFILES"), "Profile chip did not open the profiles");
                        // A new profile takes the current setup; loading Standard brings FPS back.
                        h.click("Profil hinzufügen");
                        check(SaviraClient.config.profiles().size() == 2 && SaviraClient.config.activeProfile == 1, "Profile not added");
                        HudModule.FPS.toggle();
                        check(!HudModule.FPS.enabled(), "");
                    }
                    case 22 -> {
                        screenshot(mc, "savira-menu-profiles");
                        HudScreen h = menu();
                        h.click("Laden: Standard");
                        check(SaviraClient.config.activeProfile == 0 && HudModule.FPS.enabled(), "Loading the Standard profile did not restore FPS");
                        check(!SaviraClient.config.profiles().get(1).modules.get("FPS"), "The second profile lost its own setup");
                        h.click("Löschen: Profil 2");
                        check(SaviraClient.config.profiles().size() == 1, "Profile not deleted");
                        // Closing the mod menu without a world calls setScreen(null); that must land on Savira's menu.
                        screen.close();
                    }
                    case 23 -> {
                        check(mc.currentScreen instanceof SaviraTitleScreen, "Closing the mod menu returned to the vanilla title screen: " + mc.currentScreen);
                        // Light Level needs a world: start a fresh demo world (no account needed).
                        mc.createIntegratedServerLoader().createAndStart("SaviraLight" + System.currentTimeMillis(), net.minecraft.server.MinecraftServer.DEMO_LEVEL_INFO,
                            net.minecraft.world.gen.GeneratorOptions.DEMO_OPTIONS, net.minecraft.world.gen.WorldPresets::createDemoOptions, mc.currentScreen);
                    }
                    case 24 -> {
                        if (mc.player == null || mc.world == null || mc.getServer() == null || mc.getServer().getPlayerManager().getPlayerList().isEmpty()) { stage--; return; }
                        mc.setScreen(null);
                        mc.options.hudHidden = true;
                        // A stone platform high up (open sky: unlit blocks spawn at night), a torch in the middle
                        // and a closed stone room on one side (no light at all: spawnable any time).
                        buildPlatform(mc.getServer());
                    }
                    case 25 -> { mc.setScreen(null); }
                    case 26 -> {
                        mc.setScreen(null);
                        check(mc.player.getY() > 190, "Player not on the test platform: " + mc.player.getPos());
                        SaviraClient.config.lightLevel = true; SaviraClient.config.lightRange = 24;
                        SaviraClient.config.lightMode = "NUMBER"; gg.savira.client.LightLevel.rescanNow();
                    }
                    case 27 -> {
                        // Light is computed after the blocks change; give it up to ~12 s before judging.
                        boolean ready = gg.savira.client.LightLevel.count("SAFE") > 0 && gg.savira.client.LightLevel.count("NIGHT") > 0 && gg.savira.client.LightLevel.count("SPAWNABLE") > 0;
                        mc.setScreen(null);
                        if (!ready && ++lightWaits < 20) {
                            // The platform sometimes lands before the chunks are there: build it again.
                            if (!mc.world.getBlockState(new net.minecraft.util.math.BlockPos(0, 199, 0)).isOf(net.minecraft.block.Blocks.STONE)) buildPlatform(mc.getServer());
                            gg.savira.client.LightLevel.rescanNow(); stage--; return;
                        }
                        var below = mc.player.getBlockPos().down();
                        LoggerFactory.getLogger("SaviraUITest").info("Light-Debug: pos=" + mc.player.getBlockPos() + " unten=" + mc.world.getBlockState(below) + " an=" + SaviraClient.config.lightLevel + " block=" + mc.world.getLightLevel(net.minecraft.world.LightType.BLOCK, mc.player.getBlockPos()) + " himmel=" + mc.world.getLightLevel(net.minecraft.world.LightType.SKY, mc.player.getBlockPos()) + " versuche=" + lightWaits);
                        LoggerFactory.getLogger("SaviraUITest").info("Light Level: " + gg.savira.client.LightLevel.count("SAFE") + " sicher, " + gg.savira.client.LightLevel.count("NIGHT") + " nachts, " + gg.savira.client.LightLevel.count("SPAWNABLE") + " spawnbar");
                        check(gg.savira.client.LightLevel.count("SAFE") > 0, "No lit blocks around the torch");
                        check(gg.savira.client.LightLevel.count("NIGHT") > 0, "No open-sky blocks that spawn at night");
                        check(gg.savira.client.LightLevel.count("SPAWNABLE") > 0, "No dark blocks inside the closed room");
                        screenshot(mc, "savira-light-number");
                        SaviraClient.config.lightMode = "CROSS";
                    }
                    case 28 -> { screenshot(mc, "savira-light-cross"); SaviraClient.config.lightMode = "OUTLINE"; }
                    case 29 -> { screenshot(mc, "savira-light-outline"); SaviraClient.config.lightMode = "FILL"; }
                    case 30 -> {
                        screenshot(mc, "savira-light-fill");
                        // Only spawnable: the lit blocks disappear.
                        SaviraClient.config.lightOnlySpawnable = true; gg.savira.client.LightLevel.rescanNow();
                    }
                    case 31 -> {
                        check(gg.savira.client.LightLevel.count("SAFE") == 0 && gg.savira.client.LightLevel.spotCount() > 0, "Only spawnable still shows safe blocks");
                        // Settings page of the module, with the toggle key, range, mode and colours.
                        SaviraClient.config.lightOnlySpawnable = false;
                        mc.options.hudHidden = false;
                        screen = new HudScreen(); mc.setScreen(screen);
                    }
                    case 32 -> { menu().rightClick("Light Level"); }
                    case 33 -> {
                        HudScreen h = menu();
                        check(h.has("Taste") && h.has("Reichweite") && h.has("Spawnbar") && h.has("Nachts spawnbar") && h.has("Sicher"), "Light Level settings incomplete: " + h.labels());
                        h.click("Taste");
                        screen.keyPressed(GLFW.GLFW_KEY_L, 0, 0);
                        check(!SaviraClient.lightKey.isUnbound(), "Toggle key not bound");
                    }
                    case 34 -> {
                        screenshot(mc, "savira-light-settings");
                        screen.keyPressed(GLFW.GLFW_KEY_ESCAPE, 0, 0);
                    }
                    case 35 -> {
                        // The Emotes card opens the emote settings on right click.
                        check(menu().has("Emotes: An/Aus"), "Emotes module card missing");
                        menu().rightClick("Emotes");
                    }
                    case 36 -> {
                        HudScreen h = menu();
                        check(h.has("Taste") && h.has("Interaktions-Taste") && h.has("Automatisch wechseln") && h.has("Emote-Sounds")
                            && h.has("Sound-Spieler-Limit") && h.has("Audio-Reichweite") && h.has("Emote-Rad öffnen"), "Emote settings incomplete: " + h.labels());
                        check(!SaviraClient.emoteKey.isUnbound(), "Emote wheel key not bound by default");
                        screenshot(mc, "savira-emote-settings");
                        // Stand on the platform, the light off, and open the wheel.
                        SaviraClient.config.lightLevel = false;
                        var server = mc.getServer();
                        server.execute(() -> {
                            var player = server.getPlayerManager().getPlayerList().get(0);
                            player.getAbilities().flying = false; player.sendAbilitiesUpdate();
                            player.teleport(server.getOverworld(), -6.5, 200, -8.5, 0f, 10f);
                        });
                        mc.options.setPerspective(net.minecraft.client.option.Perspective.FIRST_PERSON);
                        mc.options.hudHidden = true;
                        mc.setScreen(new gg.savira.client.EmoteWheelScreen());
                    }
                    case 37 -> {
                        check(mc.currentScreen instanceof gg.savira.client.EmoteWheelScreen, "Emote wheel not open");
                        check(gg.savira.client.Emotes.slot(0) == gg.savira.client.Emote.byId("waving"), "First slot is not Winken");
                        screenshot(mc, "savira-emote-wheel");
                        mc.setScreen(new gg.savira.client.EmotePickerScreen(4));
                    }
                    case 38 -> {
                        var picker = (gg.savira.client.EmotePickerScreen) mc.currentScreen;
                        check(picker.cardCount() == gg.savira.client.Emote.ALL.size(), "Emote list incomplete: " + picker.cardCount());
                        screenshot(mc, "savira-emote-picker");
                        picker.chooseForTest("floss");
                        check(gg.savira.client.Emotes.slot(4) == gg.savira.client.Emote.byId("floss"), "Chosen emote not in slot 5");
                        check(mc.currentScreen instanceof gg.savira.client.EmoteWheelScreen, "Choosing did not go back to the wheel");
                    }
                    case 39 -> {
                        ((gg.savira.client.EmoteWheelScreen) mc.currentScreen).playSlotForTest(4);
                        check(mc.currentScreen == null, "Wheel still open after playing");
                        check(gg.savira.client.Emotes.current(mc.player) == gg.savira.client.Emote.byId("floss"), "Floss not playing");
                        check(mc.options.getPerspective() == net.minecraft.client.option.Perspective.THIRD_PERSON_FRONT, "Camera did not switch for the emote");
                    }
                    case 40 -> {
                        check(gg.savira.client.Emotes.current(mc.player) != null, "Looping emote ended by itself");
                        screenshot(mc, "savira-emote-floss");
                        gg.savira.client.Emotes.play(gg.savira.client.Emote.byId("sit"));
                    }
                    case 41 -> {
                        screenshot(mc, "savira-emote-sit");
                        gg.savira.client.Emotes.play(gg.savira.client.Emote.byId("waving"));
                    }
                    case 42 -> { screenshot(mc, "savira-emote-waving"); }
                    case 43 -> {}
                    case 44 -> {
                        // Winken is 2.4 s long: over by now, and the camera is back in first person.
                        check(gg.savira.client.Emotes.current(mc.player) == null, "Winken did not end");
                        check(mc.options.getPerspective().isFirstPerson(), "Camera not back in first person after the emote");
                        LoggerFactory.getLogger("SaviraUITest").info("SAVIRA_UI_SMOKE_OK: title, news, background, cape, home, home-drag, hide, new-tag, new-first, toasts, ui-sounds, icon, nametag, modules(14), menu(mods, profiles, settings, accent, dark), settings, background, slider-reset, color-picker, dark-theme, smooth-scroll, text, search, editor, drag, scale, persistence, feature, back-to-title, light-level(world, number, cross, outline, fill, only-spawnable, settings, key), emotes(settings, wheel, picker, slot, play, camera, loop, end)");
                        stage = -1;
                    }
                }
            } catch (Throwable failure) {
                LoggerFactory.getLogger("SaviraUITest").error("SAVIRA_UI_SMOKE_FAILED", failure); stage = -1;
            }
        });
    }
}

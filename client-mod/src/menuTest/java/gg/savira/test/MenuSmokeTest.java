package gg.savira.test;

import gg.savira.client.HudConfig;
import gg.savira.client.HudModule;
import gg.savira.client.HudScreen;
import gg.savira.client.SaviraClient;
import gg.savira.client.SaviraHud;
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
    private int ticks, stage;
    private Screen screen;
    private void check(boolean value, String message) { if (!value) throw new IllegalStateException(message); }
    private void button(String text) {
        ButtonWidget button = screen.children().stream().filter(w -> w instanceof ButtonWidget b && b.getMessage().getString().startsWith(text)).map(w -> (ButtonWidget) w).findFirst().orElseThrow();
        button.onPress();
    }
    private void screenshot(MinecraftClient mc, String name) {
        ScreenshotRecorder.saveScreenshot(mc.runDirectory, name + ".png", mc.getFramebuffer(), message -> {});
    }
    @Override
    public void onInitializeClient() {
        ClientTickEvents.END_CLIENT_TICK.register(mc -> {
            if (stage == -1) return;
            if (stage == 0 && !(mc.currentScreen instanceof TitleScreen)) return;
            if (++ticks % 25 != 0) return;
            try {
                switch (stage++) {
                    case 0 -> { SaviraClient.config = new HudConfig(); screen = new HudScreen(); mc.setScreen(screen); }
                    case 1 -> { screenshot(mc, "savira-menu-home"); button("Mod-Menü"); }
                    case 2 -> {
                        screenshot(mc, "savira-menu-modules");
                        check(HudModule.values().length == 10, "Module count");
                        button("FPS-Anzeige"); check(!HudModule.FPS.enabled(), "Module toggle failed");
                        button("Effekte"); check(!HudModule.POTIONS.enabled(), "Potion toggle failed");
                        button("Effekte"); check(HudModule.POTIONS.enabled(), "Potion re-enable failed");
                        TextFieldWidget search = screen.children().stream().filter(w -> w instanceof TextFieldWidget).map(w -> (TextFieldWidget) w).findFirst().orElseThrow();
                        search.setText("KeineTreffer123");
                    }
                    case 3 -> {
                        screenshot(mc, "savira-menu-empty");
                        check(screen.children().stream().filter(w -> w instanceof ButtonWidget b && b.getMessage().getString().contains(": aktiviert")).count() == 0, "Search failed");
                        TextFieldWidget search = screen.children().stream().filter(w -> w instanceof TextFieldWidget).map(w -> (TextFieldWidget) w).findFirst().orElseThrow();
                        search.setText(""); button("FPS-Anzeige"); button("Raster");
                    }
                    case 4 -> { screenshot(mc, "savira-menu-list"); button("HUD bearbeiten"); }
                    case 5 -> {
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
                    case 6 -> {
                        check(screen.children().stream().anyMatch(w -> w instanceof ButtonWidget b && b.getMessage().getString().equals("Mod-Menü")), "Escape navigation failed");
                        LoggerFactory.getLogger("SaviraUITest").info("SAVIRA_UI_SMOKE_OK: home, modules(10), search, list, editor, drag, scale, persistence");
                        stage = -1;
                    }
                }
            } catch (Throwable failure) {
                LoggerFactory.getLogger("SaviraUITest").error("SAVIRA_UI_SMOKE_FAILED", failure); stage = -1;
            }
        });
    }
}

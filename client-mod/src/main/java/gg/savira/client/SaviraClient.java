package gg.savira.client;

import net.minecraft.client.MinecraftClient;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.fabricmc.fabric.api.client.rendering.v1.WorldRenderEvents;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.util.InputUtil;
import org.lwjgl.glfw.GLFW;

public final class SaviraClient implements ClientModInitializer {
    public static HudConfig config;
    public static boolean zoomActive;
    private static Integer savedFov;
    /** Turns the Light Level module on and off; unbound until set in its settings. */
    public static KeyBinding lightKey;
    /** Opens the emote wheel (B, like NoRisk); joins another player's interactive emote (G). */
    public static KeyBinding emoteKey, emoteJoinKey;
    /** Opens and closes the Right-Shift menu; zooms while held. */
    public static KeyBinding menuKey, zoomKey;

    @Override
    public void onInitializeClient() {
        config = HudConfig.load();
        KeyBinding menu = menuKey = KeyBindingHelper.registerKeyBinding(new KeyBinding("key.savira.menu", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_RIGHT_SHIFT, "category.savira"));
        KeyBinding zoom = zoomKey = KeyBindingHelper.registerKeyBinding(new KeyBinding("key.savira.zoom", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_C, "category.savira"));
        lightKey = KeyBindingHelper.registerKeyBinding(new KeyBinding("key.savira.lightlevel", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_UNKNOWN, "category.savira"));
        emoteKey = KeyBindingHelper.registerKeyBinding(new KeyBinding("key.savira.emotes", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_B, "category.savira"));
        emoteJoinKey = KeyBindingHelper.registerKeyBinding(new KeyBinding("key.savira.emotejoin", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_G, "category.savira"));
        WorldRenderEvents.AFTER_TRANSLUCENT.register(LightLevel::render);
        ClientTickEvents.END_CLIENT_TICK.register(client -> {
            while (emoteKey.wasPressed()) {
                if (client.currentScreen != null || client.player == null) continue;
                if (!config.emotes) { SaviraToasts.show("Emotes", "Im Mod-Menü deaktiviert"); continue; }
                SaviraSounds.play(SaviraSounds.Sound.OPEN); client.setScreen(new EmoteWheelScreen());
            }
            while (emoteJoinKey.wasPressed()) {
                if (client.currentScreen == null && client.player != null) Emotes.join();
            }
            Emotes.tick(client);
            while (lightKey.wasPressed()) {
                if (client.currentScreen != null) continue;
                HudModule.LIGHT_LEVEL.toggle(); config.save();
                SaviraSounds.play(config.lightLevel ? SaviraSounds.Sound.ON : SaviraSounds.Sound.OFF);
                SaviraToasts.show("Light Level", config.lightLevel ? "Aktiviert" : "Deaktiviert");
            }
            LightLevel.tick(client);
            while (menu.wasPressed()) {
                if (client.currentScreen == null && client.player != null) client.setScreen(new HudScreen());
            }
            boolean want = config.zoom && zoom.isPressed() && client.player != null && client.currentScreen == null;
            zoomActive = want;
            if (want) {
                if (savedFov == null) savedFov = client.options.getFov().getValue();
                client.options.getFov().setValue(35);
            } else if (savedFov != null) {
                client.options.getFov().setValue(savedFov);
                savedFov = null;
            }
        });
        HudRenderCallback.EVENT.register((context, tickCounter) -> {
            SaviraHud.render(context);
            // Notifications keep running after the mod menu closes.
            if (SaviraToasts.any() && !(MinecraftClient.getInstance().currentScreen instanceof HudScreen)) SaviraToasts.render(context, context.getScaledWindowWidth());
        });
    }
}

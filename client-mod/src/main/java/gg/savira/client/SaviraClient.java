package gg.savira.client;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.util.InputUtil;
import org.lwjgl.glfw.GLFW;

public final class SaviraClient implements ClientModInitializer {
    public static HudConfig config;
    public static boolean zoomActive;
    private static Integer savedFov;

    @Override
    public void onInitializeClient() {
        config = HudConfig.load();
        KeyBinding menu = KeyBindingHelper.registerKeyBinding(new KeyBinding("key.savira.menu", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_RIGHT_SHIFT, "category.savira"));
        KeyBinding zoom = KeyBindingHelper.registerKeyBinding(new KeyBinding("key.savira.zoom", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_C, "category.savira"));
        ClientTickEvents.END_CLIENT_TICK.register(client -> {
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
        HudRenderCallback.EVENT.register((context, tickCounter) -> SaviraHud.render(context));
    }
}

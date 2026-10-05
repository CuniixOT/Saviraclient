package gg.savira.client.mixin;

import gg.savira.client.ClickTracker;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.Mouse;
import org.lwjgl.glfw.GLFW;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(Mouse.class)
public abstract class MouseMixin {
    @Inject(method = "onMouseButton", at = @At("HEAD"))
    private void savira$countClick(long window, int button, int action, int mods, CallbackInfo ci) {
        MinecraftClient client = MinecraftClient.getInstance();
        if (window == client.getWindow().getHandle() && action == GLFW.GLFW_PRESS && client.player != null && client.currentScreen == null) {
            ClickTracker.record(button);
        }
    }
}

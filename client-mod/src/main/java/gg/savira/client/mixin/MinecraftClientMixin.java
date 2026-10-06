package gg.savira.client.mixin;

import gg.savira.client.SaviraClient;
import gg.savira.client.SaviraTitleScreen;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.screen.TitleScreen;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyVariable;

/** Every way back to the main menu goes through setScreen, so swapping here covers them all. */
@Mixin(MinecraftClient.class)
public abstract class MinecraftClientMixin {
    // Screens that ask for the title screen directly.
    @ModifyVariable(method = "setScreen", at = @At("HEAD"), argsOnly = true)
    private Screen savira$replaceTitleScreen(Screen screen) {
        return swap(screen);
    }

    // setScreen(null) without a world: vanilla assigns `screen = new TitleScreen()` inside the
    // method, after HEAD. Closing the mod menu from the main menu takes exactly this path.
    @ModifyVariable(method = "setScreen", at = @At("STORE"), argsOnly = true)
    private Screen savira$replaceDefaultTitleScreen(Screen screen) {
        return swap(screen);
    }

    private static Screen swap(Screen screen) {
        if (screen instanceof TitleScreen && SaviraClient.config != null && SaviraClient.config.customTitleScreen) return new SaviraTitleScreen();
        return screen;
    }
}

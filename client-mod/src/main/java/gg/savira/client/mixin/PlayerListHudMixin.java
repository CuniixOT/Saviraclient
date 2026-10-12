package gg.savira.client.mixin;

import gg.savira.client.SaviraIcon;
import net.minecraft.client.gui.hud.PlayerListHud;
import net.minecraft.client.network.PlayerListEntry;
import net.minecraft.text.Text;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Mixin(PlayerListHud.class)
public abstract class PlayerListHudMixin {
    /** Icon module: Savira icon in front of the name in the tab list. */
    @Inject(method = "getPlayerName", at = @At("RETURN"), cancellable = true)
    private void savira$icon(PlayerListEntry entry, CallbackInfoReturnable<Text> cir) {
        cir.setReturnValue(SaviraIcon.decorate(cir.getReturnValue(), entry.getProfile().getId(), true));
    }
}

package gg.savira.client.mixin;

import gg.savira.client.HudConfig;
import gg.savira.client.SaviraClient;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.render.entity.LivingEntityRenderer;
import net.minecraft.entity.LivingEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Mixin(LivingEntityRenderer.class)
public abstract class LivingEntityRendererMixin {
    /** Nametag module: vanilla hides your own name; show it in third person (F5). */
    @Inject(method = "hasLabel(Lnet/minecraft/entity/LivingEntity;)Z", at = @At("RETURN"), cancellable = true)
    private void savira$ownNametag(LivingEntity entity, CallbackInfoReturnable<Boolean> cir) {
        HudConfig c = SaviraClient.config;
        MinecraftClient mc = MinecraftClient.getInstance();
        if (cir.getReturnValueZ() || c == null || !c.nametag || !c.nametagF5) return;
        if (entity == mc.player && entity == mc.getCameraEntity() && !mc.options.getPerspective().isFirstPerson()
                && MinecraftClient.isHudEnabled() && !entity.isInvisibleTo(mc.player) && !entity.hasPassengers()) {
            cir.setReturnValue(true);
        }
    }
}

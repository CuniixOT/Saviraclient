package gg.savira.client.mixin;

import gg.savira.client.Emotes;
import net.minecraft.client.render.VertexConsumerProvider;
import net.minecraft.client.render.entity.feature.HeldItemFeatureRenderer;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.entity.LivingEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(HeldItemFeatureRenderer.class)
public abstract class HeldItemFeatureRendererMixin {
    /** Immersive emotes: no items in the hands while emoting. */
    @Inject(method = "render(Lnet/minecraft/client/util/math/MatrixStack;Lnet/minecraft/client/render/VertexConsumerProvider;ILnet/minecraft/entity/LivingEntity;FFFFFF)V", at = @At("HEAD"), cancellable = true)
    private void savira$hideDuringEmote(MatrixStack matrices, VertexConsumerProvider vertices, int light, LivingEntity entity, float limbAngle, float limbDistance, float tickDelta, float age, float headYaw, float headPitch, CallbackInfo ci) {
        if (Emotes.hidesItems(entity)) ci.cancel();
    }
}

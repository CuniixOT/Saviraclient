package gg.savira.client.mixin;

import com.llamalad7.mixinextras.sugar.Local;
import gg.savira.client.Emotes;
import gg.savira.client.SaviraIcon;
import net.minecraft.client.util.math.MatrixStack;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import net.minecraft.client.network.AbstractClientPlayerEntity;
import net.minecraft.client.render.entity.PlayerEntityRenderer;
import net.minecraft.text.Text;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyVariable;

@Mixin(PlayerEntityRenderer.class)
public abstract class PlayerEntityRendererMixin {
    /** Icon module: Savira icon in front of the name above the player. */
    @ModifyVariable(method = "renderLabelIfPresent(Lnet/minecraft/client/network/AbstractClientPlayerEntity;Lnet/minecraft/text/Text;Lnet/minecraft/client/util/math/MatrixStack;Lnet/minecraft/client/render/VertexConsumerProvider;IF)V", at = @At("HEAD"), argsOnly = true)
    private Text savira$icon(Text text, @Local(argsOnly = true) AbstractClientPlayerEntity player) {
        return SaviraIcon.decorate(text, player.getUuid(), false);
    }

    /** Emotes: lift, turn or sway the whole player (sitting, spinning, floating). */
    @Inject(method = "setupTransforms(Lnet/minecraft/client/network/AbstractClientPlayerEntity;Lnet/minecraft/client/util/math/MatrixStack;FFFF)V", at = @At("TAIL"))
    private void savira$emoteBody(AbstractClientPlayerEntity player, MatrixStack matrices, float age, float bodyYaw, float tickDelta, float scale, CallbackInfo ci) {
        Emotes.applyToBody(player, matrices);
    }
}

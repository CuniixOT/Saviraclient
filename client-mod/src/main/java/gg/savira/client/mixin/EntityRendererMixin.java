package gg.savira.client.mixin;

import com.llamalad7.mixinextras.sugar.Local;
import gg.savira.client.HudConfig;
import gg.savira.client.SaviraClient;
import net.minecraft.client.render.entity.EntityRenderer;
import net.minecraft.entity.Entity;
import net.minecraft.entity.player.PlayerEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyArg;

@Mixin(EntityRenderer.class)
public abstract class EntityRendererMixin {
    private static final String LABEL = "renderLabelIfPresent(Lnet/minecraft/entity/Entity;Lnet/minecraft/text/Text;Lnet/minecraft/client/util/math/MatrixStack;Lnet/minecraft/client/render/VertexConsumerProvider;IF)V";
    private static final String DRAW = "Lnet/minecraft/client/font/TextRenderer;draw(Lnet/minecraft/text/Text;FFIZLorg/joml/Matrix4f;Lnet/minecraft/client/render/VertexConsumerProvider;Lnet/minecraft/client/font/TextRenderer$TextLayerType;II)I";

    private static boolean styled(Entity entity) {
        HudConfig c = SaviraClient.config;
        return c != null && c.nametag && entity instanceof PlayerEntity;
    }

    /** Nametag module: text shadow on player names. */
    @ModifyArg(method = LABEL, at = @At(value = "INVOKE", target = DRAW), index = 4)
    private boolean savira$shadow(boolean shadow, @Local(argsOnly = true) Entity entity) {
        return styled(entity) && SaviraClient.config.nametagShadow || shadow;
    }

    /** Nametag module: no grey box behind player names. */
    @ModifyArg(method = LABEL, at = @At(value = "INVOKE", target = DRAW), index = 8)
    private int savira$background(int color, @Local(argsOnly = true) Entity entity) {
        return styled(entity) && SaviraClient.config.nametagNoBackground ? 0 : color;
    }
}

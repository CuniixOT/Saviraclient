package gg.savira.client.mixin;

import gg.savira.client.SaviraCape;
import net.minecraft.client.network.AbstractClientPlayerEntity;
import net.minecraft.client.network.ClientPlayerEntity;
import net.minecraft.client.util.SkinTextures;
import net.minecraft.util.Identifier;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Mixin(AbstractClientPlayerEntity.class)
public abstract class AbstractClientPlayerEntityMixin {
    /** Gives the local player the Savira cape (and matching elytra) picked in the launcher. */
    @Inject(method = "getSkinTextures", at = @At("RETURN"), cancellable = true)
    private void savira$customCape(CallbackInfoReturnable<SkinTextures> cir) {
        if (!((Object) this instanceof ClientPlayerEntity)) return;
        Identifier cape = SaviraCape.texture();
        if (cape == null) return;
        SkinTextures textures = cir.getReturnValue();
        cir.setReturnValue(new SkinTextures(textures.texture(), textures.textureUrl(), cape, cape, textures.model(), textures.secure()));
    }
}

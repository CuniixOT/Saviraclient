package gg.savira.client;

import com.mojang.blaze3d.systems.RenderSystem;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.texture.NativeImage;
import net.minecraft.client.texture.NativeImageBackedTexture;
import net.minecraft.util.Identifier;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * The player's own Savira cape, chosen in the launcher's cape section. The launcher copies
 * it to config/savira-cape.png before the game starts; only this player sees it for now.
 */
public final class SaviraCape {
    private static final Path FILE = FabricLoader.getInstance().getConfigDir().resolve("savira-cape.png");
    private static final Identifier ID = Identifier.of("savira", "cape/self");
    private static boolean tried;
    private static Identifier loaded;
    private SaviraCape() {}

    /** The registered cape texture, or null when none is set or the file is unusable. */
    public static Identifier texture() {
        if (!SaviraClient.config.customCape) return null;
        // Textures can only be uploaded on the render thread; try again on the next call there.
        if (!tried && RenderSystem.isOnRenderThread()) {
            tried = true;
            try (InputStream in = Files.newInputStream(FILE)) {
                NativeImage image = NativeImage.read(in);
                // Capes use a 2:1 layout (64x32, or larger for HD capes).
                if (image.getWidth() != image.getHeight() * 2 || image.getWidth() < 64 || image.getWidth() > 1024) image.close();
                else {
                    MinecraftClient.getInstance().getTextureManager().registerTexture(ID, new NativeImageBackedTexture(image));
                    loaded = ID;
                }
            } catch (Exception e) {
                loaded = null;
            }
        }
        return loaded;
    }
}

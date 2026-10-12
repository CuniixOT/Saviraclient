package gg.savira.client;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.mojang.blaze3d.systems.RenderSystem;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.CubeMapRenderer;
import net.minecraft.client.gui.RotatingCubeMapRenderer;
import net.minecraft.client.texture.NativeImage;
import net.minecraft.client.texture.NativeImageBackedTexture;
import net.minecraft.util.Identifier;
import java.io.InputStream;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Title-screen panoramas of earlier Minecraft updates. The launcher downloads them from Mojang
 * into its panoramas folder and tells the mod where that is (config.panoramaDir); nothing is bundled.
 */
public final class SaviraPanoramas {
    public record Entry(String id, String label, String version) {}
    private static final Pattern ID = Pattern.compile("^[a-z]{1,16}$");
    private static final Map<String, RotatingCubeMapRenderer> RENDERERS = new HashMap<>();
    private static final Map<String, Identifier> THUMBS = new HashMap<>();
    private SaviraPanoramas() {}

    private static Path dir() {
        String value = SaviraClient.config.panoramaDir;
        return value == null || value.isBlank() ? null : Path.of(value);
    }

    /** Panoramas the launcher has finished downloading, newest first. */
    public static List<Entry> list() {
        List<Entry> result = new ArrayList<>();
        Path dir = dir();
        if (dir == null) return result;
        try (Reader reader = Files.newBufferedReader(dir.resolve("index.json"), StandardCharsets.UTF_8)) {
            JsonArray array = new Gson().fromJson(reader, JsonArray.class);
            for (JsonElement element : array) {
                JsonObject o = element.getAsJsonObject();
                String id = o.get("id").getAsString();
                if (!ID.matcher(id).matches() || !complete(dir.resolve(id))) continue;
                result.add(new Entry(id, o.get("label").getAsString(), o.has("version") ? o.get("version").getAsString() : ""));
            }
        } catch (Exception e) {
            // No panoramas yet (first start, offline): only Minecraft's own one is offered.
        }
        return result;
    }

    private static boolean complete(Path folder) {
        for (int i = 0; i < 6; i++) if (!Files.isRegularFile(folder.resolve("panorama_" + i + ".png"))) return false;
        return true;
    }

    private static NativeImage read(Path file) throws Exception {
        try (InputStream in = Files.newInputStream(file)) { return NativeImage.read(in); }
    }

    /** The rotating panorama for this id; its six faces are uploaded on first use. */
    public static RotatingCubeMapRenderer renderer(String id) {
        if (!ID.matcher(id).matches() || !RenderSystem.isOnRenderThread()) return null;
        if (RENDERERS.containsKey(id)) return RENDERERS.get(id);
        Path dir = dir();
        RotatingCubeMapRenderer renderer = null;
        if (dir != null && complete(dir.resolve(id))) {
            try {
                Identifier base = Identifier.of("savira", "panorama/" + id + "/panorama");
                for (int i = 0; i < 6; i++) {
                    NativeImage image = read(dir.resolve(id).resolve("panorama_" + i + ".png"));
                    MinecraftClient.getInstance().getTextureManager().registerTexture(base.withPath(base.getPath() + "_" + i + ".png"), new NativeImageBackedTexture(image));
                }
                renderer = new RotatingCubeMapRenderer(new CubeMapRenderer(base));
            } catch (Exception e) {
                renderer = null;
            }
        }
        RENDERERS.put(id, renderer);
        return renderer;
    }

    /** A small copy of the front face for the picker, so thumbnails do not cost much memory. */
    public static Identifier thumbnail(String id) {
        if (!ID.matcher(id).matches() || !RenderSystem.isOnRenderThread()) return null;
        if (THUMBS.containsKey(id)) return THUMBS.get(id);
        Identifier result = null;
        Path dir = dir();
        if (dir != null) {
            try (NativeImage face = read(dir.resolve(id).resolve("panorama_0.png"))) {
                NativeImage small = new NativeImage(128, 128, false);
                face.resizeSubRectTo(0, 0, face.getWidth(), face.getHeight(), small);
                result = Identifier.of("savira", "panorama/" + id + "/thumb");
                MinecraftClient.getInstance().getTextureManager().registerTexture(result, new NativeImageBackedTexture(small));
            } catch (Exception e) {
                result = null;
            }
        }
        THUMBS.put(id, result);
        return result;
    }
}

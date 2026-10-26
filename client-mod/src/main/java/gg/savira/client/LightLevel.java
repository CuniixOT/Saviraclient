package gg.savira.client;

import com.mojang.blaze3d.systems.RenderSystem;
import net.fabricmc.fabric.api.client.rendering.v1.WorldRenderContext;
import net.minecraft.block.BlockState;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.font.TextRenderer;
import net.minecraft.client.render.BufferBuilder;
import net.minecraft.client.render.BufferRenderer;
import net.minecraft.client.render.GameRenderer;
import net.minecraft.client.render.Tessellator;
import net.minecraft.client.render.VertexConsumerProvider;
import net.minecraft.client.render.VertexFormat;
import net.minecraft.client.render.VertexFormats;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.client.world.ClientWorld;
import net.minecraft.entity.EntityType;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.RotationAxis;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.LightType;
import net.minecraft.world.SpawnHelper;
import org.joml.Matrix4f;
import java.util.ArrayList;
import java.util.List;

/**
 * Light Level module: marks the blocks around the player where monsters can spawn.
 * Since Minecraft 1.18 monsters need block light 0; with sky light above 7 that only happens at
 * night, so those blocks are "spawnable at night", the others "spawnable" at any time.
 * The scan runs a few times a second on the client; drawing happens every frame.
 */
public final class LightLevel {
    public enum Mode {
        NUMBER("Zahl"), CROSS("Kreuz"), OUTLINE("Rahmen"), FILL("Fläche");
        public final String label;
        Mode(String label) { this.label = label; }
        public static Mode parse(String name) { for (Mode m : values()) if (m.name().equals(name)) return m; return NUMBER; }
        public Mode next(int step) { Mode[] all = values(); return all[Math.floorMod(ordinal() + step, all.length)]; }
    }
    private enum Kind { SPAWNABLE, NIGHT, SAFE }
    private record Spot(int x, int y, int z, int light, Kind kind) {}

    private static final int RESCAN_TICKS = 6, MAX_HEIGHT = 12;
    private static List<Spot> spots = List.of();
    private static BlockPos lastCenter;
    private static int sinceScan;
    private LightLevel() {}

    private static HudConfig cfg() { return SaviraClient.config; }

    /** Every tick: rescan when the player moved a block or a few ticks passed (torches, day). */
    public static void tick(MinecraftClient mc) {
        if (!cfg().lightLevel || mc.player == null || mc.world == null) { spots = List.of(); lastCenter = null; return; }
        BlockPos center = mc.player.getBlockPos();
        if (++sinceScan < RESCAN_TICKS && center.equals(lastCenter)) return;
        sinceScan = 0; lastCenter = center;
        spots = scan(mc.world, center, Math.clamp(cfg().lightRange, 1, 32));
    }

    static List<Spot> scan(ClientWorld world, BlockPos center, int range) {
        List<Spot> found = new ArrayList<>();
        int height = Math.min(range, MAX_HEIGHT);
        BlockPos.Mutable pos = new BlockPos.Mutable(), below = new BlockPos.Mutable();
        for (int dx = -range; dx <= range; dx++) for (int dz = -range; dz <= range; dz++) {
            if (dx * dx + dz * dz > range * range) continue;
            for (int dy = -height; dy <= height; dy++) {
                pos.set(center.getX() + dx, center.getY() + dy, center.getZ() + dz);
                below.set(pos.getX(), pos.getY() - 1, pos.getZ());
                BlockState ground = world.getBlockState(below);
                if (!ground.allowsSpawning(world, below, EntityType.ZOMBIE)) continue;
                BlockState state = world.getBlockState(pos);
                if (!SpawnHelper.isClearForSpawn(world, pos, state, state.getFluidState(), EntityType.ZOMBIE)) continue;
                int block = world.getLightLevel(LightType.BLOCK, pos), sky = world.getLightLevel(LightType.SKY, pos);
                Kind kind = block > 0 ? Kind.SAFE : sky > 7 ? Kind.NIGHT : Kind.SPAWNABLE;
                if (cfg().lightOnlySpawnable && kind == Kind.SAFE) continue;
                found.add(new Spot(pos.getX(), pos.getY(), pos.getZ(), block, kind));
            }
        }
        return found;
    }

    private static int color(Kind kind) {
        return 0xFF000000 | switch (kind) { case SPAWNABLE -> cfg().lightColorSpawnable; case NIGHT -> cfg().lightColorNight; case SAFE -> cfg().lightColorSafe; };
    }

    public static void render(WorldRenderContext context) {
        List<Spot> list = spots;
        if (list.isEmpty() || !cfg().lightLevel) return;
        MinecraftClient mc = MinecraftClient.getInstance();
        Vec3d cam = context.camera().getPos();
        // Minecraft 1.21 already has the camera rotation on the model-view stack here; only the position is ours.
        MatrixStack matrices = new MatrixStack();
        Mode mode = Mode.parse(cfg().lightMode);
        if (mode == Mode.NUMBER) { renderNumbers(mc, context, matrices, cam, list); return; }

        RenderSystem.enableBlend();
        RenderSystem.defaultBlendFunc();
        RenderSystem.enableDepthTest();
        RenderSystem.disableCull();
        RenderSystem.setShader(GameRenderer::getPositionColorProgram);
        BufferBuilder buffer = Tessellator.getInstance().begin(VertexFormat.DrawMode.QUADS, VertexFormats.POSITION_COLOR);
        Matrix4f m = matrices.peek().getPositionMatrix();
        int fillAlpha = Math.round(Math.clamp(cfg().lightAlpha, .05f, 1f) * 255);
        float w = 1 / 16f;
        for (Spot s : list) {
            float x = (float) (s.x() - cam.x), y = (float) (s.y() - cam.y) + .005f, z = (float) (s.z() - cam.z);
            int c = color(s.kind());
            switch (mode) {
                case CROSS -> { diagonal(buffer, m, x, y, z, w, false, c); diagonal(buffer, m, x, y, z, w, true, c); }
                case OUTLINE -> frame(buffer, m, x, y, z, w, c);
                case FILL -> { quad(buffer, m, x, y, z, x + 1, z + 1, (fillAlpha << 24) | (c & 0xFFFFFF)); frame(buffer, m, x, y + .001f, z, w, c); }
                default -> { }
            }
        }
        var built = buffer.endNullable();
        if (built != null) BufferRenderer.drawWithGlobalProgram(built);
        RenderSystem.enableCull();
        RenderSystem.disableBlend();
    }

    private static void quad(BufferBuilder b, Matrix4f m, float x1, float y, float z1, float x2, float z2, int color) {
        b.vertex(m, x1, y, z1).color(color);
        b.vertex(m, x1, y, z2).color(color);
        b.vertex(m, x2, y, z2).color(color);
        b.vertex(m, x2, y, z1).color(color);
    }
    /** The four edges of the block's top face as thin strips, like NoRisk's grid. */
    private static void frame(BufferBuilder b, Matrix4f m, float x, float y, float z, float w, int c) {
        quad(b, m, x, y, z, x + 1, z + w, c);
        quad(b, m, x, y, z + 1 - w, x + 1, z + 1, c);
        quad(b, m, x, y, z + w, x + w, z + 1 - w, c);
        quad(b, m, x + 1 - w, y, z + w, x + 1, z + 1 - w, c);
    }
    /** One diagonal of the top face as a strip of width w. */
    private static void diagonal(BufferBuilder b, Matrix4f m, float x, float y, float z, float w, boolean flip, int c) {
        float inset = .12f, a = x + inset, e = x + 1 - inset, n = z + inset, s = z + 1 - inset, h = w * .7f;
        float z1 = flip ? s : n, z2 = flip ? n : s;
        b.vertex(m, a - h, y, z1).color(c);
        b.vertex(m, a + h, y, z1).color(c);
        b.vertex(m, e + h, y, z2).color(c);
        b.vertex(m, e - h, y, z2).color(c);
    }

    /** The block light as a number lying on each block, turned towards the player. */
    private static void renderNumbers(MinecraftClient mc, WorldRenderContext context, MatrixStack matrices, Vec3d cam, List<Spot> list) {
        TextRenderer font = mc.textRenderer;
        VertexConsumerProvider.Immediate consumers = mc.getBufferBuilders().getEntityVertexConsumers();
        float yaw = context.camera().getYaw(), scale = .045f * Math.clamp(cfg().lightTextSize, .5f, 2f);
        for (Spot s : list) {
            matrices.push();
            matrices.translate(s.x() + .5 - cam.x, s.y() + .01 - cam.y, s.z() + .5 - cam.z);
            matrices.multiply(RotationAxis.POSITIVE_Y.rotationDegrees(180 - yaw));
            matrices.multiply(RotationAxis.POSITIVE_X.rotationDegrees(90));
            matrices.scale(scale, scale, scale);
            String text = Integer.toString(s.light());
            font.draw(text, -font.getWidth(text) / 2f + .5f, -3.5f, color(s.kind()), false, matrices.peek().getPositionMatrix(), consumers, TextRenderer.TextLayerType.NORMAL, 0, 0xF000F0);
            matrices.pop();
        }
        consumers.draw();
    }

    /** For tests: how many blocks the last scan marked. */
    public static int spotCount() { return spots.size(); }
    public static long count(String kind) { return spots.stream().filter(spot -> spot.kind().name().equals(kind)).count(); }
    public static void rescanNow() { sinceScan = RESCAN_TICKS; lastCenter = null; }
}

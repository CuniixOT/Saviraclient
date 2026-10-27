package gg.savira.client;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.model.ModelPart;
import net.minecraft.client.network.AbstractClientPlayerEntity;
import net.minecraft.client.option.Perspective;
import net.minecraft.client.render.DiffuseLighting;
import net.minecraft.client.render.OverlayTexture;
import net.minecraft.client.render.RenderLayer;
import net.minecraft.client.render.entity.model.EntityModelLayers;
import net.minecraft.client.render.entity.model.PlayerEntityModel;
import net.minecraft.client.util.SkinTextures;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.entity.Entity;
import net.minecraft.entity.LivingEntity;
import net.minecraft.sound.SoundCategory;
import net.minecraft.util.Util;
import net.minecraft.util.math.RotationAxis;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Plays emotes: who is emoting, the pose for the model (blended in and out over the vanilla pose),
 * sounds within the audio range, the camera switch and the 3D figure used by the menus.
 * Emotes are kept per player so others' emotes can be shown once a server sends them; for now
 * only your own play, and only you see them.
 */
public final class Emotes {
    private Emotes() {}
    public static final int SLOTS = 8, PAGES = 5;
    private static final float FADE_IN = .18f, FADE_OUT = .25f;

    private static final class Playing {
        final Emote emote;
        final long start;
        long stopAt = -1;
        float soundAt;
        Playing(Emote emote) { this.emote = emote; this.start = Util.getMeasuringTimeMs(); }
        float time() { return (Util.getMeasuringTimeMs() - start) / 1000f; }
    }
    private static final Map<UUID, Playing> PLAYING = new HashMap<>();
    /** The view before an emote switched to third person, restored afterwards. */
    private static Perspective before;
    private static final Emote.Pose POSE = new Emote.Pose();

    private static HudConfig cfg() { return SaviraClient.config; }

    // ---------- Slots ----------
    public static List<String> slots() {
        HudConfig c = cfg();
        // The first page starts with a few classics; two slots stay free to show how to fill them.
        if (c.emoteSlots == null) c.emoteSlots = new ArrayList<>(List.of("waving", "handshake", "clap", "dab", "", "sit", "", "cheer"));
        while (c.emoteSlots.size() < SLOTS * PAGES) c.emoteSlots.add("");
        return c.emoteSlots;
    }
    public static Emote slot(int index) { return Emote.byId(slots().get(index)); }
    public static void setSlot(int index, Emote emote) { slots().set(index, emote == null ? "" : emote.id()); cfg().save(); }

    // ---------- Playing ----------
    public static Emote current(Entity entity) {
        Playing p = entity == null ? null : PLAYING.get(entity.getUuid());
        return p == null ? null : p.emote;
    }

    /** Starts an emote for your own player; returns false (with a hint) if it cannot play now. */
    public static boolean play(Emote emote) {
        MinecraftClient mc = MinecraftClient.getInstance();
        if (mc.player == null || emote == null) return false;
        Perspective view = mc.options.getPerspective();
        if (view.isFirstPerson() && !cfg().emoteAutoSwitch && !cfg().emoteFirstPerson) {
            SaviraToasts.show("Emotes", "Wechsle mit F5 in die dritte Person");
            return false;
        }
        if (view.isFirstPerson() && cfg().emoteAutoSwitch) {
            if (before == null) before = view;
            mc.options.setPerspective(Perspective.THIRD_PERSON_FRONT);
        }
        PLAYING.put(mc.player.getUuid(), new Playing(emote));
        return true;
    }
    public static void stop(Entity entity) {
        Playing p = entity == null ? null : PLAYING.get(entity.getUuid());
        if (p != null && p.stopAt < 0) p.stopAt = Util.getMeasuringTimeMs();
    }

    /** Interactive emotes of other players need Savira's server; tell the player honestly. */
    public static void join() {
        SaviraToasts.show("Emotes", "Kein interaktives Emote in der Nähe");
    }

    public static void tick(MinecraftClient mc) {
        if (mc.player == null || mc.world == null) { PLAYING.clear(); restoreView(mc); return; }
        // Moving, jumping or attacking ends your own emote.
        Playing own = PLAYING.get(mc.player.getUuid());
        if (own != null && own.stopAt < 0 && mc.currentScreen == null) {
            var in = mc.player.input;
            if (in != null && (in.movementForward != 0 || in.movementSideways != 0 || in.jumping || in.sneaking) || mc.options.attackKey.isPressed() || mc.player.isDead()) stop(mc.player);
        }
        long now = Util.getMeasuringTimeMs();
        PLAYING.entrySet().removeIf(entry -> {
            Playing p = entry.getValue();
            float t = p.time();
            boolean over = !p.emote.loop() && t >= p.emote.length() || p.stopAt >= 0 && now - p.stopAt > FADE_OUT * 1000;
            return over || mc.world.getPlayerByUuid(entry.getKey()) == null;
        });
        if (!PLAYING.containsKey(mc.player.getUuid())) restoreView(mc);
        playSounds(mc);
    }
    private static void restoreView(MinecraftClient mc) {
        if (before != null) { mc.options.setPerspective(before); before = null; }
    }

    /** Sounds of the nearest emoting players within the audio range, at most the player limit. */
    private static void playSounds(MinecraftClient mc) {
        if (!cfg().emoteSounds) { PLAYING.values().forEach(p -> p.soundAt = p.time()); return; }
        var camera = mc.gameRenderer.getCamera().getPos();
        int range = Math.clamp(cfg().emoteAudioRange, 1, 128);
        List<Map.Entry<UUID, Playing>> near = new ArrayList<>(PLAYING.entrySet());
        near.removeIf(e -> { var pl = mc.world.getPlayerByUuid(e.getKey()); return pl == null || pl.getPos().distanceTo(camera) > range; });
        near.sort(Comparator.comparingDouble(e -> mc.world.getPlayerByUuid(e.getKey()).getPos().distanceTo(camera)));
        int limit = Math.clamp(cfg().emoteSoundLimit, 1, 64);
        for (int i = 0; i < near.size(); i++) {
            Playing p = near.get(i).getValue();
            float from = p.soundAt, to = p.time();
            p.soundAt = to;
            if (i >= limit || p.stopAt >= 0) continue;
            var player = mc.world.getPlayerByUuid(near.get(i).getKey());
            float len = p.emote.length();
            for (Emote.Cue cue : p.emote.cues()) {
                // Looping emotes repeat their cues every round.
                float first = p.emote.loop() ? (float) Math.floor(from / len) * len + cue.at() : cue.at();
                for (float at = first; at <= to; at += p.emote.loop() ? len : Float.MAX_VALUE) {
                    if (at > from || from == 0 && at == 0) mc.world.playSound(player.getX(), player.getY(), player.getZ(), cue.sound().get(), SoundCategory.PLAYERS, cue.volume(), cue.pitch(), false);
                    if (!p.emote.loop()) break;
                }
            }
        }
    }

    /** How much of the emote shows: fades in at the start, out at the end or when stopped. */
    private static float weight(Playing p) {
        float t = p.time(), w = Math.min(1, t / FADE_IN);
        if (!p.emote.loop()) w = Math.min(w, (p.emote.length() - t) / FADE_OUT);
        if (p.stopAt >= 0) w = Math.min(w, 1 - (Util.getMeasuringTimeMs() - p.stopAt) / (FADE_OUT * 1000));
        return Math.clamp(w, 0f, 1f);
    }
    private static boolean visible(Entity entity) {
        MinecraftClient mc = MinecraftClient.getInstance();
        if (entity == mc.player) return true;
        // Others: everyone, friends (none yet) or no one.
        return "ALL".equals(cfg().emoteVisibility);
    }

    /** Called after the vanilla pose is set: lays the emote over it. */
    public static void applyToModel(PlayerEntityModel<?> model, LivingEntity entity) {
        // Minecraft never resets these two: without this an emote's tilt would add up and stay.
        model.head.roll = 0; model.body.roll = 0;
        model.hat.copyTransform(model.head); model.jacket.copyTransform(model.body);
        Playing p = PLAYING.get(entity.getUuid());
        if (p == null || !visible(entity)) return;
        float w = weight(p);
        if (w <= 0) return;
        POSE.reset();
        p.emote.animation().pose(p.emote.loop() ? p.time() % p.emote.length() : p.time(), POSE);
        apply(model, POSE, w);
    }
    /** Moves the whole figure (rising, turning, swaying) in the renderer's body frame. */
    public static void applyToBody(AbstractClientPlayerEntity player, MatrixStack matrices) {
        Playing p = PLAYING.get(player.getUuid());
        if (p == null || !visible(player)) return;
        float w = weight(p);
        if (w <= 0) return;
        POSE.reset();
        p.emote.animation().pose(p.emote.loop() ? p.time() % p.emote.length() : p.time(), POSE);
        // The renderer later flips x and y for the model: the figure's left is -x here.
        matrices.translate(-POSE.rootX * w, POSE.rootY * w, 0);
        if (POSE.rootYaw != 0) matrices.multiply(RotationAxis.POSITIVE_Y.rotationDegrees(-POSE.rootYaw * w));
    }
    public static boolean hidesItems(LivingEntity entity) {
        return cfg().emoteImmersive && PLAYING.containsKey(entity.getUuid()) && visible(entity);
    }

    private static float mix(float a, float b, float w) { return a + (b - a) * w; }
    private static void set(ModelPart part, float pitch, float yaw, float roll, float w) {
        part.pitch = mix(part.pitch, pitch, w); part.yaw = mix(part.yaw, yaw, w); part.roll = mix(part.roll, roll, w);
    }
    /** Blends pose p into the model by weight w; sleeves, pants, jacket and hat follow their parts. */
    public static void apply(PlayerEntityModel<?> m, Emote.Pose p, float w) {
        float keep = p.lockHead ? 1 - w : 1;
        m.head.pitch = m.head.pitch * keep + p.hx * w; m.head.yaw = m.head.yaw * keep + p.hy * w; m.head.roll = m.head.roll * keep + p.hz * w;
        set(m.body, p.bx, p.by, p.bz, w);
        set(m.rightArm, p.rax, p.ray, p.raz, w);
        set(m.leftArm, p.lax, p.lay, p.laz, w);
        set(m.rightLeg, p.rlx, p.rly, p.rlz, w);
        set(m.leftLeg, p.llx, p.lly, p.llz, w);
        if (p.bend > 0) {
            // Bent forward like sneaking: body, head and arms lower, legs step back.
            float b = p.bend * w;
            m.body.pivotY = mix(m.body.pivotY, 3.2f, b); m.head.pivotY = mix(m.head.pivotY, 4.2f, b);
            m.rightArm.pivotY = mix(m.rightArm.pivotY, 5.2f, b); m.leftArm.pivotY = mix(m.leftArm.pivotY, 5.2f, b);
            m.rightLeg.pivotZ = mix(m.rightLeg.pivotZ, 4, b); m.leftLeg.pivotZ = mix(m.leftLeg.pivotZ, 4, b);
            m.rightLeg.pivotY = mix(m.rightLeg.pivotY, 12.2f, b); m.leftLeg.pivotY = mix(m.leftLeg.pivotY, 12.2f, b);
        }
        m.hat.copyTransform(m.head);
        m.jacket.copyTransform(m.body);
        m.leftSleeve.copyTransform(m.leftArm); m.rightSleeve.copyTransform(m.rightArm);
        m.leftPants.copyTransform(m.leftLeg); m.rightPants.copyTransform(m.rightLeg);
    }

    // ---------- 3D figure for the menus ----------
    private static PlayerEntityModel<LivingEntity> wide, slim;
    private static final Emote.Pose PREVIEW = new Emote.Pose();

    public static SkinTextures skin() {
        MinecraftClient mc = MinecraftClient.getInstance();
        return mc.player != null ? mc.player.getSkinTextures() : mc.getSkinProvider().getSkinTextures(mc.getGameProfile());
    }

    /**
     * Your player standing at (x, feet), size gui units per block, turned by yaw degrees, showing
     * the emote at time t (null: standing). lookX/lookY turn the head a little (-1..1).
     */
    public static void drawFigure(DrawContext c, float x, float feet, float size, float yaw, Emote emote, float t, float lookX, float lookY) {
        MinecraftClient mc = MinecraftClient.getInstance();
        SkinTextures skin = skin();
        if (wide == null) {
            wide = new PlayerEntityModel<>(mc.getEntityModelLoader().getModelPart(EntityModelLayers.PLAYER), false);
            slim = new PlayerEntityModel<>(mc.getEntityModelLoader().getModelPart(EntityModelLayers.PLAYER_SLIM), true);
        }
        PlayerEntityModel<LivingEntity> model = skin.model() == SkinTextures.Model.SLIM ? slim : wide;
        for (ModelPart part : new ModelPart[] {model.head, model.body, model.rightArm, model.leftArm, model.rightLeg, model.leftLeg}) part.resetTransform();
        float breath = (float) Math.sin(Util.getMeasuringTimeMs() / 1000f * 1.7f);
        model.head.yaw = Math.clamp(lookX, -1f, 1f) * .5f; model.head.pitch = Math.clamp(lookY, -1f, 1f) * .3f;
        model.rightArm.roll = .06f + breath * .03f; model.leftArm.roll = -.06f - breath * .03f;
        PREVIEW.reset();
        if (emote != null) emote.animation().pose(emote.loop() ? t % emote.length() : Math.min(t, emote.length()), PREVIEW);
        apply(model, PREVIEW, emote == null ? 0 : 1);

        c.draw();
        MatrixStack m = c.getMatrices();
        m.push();
        m.translate(x, feet, 150);
        m.scale(size, size, -size);
        m.translate(PREVIEW.rootX, -PREVIEW.rootY, 0);
        m.multiply(RotationAxis.POSITIVE_Y.rotationDegrees(yaw + PREVIEW.rootYaw));
        m.translate(0, -1.5f, 0);
        DiffuseLighting.method_34742();
        model.render(m, c.getVertexConsumers().getBuffer(RenderLayer.getEntityTranslucent(skin.texture())), 0xF000F0, OverlayTexture.DEFAULT_UV, -1);
        c.draw();
        DiffuseLighting.enableGuiDepthLighting();
        m.pop();
    }
}

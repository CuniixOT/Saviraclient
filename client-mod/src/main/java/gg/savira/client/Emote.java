package gg.savira.client;

import net.minecraft.sound.SoundEvent;
import net.minecraft.sound.SoundEvents;
import java.util.List;
import java.util.Locale;
import java.util.function.Supplier;

/**
 * One emote: name, rarity, length and its animation. The animation sets a {@link Pose} for every
 * point in time; {@link Emotes} blends it over the vanilla pose, in the world and in the menus.
 * Angles are radians in Minecraft's model space (arm pitch below zero lifts the arm forward,
 * right arm roll above zero lifts it out to the side, head pitch above zero looks down).
 */
public record Emote(String id, String name, Rarity rarity, float length, boolean loop, boolean interactive, Animation animation, List<Cue> cues) {
    public enum Rarity {
        CLASSIC("Classic", 0xFF9AA0A8), RANDOM("Random", 0xFF4CC26A), SPECIAL("Special", 0xFF3D8BFF), EPIC("Episch", 0xFFB15CFF), LEGENDARY("Legendär", 0xFFF2A922);
        public final String label;
        public final int color;
        Rarity(String label, int color) { this.label = label; this.color = color; }
    }
    public interface Animation { void pose(float t, Pose p); }
    /** A sound at a point of the emote; looping emotes repeat it every round. */
    public record Cue(float at, Supplier<SoundEvent> sound, float pitch, float volume) {}

    /** Target pose of the parts, plus bending (like sneaking) and a move of the whole figure. */
    public static final class Pose {
        public float hx, hy, hz, bx, by, bz, rax, ray, raz, lax, lay, laz, rlx, rly, rlz, llx, lly, llz;
        /** 0 = upright, 1 = bent forward like sneaking. */
        public float bend;
        /** Whole figure: up and to its left in blocks, turned in degrees. */
        public float rootY, rootX, rootYaw;
        /** The head ignores where the player looks. */
        public boolean lockHead;
        public void reset() {
            hx = hy = hz = bx = by = bz = rax = ray = raz = lax = lay = laz = rlx = rly = rlz = llx = lly = llz = 0;
            bend = rootY = rootX = rootYaw = 0; lockHead = false;
            // Arms hang slightly away from the body, as in Minecraft's idle pose.
            raz = .06f; laz = -.06f;
        }
    }

    public String label() { return name.toUpperCase(Locale.ROOT); }

    private static final float PI = (float) Math.PI;
    private static float wave(float t, float hz) { return (float) Math.sin(t * 2 * PI * hz); }
    private static float pulse(float t, float hz) { return Math.abs(wave(t, hz)); }
    private static float smooth(float a, float b, float k) { k = Math.clamp(k, 0f, 1f); k = k * k * (3 - 2 * k); return a + (b - a) * k; }
    private static Supplier<SoundEvent> note(net.minecraft.registry.entry.RegistryEntry<SoundEvent> entry) { return entry::value; }
    private static Cue cue(float at, Supplier<SoundEvent> sound, float pitch) { return new Cue(at, sound, pitch, .6f); }

    private static Emote of(String id, String name, Rarity rarity, float length, boolean loop, Animation animation, Cue... cues) {
        return new Emote(id, name, rarity, length, loop, false, animation, List.of(cues));
    }

    public static final List<Emote> ALL = List.of(
        // ---------- Classic ----------
        of("waving", "Winken", Rarity.CLASSIC, 2.4f, false, (t, p) -> {
            p.raz = 2.55f + wave(t, 1.6f) * .32f; p.ray = .2f; p.hz = -.08f; p.hx = -.05f;
        }),
        of("clap", "Klatschen", Rarity.CLASSIC, 2.4f, false, (t, p) -> {
            float c = .5f + .5f * wave(t - .05f, 2.5f);
            p.rax = p.lax = -1.25f; p.ray = -.15f - .45f * c; p.lay = .15f + .45f * c; p.hx = .1f;
        }, cue(.15f, note(SoundEvents.BLOCK_NOTE_BLOCK_HAT), 1.4f), cue(.55f, note(SoundEvents.BLOCK_NOTE_BLOCK_HAT), 1.4f), cue(.95f, note(SoundEvents.BLOCK_NOTE_BLOCK_HAT), 1.4f),
           cue(1.35f, note(SoundEvents.BLOCK_NOTE_BLOCK_HAT), 1.4f), cue(1.75f, note(SoundEvents.BLOCK_NOTE_BLOCK_HAT), 1.4f)),
        of("dab", "Dab", Rarity.CLASSIC, 1.8f, false, (t, p) -> {
            p.raz = 2.1f; p.rax = -.5f; p.lax = -1.7f; p.lay = .95f; p.laz = .15f;
            p.hx = .55f; p.hy = .55f; p.lockHead = true;
        }, cue(.1f, () -> SoundEvents.ENTITY_PLAYER_ATTACK_SWEEP, 1.6f)),
        of("comehere", "Komm her", Rarity.CLASSIC, 2.2f, false, (t, p) -> {
            p.rax = -1.35f + pulse(t, 1.4f) * .55f; p.ray = -.1f; p.hz = .08f;
        }),
        of("salute", "o7", Rarity.CLASSIC, 2.2f, false, (t, p) -> {
            p.rax = -2.5f; p.raz = -.55f; p.ray = .15f; p.lockHead = true; p.hx = -.1f;
        }, cue(.2f, note(SoundEvents.BLOCK_NOTE_BLOCK_BELL), 1.2f)),
        of("overthere", "Da drüben", Rarity.CLASSIC, 2.2f, false, (t, p) -> {
            p.rax = -1.5f; p.ray = .55f + wave(t, 2) * .04f; p.hy = .5f; p.lockHead = true; p.by = .15f;
        }),
        of("sit", "Sitzen", Rarity.CLASSIC, 4f, true, (t, p) -> {
            p.rlx = p.llx = -1.45f; p.rly = .12f; p.lly = -.12f; p.rax = p.lax = -.55f; p.rootY = -.62f;
            p.hx = wave(t, .25f) * .04f;
        }),
        new Emote("handshake", "Handschlag", Rarity.CLASSIC, 3f, true, true, (t, p) -> {
            p.rax = -1.3f + .12f * wave(t, 2.5f); p.ray = -.1f; p.hx = .15f;
        }, List.of()),
        of("bow", "Verbeugen", Rarity.CLASSIC, 2.4f, false, (t, p) -> {
            float k = smooth(0, 1, t / .5f) * smooth(1, 0, (t - 1.6f) / .6f);
            p.bend = k; p.bx = .75f * k; p.hx = .4f * k; p.rax = .35f * k; p.lax = -.6f * k; p.lay = .5f * k; p.lockHead = true;
        }),
        of("facepalm", "Facepalm", Rarity.CLASSIC, 2.2f, false, (t, p) -> {
            p.rax = -2.15f; p.ray = -.55f; p.hx = .45f; p.hy = wave(t, 1.2f) * .12f; p.lockHead = true;
        }, cue(.3f, () -> SoundEvents.ENTITY_VILLAGER_NO, 1f)),
        of("yes", "Ja", Rarity.CLASSIC, 1.6f, false, (t, p) -> {
            p.hx = .35f * pulse(t, 1.8f); p.lockHead = true;
        }, cue(.1f, () -> SoundEvents.ENTITY_VILLAGER_YES, 1f)),
        of("no", "Nein", Rarity.CLASSIC, 1.6f, false, (t, p) -> {
            p.hy = .5f * wave(t, 2.4f); p.lockHead = true;
        }, cue(.1f, () -> SoundEvents.ENTITY_VILLAGER_NO, 1f)),

        // ---------- Random ----------
        of("vibedance", "Vibedance", Rarity.RANDOM, 2f, true, (t, p) -> {
            p.hx = .18f * wave(t, 2); p.by = .2f * wave(t, 1);
            p.rax = -.6f * wave(t, 1); p.lax = .6f * wave(t, 1); p.raz = .25f; p.laz = -.25f;
            p.rlx = .25f * wave(t, 1); p.llx = -.25f * wave(t, 1); p.rootY = .05f * pulse(t, 1);
        }, cue(0, note(SoundEvents.BLOCK_NOTE_BLOCK_BASEDRUM), 1f), cue(.5f, note(SoundEvents.BLOCK_NOTE_BLOCK_HAT), 1.2f),
           cue(1f, note(SoundEvents.BLOCK_NOTE_BLOCK_BASEDRUM), 1f), cue(1.5f, note(SoundEvents.BLOCK_NOTE_BLOCK_HAT), 1.2f)),
        of("jumpingjack", "Hampelmann", Rarity.RANDOM, 1.2f, true, (t, p) -> {
            float k = pulse(t, .833f);
            p.raz = .1f + 2.7f * k; p.laz = -.1f - 2.7f * k; p.rlz = .35f * k; p.llz = -.35f * k; p.rootY = .25f * k;
        }),
        of("robot", "Roboter", Rarity.RANDOM, 4f, true, (t, p) -> {
            int step = (int) (t * 2) % 8;
            float a = step % 4 < 2 ? -1.57f : 0, b = step % 4 >= 2 ? -1.57f : 0;
            p.rax = a; p.lax = b; p.hy = step < 4 ? .45f : -.45f; p.lockHead = true; p.by = step < 4 ? .15f : -.15f;
        }, cue(0, note(SoundEvents.BLOCK_NOTE_BLOCK_BIT), .8f), cue(.5f, note(SoundEvents.BLOCK_NOTE_BLOCK_BIT), 1.2f),
           cue(1, note(SoundEvents.BLOCK_NOTE_BLOCK_BIT), .8f), cue(1.5f, note(SoundEvents.BLOCK_NOTE_BLOCK_BIT), 1.2f),
           cue(2, note(SoundEvents.BLOCK_NOTE_BLOCK_BIT), .8f), cue(2.5f, note(SoundEvents.BLOCK_NOTE_BLOCK_BIT), 1.2f),
           cue(3, note(SoundEvents.BLOCK_NOTE_BLOCK_BIT), .8f), cue(3.5f, note(SoundEvents.BLOCK_NOTE_BLOCK_BIT), 1.2f)),
        of("tpose", "T-Pose", Rarity.RANDOM, 3f, false, (t, p) -> {
            p.raz = PI / 2; p.laz = -PI / 2; p.lockHead = true;
        }),
        of("flail", "Zappeln", Rarity.RANDOM, 2f, true, (t, p) -> {
            p.rax = -1.2f + 1.1f * wave(t, 2.3f); p.lax = -1.2f + 1.1f * wave(t + .3f, 2.7f);
            p.raz = .6f + .5f * wave(t, 3.1f); p.laz = -.6f - .5f * wave(t, 2.9f);
            p.hy = .4f * wave(t, 3); p.hz = .2f * wave(t, 2); p.lockHead = true;
        }),
        of("shrug", "Schulterzucken", Rarity.RANDOM, 1.8f, false, (t, p) -> {
            float k = smooth(0, 1, t / .35f);
            p.rax = p.lax = -.7f * k; p.raz = .45f * k; p.laz = -.45f * k; p.ray = .5f * k; p.lay = -.5f * k; p.hz = .18f * k;
        }),

        // ---------- Special ----------
        of("floss", "Floss", Rarity.SPECIAL, .8f, true, (t, p) -> {
            float s = wave(t, 1.25f), front = wave(t, 2.5f) > 0 ? -.45f : .45f;
            p.raz = .45f * s + .1f; p.laz = .45f * s - .1f; p.rax = front; p.lax = -front;
            p.rootX = -.12f * s; p.bz = .08f * s;
        }, cue(0, note(SoundEvents.BLOCK_NOTE_BLOCK_HAT), 1f), cue(.4f, note(SoundEvents.BLOCK_NOTE_BLOCK_HAT), 1.3f)),
        of("disco", "Disco", Rarity.SPECIAL, 2f, true, (t, p) -> {
            boolean up = wave(t, .5f) > 0;
            p.rax = up ? -2.6f : -.5f; p.raz = up ? .7f : -.4f; p.laz = -.55f; p.lax = .2f;
            p.by = .15f * wave(t, 1); p.rootY = .04f * pulse(t, 1); p.hx = up ? -.25f : .25f;
        }, cue(0, note(SoundEvents.BLOCK_NOTE_BLOCK_BASEDRUM), 1f), cue(.5f, note(SoundEvents.BLOCK_NOTE_BLOCK_HARP), 1.2f),
           cue(1, note(SoundEvents.BLOCK_NOTE_BLOCK_BASEDRUM), 1f), cue(1.5f, note(SoundEvents.BLOCK_NOTE_BLOCK_HARP), 1.5f)),
        of("cheer", "Jubeln", Rarity.SPECIAL, 3f, false, (t, p) -> {
            p.raz = 2.75f + .25f * wave(t, 2); p.laz = -2.75f - .25f * wave(t, 2); p.rootY = .3f * pulse(t, .75f); p.hx = -.3f; p.lockHead = true;
        }, cue(.1f, () -> SoundEvents.ENTITY_PLAYER_LEVELUP, 1.2f), cue(.8f, () -> SoundEvents.ENTITY_FIREWORK_ROCKET_TWINKLE, 1f)),
        of("heart", "Herz", Rarity.SPECIAL, 3f, false, (t, p) -> {
            p.rax = p.lax = -2.35f; p.ray = -.5f; p.lay = .5f; p.rootY = .03f * pulse(t, .8f); p.hz = .1f * wave(t, .7f);
        }, cue(.3f, () -> SoundEvents.BLOCK_AMETHYST_BLOCK_CHIME, 1.4f)),

        // ---------- Episch ----------
        of("pirouette", "Pirouette", Rarity.EPIC, 3f, false, (t, p) -> {
            float spin = smooth(0, 1, (t - .3f) / 1.6f);
            p.rootYaw = 360 * spin; p.raz = 1.4f + 1.2f * spin; p.laz = -1.4f - 1.2f * spin; p.rootY = .1f * (float) Math.sin(spin * PI);
            p.rlz = .2f * spin; p.lockHead = true;
        }, cue(.3f, () -> SoundEvents.ENTITY_PLAYER_ATTACK_SWEEP, .8f), cue(2f, () -> SoundEvents.BLOCK_AMETHYST_BLOCK_CHIME, 1.2f)),
        of("macarena", "Macarena", Rarity.EPIC, 4f, true, (t, p) -> {
            // Eight moves of half a second, the hips swinging in the second half.
            int step = (int) (t * 2) % 8;
            if (step >= 0) { p.rax = -1.5f; }
            if (step >= 1) { p.lax = -1.5f; }
            if (step >= 2) { p.rax = -1.2f; p.ray = -.8f; }
            if (step >= 3) { p.lax = -1.2f; p.lay = .8f; }
            if (step >= 4) { p.rax = -2.9f; p.ray = -.5f; }
            if (step >= 5) { p.lax = -2.9f; p.lay = .5f; }
            if (step >= 6) { p.rax = .2f; p.raz = .7f; p.ray = 0; }
            if (step >= 7) { p.lax = .2f; p.laz = -.7f; p.lay = 0; }
            if (step >= 6) p.rootX = .08f * wave(t, 2);
        }, cue(0, note(SoundEvents.BLOCK_NOTE_BLOCK_HARP), 1f), cue(.5f, note(SoundEvents.BLOCK_NOTE_BLOCK_HARP), 1.12f),
           cue(1, note(SoundEvents.BLOCK_NOTE_BLOCK_HARP), 1.26f), cue(1.5f, note(SoundEvents.BLOCK_NOTE_BLOCK_HARP), 1.33f),
           cue(2, note(SoundEvents.BLOCK_NOTE_BLOCK_HARP), 1.5f), cue(2.5f, note(SoundEvents.BLOCK_NOTE_BLOCK_HARP), 1.33f),
           cue(3, note(SoundEvents.BLOCK_NOTE_BLOCK_HARP), 1.26f), cue(3.5f, note(SoundEvents.BLOCK_NOTE_BLOCK_HARP), 1.12f)),

        // ---------- Legendär ----------
        of("helicopter", "Helikopter", Rarity.LEGENDARY, 1f, true, (t, p) -> {
            p.raz = PI / 2; p.laz = -PI / 2; p.rootYaw = t * 720; p.rootY = .35f + .08f * wave(t, 1); p.rlx = -.2f; p.llx = .2f; p.lockHead = true;
        }, cue(0, () -> SoundEvents.ENTITY_PHANTOM_FLAP, 1.4f), cue(.25f, () -> SoundEvents.ENTITY_PHANTOM_FLAP, 1.5f),
           cue(.5f, () -> SoundEvents.ENTITY_PHANTOM_FLAP, 1.4f), cue(.75f, () -> SoundEvents.ENTITY_PHANTOM_FLAP, 1.5f)),
        of("meditate", "Meditation", Rarity.LEGENDARY, 3f, true, (t, p) -> {
            p.rlx = p.llx = -1.45f; p.rly = .75f; p.lly = -.75f; p.rax = -.35f; p.lax = -.35f; p.raz = .5f; p.laz = -.5f;
            p.rootY = -.25f + .1f * wave(t, 1 / 3f); p.hx = .1f; p.lockHead = true;
        }, cue(0, () -> SoundEvents.BLOCK_AMETHYST_BLOCK_CHIME, .8f), cue(1.5f, () -> SoundEvents.BLOCK_AMETHYST_BLOCK_CHIME, 1f))
    );

    public static Emote byId(String id) {
        if (id == null || id.isEmpty()) return null;
        for (Emote e : ALL) if (e.id.equals(id)) return e;
        return null;
    }
}

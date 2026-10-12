package gg.savira.client;

import net.minecraft.client.MinecraftClient;
import net.minecraft.sound.SoundCategory;
import org.lwjgl.BufferUtils;
import org.lwjgl.openal.AL10;
import java.nio.ShortBuffer;
import java.util.EnumMap;
import java.util.Map;

/**
 * Savira's own interface sounds. They are synthesised once (short tones with soft envelopes)
 * and played through OpenAL, which Minecraft's sound engine already set up; no audio files.
 * Volume follows the master volume. If OpenAL is not available the menu stays silent.
 */
public final class SaviraSounds {
    public enum Sound { OPEN, WINDOW, ON, OFF, CLICK, NOTIFY }
    private static final int RATE = 44100, SOURCES = 6;
    private static final Map<Sound, Integer> BUFFERS = new EnumMap<>(Sound.class);
    private static int[] sources;
    private static int next;
    private static boolean failed;
    private SaviraSounds() {}

    /** One tone: start/end frequency (glide), duration, loudness, overtone mix. */
    private record Tone(double from, double to, double seconds, double gain, double start) {}

    private static short[] render(double length, Tone... tones) {
        short[] pcm = new short[(int) (RATE * length)];
        for (Tone tone : tones) {
            double phase = 0;
            int begin = (int) (tone.start() * RATE), count = (int) (tone.seconds() * RATE);
            for (int i = 0; i < count && begin + i < pcm.length; i++) {
                double t = i / (double) count;
                double freq = tone.from() + (tone.to() - tone.from()) * t;
                phase += 2 * Math.PI * freq / RATE;
                // Quick attack, smooth exponential release: a soft "pling" instead of a beep.
                double env = Math.min(1, i / (RATE * .004)) * Math.exp(-4.2 * t);
                double sample = (Math.sin(phase) + .25 * Math.sin(phase * 2) + .08 * Math.sin(phase * 3)) / 1.33;
                int value = pcm[begin + i] + (int) (sample * env * tone.gain() * 32767);
                pcm[begin + i] = (short) Math.clamp(value, Short.MIN_VALUE, Short.MAX_VALUE);
            }
        }
        return pcm;
    }

    private static short[] samples(Sound sound) {
        return switch (sound) {
            // Rising two-note chime when the Right-Shift menu opens.
            case OPEN -> render(.34, new Tone(660, 660, .22, .32, 0), new Tone(990, 990, .26, .28, .07));
            // Soft upward glide as the window slides in.
            case WINDOW -> render(.26, new Tone(420, 760, .24, .30, 0), new Tone(840, 1320, .18, .10, .02));
            // Module on: bright blip upward; off: duller blip downward.
            case ON -> render(.16, new Tone(780, 1180, .14, .34, 0));
            case OFF -> render(.16, new Tone(620, 380, .14, .30, 0));
            case CLICK -> render(.07, new Tone(1500, 1300, .05, .22, 0));
            // Notification: two gentle bell notes.
            case NOTIFY -> render(.42, new Tone(1046, 1046, .28, .20, 0), new Tone(1318, 1318, .32, .18, .09));
        };
    }

    private static boolean setUp() {
        if (failed) return false;
        if (sources != null) return true;
        try {
            sources = new int[SOURCES];
            AL10.alGenSources(sources);
            for (Sound sound : Sound.values()) {
                short[] pcm = samples(sound);
                ShortBuffer data = BufferUtils.createShortBuffer(pcm.length).put(pcm);
                data.flip();
                int buffer = AL10.alGenBuffers();
                AL10.alBufferData(buffer, AL10.AL_FORMAT_MONO16, data, RATE);
                BUFFERS.put(sound, buffer);
            }
            for (int source : sources) AL10.alSourcei(source, AL10.AL_SOURCE_RELATIVE, AL10.AL_TRUE);
            if (AL10.alGetError() != AL10.AL_NO_ERROR) throw new IllegalStateException("OpenAL error");
            return true;
        } catch (Throwable e) {
            failed = true;
            sources = null;
            return false;
        }
    }

    public static void play(Sound sound) {
        MinecraftClient mc = MinecraftClient.getInstance();
        float volume = mc.options.getSoundVolume(SoundCategory.MASTER);
        if (SaviraClient.config != null && !SaviraClient.config.uiSounds) return;
        if (volume <= 0 || !setUp()) return;
        try {
            int source = sources[next++ % SOURCES];
            AL10.alSourceStop(source);
            AL10.alSourcei(source, AL10.AL_BUFFER, BUFFERS.get(sound));
            AL10.alSourcef(source, AL10.AL_GAIN, .6f * volume);
            AL10.alSourcePlay(source);
        } catch (Throwable e) {
            failed = true;
        }
    }

    /** For the UI test: true once the sounds were created. */
    public static boolean ready() { return sources != null && !failed; }
}

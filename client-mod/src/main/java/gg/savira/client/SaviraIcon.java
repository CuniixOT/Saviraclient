package gg.savira.client;

import net.minecraft.client.MinecraftClient;
import net.minecraft.text.MutableText;
import net.minecraft.text.Style;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import net.minecraft.util.Identifier;
import java.util.List;
import java.util.UUID;

/**
 * The Icon module: Savira's icon in front of a player's name (nametag and tab list).
 * The icons are glyphs of the bitmap font savira:icons, so they sit inside the name text.
 * For now only this player is known to use Savira; others follow with the Savira server.
 */
public final class SaviraIcon {
    /** tint 0 means the logo in its own colours. */
    public record Type(String id, String label, char glyph, int tint) {}
    public static final List<Type> TYPES = List.of(new Type("beta", "Beta", '\uE001', 0xFFF2C35B), new Type("default", "Default", '\uE000', 0), new Type("creator", "Creator Code", '\uE002', 0xFFE36BB5));
    private static final Identifier FONT = Identifier.of("savira", "icons");
    private SaviraIcon() {}

    public static Type current() {
        String id = SaviraClient.config.iconType;
        return TYPES.stream().filter(t -> t.id().equals(id)).findFirst().orElse(TYPES.get(1));
    }

    /** The icon glyph as text; white, so team colours do not tint it. */
    public static MutableText glyph(Type type) {
        return Text.literal(String.valueOf(type.glyph())).setStyle(Style.EMPTY.withFont(FONT).withColor(Formatting.WHITE));
    }

    public static boolean usesSavira(UUID id) {
        UUID self = MinecraftClient.getInstance().getSession().getUuidOrNull();
        return id != null && id.equals(self);
    }

    /** name with the icon in front, or name unchanged when the module or this place is off. */
    public static Text decorate(Text name, UUID player, boolean tablist) {
        HudConfig c = SaviraClient.config;
        if (c == null || !c.icon || name == null || !usesSavira(player) || !(tablist ? c.iconTablist : c.iconNametag)) return name;
        MutableText result = Text.empty().append(glyph(current()));
        if (c.iconSpace) result.append(" ");
        return result.append(name);
    }
}

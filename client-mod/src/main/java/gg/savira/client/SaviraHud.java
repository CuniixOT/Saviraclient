package gg.savira.client;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.font.TextRenderer;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.tooltip.TooltipBackgroundRenderer;
import net.minecraft.client.network.PlayerListEntry;
import net.minecraft.entity.effect.StatusEffectInstance;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import org.lwjgl.glfw.GLFW;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public final class SaviraHud {
    private SaviraHud() {}
    public record Bounds(int x, int y, int width, int height, float scale) {
        public boolean contains(double mx, double my) { return mx >= x && mx <= x + width && my >= y && my <= y + height; }
    }

    /** Unscaled size: text modules fit their template, the others keep their fixed layout. */
    public static int[] size(HudModule module) {
        if (!module.textual()) return new int[]{module.width, module.height};
        TextRenderer font = MinecraftClient.getInstance().textRenderer;
        String sample = fill(template(module), Map.of("value", module.sample("value"), "left", module.sample("left"), "right", module.sample("right")));
        return new int[]{Math.max(26, font.getWidth(sample) + 12), 16};
    }

    public static Bounds bounds(HudModule module, int width, int height) {
        HudConfig c = SaviraClient.config;
        HudConfig.Placement p = c.placement(module);
        int[] size = size(module);
        float scale = Math.min(c.scale * p.size, Math.min((width - 8f) / size[0], (height - 8f) / size[1]));
        int w = (int) Math.ceil(size[0] * scale), h = (int) Math.ceil(size[1] * scale);
        return new Bounds(Math.round(p.x * Math.max(0, width - w)), Math.round(p.y * Math.max(0, height - h)), w, h, scale);
    }
    public static void render(DrawContext context) {
        MinecraftClient mc = MinecraftClient.getInstance();
        if (mc.player == null || mc.options.hudHidden || mc.getDebugHud().shouldShowDebugHud() || mc.currentScreen instanceof HudScreen) return;
        renderModules(context, false);
    }
    public static void renderModules(DrawContext context, boolean preview) {
        MinecraftClient mc = MinecraftClient.getInstance();
        for (HudModule module : HudModule.values()) {
            if (!module.enabled()) continue;
            Bounds b = bounds(module, mc.getWindow().getScaledWidth(), mc.getWindow().getScaledHeight());
            context.getMatrices().push();
            context.getMatrices().translate(b.x, b.y, 0);
            context.getMatrices().scale(b.scale, b.scale, 1);
            drawModule(context, mc, module, preview);
            context.getMatrices().pop();
        }
    }

    /** One module centred in a box, for the live preview on its settings page. */
    public static void renderPreview(DrawContext context, HudModule module, int x, int y, int w, int h) {
        int[] size = size(module);
        float scale = Math.min(SaviraClient.config.scale * SaviraClient.config.placement(module).size, Math.min(w / (float) size[0], h / (float) size[1]));
        context.getMatrices().push();
        context.getMatrices().translate(x + (w - size[0] * scale) / 2f, y + (h - size[1] * scale) / 2f, 0);
        context.getMatrices().scale(scale, scale, 1);
        drawModule(context, MinecraftClient.getInstance(), module, true);
        context.getMatrices().pop();
    }

    static String template(HudModule module) {
        String custom = SaviraClient.config.style(module).text;
        return custom != null ? custom : module.defaultText();
    }
    static String fill(String template, Map<String, String> values) {
        String out = template;
        for (Map.Entry<String, String> e : values.entrySet()) out = out.replace("{" + e.getKey() + "}", e.getValue());
        return out;
    }

    /** Draws one of the selectable backgrounds into a w×h box at the origin. */
    public static void background(DrawContext c, HudConfig.Style style, int x, int y, int w, int h) {
        int r = style.radius;
        switch (HudBackground.parse(style.background)) {
            case BLANK -> { }
            case VANILLA -> MenuStyle.round(c, x, y, w, h, r, 0x90000000);
            case DARK_PANEL -> {
                MenuStyle.outlined(c, x, y, w, h, r, 0xC02A2F37, 0xE00D1014);
                if (h >= 12) c.fill(x, y + Math.min(5, h / 4), x + 2, y + h - Math.min(5, h / 4), MenuStyle.accent());
            }
            case TOOLTIP -> TooltipBackgroundRenderer.render(c, x + 3, y + 3, Math.max(1, w - 6), Math.max(1, h - 6), 0);
            // A true per-element blur needs a shader pass; a light frosted panel gives the same read over the world.
            case BLUR -> MenuStyle.outlined(c, x, y, w, h, r, 0x38FFFFFF, 0x46B4BEC8);
            case COLOR -> MenuStyle.round(c, x, y, w, h, r, style.backgroundColor);
            case OUTLINE -> {
                int line = style.backgroundColor | 0xFF000000;
                MenuStyle.outlined(c, x, y, w, h, r, line, 0x30000000);
            }
        }
    }

    private static void text(DrawContext c, TextRenderer font, String text, int x, int y, int color, boolean shadow) {
        c.drawText(font, text, x, y, color, shadow);
    }

    private static void drawModule(DrawContext c, MinecraftClient mc, HudModule module, boolean preview) {
        HudConfig.Style style = SaviraClient.config.style(module);
        TextRenderer font = mc.textRenderer;
        int[] size = size(module);
        if (module != HudModule.KEYSTROKES) background(c, style, 0, 0, size[0], size[1]);
        int color = style.textColor;
        boolean shadow = style.textShadow;
        if (module.textual()) {
            String line = fill(template(module), values(mc, module));
            text(c, font, line, (size[0] - font.getWidth(line)) / 2, (size[1] - 8) / 2 + 1, color, shadow);
            return;
        }
        switch (module) {
            case COORDINATES -> {
                String position = mc.player == null ? "X --  Y --  Z --" : "X " + mc.player.getBlockX() + "  Y " + mc.player.getBlockY() + "  Z " + mc.player.getBlockZ();
                text(c, font, font.trimToWidth(position, 136), 8, 7, color, shadow);
                text(c, font, "Richtung: " + facingName(mc), 8, 22, color, shadow);
                text(c, font, font.trimToWidth("Biom: " + biomeName(mc), 136), 8, 37, MenuStyle.MUTED, shadow);
            }
            case POTIONS -> {
                List<StatusEffectInstance> effects = mc.player == null ? List.of() : new ArrayList<>(mc.player.getStatusEffects());
                if (effects.isEmpty()) {
                    if (preview) {
                        effectRow(c, font, module.width, "Stärke II", "1:20", 7, color, shadow);
                        effectRow(c, font, module.width, "Speed", "0:45", 22, color, shadow);
                        effectRow(c, font, module.width, "Feuerschutz", "3:07", 37, color, shadow);
                    } else {
                        text(c, font, "Keine Effekte", (module.width - font.getWidth("Keine Effekte")) / 2, 24, MenuStyle.MUTED, shadow);
                    }
                } else {
                    int rows = Math.min(3, effects.size());
                    for (int i = 0; i < rows; i++) {
                        StatusEffectInstance effect = effects.get(i);
                        String name = effect.getEffectType().value().getName().getString();
                        if (effect.getAmplifier() > 0) name += " " + (effect.getAmplifier() + 1);
                        effectRow(c, font, module.width, name, formatDuration(effect.getDuration()), 7 + i * 15, color, shadow);
                    }
                    if (effects.size() > 3) text(c, font, "+" + (effects.size() - 3), 8, 52, MenuStyle.MUTED, false);
                }
            }
            case KEYSTROKES -> {
                boolean active = mc.currentScreen == null;
                key(c, font, style, "W", 29, 0, 27, active && mc.options.forwardKey.isPressed());
                key(c, font, style, "A", 0, 29, 27, active && mc.options.leftKey.isPressed());
                key(c, font, style, "S", 29, 29, 27, active && mc.options.backKey.isPressed());
                key(c, font, style, "D", 58, 29, 27, active && mc.options.rightKey.isPressed());
                long handle = mc.getWindow().getHandle();
                key(c, font, style, "LMB", 0, 58, 41, active && GLFW.glfwGetMouseButton(handle, 0) == GLFW.GLFW_PRESS);
                key(c, font, style, "RMB", 44, 58, 41, active && GLFW.glfwGetMouseButton(handle, 1) == GLFW.GLFW_PRESS);
                key(c, font, style, "SPACE", 0, 87, 85, active && mc.options.jumpKey.isPressed());
            }
            case ARMOR -> {
                boolean equipped = false;
                for (int slot = 3; slot >= 0; slot--) {
                    ItemStack stack = mc.player == null ? ItemStack.EMPTY : mc.player.getInventory().armor.get(slot);
                    boolean example = stack.isEmpty();
                    equipped |= !example;
                    if (example && preview) stack = new ItemStack(switch (slot) { case 3 -> Items.IRON_HELMET; case 2 -> Items.IRON_CHESTPLATE; case 1 -> Items.IRON_LEGGINGS; default -> Items.IRON_BOOTS; });
                    int x = 6 + (3 - slot) * 23;
                    if (!stack.isEmpty()) {
                        c.drawItem(stack, x, 5);
                        c.fill(x, 26, x + 16, 28, 0xFF3A3A3A);
                        float remaining = stack.isDamageable() ? 1f - (float) stack.getDamage() / stack.getMaxDamage() : 1f;
                        c.fill(x, 26, x + Math.round(16 * remaining), 28, example ? 0xFF8A8A8A : MenuStyle.accent());
                    }
                }
                if (!equipped && !preview) text(c, font, "Keine Rüstung", (module.width - font.getWidth("Keine Rüstung")) / 2, 15, MenuStyle.MUTED, shadow);
            }
            default -> { }
        }
    }

    private static Map<String, String> values(MinecraftClient mc, HudModule module) {
        return switch (module) {
            case FPS -> Map.of("value", Integer.toString(mc.getCurrentFps()));
            case CPS -> Map.of("left", Integer.toString(ClickTracker.left()), "right", Integer.toString(ClickTracker.right()));
            case PING -> {
                PlayerListEntry entry = mc.player == null || mc.getNetworkHandler() == null ? null : mc.getNetworkHandler().getPlayerListEntry(mc.player.getUuid());
                yield Map.of("value", mc.isInSingleplayer() ? "LOCAL" : entry == null ? "--" : Integer.toString(entry.getLatency()));
            }
            case SPRINT -> Map.of("value", mc.player == null ? "BEREIT" : mc.player.isSprinting() ? "SPRINTEN" : mc.player.isSneaking() ? "SCHLEICHEN" : "LAUFEN");
            case ZOOM -> Map.of("value", SaviraClient.zoomActive ? "AKTIV" : "BEREIT (C)");
            case RAM -> {
                Runtime runtime = Runtime.getRuntime();
                yield Map.of("value", (runtime.totalMemory() - runtime.freeMemory()) / 1048576 + " / " + runtime.maxMemory() / 1048576);
            }
            default -> Map.of();
        };
    }

    private static String facingName(MinecraftClient mc) {
        if (mc.player == null) return "--";
        return switch (mc.player.getHorizontalFacing().asString().toLowerCase(Locale.ROOT)) {
            case "north" -> "Norden"; case "south" -> "Süden";
            case "east" -> "Osten"; case "west" -> "Westen";
            default -> mc.player.getHorizontalFacing().asString();
        };
    }

    private static String biomeName(MinecraftClient mc) {
        try {
            if (mc.world == null || mc.player == null) return "--";
            var key = mc.world.getBiome(mc.player.getBlockPos()).getKey();
            if (key.isEmpty()) return "--";
            String[] parts = key.get().getValue().getPath().split("_");
            StringBuilder name = new StringBuilder();
            for (String part : parts) {
                if (part.isEmpty()) continue;
                if (!name.isEmpty()) name.append(' ');
                name.append(Character.toUpperCase(part.charAt(0))).append(part.substring(1));
            }
            return name.toString();
        } catch (RuntimeException e) {
            return "--";
        }
    }

    private static String formatDuration(int ticks) {
        int seconds = Math.max(0, ticks / 20);
        return (seconds / 60) + ":" + String.format(Locale.ROOT, "%02d", seconds % 60);
    }

    private static void effectRow(DrawContext c, TextRenderer font, int boxWidth, String name, String duration, int y, int color, boolean shadow) {
        text(c, font, font.trimToWidth(name, boxWidth - 48), 8, y, color, shadow);
        int width = font.getWidth(duration);
        text(c, font, duration, boxWidth - 8 - width, y, MenuStyle.accent(), false);
    }

    /** Each key gets the module's background; pressed keys light up in Savira mint. */
    private static void key(DrawContext c, TextRenderer font, HudConfig.Style style, String label, int x, int y, int width, boolean pressed) {
        if (pressed) MenuStyle.round(c, x, y, width, 27, style.radius, MenuStyle.accent());
        else if (HudBackground.parse(style.background) == HudBackground.BLANK) MenuStyle.round(c, x, y, width, 27, style.radius, 0x40000000);
        else background(c, style, x, y, width, 27);
        c.drawText(font, label, x + (width - font.getWidth(label)) / 2, y + 10, pressed ? 0xFF090909 : style.textColor, !pressed && style.textShadow);
    }
}

package gg.savira.client;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.network.PlayerListEntry;
import net.minecraft.entity.effect.StatusEffectInstance;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import org.lwjgl.glfw.GLFW;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public final class SaviraHud {
    private SaviraHud() {}
    public record Bounds(int x, int y, int width, int height, float scale) {
        public boolean contains(double mx, double my) { return mx >= x && mx <= x + width && my >= y && my <= y + height; }
    }
    public static Bounds bounds(HudModule module, int width, int height) {
        HudConfig c = SaviraClient.config;
        HudConfig.Placement p = c.placement(module);
        float scale = Math.min(c.scale * p.size, Math.min((width - 8f) / module.width, (height - 8f) / module.height));
        int w = (int) Math.ceil(module.width * scale), h = (int) Math.ceil(module.height * scale);
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
    private static void drawModule(DrawContext c, MinecraftClient mc, HudModule module, boolean preview) {
        if (module != HudModule.KEYSTROKES) {
            MenuStyle.round(c, 0, 0, module.width, module.height, 4, 0xD20B0B0B);
            c.fill(0, 7, 2, module.height - 7, MenuStyle.accent());
        }
        switch (module) {
            case FPS -> metric(c, mc, "FPS", Integer.toString(mc.getCurrentFps()));
            case CPS -> metric(c, mc, "L / R CPS", ClickTracker.left() + " / " + ClickTracker.right());
            case PING -> {
                PlayerListEntry entry = mc.player == null || mc.getNetworkHandler() == null ? null : mc.getNetworkHandler().getPlayerListEntry(mc.player.getUuid());
                metric(c, mc, "PING", mc.isInSingleplayer() ? "LOCAL" : entry == null ? "--" : entry.getLatency() + " ms");
            }
            case COORDINATES -> {
                String position = mc.player == null ? "X --  Y --  Z --" : "X " + mc.player.getBlockX() + "  Y " + mc.player.getBlockY() + "  Z " + mc.player.getBlockZ();
                c.drawTextWithShadow(mc.textRenderer, mc.textRenderer.trimToWidth(position, 136), 8, 7, MenuStyle.TEXT);
                c.drawTextWithShadow(mc.textRenderer, "Richtung: " + facingName(mc), 8, 22, MenuStyle.TEXT);
                c.drawTextWithShadow(mc.textRenderer, mc.textRenderer.trimToWidth("Biom: " + biomeName(mc), 136), 8, 37, MenuStyle.MUTED);
            }
            case POTIONS -> {
                List<StatusEffectInstance> effects = mc.player == null ? List.of() : new ArrayList<>(mc.player.getStatusEffects());
                if (effects.isEmpty()) {
                    if (preview) {
                        effectRow(c, mc, module.width, "Stärke II", "1:20", 7);
                        effectRow(c, mc, module.width, "Speed", "0:45", 22);
                        effectRow(c, mc, module.width, "Feuerschutz", "3:07", 37);
                    } else {
                        c.drawCenteredTextWithShadow(mc.textRenderer, "Keine Effekte", module.width / 2, 24, MenuStyle.MUTED);
                    }
                } else {
                    int rows = Math.min(3, effects.size());
                    for (int i = 0; i < rows; i++) {
                        StatusEffectInstance effect = effects.get(i);
                        String name = effect.getEffectType().value().getName().getString();
                        if (effect.getAmplifier() > 0) name += " " + (effect.getAmplifier() + 1);
                        effectRow(c, mc, module.width, name, formatDuration(effect.getDuration()), 7 + i * 15);
                    }
                    if (effects.size() > 3) c.drawText(mc.textRenderer, "+" + (effects.size() - 3), 8, 52, MenuStyle.MUTED, false);
                }
            }
            case SPRINT -> {
                String state = mc.player == null ? "BEREIT" : mc.player.isSprinting() ? "SPRINTEN" : mc.player.isSneaking() ? "SCHLEICHEN" : "LAUFEN";
                metric(c, mc, "STATUS", state);
            }
            case ZOOM -> metric(c, mc, "ZOOM", SaviraClient.zoomActive ? "AKTIV" : "BEREIT (C)");
            case RAM -> {
                Runtime runtime = Runtime.getRuntime();
                long used = (runtime.totalMemory() - runtime.freeMemory()) / 1048576;
                long max = runtime.maxMemory() / 1048576;
                metric(c, mc, "RAM MB", used + " / " + max);
            }
            case KEYSTROKES -> {
                boolean active = mc.currentScreen == null;
                key(c, mc, "W", 29, 0, 27, active && mc.options.forwardKey.isPressed());
                key(c, mc, "A", 0, 29, 27, active && mc.options.leftKey.isPressed());
                key(c, mc, "S", 29, 29, 27, active && mc.options.backKey.isPressed());
                key(c, mc, "D", 58, 29, 27, active && mc.options.rightKey.isPressed());
                long handle = mc.getWindow().getHandle();
                key(c, mc, "LMB", 0, 58, 41, active && GLFW.glfwGetMouseButton(handle, 0) == GLFW.GLFW_PRESS);
                key(c, mc, "RMB", 44, 58, 41, active && GLFW.glfwGetMouseButton(handle, 1) == GLFW.GLFW_PRESS);
                key(c, mc, "SPACE", 0, 87, 85, active && mc.options.jumpKey.isPressed());
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
                if (!equipped && !preview) c.drawCenteredTextWithShadow(mc.textRenderer, "Keine Rüstung", 50, 15, MenuStyle.MUTED);
            }
        }
    }
    private static void metric(DrawContext c, MinecraftClient mc, String label, String value) {
        c.drawTextWithShadow(mc.textRenderer, value, 8, 5, MenuStyle.TEXT);
        c.getMatrices().push();
        c.getMatrices().scale(.65f, .65f, 1);
        c.drawText(mc.textRenderer, label, 12, 25, MenuStyle.accent(), false);
        c.getMatrices().pop();
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

    private static void effectRow(DrawContext c, MinecraftClient mc, int boxWidth, String name, String duration, int y) {
        c.drawTextWithShadow(mc.textRenderer, mc.textRenderer.trimToWidth(name, boxWidth - 48), 8, y, MenuStyle.TEXT);
        int width = mc.textRenderer.getWidth(duration);
        c.drawText(mc.textRenderer, duration, boxWidth - 8 - width, y, MenuStyle.accent(), false);
    }

    private static void key(DrawContext c, MinecraftClient mc, String label, int x, int y, int width, boolean pressed) {
        MenuStyle.round(c, x, y, width, 27, 4, pressed ? MenuStyle.accent() : 0xD20B0B0B);
        c.drawText(mc.textRenderer, label, x + (width - mc.textRenderer.getWidth(label)) / 2, y + 10, pressed ? 0xFF090909 : MenuStyle.TEXT, false);
    }
}

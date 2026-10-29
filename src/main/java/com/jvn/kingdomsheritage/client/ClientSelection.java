package com.jvn.kingdomsheritage.client;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.jvn.kingdomsheritage.KingdomsHeritage;
import com.jvn.kingdomsheritage.network.HeritageNetwork;
import java.util.List;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.network.chat.Component;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.fml.event.lifecycle.FMLClientSetupEvent;
import net.neoforged.neoforge.client.event.ClientPlayerNetworkEvent;
import net.neoforged.neoforge.client.event.ClientTickEvent;
import net.neoforged.neoforge.client.event.MovementInputUpdateEvent;
import net.neoforged.neoforge.common.NeoForge;

@EventBusSubscriber(modid = KingdomsHeritage.MOD_ID, value = Dist.CLIENT)
public final class ClientSelection {
    private static JsonObject catalog;
    private static SpawnSelectScreen selection;
    private static KitSelection kits;
    private static String progress = "";

    private ClientSelection() {}

    @SubscribeEvent
    public static void setup(FMLClientSetupEvent event) {
        HeritageNetwork.clientReceiver = ClientSelection::receive;
        NeoForge.EVENT_BUS.addListener(ClientSelection::tick);
        NeoForge.EVENT_BUS.addListener(ClientSelection::movement);
        NeoForge.EVENT_BUS.addListener(ClientSelection::logout);
        KitSelection.register();
        SpawnIntroOverlay.register();
        NeoForge.EVENT_BUS.addListener(ClientSelection::hideHud);
        NeoForge.EVENT_BUS.addListener(ClientSelection::renderIntroAfterHud);
        NeoForge.EVENT_BUS.addListener(ClientSelection::hideHand);
    }

    private static void receive(String json) {
        JsonObject next = JsonParser.parseString(json).getAsJsonObject();
        Minecraft minecraft = Minecraft.getInstance();
        if (next.has("progress")) {
            progress = next.get("progress").getAsString();
            if (progress.equals("retry")) {
                if (kits != null) kits.retry();
                else if (selection != null) selection.retry();
                progress = "";
            }
            return;
        }
        SpawnIntroOverlay.clear();
        progress = "";
        String spawnId = kits != null ? kits.spawnId() : selection == null ? null : selection.selectedId();
        String kitId = kits == null ? null : kits.kitId();
        if (kits != null) {
            kits.restore();
            if (minecraft.player != null) minecraft.player.closeContainer();
        }
        kits = null;
        if (!next.has("spawns")) {
            catalog = null;
            selection = null;
            if (minecraft.player != null) minecraft.player.closeContainer();
            minecraft.setScreen(null);
            if (next.has("intro")) SpawnIntroOverlay.start(next);
            return;
        }
        catalog = next;
        selection = new SpawnSelectScreen(catalog);
        selection.restoreSelection(spawnId);
        if (minecraft.level != null && minecraft.player != null) {
            minecraft.setScreen(selection);
            if (kitId != null && selection.selectedId() != null && !allowedKits(catalog, spawnId).isEmpty()) {
                kits = new KitSelection(catalog, spawnId);
                kits.restoreSelection(kitId);
                kits.openInventory();
            }
        }
    }

    private static void hideHud(net.neoforged.neoforge.client.event.RenderGuiEvent.Pre event) {
        if (catalog != null) {
            event.setCanceled(true);
        } else if (SpawnIntroOverlay.hidesHud()) {
            event.setCanceled(true);
            renderIntro(event.getGuiGraphics(), event.getPartialTick().getGameTimeDeltaPartialTick(false));
        }
    }

    private static void renderIntroAfterHud(net.neoforged.neoforge.client.event.RenderGuiEvent.Post event) {
        renderIntro(event.getGuiGraphics(), event.getPartialTick().getGameTimeDeltaPartialTick(false));
    }

    private static void renderIntro(net.minecraft.client.gui.GuiGraphics graphics, float partialTick) {
        if (!SpawnIntroOverlay.active()) return;
        graphics.flush();
        com.mojang.blaze3d.systems.RenderSystem.clear(org.lwjgl.opengl.GL11.GL_DEPTH_BUFFER_BIT, Minecraft.ON_OSX);
        SpawnIntroOverlay.render(graphics, partialTick);
        graphics.flush();
    }

    private static void hideHand(net.neoforged.neoforge.client.event.RenderHandEvent event) {
        if (catalog != null) event.setCanceled(true);
    }

    static void openKits(String spawn) {
        kits = new KitSelection(catalog, spawn);
        kits.openInventory();
    }

    static Component progress() {
        return Component.translatable("screen.kingdomsheritage."
                + (progress.isEmpty() ? "wait" : progress));
    }

    static List<JsonObject> allowedKits(JsonObject catalog, String spawnId) {
        var spawn = catalog.getAsJsonArray("spawns").asList().stream().map(value -> value.getAsJsonObject())
                .filter(value -> value.get("id").getAsString().equals(spawnId)).findFirst().orElse(null);
        return catalog.getAsJsonArray("kits").asList().stream().map(value -> value.getAsJsonObject())
                .filter(kit -> spawn == null || !spawn.has("kits") || spawn.getAsJsonArray("kits").asList().stream()
                        .anyMatch(id -> id.getAsString().equals(kit.get("id").getAsString()))).toList();
    }

    static KitSelection kits() { return kits; }

    public static boolean choosingKit() { return kits != null; }

    static void back() {
        if (kits != null) kits.restore();
        kits = null;
        Minecraft minecraft = Minecraft.getInstance();
        minecraft.player.closeContainer();
        minecraft.setScreen(selection);
    }

    private static void tick(ClientTickEvent.Post event) {
        SpawnIntroOverlay.tick();
        Minecraft minecraft = Minecraft.getInstance();
        if (catalog == null || minecraft.level == null || minecraft.player == null) return;
        if (kits != null) {
            kits.tick();
            if (!KitSelection.isInventory(minecraft.screen) && !KitSelection.isLayoutPicker(minecraft.screen)) kits.openInventory();
        } else if (!(minecraft.screen instanceof SpawnSelectScreen)) {
            minecraft.setScreen(selection);
        }
    }

    private static void movement(MovementInputUpdateEvent event) {
        if (catalog == null && !SpawnIntroOverlay.blocked()) return;
        var input = event.getInput();
        input.forwardImpulse = 0;
        input.leftImpulse = 0;
        input.jumping = false;
        input.shiftKeyDown = false;
        input.up = input.down = input.left = input.right = false;
    }

    private static void logout(ClientPlayerNetworkEvent.LoggingOut event) {
        SpawnIntroOverlay.clear();
        if (kits != null) kits.restore();
        kits = null;
        catalog = null;
        selection = null;
        progress = "";
    }

    static void disconnect() {
        SpawnIntroOverlay.clear();
        Minecraft minecraft = Minecraft.getInstance();
        if (kits != null) kits.restore();
        kits = null;
        catalog = null;
        selection = null;
        if (minecraft.level != null) minecraft.level.disconnect();
        minecraft.disconnect();
        minecraft.setScreen(new TitleScreen());
    }
}

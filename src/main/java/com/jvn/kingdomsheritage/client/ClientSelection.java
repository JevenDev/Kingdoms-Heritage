package com.jvn.kingdomsheritage.client;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.jvn.kingdomsheritage.KingdomsHeritage;
import com.jvn.kingdomsheritage.network.HeritageNetwork;
import java.util.List;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.GenericMessageScreen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.network.ConnectionProtocol;
import net.minecraft.network.chat.Component;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.fml.event.lifecycle.FMLClientSetupEvent;
import net.neoforged.neoforge.client.event.ClientPlayerNetworkEvent;
import net.neoforged.neoforge.client.event.ClientTickEvent;
import net.neoforged.neoforge.client.event.MovementInputUpdateEvent;
import net.neoforged.neoforge.common.NeoForge;
import net.neoforged.neoforge.network.registration.NetworkRegistry;

@EventBusSubscriber(modid = KingdomsHeritage.MOD_ID, value = Dist.CLIENT)
public final class ClientSelection {
    private static JsonObject catalog;
    private static SpawnSelectScreen selection;
    private static KitSelection kits;
    private static FinalConfirmationScreen finalReview;
    private static String progress = "";

    private ClientSelection() {}

    @SubscribeEvent
    public static void setup(FMLClientSetupEvent event) {
        HeritageNetwork.clientReceiver = ClientSelection::receive;
        HeritageNetwork.joinReceiver = pending -> {
            if (pending) SelectionTransition.join();
            else SelectionTransition.arrive();
        };
        NeoForge.EVENT_BUS.addListener(ClientSelection::tick);
        NeoForge.EVENT_BUS.addListener(ClientSelection::movement);
        NeoForge.EVENT_BUS.addListener(ClientSelection::login);
        NeoForge.EVENT_BUS.addListener(ClientSelection::logout);
        KitSelection.register();
        SpawnIntroOverlay.register();
        SelectionMusic.register();
        SelectionTransition.register();
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
                SelectionSounds.ERROR.play();
                if (finalReview != null) finalReview.retry();
                else if (kits != null) kits.retry();
                else if (selection != null) selection.retry();
                progress = "";
                SelectionTransition.reveal();
            }
            return;
        }
        if (next.has("review")) {
            var review = next.getAsJsonObject("review");
            if (catalog == null || review.get("revision").getAsLong() != catalog.get("revision").getAsLong()) {
                net.neoforged.neoforge.network.PacketDistributor.sendToServer(new HeritageNetwork.ReviewDecision(
                        java.util.UUID.fromString(review.get("token").getAsString()), false));
                return;
            }
            progress = "";
            if (kits != null) kits.close();
            finalReview = new FinalConfirmationScreen(catalog, review);
            minecraft.setScreen(finalReview);
            SelectionTransition.reveal();
            return;
        }
        finalReview = null;
        SpawnIntroOverlay.clear();
        boolean confirmed = progress.equals("applying");
        progress = "";
        String spawnId = kits != null ? kits.spawnId() : selection == null ? null : selection.selectedId();
        String kitId = kits == null ? null : kits.kitId();
        if (kits != null) {
            kits.close();
            if (minecraft.player != null) minecraft.player.closeContainer();
        }
        kits = null;
        if (!next.has("spawns")) {
            if (confirmed) SelectionSounds.CONFIRMATION.play();
            catalog = null;
            selection = null;
            if (minecraft.player != null) minecraft.player.closeContainer();
            minecraft.setScreen(null);
            if (next.has("intro")) SpawnIntroOverlay.start(next);
            SelectionTransition.arrive();
            return;
        }
        if (!SelectionTransition.joining()) SelectionTransition.reveal();
        if (!next.get("error").getAsString().isEmpty()) SelectionSounds.ERROR.play();
        else if (catalog != null) SelectionSounds.NOTICE.play();
        catalog = next;
        selection = new SpawnSelectScreen(catalog);
        selection.restoreSelection(spawnId);
        if (minecraft.level != null && minecraft.player != null) {
            minecraft.setScreen(selection);
            if (kitId != null && selection.selectedId() != null && allowedKits(catalog, spawnId).size() > 1) {
                kits = new KitSelection(catalog, spawnId);
                kits.restoreSelection(kitId);
                kits.openInventory();
            }
            if (SelectionTransition.joining()) SelectionTransition.reveal();
        }
    }

    private static void hideHud(net.neoforged.neoforge.client.event.RenderGuiEvent.Pre event) {
        if (catalog != null || SelectionTransition.joining() || SpawnIntroOverlay.hidesHud()) {
            event.setCanceled(true);
            renderIntro(event.getGuiGraphics(), event.getPartialTick().getGameTimeDeltaPartialTick(false));
        }
    }

    private static void renderIntroAfterHud(net.neoforged.neoforge.client.event.RenderGuiEvent.Post event) {
        renderIntro(event.getGuiGraphics(), event.getPartialTick().getGameTimeDeltaPartialTick(false));
    }

    private static void renderIntro(net.minecraft.client.gui.GuiGraphics graphics, float partialTick) {
        if (!SpawnIntroOverlay.active() && !SelectionTransition.active()) return;
        graphics.flush();
        com.mojang.blaze3d.systems.RenderSystem.clear(org.lwjgl.opengl.GL11.GL_DEPTH_BUFFER_BIT, Minecraft.ON_OSX);
        SpawnIntroOverlay.render(graphics, partialTick);
        if (Minecraft.getInstance().screen == null) SelectionTransition.render(graphics);
        graphics.flush();
    }

    private static void hideHand(net.neoforged.neoforge.client.event.RenderHandEvent event) {
        if (catalog != null || SelectionTransition.active()) event.setCanceled(true);
    }

    static void openKits(String spawn) {
        SelectionTransition.fadeOut(() -> {
            kits = new KitSelection(catalog, spawn);
            kits.openInventory();
            SelectionTransition.reveal();
        });
    }

    static void review(String spawn, String kit) {
        var request = new HeritageNetwork.Choose(spawn, kit, catalog.get("revision").getAsLong());
        SelectionTransition.fadeOut(() -> net.neoforged.neoforge.network.PacketDistributor.sendToServer(new HeritageNetwork.Review(request)));
    }

    static void cancelReview(java.util.UUID token) {
        net.neoforged.neoforge.network.PacketDistributor.sendToServer(new HeritageNetwork.ReviewDecision(token, false));
        finalReview = null;
        progress = "";
        if (kits != null) {
            kits.retry();
            kits.openInventory();
        } else {
            selection.retry();
            Minecraft.getInstance().setScreen(selection);
        }
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
        SelectionTransition.fadeOut(() -> {
            if (kits != null) kits.close();
            kits = null;
            Minecraft minecraft = Minecraft.getInstance();
            minecraft.player.closeContainer();
            minecraft.setScreen(selection);
            SelectionTransition.reveal();
        });
    }

    private static void tick(ClientTickEvent.Post event) {
        SelectionTransition.tick();
        SpawnIntroOverlay.tick();
        SelectionMusic.tick(catalog != null && !progress.equals("applying"));
        Minecraft minecraft = Minecraft.getInstance();
        if (catalog == null || minecraft.level == null || minecraft.player == null) return;
        if (finalReview != null) {
            if (minecraft.screen != finalReview) minecraft.setScreen(finalReview);
        } else if (kits != null) {
            kits.tick();
            if (!KitSelection.isInventory(minecraft.screen) && !KitSelection.isLayoutPicker(minecraft.screen)) kits.openInventory();
        } else if (!(minecraft.screen instanceof SpawnSelectScreen)) {
            minecraft.setScreen(selection);
        }
        if (SelectionTransition.joining()) SelectionTransition.reveal();
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

    private static void login(ClientPlayerNetworkEvent.LoggingIn event) {
        if (NetworkRegistry.hasChannel(event.getConnection(), ConnectionProtocol.PLAY, HeritageNetwork.JoinState.TYPE.id())) {
            SelectionTransition.join();
        } else if (SelectionTransition.joining()) {
            SelectionTransition.clear();
        }
    }

    private static void logout(ClientPlayerNetworkEvent.LoggingOut event) {
        SelectionMusic.stop();
        // starting an integrated server also fires a logout without a connection
        if (event.getConnection() != null || !SelectionTransition.joining()) SelectionTransition.clear();
        SpawnIntroOverlay.clear();
        if (kits != null) kits.close();
        kits = null;
        catalog = null;
        selection = null;
        finalReview = null;
        progress = "";
    }

    static void disconnect() {
        SelectionMusic.stop();
        SelectionTransition.clear();
        SpawnIntroOverlay.clear();
        Minecraft minecraft = Minecraft.getInstance();
        if (kits != null) kits.close();
        kits = null;
        catalog = null;
        selection = null;
        finalReview = null;
        if (minecraft.level != null) minecraft.level.disconnect();
        if (minecraft.isLocalServer()) minecraft.disconnect(new GenericMessageScreen(Component.translatable("menu.savingLevel")));
        else minecraft.disconnect();
        minecraft.setScreen(new TitleScreen());
    }
}

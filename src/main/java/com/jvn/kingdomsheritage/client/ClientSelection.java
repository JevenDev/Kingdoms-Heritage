package com.jvn.kingdomsheritage.client;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.jvn.kingdomsheritage.KingdomsHeritage;
import com.jvn.kingdomsheritage.data.DefinitionJson;
import com.jvn.kingdomsheritage.network.HeritageNetwork;
import java.util.List;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.DeathScreen;
import net.minecraft.client.gui.screens.GenericMessageScreen;
import net.minecraft.client.gui.screens.Screen;
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
            else SelectionTransition.clear();
        };
        NeoForge.EVENT_BUS.addListener(ClientSelection::tick);
        NeoForge.EVENT_BUS.addListener(ClientSelection::movement);
        NeoForge.EVENT_BUS.addListener(ClientSelection::login);
        NeoForge.EVENT_BUS.addListener(ClientSelection::logout);
        SelectionGuiScale.register();
        KitSelection.register();
        SpawnIntroOverlay.register();
        SelectionMusic.register();
        SelectionTransition.register();
        ClientParty.register();
        NeoForge.EVENT_BUS.addListener(ClientSelection::hideHud);
        NeoForge.EVENT_BUS.addListener(ClientSelection::renderIntroAfterHud);
        NeoForge.EVENT_BUS.addListener(ClientSelection::hideHand);
    }

    private static void receive(String json) {
        JsonObject next = JsonParser.parseString(json).getAsJsonObject();
        if (next.has("cinematic")) {
            if (next.has("intro")) {
                Minecraft.getInstance().setScreen(null);
                SpawnIntroOverlay.start(next);
            } else SpawnIntroOverlay.clear();
        } else if (next.has("flow_update")) ClientSteps.receive(next.getAsJsonObject("flow_update"));
        else if (next.has("flow_reset")) ClientSteps.reset(next.getAsJsonObject("flow_reset"));
        else if (next.has("party")) ClientParty.receive(next.getAsJsonObject("party"));
        else if (next.has("suggestion")) {
            SelectionSounds.NOTICE.play();
            if (selection != null) selection.suggestion(next.get("suggestion").getAsString(), next.get("sender").getAsString());
        } else if (next.has("progress")) receiveProgress(next.get("progress").getAsString());
        else if (next.has("review")) receiveReview(next.getAsJsonObject("review"));
        else receiveCatalog(next);
    }

    private static void receiveProgress(String value) {
        if (interrupted()) return;
        progress = value;
        if (progress.equals("retry")) {
            SelectionSounds.ERROR.play();
            if (finalReview != null) finalReview.retry();
            else if (kits != null) kits.retry();
            else if (selection != null) selection.retry();
            progress = "";
            SelectionTransition.reveal();
        }
    }

    private static void receiveReview(JsonObject review) {
        Minecraft minecraft = Minecraft.getInstance();
        if (interrupted() || minecraft.player == null || catalog == null || review.get("revision").getAsLong() != catalog.get("revision").getAsLong()) {
            net.neoforged.neoforge.network.PacketDistributor.sendToServer(new HeritageNetwork.ReviewDecision(
                    java.util.UUID.fromString(review.get("token").getAsString()), false));
            return;
        }
        progress = "";
        if (kits != null) kits.close();
        finalReview = new FinalConfirmationScreen(catalog, review);
        minecraft.setScreen(finalReview);
        SelectionTransition.reveal();
    }

    private static void receiveCatalog(JsonObject next) {
        Minecraft minecraft = Minecraft.getInstance();
        Screen previousScreen = minecraft.screen;
        finalReview = null;
        SpawnIntroOverlay.clear();
        boolean confirmed = progress.equals("applying");
        progress = "";
        String spawnId = kits != null ? kits.spawnId() : selection == null ? null : selection.selectedId();
        String kitId = kits == null ? null : kits.kitId();
        if (kits != null && minecraft.player != null) minecraft.player.closeContainer();
        closeKits();
        if (!next.has("spawns")) {
            ClientSelectionEvents.finish(next.has("outcome") ? next.get("outcome").getAsString().equals("completed") : confirmed,
                    com.jvn.kingdomsheritage.api.SelectionEvent.Reason.RECOVERED);
            if (confirmed) SelectionSounds.CONFIRMATION.play();
            clearSelection();
            if (minecraft.player != null) minecraft.player.closeContainer();
            minecraft.setScreen(null);
            if (next.has("intro")) SpawnIntroOverlay.start(next);
            SelectionTransition.arrive(next);
            SelectionGuiScale.configure(next);
            return;
        }
        if (!SelectionTransition.joining()) SelectionTransition.reveal();
        if (!next.get("error").getAsString().isEmpty()) SelectionSounds.ERROR.play();
        else if (catalog != null) SelectionSounds.NOTICE.play();
        boolean newSession = catalog == null || next.has("session") && catalog.has("session")
                && !next.get("session").getAsString().equals(catalog.get("session").getAsString());
        catalog = next;
        SelectionGuiScale.configure(next);
        ClientSelectionEvents.catalog(next);
        var flowReset = ClientSteps.catalog(next);
        if (newSession) HeritageScreens.begin();
        selection = new SpawnSelectScreen(catalog);
        selection.restoreSelection(spawnId);
        if (!HeritageScreens.valid(catalog)) HeritageScreens.cancel();
        if (minecraft.level != null && minecraft.player != null && !interrupted()) {
            if (kitId != null && selection.selectedId() != null && allowedKits(catalog, spawnId).size() > 1) {
                kits = new KitSelection(catalog, spawnId);
                kits.restoreSelection(kitId);
            }
            if (!newSession && flowReset != null) resetExtensions(flowReset);
            else showSelection();
            if (!newSession) ClientParty.selectionRefreshed(previousScreen, minecraft.screen);
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

    static boolean selecting() { return catalog != null && Minecraft.getInstance().player != null; }

    static void choicesChanged(String spawn, String kit) {
        ClientSteps.navigate(spawn, kit);
        ClientParty.kitChanged(spawn, kit);
        ClientSelectionEvents.choices(spawn == null ? null : net.minecraft.resources.ResourceLocation.parse(spawn),
                kit == null ? null : net.minecraft.resources.ResourceLocation.parse(kit));
    }

    static JsonObject catalogCopy() { return catalog.deepCopy(); }

    static Component spawnTitle(String id) {
        if (catalog != null) for (var value : catalog.getAsJsonArray("spawns")) {
            var choice = value.getAsJsonObject();
            if (choice.get("id").getAsString().equals(id)) return DefinitionJson.component(choice, "title");
        }
        return Component.literal(id);
    }

    static void showSelection() {
        if (!HeritageScreens.finished()) {
            HeritageScreens.showNext();
            return;
        }
        if (kits != null) kits.openInventory();
        else Minecraft.getInstance().setScreen(selection);
        SelectionTransition.reveal();
    }

    static long revision() { return catalog == null ? -1 : catalog.get("revision").getAsLong(); }

    static void followPartySpawn(String spawn) {
        if (catalog == null || Minecraft.getInstance().player == null) return;
        closeKits();
        finalReview = null;
        progress = "";
        selection.restoreSelection(spawn);
        var allowed = allowedKits(catalog, spawn);
        if (!allowed.isEmpty()) openKits(spawn);
    }

    static void openKits(String spawn) {
        choicesChanged(spawn, null);
        SelectionTransition.fadeOut(() -> HeritageScreens.open(HeritageScreens.Placement.AFTER_SPAWN,
                HeritageScreens.Placement.BEFORE_KIT, spawn, null, () -> {
                    kits = new KitSelection(catalog, spawn);
                    kits.openInventory();
                    SelectionTransition.reveal();
                }));
    }

    static void reviewAutomaticKit(String spawn, String kit) {
        choicesChanged(spawn, kit);
        SelectionTransition.fadeOut(() -> HeritageScreens.open(HeritageScreens.Placement.AFTER_SPAWN,
                HeritageScreens.Placement.AFTER_KIT, spawn, kit, () -> requestReview(spawn, kit)));
    }

    static void review(String spawn, String kit) {
        choicesChanged(spawn, kit);
        SelectionTransition.fadeOut(() -> {
            if (kits != null) kits.close();
            Minecraft.getInstance().player.closeContainer();
            HeritageScreens.open(HeritageScreens.Placement.AFTER_KIT, HeritageScreens.Placement.AFTER_KIT,
                    spawn, kit, () -> requestReview(spawn, kit));
        });
    }

    private static void requestReview(String spawn, String kit) {
        var request = new HeritageNetwork.Choose(spawn, kit, catalog.get("revision").getAsLong());
        net.neoforged.neoforge.network.PacketDistributor.sendToServer(new HeritageNetwork.Review(request));
    }

    static void cancelReview(java.util.UUID token) {
        ClientSteps.invalidate(kits == null ? com.jvn.kingdomsheritage.api.ScreenStep.Placement.AFTER_SPAWN
                : com.jvn.kingdomsheritage.api.ScreenStep.Placement.AFTER_KIT);
        SelectionTransition.fadeOut(() -> {
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
            SelectionTransition.reveal();
        });
    }

    static void resetExtensions(com.jvn.kingdomsheritage.api.ScreenStep.Placement from) {
        if (!selecting()) return;
        var placement = HeritageScreens.placement();
        if (placement != null && placement.ordinal() < from.ordinal()) return;
        if (from == com.jvn.kingdomsheritage.api.ScreenStep.Placement.AFTER_KIT && placement == null && kits == null && finalReview == null) return;
        var minecraft = Minecraft.getInstance();
        Screen previousScreen = minecraft.screen;
        finalReview = null;
        progress = "";
        SelectionTransition.clear();
        if (from == com.jvn.kingdomsheritage.api.ScreenStep.Placement.BEFORE_SPAWN) {
            closeKits();
            HeritageScreens.restart();
        } else backFromExtension(HeritageScreens.Placement.valueOf(from.name()));
        ClientParty.selectionRefreshed(previousScreen, minecraft.screen);
    }

    static void backFromExtension(HeritageScreens.Placement placement) {
        HeritageScreens.cancel();
        progress = "";
        if (placement == HeritageScreens.Placement.AFTER_KIT && kits != null) {
            kits.retry();
            kits.openInventory();
        } else {
            closeKits();
            Minecraft.getInstance().player.closeContainer();
            selection.retry();
            choicesChanged(selection.selectedId(), null);
            Minecraft.getInstance().setScreen(selection);
        }
        SelectionTransition.reveal();
    }

    static boolean waitingForParty() { return progress.equals("party_waiting") && ClientParty.grouped(); }

    static Component progress() {
        if (waitingForParty()) return ClientParty.waitingSummary();
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

    public static boolean blocksToasts() {
        return catalog != null || SpawnIntroOverlay.blocked() || SpawnIntroOverlay.active();
    }

    static void back() {
        ClientSteps.invalidate(com.jvn.kingdomsheritage.api.ScreenStep.Placement.AFTER_SPAWN);
        SelectionTransition.fadeOut(() -> {
            closeKits();
            Minecraft minecraft = Minecraft.getInstance();
            minecraft.player.closeContainer();
            choicesChanged(selection.selectedId(), null);
            minecraft.setScreen(selection);
            SelectionTransition.reveal();
        });
    }

    private static void tick(ClientTickEvent.Post event) {
        SelectionTransition.tick();
        SpawnIntroOverlay.tick();
        SelectionGuiScale.refresh();
        SelectionMusic.tick(catalog != null && !progress.equals("applying"), finalReview != null);
        Minecraft minecraft = Minecraft.getInstance();
        if (catalog == null || minecraft.level == null || minecraft.player == null) return;
        ClientSelectionEvents.ensureStarted();
        if (!interrupted()) ClientSteps.pump();
        if (interrupted()) {
            ClientSelectionEvents.finish(false, com.jvn.kingdomsheritage.api.SelectionEvent.Reason.DEATH);
            closeKits();
            finalReview = null;
            HeritageScreens.clear();
            ClientSteps.clear();
            selection.retry();
            progress = "";
            SelectionTransition.clear();
            return;
        }
        if (!HeritageScreens.finished()) {
            Screen extension = HeritageScreens.current();
            if (extension == null) HeritageScreens.showNext();
            else {
                if (minecraft.screen != extension) minecraft.setScreen(extension);
                HeritageScreens.tick();
            }
        } else if (finalReview != null) {
            if (minecraft.screen != finalReview) minecraft.setScreen(finalReview);
        } else if (kits != null) {
            kits.tick();
            if (!KitSelection.isInventory(minecraft.screen) && !KitSelection.isLayoutPicker(minecraft.screen)) kits.openInventory();
        } else if (!(minecraft.screen instanceof SpawnSelectScreen)) {
            minecraft.setScreen(selection);
        }
        if (SelectionTransition.joining()) SelectionTransition.reveal();
        ClientParty.tick();
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

    private static boolean interrupted() {
        Minecraft minecraft = Minecraft.getInstance();
        return minecraft.screen instanceof DeathScreen || minecraft.player != null && !minecraft.player.isAlive();
    }

    private static void closeKits() {
        if (kits != null) kits.close();
        kits = null;
    }

    private static void clearSelection() {
        closeKits();
        catalog = null;
        selection = null;
        finalReview = null;
        progress = "";
        ClientParty.clear();
        HeritageScreens.clear();
        ClientSteps.clear();
        SelectionToasts.clear();
    }

    private static void login(ClientPlayerNetworkEvent.LoggingIn event) {
        if (!NetworkRegistry.hasChannel(event.getConnection(), ConnectionProtocol.PLAY, HeritageNetwork.JoinState.TYPE.id())
                && SelectionTransition.joining()) {
            SelectionTransition.clear();
        }
    }

    private static void logout(ClientPlayerNetworkEvent.LoggingOut event) {
        ClientSelectionEvents.finish(false, com.jvn.kingdomsheritage.api.SelectionEvent.Reason.DISCONNECTED);
        SelectionMusic.stop();
        // starting an integrated server also fires a logout without a connection
        if (event.getConnection() != null || !SelectionTransition.joining()) SelectionTransition.clear();
        SpawnIntroOverlay.clear();
        clearSelection();
        SelectionGuiScale.clear();
    }

    static void disconnect() {
        ClientSelectionEvents.finish(false, com.jvn.kingdomsheritage.api.SelectionEvent.Reason.DISCONNECTED);
        SelectionMusic.stop();
        SelectionTransition.clear();
        SpawnIntroOverlay.clear();
        Minecraft minecraft = Minecraft.getInstance();
        clearSelection();
        SelectionGuiScale.clear();
        if (minecraft.level != null) minecraft.level.disconnect();
        if (minecraft.isLocalServer()) minecraft.disconnect(new GenericMessageScreen(Component.translatable("menu.savingLevel")));
        else minecraft.disconnect();
        minecraft.setScreen(new TitleScreen());
    }
}

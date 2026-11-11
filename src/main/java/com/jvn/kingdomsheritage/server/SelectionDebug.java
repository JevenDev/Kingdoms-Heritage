package com.jvn.kingdomsheritage.server;

import com.jvn.kingdomsheritage.data.HeritageCatalog;
import com.jvn.kingdomsheritage.network.HeritageNetwork;
import com.mojang.authlib.GameProfile;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.neoforged.neoforge.common.util.FakePlayer;

final class SelectionDebug {
    static final int MAX_BOTS = 20;
    private static final List<Bot> BOTS = new ArrayList<>();
    private static UUID recipient;
    private static boolean offered;
    private static long nextOffer;

    private SelectionDebug() {}

    static void setCount(MinecraftServer server, ServerPlayer operator, int count) {
        while (BOTS.size() > count) SelectionManager.stopDebugPlayer(BOTS.removeLast());
        while (BOTS.size() < count) {
            var bot = new Bot(server.overworld(), BOTS.size());
            BOTS.add(bot);
            SelectionManager.startDebugPlayer(bot);
        }
        recipient = operator == null ? null : operator.getUUID();
        offered = false;
        nextOffer = 0;
    }

    static boolean isBot(ServerPlayer player) { return player instanceof Bot; }
    static boolean isBot(UUID player) { return BOTS.stream().anyMatch(bot -> bot.getUUID().equals(player)); }

    static void clear() {
        BOTS.clear();
        recipient = null;
        offered = false;
        nextOffer = 0;
    }

    static void tick(MinecraftServer server) {
        if (BOTS.isEmpty()) return;
        long tick = server.overworld().getGameTime();
        for (var bot : BOTS) bot.select(tick);
        if (offered || tick < nextOffer) return;
        nextOffer = tick + 20;
        var target = recipient == null ? server.getPlayerList().getPlayers().stream()
                .filter(SelectionDebug::canReceiveInvite).findFirst().orElse(null) : server.getPlayerList().getPlayer(recipient);
        if (target == null || !canReceiveInvite(target)) return;
        for (var bot : BOTS) {
            if (SelectionParty.grouped(bot) || !SelectionParty.choosingSpawn(bot)) continue;
            bot.action(HeritageNetwork.PartyAction.INVITE, target.getUUID(), "");
            if (SelectionParty.invited(bot.getUUID(), target.getUUID())) {
                offered = true;
                return;
            }
        }
    }

    private static boolean canReceiveInvite(ServerPlayer player) {
        return !isBot(player) && SelectionParty.choosingSpawn(player) && !SelectionParty.grouped(player);
    }

    private static final class Bot extends FakePlayer {
        final int index;
        UUID inviter;
        long inviteSince;
        long generation = -1;
        long changed;
        String spawn = "";
        boolean suggested;

        Bot(ServerLevel level, int index) {
            super(level, new GameProfile(UUID.randomUUID(), "[HeritageBot" + (index < 9 ? "0" : "") + (index + 1) + "]"));
            this.index = index;
        }

        void select(long tick) {
            if (!SelectionManager.pending(this)) {
                SelectionManager.stopDebugPlayer(this);
                SelectionManager.startDebugPlayer(this);
            }
            var tester = SelectionParty.members(this).stream().filter(member -> !isBot(member)).findFirst().orElse(null);
            if (tester == null) {
                if (SelectionParty.grouped(this)) SelectionParty.leave(this);
                generation = -1;
                SelectionParty.stage(this, 0);
                acceptInvite(tick);
                return;
            }

            inviter = null;
            String selected = SelectionParty.selectedSpawn(this);
            long currentGeneration = SelectionParty.generation(this);
            if (!selected.equals(spawn) || generation != currentGeneration) {
                spawn = selected;
                generation = currentGeneration;
                changed = tick;
                suggested = false;
                SelectionParty.stage(this, spawn.isEmpty() ? 0 : 2);
            }
            long elapsed = tick - changed;
            if (spawn.isEmpty()) {
                chooseSpawn(tester, tick, elapsed);
            } else if (!SelectionParty.isReady(this)) {
                chooseKit(elapsed);
            }
        }

        private void acceptInvite(long tick) {
            UUID sender = SelectionParty.inviter(this);
            if (!java.util.Objects.equals(sender, inviter)) {
                inviter = sender;
                inviteSince = tick;
            }
            if (inviter != null && tick - inviteSince >= 60) {
                action(HeritageNetwork.PartyAction.ACCEPT, inviter, "");
                inviteSince = tick;
            }
        }

        private void chooseSpawn(ServerPlayer tester, long tick, long elapsed) {
            if (!SelectionParty.choosingSpawn(tester)) return;
            if ((tick + index) % 8 == 0) {
                int x = (int) ((0.5 + Math.sin(tick / 35D + index) * 0.28) * 65535);
                int y = (int) ((0.46 + Math.cos(tick / 41D + index) * 0.17) * 65535);
                SelectionParty.cursor(this, new HeritageNetwork.Cursor(getUUID(), x, y, SelectionParty.cursorPage(tester)));
            }
            var spawns = HeritageCatalog.spawns().keySet();
            if (spawns.isEmpty()) return;
            UUID leader = SelectionParty.leader(this);
            if (getUUID().equals(leader)) {
                if (elapsed >= 160) action(HeritageNetwork.PartyAction.SELECT, getUUID(), spawns.iterator().next().toString());
            } else if (!isBot(leader) && !suggested && elapsed >= 30 + index * 5L) {
                var choice = spawns.stream().skip(index % spawns.size()).findFirst().orElseThrow();
                action(HeritageNetwork.PartyAction.SUGGEST, getUUID(), choice.toString());
                suggested = true;
            }
        }

        private void chooseKit(long elapsed) {
            if (elapsed < 24) return;
            if (SelectionParty.stage(this) == 2) {
                var definition = HeritageCatalog.spawns().get(net.minecraft.resources.ResourceLocation.parse(spawn));
                if (definition == null) return;
                var kits = HeritageCatalog.kits().values().stream().filter(definition::allows).toList();
                if (kits.isEmpty()) return;
                SelectionParty.stage(this, 1);
                action(HeritageNetwork.PartyAction.KIT, getUUID(), kits.get(index % kits.size()).id().toString());
            }
            int reviewAt = 64 + (index % 7) * 12;
            if (elapsed >= reviewAt + 20) SelectionManager.readyDebugPlayer(this);
            else if (elapsed >= reviewAt && SelectionParty.stage(this) == 1) SelectionParty.stage(this, 3);
        }

        private void action(int type, UUID target, String choice) {
            SelectionParty.action(this, new HeritageNetwork.PartyAction(type, target, choice, HeritageCatalog.revision()));
        }
    }
}

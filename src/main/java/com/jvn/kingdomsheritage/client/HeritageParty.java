package com.jvn.kingdomsheritage.client;

import com.jvn.kingdomsheritage.network.HeritageNetwork;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

public final class HeritageParty {
    public enum Stage { SPAWN, KIT, LOADING, REVIEW, READY }
    public record Player(UUID id, String name, Stage stage, boolean available) {}
    public record Invitation(UUID sender, long remainingMillis) {}

    public record Snapshot(List<Player> players, UUID leader, Set<UUID> members, String spawn,
                           List<Invitation> invitations, Set<UUID> outgoing) {
        public Snapshot {
            players = List.copyOf(players);
            members = Set.copyOf(members);
            invitations = List.copyOf(invitations);
            outgoing = Set.copyOf(outgoing);
        }
    }

    private HeritageParty() {}

    public static boolean active() { return ClientSelection.selecting(); }
    public static Snapshot snapshot() { return ClientParty.snapshot(); }
    public static void invite(UUID player) { request(HeritageNetwork.PartyAction.INVITE, player); }
    public static void accept(UUID sender) { request(HeritageNetwork.PartyAction.ACCEPT, sender); }
    public static void decline(UUID sender) { request(HeritageNetwork.PartyAction.DECLINE, sender); }
    public static void leave() {
        if (active()) ClientParty.action(HeritageNetwork.PartyAction.LEAVE, null, "");
    }

    private static void request(int action, UUID player) {
        Objects.requireNonNull(player, "player");
        if (active()) ClientParty.action(action, player, "");
    }
}

package com.jvn.kingdomsheritage.api;

import net.minecraft.world.entity.player.Player;
import net.neoforged.bus.api.Event;

public abstract class SelectionEvent extends Event {
    public enum Reason { DISCONNECTED, DEATH, RECOVERED, RESET }
    private final Player player;
    private final SelectionState previous;
    private final SelectionState state;

    protected SelectionEvent(Player player, SelectionState previous, SelectionState state) {
        this.player = player;
        this.previous = previous;
        this.state = state;
    }

    public Player getPlayer() { return player; }
    public boolean isClientSide() { return player.level().isClientSide(); }
    public SelectionState getPrevious() { return previous; }
    public SelectionState getState() { return state; }

    public static final class Started extends SelectionEvent {
        public Started(Player player, SelectionState state) { super(player, state, state); }
    }

    public static final class ChoicesChanged extends SelectionEvent {
        public ChoicesChanged(Player player, SelectionState previous, SelectionState state) { super(player, previous, state); }
    }

    public static final class PartyChanged extends SelectionEvent {
        public PartyChanged(Player player, SelectionState previous, SelectionState state) { super(player, previous, state); }
    }

    public static final class Completed extends SelectionEvent {
        public Completed(Player player, SelectionState state) { super(player, state, state); }
    }

    public static final class Reset extends SelectionEvent {
        public Reset(Player player, SelectionState state) { super(player, state, state); }
    }

    public static final class Cancelled extends SelectionEvent {
        private final Reason reason;
        public Cancelled(Player player, SelectionState state, Reason reason) {
            super(player, state, state);
            this.reason = reason;
        }
        public Reason getReason() { return reason; }
    }
}

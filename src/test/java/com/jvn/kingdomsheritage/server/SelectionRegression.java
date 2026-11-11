package com.jvn.kingdomsheritage.server;

import com.jvn.kingdomsheritage.client.ArrivalRegression;
import com.jvn.kingdomsheritage.data.CatalogRegression;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.core.BlockPos;

public final class SelectionRegression {
    private SelectionRegression() {}

    public static void main(String[] args) {
        CatalogRegression.run();
        ArrivalRegression.run();
        rollsBackAfterSecondMemberFailure();
        spacesPartyArrivalsWhenTerrainAllows();
        keepsPartyArrivalsInTheStructureWhenPossible();
        System.out.println("Heritage selection regression checks passed");
    }

    private static void spacesPartyArrivalsWhenTerrainAllows() {
        var anchor = new BlockPos(40, 64, -12);
        var assigned = new ArrayList<>(List.of(anchor));
        for (int i = 1; i < 8; i++) {
            var next = SpawnResolver.partyPosition(anchor, assigned, pos -> pos.getY() == 65 && pos.getX() >= 40, null);
            if (next.getX() < 40 || next.getY() != 65 || assigned.stream().anyMatch(pos -> {
                int dx = pos.getX() - next.getX(), dz = pos.getZ() - next.getZ();
                return dx * dx + dz * dz < 9;
            })) throw new AssertionError("Party arrival ignored spacing or safe terrain");
            assigned.add(next);
        }
        var tight = anchor.east();
        if (!SpawnResolver.partyPosition(anchor, List.of(anchor), tight::equals, null).equals(tight)
                || !SpawnResolver.partyPosition(anchor, List.of(anchor), pos -> false, null).equals(anchor)) {
            throw new AssertionError("Party arrival did not fall back to the nearest safe space or anchor");
        }
    }

    private static void keepsPartyArrivalsInTheStructureWhenPossible() {
        var anchor = new BlockPos(15, 64, 15);
        var inside = anchor.east();
        var outside = anchor.west(3);
        var assigned = List.of(anchor);
        if (!SpawnResolver.partyPosition(anchor, assigned, pos -> pos.equals(inside) || pos.equals(outside), inside::equals).equals(inside)
                || !SpawnResolver.partyPosition(anchor, assigned, outside::equals, inside::equals).equals(outside)) {
            throw new AssertionError("Party arrival should prefer safe interior space and fall back outside only when necessary");
        }
    }

    private static void rollsBackAfterSecondMemberFailure() {
        int[] slots = {1, 2};
        var failure = new IllegalStateException("second equipment write failed");
        var rollbackFailure = new IllegalStateException("second rollback failed");
        try {
            SelectionFinalization.run(undo -> {
                undo.accept(() -> slots[0] = 1);
                slots[0] = 10;
                undo.accept(() -> {
                    slots[1] = 2;
                    throw rollbackFailure;
                });
                slots[1] = 20;
                throw failure;
            });
            throw new AssertionError("Selection reported success after an equipment write failed");
        } catch (IllegalStateException error) {
            if (error != failure || error.getSuppressed().length != 1 || error.getSuppressed()[0] != rollbackFailure) {
                throw new AssertionError("Selection lost the original or rollback failure", error);
            }
        }
        if (slots[0] != 1 || slots[1] != 2) throw new AssertionError("Selection left a partial kit after rollback");
    }
}

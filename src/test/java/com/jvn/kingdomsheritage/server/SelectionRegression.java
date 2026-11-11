package com.jvn.kingdomsheritage.server;

import com.jvn.kingdomsheritage.client.ArrivalRegression;
import com.jvn.kingdomsheritage.data.CatalogRegression;

public final class SelectionRegression {
    private SelectionRegression() {}

    public static void main(String[] args) {
        CatalogRegression.run();
        ArrivalRegression.run();
        rollsBackAfterSecondMemberFailure();
        System.out.println("Heritage selection regression checks passed");
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

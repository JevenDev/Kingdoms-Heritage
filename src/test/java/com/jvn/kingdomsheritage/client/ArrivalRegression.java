package com.jvn.kingdomsheritage.client;

import com.jvn.kingdomsheritage.client.SelectionTransition.ArrivalAction;

public final class ArrivalRegression {
    private ArrivalRegression() {}

    public static void run() {
        expect(ArrivalAction.REVEAL, SelectionTransition.arrivalAction(500, () -> true, false));
        expect(ArrivalAction.START_INTRO, SelectionTransition.arrivalAction(500, () -> true, true));
        for (boolean hasIntro : new boolean[] {false, true}) {
            expect(ArrivalAction.WAIT, SelectionTransition.arrivalAction(500, () -> false, hasIntro));
            expect(ArrivalAction.TIMEOUT, SelectionTransition.arrivalAction(15_000, () -> {
                throw new AssertionError("Expired arrival should no longer wait on terrain");
            }, hasIntro));
        }
    }

    private static void expect(ArrivalAction expected, ArrivalAction actual) {
        if (actual != expected) throw new AssertionError("Expected " + expected + " but was " + actual);
    }
}

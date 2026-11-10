package com.jvn.kingdomsheritage.client;

final class LocationNavigation {
    private final int count;
    private final int pageSize;
    private int index;
    private double scrollRemainder;

    LocationNavigation(int count, int pageSize) {
        if (count < 1 || pageSize < 1) throw new IllegalArgumentException("Location navigation requires choices and a positive page size");
        this.count = count;
        this.pageSize = pageSize;
    }

    int index() { return index; }
    int page() { return index / pageSize; }

    void focus(int index) {
        this.index = Math.max(0, Math.min(count - 1, index));
    }

    boolean move(int offset) {
        int previous = index;
        focus((int) Math.max(0, Math.min(count - 1, (long) index + offset)));
        return index != previous;
    }

    boolean changePage(int direction) {
        int nextPage = Math.max(0, Math.min((count - 1) / pageSize, page() + direction));
        if (nextPage == page()) return false;
        focus(nextPage * pageSize + index % pageSize);
        return true;
    }

    boolean scroll(double delta) {
        if (delta == 0) return false;
        if (Math.signum(delta) != Math.signum(scrollRemainder)) scrollRemainder = 0;
        scrollRemainder += delta;
        int steps = (int) scrollRemainder;
        scrollRemainder -= steps;
        return move(-steps);
    }
}

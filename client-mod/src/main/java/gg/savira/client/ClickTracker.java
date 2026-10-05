package gg.savira.client;

import java.util.ArrayDeque;
import java.util.Deque;

public final class ClickTracker {
    private static final Deque<Long> LEFT = new ArrayDeque<>();
    private static final Deque<Long> RIGHT = new ArrayDeque<>();
    private ClickTracker() {}

    public static void record(int button) {
        if (button == 0) LEFT.addLast(System.nanoTime());
        if (button == 1) RIGHT.addLast(System.nanoTime());
        prune(LEFT);
        prune(RIGHT);
    }

    private static void prune(Deque<Long> clicks) {
        long cutoff = System.nanoTime() - 1_000_000_000L;
        while (!clicks.isEmpty() && clicks.peekFirst() <= cutoff) clicks.removeFirst();
    }

    public static int left() { prune(LEFT); return LEFT.size(); }
    public static int right() { prune(RIGHT); return RIGHT.size(); }
}

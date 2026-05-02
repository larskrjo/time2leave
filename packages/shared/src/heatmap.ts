/**
 * Pure heatmap helpers — colour mapping, "best slot per day" reduction,
 * "minutes → human label" formatting, and the LA-time NOW bucket.
 *
 * Kept framework-free so they work in:
 *   - the React Router 7 SPA (`apps/web`),
 *   - the Expo / React Native app (`apps/mobile`), and
 *   - Vitest unit tests in either workspace.
 */
import { WEEKDAYS, type HeatmapPayload, type Weekday } from "./types";

/**
 * Map a duration in minutes onto the green→yellow→red scale, normalized
 * against the trip's own min/max for the week so the *fastest* slot is
 * always pure green and the *slowest* always pure red regardless of
 * absolute commute length.
 *
 * Edge cases:
 *   - `maxMinutes <= 0`: empty grid — return a soft neutral.
 *   - `maxMinutes === minMinutes`: every sampled cell is identical
 *     (zero variance), so return a confident midpoint amber.
 */
export function colorFor(
    minutes: number,
    minMinutes: number,
    maxMinutes: number,
): string {
    if (maxMinutes <= 0) return "hsl(200 20% 92%)";
    if (maxMinutes === minMinutes) return "hsl(60 70% 60%)";
    const t = Math.min(
        1,
        Math.max(0, (minutes - minMinutes) / (maxMinutes - minMinutes)),
    );
    const hue = 120 - t * 120;
    const sat = 70;
    // Slightly lighter at the green end so the bad (red) cells visually
    // punch through and the heatmap reads "where to avoid" at a glance.
    const light = 52 + (1 - t) * 14;
    return `hsl(${hue} ${sat}% ${light}%)`;
}

/** "85" → "1h25m"; "59" → "59m"; "60" → "1h"; "120" → "2h". */
export function minutesLabel(minutes: number): string {
    if (minutes < 60) return `${Math.round(minutes)}m`;
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes - h * 60);
    return m ? `${h}h${m}m` : `${h}h`;
}

/**
 * Walk every (min, max) pair of sampled cells and return the global
 * extremes for the given direction. Empty-grid case yields
 * `{minMinutes: 0, maxMinutes: 0}` so `colorFor` enters its neutral
 * branch and the UI stays calm.
 */
export function heatmapMinMax(
    heatmap: HeatmapPayload,
    direction: "outbound" | "return",
    weekdays: readonly Weekday[] = heatmap.weekdays ?? WEEKDAYS,
    slots: readonly string[] = [],
): { minMinutes: number; maxMinutes: number } {
    const directionPayload = heatmap[direction] ?? {};
    let min = Number.POSITIVE_INFINITY;
    let max = 0;
    for (const day of weekdays) {
        const row = directionPayload[day] ?? {};
        const candidates: ReadonlyArray<string> =
            slots.length > 0 ? slots : Object.keys(row);
        for (const slot of candidates) {
            const v = row[slot];
            if (typeof v === "number") {
                if (v > max) max = v;
                if (v < min) min = v;
            }
        }
    }
    return {
        minMinutes: Number.isFinite(min) ? min : 0,
        maxMinutes: max,
    };
}

export type BestSlot = { day: Weekday; slot: string; minutes: number };

/** One row per weekday with the lowest sampled minutes for that row. */
export function bestSlotPerDay(
    heatmap: HeatmapPayload,
    direction: "outbound" | "return",
): BestSlot[] {
    const weekdays = heatmap.weekdays ?? WEEKDAYS;
    const directionPayload = heatmap[direction] ?? {};
    const out: BestSlot[] = [];
    for (const day of weekdays) {
        const row = directionPayload[day] ?? {};
        let best: BestSlot | null = null;
        for (const [slot, minutes] of Object.entries(row)) {
            if (typeof minutes !== "number") continue;
            if (!best || minutes < best.minutes) {
                best = { day, slot, minutes };
            }
        }
        if (best) out.push(best);
    }
    return out;
}

/**
 * Return the weekday + 15-minute slot for the current time in
 * America/Los_Angeles. Returns null outside the 06:00–21:00 sampling
 * window so we don't render a NOW dot where there's no grid.
 */
export function nowBucketLA(reference: Date = new Date()): {
    day: Weekday;
    slot: string;
} | null {
    const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Los_Angeles",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
    const parts = fmt.formatToParts(reference);
    const weekday = parts.find((p) => p.type === "weekday")?.value as
        | Weekday
        | undefined;
    const hourStr = parts.find((p) => p.type === "hour")?.value ?? "00";
    const minuteStr = parts.find((p) => p.type === "minute")?.value ?? "00";
    const hour = Number(hourStr) % 24;
    const minute = Number(minuteStr);
    if (!weekday) return null;
    if (hour < 6 || hour >= 21) return null;
    const rounded = Math.floor(minute / 15) * 15;
    const slot = `${String(hour).padStart(2, "0")}:${String(rounded).padStart(
        2,
        "0",
    )}`;
    return { day: weekday, slot };
}

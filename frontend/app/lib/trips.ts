/**
 * API client helpers + shared types for the trips feature.
 *
 * Keeping these in one module means routes/components stay free of
 * fetch boilerplate, and tests only need to mock one file if they want
 * to stub out the network.
 */
import { API } from "~/constants/path";
import { apiFetch } from "~/lib/api";

export const WEEKDAYS = [
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
    "Sat",
    "Sun",
] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/**
 * Public trip projection.
 *
 * `id` is the backend-issued 10-hex-char slug (e.g. `"a1b2c3d4e5"`),
 * not an auto-incrementing integer. The format keeps URLs short while
 * not leaking how many trips the system has overall.
 */
export type TripSummary = {
    id: string;
    name: string | null;
    origin_address: string;
    destination_address: string;
    created_at: string | null;
};

export type BackfillStatus = {
    total: number;
    ready: number;
    percent_complete: number;
};

export type TripDetail = TripSummary & { backfill: BackfillStatus };

export type Direction = "outbound" | "return";

/**
 * Which week the SPA is asking the backend about.
 *
 * `"current"` is the default and matches today's behavior. `"next"`
 * targets the upcoming week's `week_start_date` and is gated by the
 * `next_week_available` flag in the heatmap payload — the SPA only
 * shows the toggle once the backend has a fully populated next-week
 * heatmap to hand back.
 */
export type Week = "current" | "next";

/** Nested {direction: {weekday: {hhmm: minutes | null}}} heatmap shape. */
export type HeatmapPayload = {
    outbound: Partial<Record<Weekday, Record<string, number | null>>>;
    return: Partial<Record<Weekday, Record<string, number | null>>>;
    week_start_date: string;
    weekdays: Weekday[];
    /**
     * True iff the upcoming week's heatmap is fully populated for this
     * trip. Set by the backend on every heatmap response (regardless of
     * which week was requested), so the SPA can decide whether to render
     * the "Next week" toggle on its very first load.
     */
    next_week_available: boolean;
};

export async function listTrips(): Promise<TripSummary[]> {
    return apiFetch<TripSummary[]>(API.trips);
}

export async function getTrip(id: string): Promise<TripDetail> {
    return apiFetch<TripDetail>(API.trip(id));
}

export async function createTrip(input: {
    name?: string | null;
    origin_address: string;
    destination_address: string;
}): Promise<TripDetail> {
    return apiFetch<TripDetail>(API.trips, {
        method: "POST",
        body: JSON.stringify(input),
    });
}

export async function deleteTrip(id: string): Promise<void> {
    await apiFetch<null>(API.trip(id), { method: "DELETE" });
}

/**
 * Combined trip quota: how many *slots* (saved trips) a user has used,
 * plus their rolling-7-day "billed mutation" budget. A "billed mutation"
 * is anything that triggers a fresh Routes Matrix backfill — trip create
 * and any trip patch that changes the origin/destination addresses (or
 * swaps them). Name-only patches and deletes are free and not counted.
 *
 * `mutations_oldest_age_seconds` is the age (in seconds) of the user's
 * oldest in-window mutation, or `null` when they have zero usage. Used
 * by the UI to render a "your next slot opens in N hours" hint when
 * the user is at the cap.
 */
export type TripQuota = {
    used: number;
    limit: number;
    mutations_used: number;
    mutations_limit: number;
    mutations_oldest_age_seconds: number | null;
};

export async function getTripQuota(): Promise<TripQuota> {
    return apiFetch<TripQuota>(API.tripQuota);
}

export type TripPatch = {
    name?: string | null;
    origin_address?: string;
    destination_address?: string;
    clear_name?: boolean;
    swap_addresses?: boolean;
};

export async function updateTrip(
    id: string,
    patch: TripPatch,
): Promise<TripDetail> {
    return apiFetch<TripDetail>(API.trip(id), {
        method: "PATCH",
        body: JSON.stringify(patch),
    });
}

export async function getTripHeatmap(
    id: string,
    week: Week = "current",
): Promise<HeatmapPayload> {
    return apiFetch<HeatmapPayload>(`${API.tripHeatmap(id)}?week=${week}`);
}

export async function getTripBackfillStatus(
    id: string,
    week: Week = "current",
): Promise<BackfillStatus> {
    return apiFetch<BackfillStatus>(
        `${API.tripBackfillStatus(id)}?week=${week}`,
    );
}

/**
 * Generate the canonical 15-minute HH:MM labels for 06:00-21:00.
 * Kept on the client so we can show empty cells before any data
 * arrives (useful for the backfill-in-progress state).
 */
export function weekTimeSlots(): string[] {
    const slots: string[] = [];
    for (let h = 6; h < 21; h += 1) {
        for (let m = 0; m < 60; m += 15) {
            slots.push(
                `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
            );
        }
    }
    return slots;
}

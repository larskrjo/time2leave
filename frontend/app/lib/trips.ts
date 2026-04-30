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

export type TripSummary = {
    id: number;
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

/** Nested {direction: {weekday: {hhmm: minutes | null}}} heatmap shape. */
export type HeatmapPayload = {
    outbound: Partial<Record<Weekday, Record<string, number | null>>>;
    return: Partial<Record<Weekday, Record<string, number | null>>>;
    week_start_date: string;
    weekdays: Weekday[];
};

export async function listTrips(): Promise<TripSummary[]> {
    return apiFetch<TripSummary[]>(API.trips);
}

export async function getTrip(id: number | string): Promise<TripDetail> {
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

export async function deleteTrip(id: number | string): Promise<void> {
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
    id: number | string,
    patch: TripPatch,
): Promise<TripDetail> {
    return apiFetch<TripDetail>(API.trip(id), {
        method: "PATCH",
        body: JSON.stringify(patch),
    });
}

export async function getTripHeatmap(
    id: number | string,
): Promise<HeatmapPayload> {
    return apiFetch<HeatmapPayload>(API.tripHeatmap(id));
}

export async function getTripBackfillStatus(
    id: number | string,
): Promise<BackfillStatus> {
    return apiFetch<BackfillStatus>(API.tripBackfillStatus(id));
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

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

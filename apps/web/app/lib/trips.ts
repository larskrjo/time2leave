/**
 * Web-side trips API client.
 *
 * Each function delegates to the matching helper in `@time2leave/shared`,
 * pre-binding the browser's `apiFetch` (cookie-based) and `API` paths
 * so the existing route components keep their original tiny call sites
 * (`listTrips()`, `getTrip(id)`, …).
 */
import {
    createTrip as sharedCreateTrip,
    deleteTrip as sharedDeleteTrip,
    getTrip as sharedGetTrip,
    getTripBackfillStatus as sharedGetTripBackfillStatus,
    getTripHeatmap as sharedGetTripHeatmap,
    getTripQuota as sharedGetTripQuota,
    listTrips as sharedListTrips,
    updateTrip as sharedUpdateTrip,
    type BackfillStatus,
    type Direction,
    type HeatmapPayload,
    type TripDetail,
    type TripPatch,
    type TripQuota,
    type TripSummary,
    type Week,
    type Weekday,
} from "@time2leave/shared";
import { WEEKDAYS, weekTimeSlots } from "@time2leave/shared";

import { API } from "~/constants/path";
import { apiFetch } from "~/lib/api";

export type {
    BackfillStatus,
    Direction,
    HeatmapPayload,
    TripDetail,
    TripPatch,
    TripQuota,
    TripSummary,
    Week,
    Weekday,
};
export { WEEKDAYS, weekTimeSlots };

export function listTrips(): Promise<TripSummary[]> {
    return sharedListTrips(apiFetch, API);
}

export function getTrip(id: string): Promise<TripDetail> {
    return sharedGetTrip(apiFetch, API, id);
}

export function createTrip(input: {
    name?: string | null;
    origin_address: string;
    destination_address: string;
}): Promise<TripDetail> {
    return sharedCreateTrip(apiFetch, API, input);
}

export function deleteTrip(id: string): Promise<void> {
    return sharedDeleteTrip(apiFetch, API, id);
}

export function getTripQuota(): Promise<TripQuota> {
    return sharedGetTripQuota(apiFetch, API);
}

export function updateTrip(
    id: string,
    patch: TripPatch,
): Promise<TripDetail> {
    return sharedUpdateTrip(apiFetch, API, id, patch);
}

export function getTripHeatmap(
    id: string,
    week: Week = "current",
): Promise<HeatmapPayload> {
    return sharedGetTripHeatmap(apiFetch, API, id, week);
}

export function getTripBackfillStatus(
    id: string,
    week: Week = "current",
): Promise<BackfillStatus> {
    return sharedGetTripBackfillStatus(apiFetch, API, id, week);
}

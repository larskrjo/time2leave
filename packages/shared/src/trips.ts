/**
 * API client helpers for the trips feature.
 *
 * Each helper takes the `apiFetch` and `paths` made by the consuming
 * app, so the same code works in the browser (cookie-bound fetch,
 * `import.meta.env.VITE_API_BASE_URL`) and React Native (bearer-token
 * fetch, `process.env.EXPO_PUBLIC_API_BASE_URL`).
 */
import type { ApiFetch } from "./api";
import type { ApiPaths } from "./paths";
import type {
    HeatmapPayload,
    TripDetail,
    TripPatch,
    TripQuota,
    TripSummary,
    Week,
} from "./types";

export async function listTrips(
    apiFetch: ApiFetch,
    paths: ApiPaths,
): Promise<TripSummary[]> {
    return apiFetch<TripSummary[]>(paths.trips);
}

export async function getTrip(
    apiFetch: ApiFetch,
    paths: ApiPaths,
    id: string,
): Promise<TripDetail> {
    return apiFetch<TripDetail>(paths.trip(id));
}

export async function createTrip(
    apiFetch: ApiFetch,
    paths: ApiPaths,
    input: {
        name?: string | null;
        origin_address: string;
        destination_address: string;
    },
): Promise<TripDetail> {
    return apiFetch<TripDetail>(paths.trips, {
        method: "POST",
        body: JSON.stringify(input),
    });
}

export async function deleteTrip(
    apiFetch: ApiFetch,
    paths: ApiPaths,
    id: string,
): Promise<void> {
    await apiFetch<null>(paths.trip(id), { method: "DELETE" });
}

export async function getTripQuota(
    apiFetch: ApiFetch,
    paths: ApiPaths,
): Promise<TripQuota> {
    return apiFetch<TripQuota>(paths.tripQuota);
}

export async function updateTrip(
    apiFetch: ApiFetch,
    paths: ApiPaths,
    id: string,
    patch: TripPatch,
): Promise<TripDetail> {
    return apiFetch<TripDetail>(paths.trip(id), {
        method: "PATCH",
        body: JSON.stringify(patch),
    });
}

export async function getTripHeatmap(
    apiFetch: ApiFetch,
    paths: ApiPaths,
    id: string,
    week: Week = "current",
): Promise<HeatmapPayload> {
    return apiFetch<HeatmapPayload>(`${paths.tripHeatmap(id)}?week=${week}`);
}

export async function getTripBackfillStatus(
    apiFetch: ApiFetch,
    paths: ApiPaths,
    id: string,
    week: Week = "current",
): Promise<{ total: number; ready: number; percent_complete: number }> {
    return apiFetch(`${paths.tripBackfillStatus(id)}?week=${week}`);
}

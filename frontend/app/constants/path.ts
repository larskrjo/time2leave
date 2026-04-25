const DEFAULT_DEV_BASE_URL = "http://localhost:8000";
const DEFAULT_PROD_BASE_URL = "https://api.time2leave.com";

const envBase = import.meta.env.VITE_API_BASE_URL as string | undefined;
export const BASE_URL =
    envBase && envBase.length > 0
        ? envBase
        : import.meta.env.DEV
          ? DEFAULT_DEV_BASE_URL
          : DEFAULT_PROD_BASE_URL;

export const API = {
    me: `${BASE_URL}/api/v1/me`,
    authGoogle: `${BASE_URL}/api/v1/auth/google`,
    authLogout: `${BASE_URL}/api/v1/auth/logout`,
    authDevLogin: `${BASE_URL}/api/v1/auth/dev-login`,
    authConfig: `${BASE_URL}/api/v1/auth/config`,
    trips: `${BASE_URL}/api/v1/trips`,
    tripQuota: `${BASE_URL}/api/v1/trips/quota`,
    trip: (id: number | string) => `${BASE_URL}/api/v1/trips/${id}`,
    tripHeatmap: (id: number | string) =>
        `${BASE_URL}/api/v1/trips/${id}/heatmap`,
    tripBackfillStatus: (id: number | string) =>
        `${BASE_URL}/api/v1/trips/${id}/backfill-status`,
} as const;

export const ROUTES = {
    splash: "/",
    trips: "/trips",
    newTrip: "/trips/new",
    trip: (id: number | string) => `/trips/${id}`,
} as const;

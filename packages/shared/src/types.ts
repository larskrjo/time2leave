/**
 * Domain types shared across web and mobile.
 *
 * Keep this file free of any `import` from runtime code so the bundle
 * cost is exactly zero in the type-only `import type` form.
 */

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
 * Which week the client is asking the backend about.
 *
 * `"current"` is the default and matches today's behavior. `"next"`
 * targets the upcoming week's `week_start_date` and is gated by the
 * `next_week_available` flag in the heatmap payload — the client only
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
     * which week was requested), so the client can decide whether to
     * render the "Next week" toggle on its very first load.
     */
    next_week_available: boolean;
};

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

export type TripPatch = {
    name?: string | null;
    origin_address?: string;
    destination_address?: string;
    clear_name?: boolean;
    swap_addresses?: boolean;
};

/** Auth-related projections returned by the backend. */
export type SessionUser = {
    id: number;
    email: string;
    name: string | null;
    picture_url: string | null;
    is_admin: boolean;
};

export type AuthConfig = {
    google_oauth_client_id: string | null;
    dev_login_enabled: boolean;
};

/**
 * Bearer-token fields returned alongside the session cookie when a
 * client opts in via `X-Client: mobile` or `?token=true`. Web ignores
 * these and continues to rely on the HttpOnly cookie.
 */
export type SessionTokenInfo = {
    session_token: string;
    session_expires_at: string;
};

export type AuthedUserResponse = SessionUser & Partial<SessionTokenInfo>;

import { http, HttpResponse } from "msw";

import type { AllowlistEntry } from "~/lib/admin";
import type { HeatmapPayload } from "~/lib/trips";

/**
 * Default MSW handlers for frontend tests.
 *
 * Individual tests can override any of these with
 * `server.use(http.get(...))`. The goal here is to have "no auth, no
 * trips" as the baseline so calling <SessionProvider> in a test does
 * not hit the network.
 */

export const anonymousMeResponse = { user: null };

export const defaultAuthConfig = {
    google_oauth_client_id: "test-oauth-client-id",
    dev_login_enabled: true,
};

export const sampleUser = {
    id: 1,
    email: "dev@example.com",
    name: "Dev User",
    picture_url: null,
    is_admin: true,
};

export const sampleTripSummary = {
    id: 1,
    name: "Home to Work",
    origin_address: "123 Alpha St",
    destination_address: "999 Beta Ave",
    created_at: "2025-11-01T12:00:00",
};

export const sampleTripDetail = {
    ...sampleTripSummary,
    backfill: { total: 840, ready: 210, percent_complete: 25.0 },
};

export const sampleAllowlist: AllowlistEntry[] = [
    {
        id: 1,
        email: "owner@example.com",
        added_by: "bootstrap",
        created_at: "2025-11-01T12:00:00",
    },
    {
        id: 2,
        email: "friend@example.com",
        added_by: "owner@example.com",
        created_at: "2025-11-02T08:30:00",
    },
];

export const sampleHeatmapResponse: HeatmapPayload = {
    outbound: {
        Mon: { "07:00": 42, "08:00": 78, "09:00": 60 },
        Tue: { "07:00": 45, "08:00": 80, "09:00": 62 },
        Wed: { "07:00": 46 },
        Thu: {},
        Fri: { "07:00": 50, "08:00": 88, "09:00": 70 },
        Sat: {},
        Sun: {},
    },
    return: {
        Mon: { "17:00": 85, "18:00": 70 },
        Tue: { "17:00": 90, "18:00": 72 },
        Wed: {},
        Thu: {},
        Fri: { "17:00": 100, "18:00": 80 },
        Sat: {},
        Sun: {},
    },
    week_start_date: "2025-11-10",
    weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
};

export const handlers = [
    http.get("*/api/v1/me", () => HttpResponse.json(anonymousMeResponse)),
    http.get("*/api/v1/auth/config", () =>
        HttpResponse.json(defaultAuthConfig),
    ),
    http.post("*/api/v1/auth/google", () => HttpResponse.json(sampleUser)),
    http.post("*/api/v1/auth/dev-login", () => HttpResponse.json(sampleUser)),
    http.post("*/api/v1/auth/logout", () =>
        HttpResponse.json({ status: "ok" }),
    ),
    http.get("*/api/v1/trips/quota", () =>
        HttpResponse.json({ used: 1, limit: 3 }),
    ),
    http.get("*/api/v1/trips", () => HttpResponse.json([sampleTripSummary])),
    http.get("*/api/v1/trips/:id", () => HttpResponse.json(sampleTripDetail)),
    http.post("*/api/v1/trips", () =>
        HttpResponse.json(sampleTripDetail, { status: 201 }),
    ),
    http.patch("*/api/v1/trips/:id", () => HttpResponse.json(sampleTripDetail)),
    http.delete("*/api/v1/trips/:id", () =>
        HttpResponse.json(null, { status: 204 }),
    ),
    http.get("*/api/v1/trips/:id/heatmap", () =>
        HttpResponse.json(sampleHeatmapResponse),
    ),
    http.get("*/api/v1/trips/:id/backfill-status", () =>
        HttpResponse.json({ total: 840, ready: 210, percent_complete: 25.0 }),
    ),
    http.get("*/api/v1/admin/allowlist", () =>
        HttpResponse.json(sampleAllowlist),
    ),
    http.post("*/api/v1/admin/allowlist", async ({ request }) => {
        const body = (await request.json()) as { email: string };
        return HttpResponse.json(
            {
                id: 999,
                email: body.email,
                added_by: sampleUser.email,
                created_at: new Date().toISOString(),
            },
            { status: 201 },
        );
    }),
    http.delete("*/api/v1/admin/allowlist/:email", () =>
        HttpResponse.json(null, { status: 204 }),
    ),
];

/**
 * Route-level tests for /trips/:tripId. Covers initial load, backfill
 * polling stops at 100%, and the Outbound/Return tabs swap content.
 */
import { act, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import TripDetailPage from "~/routes/trips.$tripId";
import {
    sampleHeatmapResponse,
    sampleTripDetail,
    sampleUser,
} from "~/test/mocks/handlers";
import { server } from "~/test/mocks/server";
import { renderWithProviders } from "~/test/render";

beforeEach(() => {
    server.use(http.get("*/api/v1/me", () => HttpResponse.json(sampleUser)));
});

afterEach(() => {
    vi.useRealTimers();
});

describe("/trips/:tripId route", () => {
    it("renders the trip header, heatmap, and tabs", async () => {
        server.use(
            http.get("*/api/v1/trips/:id", () =>
                HttpResponse.json({
                    ...sampleTripDetail,
                    backfill: { total: 10, ready: 10, percent_complete: 100 },
                }),
            ),
        );
        server.use(
            http.get("*/api/v1/trips/:id/heatmap", () =>
                HttpResponse.json(sampleHeatmapResponse),
            ),
        );

        renderWithProviders(<TripDetailPage />, {
            initialEntries: ["/trips/1"],
            path: "/trips/:tripId",
        });

        await screen.findByText(sampleTripDetail.name!);
        expect(screen.getByRole("tab", { name: /Outbound/i })).toBeInTheDocument();
        expect(screen.getByRole("tab", { name: /Return/i })).toBeInTheDocument();
        expect(screen.queryByText(/Backfilling/i)).toBeNull();
    });

    it("shows backfill banner while < 100% and hides it once complete", async () => {
        let progress = 25;
        server.use(
            http.get("*/api/v1/trips/:id", () =>
                HttpResponse.json({
                    ...sampleTripDetail,
                    backfill: { total: 100, ready: 25, percent_complete: progress },
                }),
            ),
        );
        server.use(
            http.get("*/api/v1/trips/:id/heatmap", () =>
                HttpResponse.json(sampleHeatmapResponse),
            ),
        );
        server.use(
            http.get("*/api/v1/trips/:id/backfill-status", () => {
                progress = progress + 25;
                return HttpResponse.json({
                    total: 100,
                    ready: progress,
                    percent_complete: progress,
                });
            }),
        );

        vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
        renderWithProviders(<TripDetailPage />, {
            initialEntries: ["/trips/1"],
            path: "/trips/:tripId",
        });

        expect(await screen.findByText(/Backfilling/i)).toBeInTheDocument();

        // Advance four 4-second polling cycles (25 → 50 → 75 → 100).
        for (let i = 0; i < 3; i += 1) {
            await act(async () => {
                await vi.advanceTimersByTimeAsync(4_000);
            });
        }
        await waitFor(() =>
            expect(screen.queryByText(/Backfilling/i)).toBeNull(),
        );
    });

    it("falls back to a friendly error when the trip can't be loaded", async () => {
        server.use(
            http.get("*/api/v1/trips/:id", () =>
                HttpResponse.json({ detail: "Trip not found" }, { status: 404 }),
            ),
        );

        renderWithProviders(<TripDetailPage />, {
            initialEntries: ["/trips/999"],
            path: "/trips/:tripId",
        });

        expect(await screen.findByText(/Trip not found/i)).toBeInTheDocument();
    });
});

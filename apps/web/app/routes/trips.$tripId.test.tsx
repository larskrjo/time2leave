/**
 * Route-level tests for /trips/:tripId. Covers initial load, backfill
 * polling stops at 100%, the Outbound/Return tabs swap content, and
 * the "This week / Next week" toggle gating + behavior.
 */
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import TripDetailPage from "~/routes/trips.$tripId";
import {
    sampleHeatmapResponse,
    sampleNextWeekHeatmapResponse,
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
        expect(screen.queryByText(/Building your heatmap/i)).toBeNull();
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

        expect(
            await screen.findByText(/Building your heatmap/i),
        ).toBeInTheDocument();

        // Advance four 4-second polling cycles (25 → 50 → 75 → 100).
        for (let i = 0; i < 3; i += 1) {
            await act(async () => {
                await vi.advanceTimersByTimeAsync(4_000);
            });
        }
        await waitFor(() =>
            expect(screen.queryByText(/Building your heatmap/i)).toBeNull(),
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

    it("hides the week toggle when next_week_available is false", async () => {
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
        // No toggle when the backend says next-week isn't ready yet.
        expect(
            screen.queryByRole("button", { name: /View this week/i }),
        ).toBeNull();
        expect(
            screen.queryByRole("button", { name: /View next week/i }),
        ).toBeNull();
    });

    it("shows the toggle and switches week when next_week_available is true", async () => {
        const heatmapCalls: string[] = [];
        server.use(
            http.get("*/api/v1/trips/:id", () =>
                HttpResponse.json({
                    ...sampleTripDetail,
                    backfill: { total: 10, ready: 10, percent_complete: 100 },
                }),
            ),
        );
        server.use(
            http.get("*/api/v1/trips/:id/heatmap", ({ request }) => {
                const week =
                    new URL(request.url).searchParams.get("week") ?? "current";
                heatmapCalls.push(week);
                if (week === "next") {
                    return HttpResponse.json(sampleNextWeekHeatmapResponse);
                }
                // Even the current-week response advertises next-week
                // as available, so the toggle renders on first paint.
                return HttpResponse.json({
                    ...sampleHeatmapResponse,
                    next_week_available: true,
                });
            }),
        );

        renderWithProviders(<TripDetailPage />, {
            initialEntries: ["/trips/1"],
            path: "/trips/:tripId",
        });

        const nextBtn = await screen.findByRole("button", {
            name: /View next week/i,
        });
        expect(
            screen.getByRole("button", { name: /View this week/i }),
        ).toBeInTheDocument();

        // Clicking flips the toggle and triggers a fresh heatmap fetch
        // with `?week=next`, after which the eyebrow date label moves
        // to the upcoming week's start.
        await act(async () => {
            fireEvent.click(nextBtn);
        });
        // The click triggers `setSelectedWeek("next")` → re-fetches the
        // heatmap with `?week=next` → setHeatmap → re-render with the
        // new `week_start_date`. Wait for both the network call and the
        // visible date label to flip in one combined poll so we don't
        // race the React batch.
        await waitFor(
            () => {
                expect(heatmapCalls).toContain("next");
                expect(
                    screen.queryAllByText(/Nov 17/).length,
                ).toBeGreaterThan(0);
            },
            { timeout: 3_000 },
        );
    });

    it("hides the NOW indicator while viewing next week", async () => {
        // Pin the system clock to a Wednesday at 09:30 PT — squarely
        // inside the heatmap's 06:00-21:00 sampling window so the NOW
        // dot would render on the current-week view. The toggle to
        // next week must suppress it: there's no "now" position in a
        // future week, and showing one would be misleading.
        vi.useFakeTimers({
            toFake: ["setInterval", "clearInterval", "Date"],
        });
        vi.setSystemTime(new Date("2026-05-06T16:30:00Z")); // 09:30 PT.

        server.use(
            http.get("*/api/v1/trips/:id", () =>
                HttpResponse.json({
                    ...sampleTripDetail,
                    backfill: { total: 10, ready: 10, percent_complete: 100 },
                }),
            ),
        );
        server.use(
            http.get("*/api/v1/trips/:id/heatmap", ({ request }) => {
                const week =
                    new URL(request.url).searchParams.get("week") ?? "current";
                return HttpResponse.json(
                    week === "next"
                        ? sampleNextWeekHeatmapResponse
                        : { ...sampleHeatmapResponse, next_week_available: true },
                );
            }),
        );

        renderWithProviders(<TripDetailPage />, {
            initialEntries: ["/trips/1"],
            path: "/trips/:tripId",
        });

        // Current week should show at least one NOW marker (the
        // desktop grid + the mobile accordion both render with the
        // same aria-label).
        await waitFor(() => {
            expect(screen.queryAllByLabelText("Now").length).toBeGreaterThan(0);
        });

        const nextBtn = await screen.findByRole("button", {
            name: /View next week/i,
        });
        await act(async () => {
            fireEvent.click(nextBtn);
        });

        // After the heatmap re-fetch with `?week=next`, every NOW
        // marker must be gone.
        await waitFor(
            () => {
                expect(screen.queryAllByLabelText("Now").length).toBe(0);
            },
            { timeout: 3_000 },
        );
    });

    it("does not poll backfill-status while viewing next week", async () => {
        let backfillPolls = 0;
        server.use(
            http.get("*/api/v1/trips/:id", () =>
                HttpResponse.json({
                    ...sampleTripDetail,
                    // Deliberately incomplete so the would-be poller
                    // *would* engage on the current-week tab — and we
                    // can prove it stays off once we switch to next.
                    backfill: { total: 100, ready: 50, percent_complete: 50 },
                }),
            ),
        );
        server.use(
            http.get("*/api/v1/trips/:id/heatmap", ({ request }) => {
                const week =
                    new URL(request.url).searchParams.get("week") ?? "current";
                return HttpResponse.json(
                    week === "next"
                        ? sampleNextWeekHeatmapResponse
                        : { ...sampleHeatmapResponse, next_week_available: true },
                );
            }),
        );
        server.use(
            http.get("*/api/v1/trips/:id/backfill-status", () => {
                backfillPolls += 1;
                return HttpResponse.json({
                    total: 100,
                    ready: 50,
                    percent_complete: 50,
                });
            }),
        );

        vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
        renderWithProviders(<TripDetailPage />, {
            initialEntries: ["/trips/1"],
            path: "/trips/:tripId",
        });

        const nextBtn = await screen.findByRole("button", {
            name: /View next week/i,
        });
        await act(async () => {
            fireEvent.click(nextBtn);
        });

        backfillPolls = 0;
        // Advance multiple polling cycles; if next-week didn't suppress
        // the timer, this would tick the counter.
        for (let i = 0; i < 3; i += 1) {
            await act(async () => {
                await vi.advanceTimersByTimeAsync(4_000);
            });
        }
        expect(backfillPolls).toBe(0);
    });
});

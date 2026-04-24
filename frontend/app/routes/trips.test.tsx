/**
 * Route-level tests for the authenticated trips list. Auth is faked via
 * MSW returning sampleUser from /me; an anonymous run hits the
 * Navigate→/ guard and we just check we end up on the splash route.
 */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import TripsPage from "~/routes/trips";
import { sampleTripSummary, sampleUser } from "~/test/mocks/handlers";
import { server } from "~/test/mocks/server";
import { renderWithProviders } from "~/test/render";

describe("/trips route", () => {
    it("redirects anonymous users to splash", async () => {
        server.use(http.get("*/api/v1/me", () => HttpResponse.json({ user: null })));
        renderWithProviders(<TripsPage />, { initialEntries: ["/trips"] });
        await waitFor(() =>
            expect(screen.getByText("fallback")).toBeInTheDocument(),
        );
    });

    it("renders the user's trips when authenticated", async () => {
        server.use(http.get("*/api/v1/me", () => HttpResponse.json(sampleUser)));
        server.use(
            http.get("*/api/v1/trips", () =>
                HttpResponse.json([
                    sampleTripSummary,
                    { ...sampleTripSummary, id: 2, name: "Gym" },
                ]),
            ),
        );

        renderWithProviders(<TripsPage />, { initialEntries: ["/trips"] });

        await waitFor(() =>
            expect(screen.getByText("My trips")).toBeInTheDocument(),
        );
        expect(screen.getByText(sampleTripSummary.name!)).toBeInTheDocument();
        expect(screen.getByText("Gym")).toBeInTheDocument();
    });

    it("shows the empty state when the user has no trips", async () => {
        server.use(http.get("*/api/v1/me", () => HttpResponse.json(sampleUser)));
        server.use(http.get("*/api/v1/trips", () => HttpResponse.json([])));

        renderWithProviders(<TripsPage />, { initialEntries: ["/trips"] });
        expect(await screen.findByText(/No trips yet/i)).toBeInTheDocument();
    });

    it("optimistically removes a trip on delete and calls the API", async () => {
        const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
        server.use(http.get("*/api/v1/me", () => HttpResponse.json(sampleUser)));
        server.use(
            http.get("*/api/v1/trips", () =>
                HttpResponse.json([sampleTripSummary]),
            ),
        );
        let deleteCalled = false;
        server.use(
            http.delete("*/api/v1/trips/:id", () => {
                deleteCalled = true;
                return HttpResponse.json(null, { status: 204 });
            }),
        );

        renderWithProviders(<TripsPage />, { initialEntries: ["/trips"] });
        await screen.findByText(sampleTripSummary.name!);

        fireEvent.click(screen.getByRole("button", { name: /delete trip/i }));

        await waitFor(() =>
            expect(screen.queryByText(sampleTripSummary.name!)).toBeNull(),
        );
        expect(deleteCalled).toBe(true);
        confirmSpy.mockRestore();
    });
});

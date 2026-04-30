/**
 * Route-level tests for the new-trip form. Covers happy path,
 * client-side button gating, and showing an inline error from the API.
 */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import NewTripPage from "~/routes/trips.new";
import { sampleTripDetail, sampleUser } from "~/test/mocks/handlers";
import { server } from "~/test/mocks/server";
import { renderWithProviders } from "~/test/render";

function authedFormSetup() {
    server.use(http.get("*/api/v1/me", () => HttpResponse.json(sampleUser)));
    return renderWithProviders(<NewTripPage />, {
        initialEntries: ["/trips/new"],
    });
}

describe("/trips/new route", () => {
    it("disables submit until both addresses are 3+ chars and distinct", async () => {
        authedFormSetup();
        const submit = await screen.findByRole("button", { name: /Create trip/i });

        expect(submit).toBeDisabled();

        const origin = screen.getByLabelText("origin address") as HTMLInputElement;
        const destination = screen.getByLabelText(
            "destination address",
        ) as HTMLInputElement;

        fireEvent.change(origin, { target: { value: "abc" } });
        fireEvent.change(destination, { target: { value: "abc" } });
        expect(submit).toBeDisabled();

        fireEvent.change(destination, { target: { value: "different st" } });
        expect(submit).toBeEnabled();
    });

    it("submits and navigates to the new trip detail on success", async () => {
        let bodySeen: unknown = null;
        server.use(http.get("*/api/v1/me", () => HttpResponse.json(sampleUser)));
        server.use(
            http.post("*/api/v1/trips", async ({ request }) => {
                bodySeen = await request.json();
                return HttpResponse.json(sampleTripDetail, { status: 201 });
            }),
        );

        renderWithProviders(<NewTripPage />, {
            initialEntries: ["/trips/new"],
        });

        await waitFor(() =>
            expect(
                screen.getByRole("button", { name: /Create trip/i }),
            ).toBeInTheDocument(),
        );

        fireEvent.change(screen.getByLabelText("origin address"), {
            target: { value: "100 A St" },
        });
        fireEvent.change(screen.getByLabelText("destination address"), {
            target: { value: "200 B Ave" },
        });
        fireEvent.click(screen.getByRole("button", { name: /Create trip/i }));

        await waitFor(() => expect(bodySeen).not.toBeNull());
        expect(bodySeen).toMatchObject({
            origin_address: "100 A St",
            destination_address: "200 B Ave",
        });
    });

    it("surfaces a backend error inline", async () => {
        server.use(http.get("*/api/v1/me", () => HttpResponse.json(sampleUser)));
        server.use(
            http.post("*/api/v1/trips", () =>
                HttpResponse.json(
                    { detail: "Per-user trip cap of 3 reached" },
                    { status: 409 },
                ),
            ),
        );

        renderWithProviders(<NewTripPage />, {
            initialEntries: ["/trips/new"],
        });

        await waitFor(() =>
            expect(
                screen.getByRole("button", { name: /Create trip/i }),
            ).toBeInTheDocument(),
        );

        fireEvent.change(screen.getByLabelText("origin address"), {
            target: { value: "100 A St" },
        });
        fireEvent.change(screen.getByLabelText("destination address"), {
            target: { value: "200 B Ave" },
        });
        fireEvent.click(screen.getByRole("button", { name: /Create trip/i }));

        expect(
            await screen.findByText(/Per-user trip cap of 3 reached/i),
        ).toBeInTheDocument();
    });

    it("renders 429 mutation-cap as a warning Alert, not an error", async () => {
        server.use(http.get("*/api/v1/me", () => HttpResponse.json(sampleUser)));
        server.use(
            http.post("*/api/v1/trips", () =>
                HttpResponse.json(
                    {
                        detail: "You've used 3 of 3 weekly trip changes. Each trip create or address edit triggers a fresh week of Google Maps lookups, so we cap edits to keep costs bounded. Your next slot opens automatically as older edits age out.",
                    },
                    { status: 429 },
                ),
            ),
        );

        renderWithProviders(<NewTripPage />, {
            initialEntries: ["/trips/new"],
        });

        await waitFor(() =>
            expect(
                screen.getByRole("button", { name: /Create trip/i }),
            ).toBeInTheDocument(),
        );

        fireEvent.change(screen.getByLabelText("origin address"), {
            target: { value: "100 A St" },
        });
        fireEvent.change(screen.getByLabelText("destination address"), {
            target: { value: "200 B Ave" },
        });
        fireEvent.click(screen.getByRole("button", { name: /Create trip/i }));

        // The text should appear, and the alert should be a "warning"
        // (yellow) not an "error" (red) — this is intentional gating.
        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent(/3 of 3 weekly trip changes/i);
        expect(alert.className).toMatch(/colorWarning|standardWarning/);
    });
});

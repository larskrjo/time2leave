import { fireEvent, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import SplashPage from "~/routes/splash";
import { sampleUser } from "~/test/mocks/handlers";
import { server } from "~/test/mocks/server";
import { renderWithProviders } from "~/test/render";

describe("/ splash route", () => {
    it("renders the hero copy and dev login for anonymous users", async () => {
        renderWithProviders(<SplashPage />, { initialEntries: ["/"] });

        // Hero h2 specifically — the bottom CTA also contains "stop"
        // ("Ready to stop guessing?") so we anchor to the heading role.
        expect(
            await screen.findByRole("heading", {
                name: /stop guessing when to leave/i,
            }),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/Know when to leave/i),
        ).toBeInTheDocument();
        // Dev login is enabled in default MSW handlers.
        expect(
            await screen.findByLabelText(/dev login email/i),
        ).toBeInTheDocument();
    });

    it("surfaces the sign-in CTA prominently", async () => {
        // The hero CTA card has an explicit framing heading + microcopy
        // so visitors don't miss the (otherwise small) Google button.
        renderWithProviders(<SplashPage />, { initialEntries: ["/"] });
        expect(
            await screen.findByText(/sign in to save your first trip/i),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/email needs to be on the allowlist/i),
        ).toBeInTheDocument();
        // Persistent "Sign in" affordances at the top of the page and
        // at the bottom — anonymous visitors get an entry point on
        // every screen position.
        expect(
            screen.getByRole("button", { name: /^sign in$/i }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: /sign in to get started/i }),
        ).toBeInTheDocument();
    });

    it("scrolls to the CTA when the header sign-in button is clicked", async () => {
        // jsdom doesn't implement scrollIntoView; track that we called
        // it on the right element when the user clicks "Sign in".
        const scrollSpy = vi.fn();
        Element.prototype.scrollIntoView = scrollSpy;

        renderWithProviders(<SplashPage />, { initialEntries: ["/"] });
        const button = await screen.findByRole("button", {
            name: /^sign in$/i,
        });
        fireEvent.click(button);
        expect(scrollSpy).toHaveBeenCalledTimes(1);
    });

    it("redirects authenticated users away from /", async () => {
        server.use(http.get("*/api/v1/me", () => HttpResponse.json(sampleUser)));
        renderWithProviders(<SplashPage />, { initialEntries: ["/"] });
        await waitFor(() =>
            expect(screen.getByText("fallback")).toBeInTheDocument(),
        );
    });
});

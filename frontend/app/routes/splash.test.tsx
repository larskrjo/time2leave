import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import SplashPage from "~/routes/splash";
import { sampleUser } from "~/test/mocks/handlers";
import { server } from "~/test/mocks/server";
import { renderWithProviders } from "~/test/render";

describe("/ splash route", () => {
    it("renders the hero copy and dev login for anonymous users", async () => {
        renderWithProviders(<SplashPage />, { initialEntries: ["/"] });

        expect(
            await screen.findByText(/Stop/i, { exact: false }),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/Know when to leave/i),
        ).toBeInTheDocument();
        // Dev login is enabled in default MSW handlers.
        expect(
            await screen.findByLabelText(/dev login email/i),
        ).toBeInTheDocument();
    });

    it("redirects authenticated users away from /", async () => {
        server.use(http.get("*/api/v1/me", () => HttpResponse.json(sampleUser)));
        renderWithProviders(<SplashPage />, { initialEntries: ["/"] });
        await waitFor(() =>
            expect(screen.getByText("fallback")).toBeInTheDocument(),
        );
    });
});

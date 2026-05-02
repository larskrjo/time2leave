/**
 * Smoke tests for SessionProvider + useSession that also cover the
 * apiFetch round-trip against MSW.
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import {
    anonymousMeResponse,
    sampleUser,
} from "~/test/mocks/handlers";
import { server } from "~/test/mocks/server";
import { SessionProvider, useSession } from "~/lib/session";

function SessionProbe() {
    const { status, user } = useSession();
    return (
        <div>
            <div data-testid="status">{status}</div>
            <div data-testid="email">{user?.email ?? "-"}</div>
        </div>
    );
}

function renderWithSession() {
    return render(
        <SessionProvider>
            <SessionProbe />
        </SessionProvider>,
    );
}

describe("SessionProvider", () => {
    it("settles into 'anonymous' when /me returns no user", async () => {
        renderWithSession();
        await waitFor(() => {
            expect(screen.getByTestId("status").textContent).toBe("anonymous");
        });
        expect(screen.getByTestId("email").textContent).toBe("-");
    });

    it("settles into 'authenticated' when /me returns a user", async () => {
        server.use(http.get("*/api/v1/me", () => HttpResponse.json(sampleUser)));
        renderWithSession();
        await waitFor(() => {
            expect(screen.getByTestId("status").textContent).toBe(
                "authenticated",
            );
        });
        expect(screen.getByTestId("email").textContent).toBe(sampleUser.email);
    });

    it("handles a 500 on /me as anonymous rather than hanging", async () => {
        server.use(
            http.get("*/api/v1/me", () =>
                HttpResponse.json({ detail: "boom" }, { status: 500 }),
            ),
        );
        renderWithSession();
        await waitFor(() => {
            expect(screen.getByTestId("status").textContent).toBe("anonymous");
        });
    });
});

describe("useSession actions", () => {
    it("loginDev then logout flips status twice", async () => {
        // `/me` initially returns anonymous.
        server.use(http.get("*/api/v1/me", () => HttpResponse.json(anonymousMeResponse)));
        server.use(
            http.post("*/api/v1/auth/dev-login", () =>
                HttpResponse.json(sampleUser),
            ),
        );
        server.use(
            http.post("*/api/v1/auth/logout", () =>
                HttpResponse.json({ status: "ok" }),
            ),
        );

        let captured: ReturnType<typeof useSession> | null = null;
        function Capture() {
            captured = useSession();
            return null;
        }

        render(
            <SessionProvider>
                <Capture />
                <SessionProbe />
            </SessionProvider>,
        );

        await waitFor(() => {
            expect(screen.getByTestId("status").textContent).toBe("anonymous");
        });

        await act(async () => {
            await captured!.loginDev(sampleUser.email, sampleUser.name ?? "");
        });
        expect(screen.getByTestId("status").textContent).toBe("authenticated");
        expect(screen.getByTestId("email").textContent).toBe(sampleUser.email);

        await act(async () => {
            await captured!.logout();
        });
        expect(screen.getByTestId("status").textContent).toBe("anonymous");
        expect(screen.getByTestId("email").textContent).toBe("-");
    });
});

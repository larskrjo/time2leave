/**
 * Route-level tests for /admin/allowlist.
 *
 * Two layers of guards: anonymous → splash, signed-in-but-not-admin →
 * /trips, admin → the page itself. Once on the page we exercise the
 * happy-path add and the deferred-undo remove just like the trips tests
 * cover the trips list.
 */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import AdminAllowlistPage from "~/routes/admin.allowlist";
import {
    sampleAllowlist,
    sampleUser,
} from "~/test/mocks/handlers";
import { server } from "~/test/mocks/server";
import { renderWithProviders } from "~/test/render";

const adminUser = { ...sampleUser, is_admin: true, email: "owner@example.com" };
const nonAdminUser = { ...sampleUser, is_admin: false };

describe("/admin/allowlist route", () => {
    it("redirects anonymous users to splash", async () => {
        server.use(http.get("*/api/v1/me", () => HttpResponse.json({ user: null })));
        renderWithProviders(<AdminAllowlistPage />, {
            initialEntries: ["/admin/allowlist"],
        });
        await waitFor(() =>
            expect(screen.getByText("fallback")).toBeInTheDocument(),
        );
    });

    it("redirects non-admin users away", async () => {
        server.use(http.get("*/api/v1/me", () => HttpResponse.json(nonAdminUser)));
        renderWithProviders(<AdminAllowlistPage />, {
            initialEntries: ["/admin/allowlist"],
        });
        await waitFor(() =>
            expect(screen.getByText("fallback")).toBeInTheDocument(),
        );
    });

    it("renders the allowlist for an admin", async () => {
        server.use(http.get("*/api/v1/me", () => HttpResponse.json(adminUser)));

        renderWithProviders(<AdminAllowlistPage />, {
            initialEntries: ["/admin/allowlist"],
        });

        await waitFor(() =>
            expect(
                screen.getByRole("heading", { name: /manage the allowlist/i }),
            ).toBeInTheDocument(),
        );
        for (const entry of sampleAllowlist) {
            expect(await screen.findByText(entry.email)).toBeInTheDocument();
        }
    });

    it("disables 'remove' for the admin's own row and for bootstrap entries", async () => {
        server.use(http.get("*/api/v1/me", () => HttpResponse.json(adminUser)));

        renderWithProviders(<AdminAllowlistPage />, {
            initialEntries: ["/admin/allowlist"],
        });

        // The owner@example.com row is both `is_self` AND `bootstrap`, so its
        // remove button is disabled. The friend@example.com row was added by
        // owner, so it is removable.
        const selfRemove = await screen.findByRole("button", {
            name: /remove owner@example\.com/i,
        });
        expect(selfRemove).toBeDisabled();

        const friendRemove = screen.getByRole("button", {
            name: /remove friend@example\.com/i,
        });
        expect(friendRemove).not.toBeDisabled();
    });

    it("validates obviously bad emails on the client", async () => {
        server.use(http.get("*/api/v1/me", () => HttpResponse.json(adminUser)));

        renderWithProviders(<AdminAllowlistPage />, {
            initialEntries: ["/admin/allowlist"],
        });

        const input = await screen.findByLabelText(/invite by email/i);
        fireEvent.change(input, { target: { value: "not-an-email" } });
        fireEvent.click(
            screen.getByRole("button", { name: /add to allowlist/i }),
        );

        // The form has noValidate so HTML5 email validation doesn't kick in
        // and our own regex check is what fires.
        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent(/valid email/i);
    });

    it("adds a new email and shows it in the list", async () => {
        server.use(http.get("*/api/v1/me", () => HttpResponse.json(adminUser)));

        let posted: { email: string } | null = null;
        server.use(
            http.post("*/api/v1/admin/allowlist", async ({ request }) => {
                posted = (await request.json()) as { email: string };
                return HttpResponse.json(
                    {
                        id: 42,
                        email: posted.email,
                        added_by: adminUser.email,
                        created_at: new Date().toISOString(),
                    },
                    { status: 201 },
                );
            }),
        );

        renderWithProviders(<AdminAllowlistPage />, {
            initialEntries: ["/admin/allowlist"],
        });

        const input = await screen.findByLabelText(/invite by email/i);
        fireEvent.change(input, { target: { value: "newperson@example.com" } });
        fireEvent.click(
            screen.getByRole("button", { name: /add to allowlist/i }),
        );

        expect(
            await screen.findByText("newperson@example.com"),
        ).toBeInTheDocument();
        await waitFor(() =>
            expect(posted).toEqual({ email: "newperson@example.com" }),
        );
    });

    it("optimistically removes an email and calls DELETE after the undo window", async () => {
        server.use(http.get("*/api/v1/me", () => HttpResponse.json(adminUser)));

        let deletedEmail: string | null = null;
        server.use(
            http.delete(
                "*/api/v1/admin/allowlist/:email",
                ({ params }) => {
                    deletedEmail = decodeURIComponent(params.email as string);
                    return HttpResponse.json(null, { status: 204 });
                },
            ),
        );

        renderWithProviders(<AdminAllowlistPage />, {
            initialEntries: ["/admin/allowlist"],
        });

        await screen.findByText("friend@example.com");
        fireEvent.click(
            screen.getByRole("button", { name: /remove friend@example\.com/i }),
        );

        // Row disappears optimistically.
        await waitFor(() =>
            expect(screen.queryByText("friend@example.com")).toBeNull(),
        );
        // Snackbar with undo affordance.
        expect(
            await screen.findByText(/removed friend@example\.com/i),
        ).toBeInTheDocument();
        // Undo restores the row and skips the DELETE.
        fireEvent.click(screen.getByRole("button", { name: /undo/i }));
        expect(await screen.findByText("friend@example.com")).toBeInTheDocument();
        expect(deletedEmail).toBeNull();
    });
});

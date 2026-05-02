/**
 * API client + types for admin-only routes.
 *
 * Mirrors `backend/app/api/admin_api.py`. The endpoints are gated server-side
 * by `get_admin_user` (membership in `ADMIN_EMAILS`); the SPA additionally
 * gates the route so non-admins never see the link.
 */
import { API } from "~/constants/path";
import { apiFetch } from "~/lib/api";

export type AllowlistEntry = {
    id: number;
    email: string;
    added_by: string | null;
    created_at: string | null;
};

export async function listAllowlist(): Promise<AllowlistEntry[]> {
    return apiFetch<AllowlistEntry[]>(API.adminAllowlist);
}

export async function addAllowlistEntry(email: string): Promise<AllowlistEntry> {
    return apiFetch<AllowlistEntry>(API.adminAllowlist, {
        method: "POST",
        body: JSON.stringify({ email }),
    });
}

export async function removeAllowlistEntry(email: string): Promise<void> {
    await apiFetch<null>(API.adminAllowlistEntry(email), { method: "DELETE" });
}

/**
 * Client-side guard for admin-only pages.
 *
 * Layered on top of <ProtectedRoute>: first ensure the user is signed in,
 * then check `is_admin`. Non-admin authenticated users get bounced to
 * /trips rather than the splash so they don't lose their session context.
 *
 * The backend re-checks admin status on every request, so this is purely
 * a UX guard — bypassing it just means the page flashes empty data and
 * the API returns 403.
 */
import type { ReactNode } from "react";
import { Navigate } from "react-router";

import { ProtectedRoute } from "~/components/ProtectedRoute";
import { ROUTES } from "~/constants/path";
import { useSession } from "~/lib/session";

export function AdminRoute({ children }: { children: ReactNode }) {
    return (
        <ProtectedRoute>
            <AdminGate>{children}</AdminGate>
        </ProtectedRoute>
    );
}

function AdminGate({ children }: { children: ReactNode }) {
    const { user } = useSession();
    if (!user?.is_admin) {
        return <Navigate to={ROUTES.trips} replace />;
    }
    return <>{children}</>;
}

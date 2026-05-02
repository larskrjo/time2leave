/**
 * Client-side route guard.
 *
 * Renders a centered spinner while the session is still loading, the
 * fallback (usually <Navigate />) while anonymous, and children once
 * authenticated. Using this component keeps per-page code free of auth
 * branching and ensures the app never flashes authenticated UI before
 * /me has resolved.
 */
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";

import { useSession } from "~/lib/session";
import { ROUTES } from "~/constants/path";
import Loading from "~/components/Loading";

export function ProtectedRoute({ children }: { children: ReactNode }) {
    const { status } = useSession();
    const location = useLocation();

    if (status === "loading") return <Loading />;
    if (status === "anonymous") {
        const params = new URLSearchParams();
        if (location.pathname && location.pathname !== ROUTES.splash) {
            params.set("next", location.pathname + location.search);
        }
        const query = params.toString();
        return (
            <Navigate
                to={`${ROUTES.splash}${query ? `?${query}` : ""}`}
                replace
            />
        );
    }
    return <>{children}</>;
}

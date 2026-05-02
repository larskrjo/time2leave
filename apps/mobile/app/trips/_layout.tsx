/**
 * Auth-gated layout for everything under `/trips`.
 *
 * Anonymous users get bounced to the splash; authenticated users see
 * a stack with a customizable header per screen. Loading state goes
 * to a centered spinner so we don't flash the splash hero between
 * "still hydrating" and "redirected to /trips".
 */
import { Redirect, Stack } from "expo-router";

import { useAuth } from "~/auth/AuthProvider";
import { Loading } from "~/components/Loading";

export default function TripsLayout() {
    const { status } = useAuth();
    if (status === "loading") return <Loading />;
    if (status !== "authenticated") return <Redirect href="/" />;
    return <Stack />;
}

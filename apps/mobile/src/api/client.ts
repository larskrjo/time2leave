/**
 * Mobile API client.
 *
 * Wraps the transport-agnostic `createApiFetch` from `@time2leave/shared`
 * with the React Native flavor of authentication: a bearer JWT pulled
 * from `expo-secure-store` and attached to every request as
 * `Authorization: Bearer <jwt>`. The web app does cookies; the mobile
 * app does headers; the same backend serves both.
 *
 * Strict by design: `BASE_URL` comes from `requireEnv()`, which
 * throws if `<RootLayout>` hasn't already validated the env. There is
 * no production-default fallback URL here — a misconfigured build
 * lands on the SetupRequired screen rather than silently calling the
 * wrong host.
 */
import {
    createApiFetch,
    createApiPaths,
    type ApiFetch,
    type ApiPaths,
} from "@time2leave/shared";

import { requireEnv } from "~/config/env";
import { getCurrentToken } from "./storage";

let _api: ApiPaths | null = null;

/**
 * Lazily-instantiated `ApiPaths`. We can't build it at module load
 * because that would call `requireEnv()` *before* `<RootLayout>` has
 * gated the env, breaking the SetupRequired fallback for unconfigured
 * checkouts. Calling `getApi()` from inside a render or effect (i.e.
 * always after the gate) is safe.
 */
export function getApi(): ApiPaths {
    if (_api === null) {
        _api = createApiPaths(requireEnv().apiBaseUrl);
    }
    return _api;
}

export const apiFetch: ApiFetch = createApiFetch({
    prepareInit: (init) => {
        // Always identify as a mobile client so the backend knows to
        // mint a bearer token on /auth/google + /auth/dev-login.
        const headers: Record<string, string> = {
            "X-Client": "mobile",
            ...((init.headers as Record<string, string> | undefined) ?? {}),
        };
        const token = getCurrentToken();
        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }
        return { ...init, headers };
    },
});

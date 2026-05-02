/**
 * Mobile API client.
 *
 * Wraps the transport-agnostic `createApiFetch` from `@time2leave/shared`
 * with the React Native flavor of authentication: a bearer JWT pulled
 * from `expo-secure-store` and attached to every request as
 * `Authorization: Bearer <jwt>`. The web app does cookies; the mobile
 * app does headers; the same backend serves both.
 *
 * All API URLs flow through `createApiPaths(baseUrl)` so the mobile
 * app and the web app emit identical paths off their own configured
 * base URLs.
 */
import {
    createApiFetch,
    createApiPaths,
    type ApiFetch,
    type ApiPaths,
} from "@time2leave/shared";

import { getCurrentToken } from "./storage";

const FALLBACK_BASE_URL = "https://api.time2leave.com";

/**
 * Resolved at module-eval time. Expo inlines `process.env.EXPO_PUBLIC_*`
 * into the bundle, so the value is constant for the running app. To
 * change it during local dev, restart `expo start`.
 */
export const BASE_URL: string =
    process.env.EXPO_PUBLIC_API_BASE_URL && process.env.EXPO_PUBLIC_API_BASE_URL.length > 0
        ? process.env.EXPO_PUBLIC_API_BASE_URL
        : FALLBACK_BASE_URL;

export const API: ApiPaths = createApiPaths(BASE_URL);

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

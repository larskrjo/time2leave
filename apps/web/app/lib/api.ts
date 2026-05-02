/**
 * Web-side API client.
 *
 * Constructs the singleton `apiFetch` for the browser SPA. Every backend
 * route under `/api/v1` uses an HttpOnly session cookie, so we plug a
 * `prepareInit` hook into the shared factory that flips on
 * `credentials: "include"` for every cross-origin request. That's the
 * only browser-specific bit — the rest of the JSON-in/JSON-out plumbing
 * and `ApiError` type live in `@time2leave/shared`.
 */
import {
    createApiFetch,
    isApiError,
    type ApiError,
    type ApiFetch,
} from "@time2leave/shared";

export type { ApiError, ApiFetch };
export { isApiError };

export const apiFetch: ApiFetch = createApiFetch({
    prepareInit: (init) => ({ ...init, credentials: "include" }),
});

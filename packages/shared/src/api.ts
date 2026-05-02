/**
 * Transport-agnostic fetch wrapper.
 *
 * Both clients want the same JSON-in/JSON-out semantics and the same
 * error normalization, but they authenticate differently:
 *   - Web: HttpOnly cookie set by `/api/v1/auth/google`. The browser
 *     attaches it automatically as long as we set `credentials:
 *     "include"` on every cross-origin request.
 *   - Mobile (Expo): there are no shared cookies between native code
 *     and a React Native fetch call, so we ask the backend to hand us
 *     a session JWT in the response body and store it in
 *     `expo-secure-store`. Each request then needs an
 *     `Authorization: Bearer <jwt>` header.
 *
 * To keep one codebase, `createApiFetch` lets the caller plug in a
 * `prepareInit` hook that does whatever per-request mutation it needs
 * (set credentials, add a header, retry on 401, etc.). Web and mobile
 * each instantiate the fetch helper once and re-use it everywhere.
 */
export type ApiError = {
    status: number;
    detail: string;
    body?: unknown;
};

export type PrepareInit = (
    init: RequestInit,
) => Promise<RequestInit> | RequestInit;

export type ApiFetchOptions = {
    /**
     * Per-request hook that runs after the default JSON headers have
     * been applied but before the fetch is made. Use it to attach
     * cookies (`credentials: "include"`) or bearer tokens.
     */
    prepareInit?: PrepareInit;
    /**
     * Optional override of the `fetch` implementation, mostly so tests
     * can pass a mock without monkey-patching the global. Defaults to
     * `globalThis.fetch`.
     */
    fetchImpl?: typeof fetch;
};

export type ApiFetch = <T>(url: string, init?: RequestInit) => Promise<T>;

export function createApiFetch(opts: ApiFetchOptions = {}): ApiFetch {
    return async function apiFetch<T>(
        url: string,
        init: RequestInit = {},
    ): Promise<T> {
        // Resolve `fetch` *at call time* rather than at factory time so
        // late patches to `globalThis.fetch` (e.g. MSW's `server.listen()`
        // in beforeAll) take effect even though `createApiFetch` itself
        // ran during module evaluation.
        const fetchImpl: typeof fetch = opts.fetchImpl ?? globalThis.fetch;
        if (!fetchImpl) {
            throw new Error(
                "createApiFetch: no fetch implementation available — pass `fetchImpl` explicitly.",
            );
        }
        const baseInit: RequestInit = {
            ...init,
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                ...(init.headers ?? {}),
            },
        };
        const finalInit = opts.prepareInit
            ? await opts.prepareInit(baseInit)
            : baseInit;
        const response = await fetchImpl(url, finalInit);

        const rawText = await response.text();
        let body: unknown = null;
        if (rawText) {
            try {
                body = JSON.parse(rawText);
            } catch {
                body = rawText;
            }
        }

        if (!response.ok) {
            const detail =
                (typeof body === "object" &&
                    body !== null &&
                    "detail" in body &&
                    String(
                        (body as { detail?: unknown }).detail ??
                            response.statusText,
                    )) ||
                response.statusText ||
                `HTTP ${response.status}`;
            const err: ApiError = {
                status: response.status,
                detail,
                body,
            };
            throw err;
        }

        return body as T;
    };
}

export function isApiError(e: unknown): e is ApiError {
    return (
        typeof e === "object" &&
        e !== null &&
        "status" in e &&
        "detail" in e
    );
}

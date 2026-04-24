/**
 * Thin fetch wrapper that always sends the session cookie.
 *
 * Every backend route under `/api/v1` uses a cookie-backed session, so
 * every request the SPA makes needs `credentials: "include"`. Using one
 * helper keeps that invariant in one place and lets us add auth retries
 * or error normalization without touching every call site.
 */
export type ApiError = {
    status: number;
    detail: string;
    body?: unknown;
};

export async function apiFetch<T>(
    url: string,
    init: RequestInit = {},
): Promise<T> {
    const response = await fetch(url, {
        ...init,
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            ...(init.headers ?? {}),
        },
    });

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
        const err: ApiError = { status: response.status, detail, body };
        throw err;
    }

    return body as T;
}

export function isApiError(e: unknown): e is ApiError {
    return (
        typeof e === "object" &&
        e !== null &&
        "status" in e &&
        "detail" in e
    );
}

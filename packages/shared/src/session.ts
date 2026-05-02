/**
 * API client helpers for auth.
 *
 * Mobile callers should pass `wantsToken: true` so the backend echoes
 * the session JWT back in the response body — the React Native client
 * persists it in `expo-secure-store` and attaches it to subsequent
 * requests as `Authorization: Bearer <jwt>`.
 *
 * Web callers leave `wantsToken` unset so the response only carries
 * the user projection; the session is delivered via the HttpOnly
 * `tlh_session` cookie as before.
 */
import type { ApiFetch } from "./api";
import type { ApiPaths } from "./paths";
import type {
    AuthConfig,
    AuthedUserResponse,
    SessionUser,
} from "./types";

export type LoginOptions = {
    /** When true, also request a bearer-token-shaped response. */
    wantsToken?: boolean;
};

function tokenInit(opts: LoginOptions | undefined): RequestInit {
    return opts?.wantsToken
        ? { headers: { "X-Client": "mobile" } }
        : {};
}

export async function fetchMe(
    apiFetch: ApiFetch,
    paths: ApiPaths,
): Promise<SessionUser | null> {
    const body = await apiFetch<SessionUser | { user: null }>(paths.me);
    if (body && "email" in body) return body;
    return null;
}

export async function fetchAuthConfig(
    apiFetch: ApiFetch,
    paths: ApiPaths,
): Promise<AuthConfig> {
    try {
        return await apiFetch<AuthConfig>(paths.authConfig);
    } catch {
        return { google_oauth_client_id: null, dev_login_enabled: false };
    }
}

export async function loginWithGoogleCredential(
    apiFetch: ApiFetch,
    paths: ApiPaths,
    credential: string,
    opts?: LoginOptions,
): Promise<AuthedUserResponse> {
    const init = tokenInit(opts);
    return apiFetch<AuthedUserResponse>(paths.authGoogle, {
        method: "POST",
        body: JSON.stringify({ credential }),
        ...init,
    });
}

export async function loginDev(
    apiFetch: ApiFetch,
    paths: ApiPaths,
    email: string,
    name?: string,
    opts?: LoginOptions,
): Promise<AuthedUserResponse> {
    const init = tokenInit(opts);
    return apiFetch<AuthedUserResponse>(paths.authDevLogin, {
        method: "POST",
        body: JSON.stringify({ email, name }),
        ...init,
    });
}

export async function logout(
    apiFetch: ApiFetch,
    paths: ApiPaths,
): Promise<void> {
    await apiFetch<{ status: string }>(paths.authLogout, {
        method: "POST",
    });
}

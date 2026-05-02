/**
 * Session plumbing: `<SessionProvider>`, `useSession()`, and helpers that
 * talk to the backend's /api/v1/me, /auth/google, /auth/logout endpoints.
 *
 * The provider loads /me once on mount so protected routes can decide
 * what to render synchronously from `useSession().status`. All mutations
 * (login, logout) flow through the context so every page sees fresh
 * state immediately. The actual HTTP calls live in `@time2leave/shared`
 * so the mobile app can re-use the same plumbing with its bearer-token
 * transport.
 */
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";

import {
    fetchAuthConfig as sharedFetchAuthConfig,
    fetchMe as sharedFetchMe,
    loginDev as sharedLoginDev,
    loginWithGoogleCredential as sharedLoginWithGoogleCredential,
    logout as sharedLogout,
    type AuthConfig,
    type SessionUser,
} from "@time2leave/shared";

import { isApiError } from "~/lib/api";
import { apiFetch } from "~/lib/api";
import { API } from "~/constants/path";

export type { AuthConfig, SessionUser };
export type SessionStatus = "loading" | "authenticated" | "anonymous";

type SessionState = {
    status: SessionStatus;
    user: SessionUser | null;
    authConfig: AuthConfig | null;
    refresh: () => Promise<void>;
    loginWithGoogleCredential: (credential: string) => Promise<SessionUser>;
    loginDev: (email: string, name?: string) => Promise<SessionUser>;
    logout: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<SessionUser | null>(null);
    const [status, setStatus] = useState<SessionStatus>("loading");
    const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
    const didInitialLoad = useRef(false);

    const refresh = useCallback(async () => {
        try {
            const me = await sharedFetchMe(apiFetch, API);
            setUser(me);
            setStatus(me ? "authenticated" : "anonymous");
        } catch (err) {
            if (isApiError(err) && err.status === 401) {
                setUser(null);
                setStatus("anonymous");
                return;
            }
            // Network or 500: treat as anonymous but keep status resolved so
            // protected routes don't hang in "loading" forever.
            setUser(null);
            setStatus("anonymous");
        }
    }, []);

    useEffect(() => {
        if (didInitialLoad.current) return;
        didInitialLoad.current = true;
        void (async () => {
            const [config] = await Promise.all([
                sharedFetchAuthConfig(apiFetch, API),
            ]);
            setAuthConfig(config);
            await refresh();
        })();
    }, [refresh]);

    const loginWithGoogleCredential = useCallback(
        async (credential: string) => {
            const authed = await sharedLoginWithGoogleCredential(
                apiFetch,
                API,
                credential,
            );
            setUser(authed);
            setStatus("authenticated");
            return authed;
        },
        [],
    );

    const loginDev = useCallback(async (email: string, name?: string) => {
        const authed = await sharedLoginDev(apiFetch, API, email, name);
        setUser(authed);
        setStatus("authenticated");
        return authed;
    }, []);

    const logout = useCallback(async () => {
        await sharedLogout(apiFetch, API);
        setUser(null);
        setStatus("anonymous");
    }, []);

    const value = useMemo<SessionState>(
        () => ({
            status,
            user,
            authConfig,
            refresh,
            loginWithGoogleCredential,
            loginDev,
            logout,
        }),
        [
            status,
            user,
            authConfig,
            refresh,
            loginWithGoogleCredential,
            loginDev,
            logout,
        ],
    );

    return (
        <SessionContext.Provider value={value}>
            {children}
        </SessionContext.Provider>
    );
}

export function useSession(): SessionState {
    const ctx = useContext(SessionContext);
    if (ctx === null) {
        throw new Error("useSession must be used inside <SessionProvider>");
    }
    return ctx;
}

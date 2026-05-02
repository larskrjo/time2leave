/**
 * Google Identity Services "Sign in with Google" button.
 *
 * Loads the GSI library on mount and renders the official button into
 * our container. When the user signs in, the callback posts the ID
 * token to the backend via useSession().loginWithGoogleCredential.
 */
import { useEffect, useRef, useState } from "react";
import { Box, Typography } from "@mui/material";

import { useSession } from "~/lib/session";

declare global {
    interface Window {
        google?: {
            accounts?: {
                id: {
                    initialize: (config: {
                        client_id: string;
                        callback: (resp: { credential?: string }) => void;
                        auto_select?: boolean;
                        // Opt into the new browser FedCM API for both
                        // the One Tap prompt and the rendered button.
                        // Without this, GSI falls back to the legacy
                        // popup + window.postMessage flow, which trips
                        // Chrome's COOP heads-up warning even when the
                        // page sets COOP=same-origin-allow-popups
                        // (because Chrome warns about future-blocking
                        // behavior, not current behavior).
                        use_fedcm_for_prompt?: boolean;
                        use_fedcm_for_button?: boolean;
                    }) => void;
                    renderButton: (
                        parent: HTMLElement,
                        options: {
                            type?: "standard" | "icon";
                            theme?: "outline" | "filled_blue" | "filled_black";
                            size?: "small" | "medium" | "large";
                            text?:
                                | "signin_with"
                                | "signup_with"
                                | "continue_with"
                                | "signin";
                            shape?: "rectangular" | "pill" | "circle" | "square";
                            logo_alignment?: "left" | "center";
                            width?: string | number;
                        },
                    ) => void;
                };
            };
        };
    }
}

const GSI_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

// GSI is *global* state — `google.accounts.id.initialize` registers a
// single callback for the whole page. Calling it more than once warns
// ("only the last initialized instance will be used") and that warning
// compounds on every logout→splash remount of this component.
//
// Solution: initialize exactly once per page lifecycle with a stable
// callback that delegates to a module-level handler reference. Each
// time the component (re)mounts it just swaps the handler — no new
// initialize call needed. On unmount the handler is cleared so any
// stale popup callbacks fired after navigation become no-ops.
let gsiInitializedClientId: string | null = null;
let credentialHandler: ((credential: string) => void) | null = null;

function loadGsiScript(): Promise<void> {
    if (typeof window === "undefined") return Promise.resolve();
    if (window.google?.accounts?.id) return Promise.resolve();
    const existing = document.querySelector<HTMLScriptElement>(
        `script[src="${GSI_SCRIPT_SRC}"]`,
    );
    if (existing) {
        return new Promise((resolve, reject) => {
            existing.addEventListener("load", () => resolve());
            existing.addEventListener("error", () =>
                reject(new Error("Failed to load GSI client")),
            );
        });
    }
    return new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = GSI_SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load GSI client"));
        document.head.appendChild(script);
    });
}

// GSI's `width` prop only accepts pixel integers in [200, 400]. Anything
// outside that range is silently clamped, so we constrain at the call site.
const MIN_GSI_WIDTH = 200;
const MAX_GSI_WIDTH = 360;

function pickButtonWidth(host: HTMLElement): number {
    // `clientWidth` is the rendered inner width of the host Box. The host
    // is `display: flex` so it always fills its parent's content area;
    // measuring it gives us the largest GSI button that won't overflow.
    const available = Math.floor(host.clientWidth);
    if (!Number.isFinite(available) || available <= 0) return MAX_GSI_WIDTH;
    return Math.min(MAX_GSI_WIDTH, Math.max(MIN_GSI_WIDTH, available));
}

export function GoogleSignInButton() {
    const { authConfig, loginWithGoogleCredential } = useSession();
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);

    useEffect(() => {
        const clientId = authConfig?.google_oauth_client_id;
        if (!clientId || !containerRef.current) return;

        let cancelled = false;
        let resizeObserver: ResizeObserver | null = null;
        let lastWidth = 0;

        type GsiId = NonNullable<
            NonNullable<typeof window.google>["accounts"]
        >["id"];

        const renderButton = (gsi: GsiId, host: HTMLElement) => {
            const width = pickButtonWidth(host);
            // Avoid re-rendering if width hasn't changed — keeps the
            // button from flickering during scroll/resize where
            // `clientWidth` rounds to the same int.
            if (width === lastWidth) return;
            lastWidth = width;
            host.innerHTML = "";
            gsi.renderButton(host, {
                type: "standard",
                theme: "filled_blue",
                size: "large",
                text: "continue_with",
                shape: "pill",
                logo_alignment: "left",
                width,
            });
        };

        void (async () => {
            try {
                await loadGsiScript();
            } catch (e) {
                if (!cancelled) {
                    setError(
                        e instanceof Error ? e.message : "Sign-in unavailable",
                    );
                }
                return;
            }
            if (cancelled) return;

            const gsi = window.google?.accounts?.id;
            const host = containerRef.current;
            if (!gsi || !host) return;

            // Wire up the handler that the (stable, single) GSI
            // callback delegates to. Each remount installs a fresh
            // closure over the *current* component's setError /
            // setPending and the latest loginWithGoogleCredential.
            credentialHandler = (credential) => {
                setPending(true);
                setError(null);
                void loginWithGoogleCredential(credential)
                    .catch((err) => {
                        setError(
                            err?.detail ??
                                err?.message ??
                                "Sign-in failed. Your email may not be on the allowlist.",
                        );
                    })
                    .finally(() => setPending(false));
            };

            // Initialize GSI exactly once per page lifecycle. Re-init
            // only if the client_id actually changed (config swap), in
            // which case the warning is acceptable since the previous
            // init's callback is genuinely stale.
            if (gsiInitializedClientId !== clientId) {
                gsi.initialize({
                    client_id: clientId,
                    callback: (resp) => {
                        if (!resp.credential) {
                            setError(
                                "Google returned an empty credential. Try again.",
                            );
                            return;
                        }
                        // Delegate to whichever component instance is
                        // currently mounted — or no-op if we've since
                        // unmounted (e.g. a stale popup credential
                        // arrives after navigation).
                        credentialHandler?.(resp.credential);
                    },
                    auto_select: false,
                    // Use FedCM (the new browser-native federated-identity
                    // API) instead of the legacy popup + postMessage flow.
                    // This is what silences the residual COOP warning even
                    // when the page already sets same-origin-allow-popups,
                    // and is the path Google is migrating all hosts to.
                    // Older browsers without FedCM gracefully fall back to
                    // the popup flow on their own.
                    use_fedcm_for_prompt: true,
                    use_fedcm_for_button: true,
                });
                gsiInitializedClientId = clientId;
            }

            renderButton(gsi, host);

            // Watch for viewport / container size changes so a rotation
            // from portrait→landscape (or any layout shift that grows the
            // available room) re-renders the button at the new width.
            // The clamp + dedupe inside renderButton make this cheap.
            if (typeof ResizeObserver !== "undefined") {
                resizeObserver = new ResizeObserver(() => {
                    if (cancelled) return;
                    renderButton(gsi, host);
                });
                resizeObserver.observe(host);
            }
        })();

        return () => {
            cancelled = true;
            resizeObserver?.disconnect();
            // Drop the closure so a credential that arrives after we've
            // unmounted (e.g. user closed the tab the popup landed in)
            // doesn't try to call setState on a dead component.
            credentialHandler = null;
        };
    }, [authConfig?.google_oauth_client_id, loginWithGoogleCredential]);

    if (!authConfig?.google_oauth_client_id) {
        return (
            <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 2 }}
            >
                Google sign-in isn't configured on this deployment yet.
            </Typography>
        );
    }

    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            <Box
                ref={containerRef}
                data-testid="gsi-button"
                sx={{ display: "flex", justifyContent: "center", minHeight: 44 }}
            />
            {pending && (
                <Typography variant="body2" color="text.secondary">
                    Signing you in...
                </Typography>
            )}
            {error && (
                <Typography variant="body2" color="error">
                    {error}
                </Typography>
            )}
        </Box>
    );
}

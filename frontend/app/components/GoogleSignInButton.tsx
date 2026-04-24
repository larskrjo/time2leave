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

export function GoogleSignInButton() {
    const { authConfig, loginWithGoogleCredential } = useSession();
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);

    useEffect(() => {
        const clientId = authConfig?.google_oauth_client_id;
        if (!clientId || !containerRef.current) return;

        let cancelled = false;

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

            gsi.initialize({
                client_id: clientId,
                callback: (resp) => {
                    if (!resp.credential) {
                        setError(
                            "Google returned an empty credential. Try again.",
                        );
                        return;
                    }
                    setPending(true);
                    setError(null);
                    void loginWithGoogleCredential(resp.credential)
                        .catch((err) => {
                            setError(
                                err?.detail ??
                                    err?.message ??
                                    "Sign-in failed. Your email may not be on the allowlist.",
                            );
                        })
                        .finally(() => setPending(false));
                },
                auto_select: false,
            });

            host.innerHTML = "";
            gsi.renderButton(host, {
                type: "standard",
                theme: "filled_blue",
                size: "large",
                text: "continue_with",
                shape: "pill",
                logo_alignment: "left",
            });
        })();

        return () => {
            cancelled = true;
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

/**
 * Native Google Sign-In button.
 *
 * Wraps `@react-native-google-signin/google-signin` so the user gets
 * Apple's "Continue with Google" sheet on iOS and the Google account
 * picker on Android. The returned `idToken` is posted to
 * `POST /api/v1/auth/google` (with `X-Client: mobile` so the backend
 * echoes a session JWT we persist in `expo-secure-store`).
 *
 * Configuration:
 *   - `EXPO_PUBLIC_GOOGLE_OAUTH_WEB_CLIENT_ID` is required so the iOS
 *     ID token contains the `aud` claim the backend expects (Apple
 *     requires the *web* client ID for `signIn()` even on iOS — the
 *     iOS client ID is configured natively via `GIDClientID` in the
 *     Info.plist, set from `app.json`).
 *   - On Android, the package name + SHA-1 of the keystore must
 *     match the Android OAuth client in GCP — `eas build` handles
 *     the prod keystore automatically.
 *
 * Errors are surfaced via the local `error` state so users see what
 * went wrong (cancellation is silent — that's a normal flow, not a
 * bug to flag).
 */
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Button, HelperText } from "react-native-paper";
import {
    GoogleSignin,
    isErrorWithCode,
    statusCodes,
} from "@react-native-google-signin/google-signin";

import { useAuth } from "~/auth/AuthProvider";

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_OAUTH_WEB_CLIENT_ID;
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_OAUTH_IOS_CLIENT_ID;

let configured = false;

function ensureConfigured(): void {
    if (configured) return;
    if (!WEB_CLIENT_ID) return;
    GoogleSignin.configure({
        // The web client ID is what gets baked into the `aud` claim of
        // the ID token Google hands back to us — backend's
        // `verify_google_id_token` matches it against the
        // comma-separated `GOOGLE_OAUTH_CLIENT_ID` list.
        webClientId: WEB_CLIENT_ID,
        iosClientId: IOS_CLIENT_ID,
        // We only need the basic profile — no Drive, no Gmail.
        scopes: ["profile", "email"],
        offlineAccess: false,
    });
    configured = true;
}

export function GoogleSignInButton() {
    const { signInWithGoogle } = useAuth();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        ensureConfigured();
    }, []);

    if (!WEB_CLIENT_ID) {
        return (
            <HelperText type="info" visible padding="none">
                Set EXPO_PUBLIC_GOOGLE_OAUTH_WEB_CLIENT_ID in apps/mobile/.env
                to enable Google sign-in on this build.
            </HelperText>
        );
    }

    return (
        <View style={{ gap: 8 }}>
            <Button
                mode="contained"
                icon="google"
                loading={busy}
                disabled={busy}
                onPress={async () => {
                    setError(null);
                    setBusy(true);
                    try {
                        await GoogleSignin.hasPlayServices({
                            showPlayServicesUpdateDialog: true,
                        });
                        const result = await GoogleSignin.signIn();
                        // The shape changed in v13 — `data` carries the user
                        // payload + idToken on success; older versions returned
                        // it at the top level. Handle both for safety.
                        const idToken =
                            // v13+ shape
                            (result as { data?: { idToken?: string | null } }).data
                                ?.idToken ??
                            // v12 and earlier
                            (result as { idToken?: string | null }).idToken ??
                            null;
                        if (!idToken) {
                            throw new Error(
                                "Google did not return an ID token — check that the OAuth client is configured for this platform.",
                            );
                        }
                        await signInWithGoogle(idToken);
                    } catch (err: unknown) {
                        if (isErrorWithCode(err)) {
                            switch (err.code) {
                                case statusCodes.SIGN_IN_CANCELLED:
                                    // User intentionally backed out — no error
                                    // to show.
                                    break;
                                case statusCodes.IN_PROGRESS:
                                    setError("A sign-in is already in progress.");
                                    break;
                                case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
                                    setError(
                                        "Google Play Services isn't available or up to date.",
                                    );
                                    break;
                                default:
                                    setError(`Sign-in failed (${err.code}).`);
                            }
                        } else {
                            setError(
                                err instanceof Error
                                    ? err.message
                                    : "Sign-in failed.",
                            );
                        }
                    } finally {
                        setBusy(false);
                    }
                }}
            >
                Continue with Google
            </Button>
            {error ? (
                <HelperText type="error" visible padding="none">
                    {error}
                </HelperText>
            ) : null}
        </View>
    );
}

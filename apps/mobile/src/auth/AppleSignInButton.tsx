/**
 * Native Sign in with Apple button.
 *
 * Wraps `expo-apple-authentication`, which is Apple's first-party
 * `AuthenticationServices.framework` exposed to React Native. The
 * button itself (`AppleAuthenticationButton`) is a real
 * `ASAuthorizationAppleIDButton` rendered by UIKit — Apple's HIG
 * requires that exact button (you can't legally substitute a
 * custom-styled "Continue with Apple" button on iOS), and on
 * iOS 26+ it picks up the system Liquid Glass treatment automatically
 * because AuthenticationServices participates in the new chrome.
 *
 * Successful sign-in posts the `identityToken` (Apple-signed JWT)
 * plus the optional first-run display name to
 * `POST /api/v1/auth/apple`. The backend verifies the JWT against
 * Apple's published JWKs (no client secret needed) and issues a
 * session token, identical to the Google path.
 *
 * iOS-only: this component returns `null` on Android. Android users
 * sign in with Google.
 */
import { useState } from "react";
import { Platform, View, type StyleProp, type ViewStyle } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { useTheme } from "react-native-paper";

import { isApiError } from "@time2leave/shared";

import { useAuth } from "~/auth/AuthProvider";

type Props = {
    /** Outer container style — typically `{ borderRadius, shadow… }`. */
    style?: StyleProp<ViewStyle>;
    /**
     * Pixel height of the native button. Apple's HIG mandates a
     * minimum of 32pt; we match the 52pt CTA pill height used for
     * the Google button so the two read as a balanced pair on the
     * splash.
     */
    height?: number;
    /**
     * Fired the moment the user taps the button (before the Apple
     * sheet is presented). The splash uses this to clear any
     * lingering allowlist-rejection banner so a retry shows fresh
     * feedback instead of a stale message from the previous attempt.
     */
    onAttemptStart?: () => void;
    /**
     * Fired only when the backend returns 403 from `/auth/apple` —
     * i.e. Apple authenticated the user but the email isn't on the
     * invite allowlist. The splash converts this into a visible
     * banner; every other failure (cancel, network, malformed token,
     * provider error) is dismissed silently to match native UX.
     */
    onAllowlistRejected?: () => void;
};

export function AppleSignInButton({
    style,
    height = 52,
    onAttemptStart,
    onAllowlistRejected,
}: Props) {
    const theme = useTheme();
    const { signInWithApple } = useAuth();
    const [busy, setBusy] = useState(false);

    if (Platform.OS !== "ios") return null;

    const handlePress = async () => {
        if (busy) return;
        onAttemptStart?.();
        setBusy(true);
        try {
            const credential = await AppleAuthentication.signInAsync({
                // FULL_NAME and EMAIL are only delivered on the
                // *first* authorization for this app + Apple ID
                // pair. Subsequent sign-ins return `null` for
                // both — that's by design (Apple's privacy
                // pitch). The backend handles both cases via
                // `apple_sub`-based re-identification.
                requestedScopes: [
                    AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
                    AppleAuthentication.AppleAuthenticationScope.EMAIL,
                ],
            });

            if (!credential.identityToken) {
                // Same UX rule as the Google button: silent on every
                // failure, including "Apple didn't return a token"
                // (which would only happen if the entitlement / App
                // ID config is wrong). Logged for our diagnostics.
                console.warn(
                    "AppleSignInButton: no identity token returned — check 'Sign in with Apple' is enabled on the App ID at developer.apple.com.",
                );
                return;
            }

            // Apple gives us the user's name as a structured object
            // *only* on first sign-in. Flatten to a single string the
            // backend can store as the display name. Trim and
            // collapse whitespace so an absent middle name doesn't
            // produce "Lars  Johansen".
            const fullName = credential.fullName
                ? [
                      credential.fullName.givenName,
                      credential.fullName.middleName,
                      credential.fullName.familyName,
                  ]
                      .filter(Boolean)
                      .join(" ")
                      .trim()
                : null;

            await signInWithApple(
                credential.identityToken,
                fullName && fullName.length > 0 ? fullName : null,
            );
        } catch (err: unknown) {
            // The one error worth surfacing: backend 403 from
            // `/auth/apple`, which only happens when the user
            // authenticated successfully with Apple but isn't on
            // the invite allowlist. Anything else (cancellations,
            // network blips, malformed tokens, provider errors)
            // dismisses silently — same UX rule as native iOS
            // sign-in flows. The user retries by tapping the
            // button. Logged for dev visibility either way.
            if (isApiError(err) && err.status === 403) {
                onAllowlistRejected?.();
            }
            console.warn("AppleSignInButton: sign-in failed", err);
        } finally {
            setBusy(false);
        }
    };

    return (
        <View
            style={[
                {
                    borderRadius: 28,
                    overflow: "hidden",
                    opacity: busy ? 0.6 : 1,
                    shadowColor: "#000",
                    shadowOpacity: theme.dark ? 0.4 : 0.12,
                    shadowRadius: 12,
                    shadowOffset: { width: 0, height: 4 },
                    elevation: 4,
                },
                style,
            ]}
        >
            <AppleAuthentication.AppleAuthenticationButton
                buttonType={
                    AppleAuthentication.AppleAuthenticationButtonType
                        .CONTINUE
                }
                buttonStyle={
                    theme.dark
                        ? AppleAuthentication
                              .AppleAuthenticationButtonStyle.WHITE
                        : AppleAuthentication
                              .AppleAuthenticationButtonStyle.BLACK
                }
                cornerRadius={28}
                style={{ width: "100%", height }}
                onPress={() => {
                    void handlePress();
                }}
            />
        </View>
    );
}

/**
 * Splash + sign-in screen.
 *
 * Mirrors the web splash (`apps/web/app/routes/splash.tsx`) at a phone
 * scale: hero copy, a "What you'll see" preview chip, and the sign-in
 * CTA. Authenticated users are redirected to `/trips` immediately.
 *
 * Sign-in flows:
 *   - Production: Google sign-in via `@react-native-google-signin`,
 *     wired up in `~/auth/googleSignIn.ts` and exposed here through
 *     `<GoogleSignInButton>`.
 *   - Local dev (`EXPO_PUBLIC_ENABLE_DEV_LOGIN=true`): a small
 *     "Continue as dev user" button posts to /auth/dev-login so we
 *     don't need a real GCP project to iterate on the app.
 */
import { useEffect } from "react";
import { ScrollView, View } from "react-native";
import { Redirect } from "expo-router";
import {
    Button,
    Card,
    HelperText,
    Text,
    useTheme,
} from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "~/auth/AuthProvider";
import { GoogleSignInButton } from "~/auth/GoogleSignInButton";
import { Loading } from "~/components/Loading";
import { Wordmark } from "~/components/Wordmark";
import { BRAND_GRADIENT } from "~/theme";

const DEV_LOGIN_ENABLED =
    (process.env.EXPO_PUBLIC_ENABLE_DEV_LOGIN ?? "").toLowerCase() === "true";
const DEV_LOGIN_EMAIL =
    process.env.EXPO_PUBLIC_DEV_LOGIN_EMAIL ?? "dev@example.com";

export default function Splash() {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const { status, signInDev } = useAuth();

    if (status === "loading") return <Loading label="Restoring session..." />;
    if (status === "authenticated") return <Redirect href="/trips" />;

    return (
        <ScrollView
            contentContainerStyle={{
                paddingTop: insets.top + 12,
                paddingBottom: insets.bottom + 32,
                paddingHorizontal: 20,
                gap: 24,
            }}
        >
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Wordmark />
            </View>

            <View style={{ gap: 12, marginTop: 16 }}>
                <Text
                    variant="labelMedium"
                    style={{ color: theme.colors.primary, letterSpacing: 1.2 }}
                >
                    KNOW WHEN TO LEAVE
                </Text>
                <Text variant="displaySmall" style={{ fontWeight: "800" }}>
                    Stop guessing{"\n"}when to leave.
                </Text>
                <Text
                    variant="bodyLarge"
                    style={{ color: theme.colors.onSurfaceVariant }}
                >
                    Save a trip between any two addresses. We build a heatmap of
                    real drive times in 15-minute intervals across the whole week —
                    both directions, weekends included.
                </Text>
            </View>

            <Card mode="elevated" style={{ borderRadius: 16 }}>
                <Card.Content style={{ gap: 12, paddingVertical: 16 }}>
                    <Text
                        variant="labelMedium"
                        style={{ color: theme.colors.primary, letterSpacing: 1.2 }}
                    >
                        GET STARTED
                    </Text>
                    <Text variant="titleMedium" style={{ fontWeight: "700" }}>
                        Sign in to save your first trip
                    </Text>

                    <GoogleSignInButton />

                    {DEV_LOGIN_ENABLED ? (
                        <Button
                            mode="outlined"
                            onPress={() => {
                                void signInDev(DEV_LOGIN_EMAIL, "Dev User");
                            }}
                            style={{ marginTop: 4 }}
                        >
                            Continue as {DEV_LOGIN_EMAIL}
                        </Button>
                    ) : null}

                    <HelperText type="info" visible padding="none">
                        Invite-only today — your email needs to be on the allowlist.
                        Ask the owner to add you.
                    </HelperText>
                </Card.Content>
            </Card>

            <PreviewBanner />
        </ScrollView>
    );
}

function PreviewBanner() {
    const theme = useTheme();
    useEffect(() => {
        // Marker so future tweaks remember the gradient is intentional.
        return () => undefined;
    }, []);
    return (
        <View
            style={{
                borderRadius: 16,
                overflow: "hidden",
                borderWidth: 1,
                borderColor: theme.colors.outline,
            }}
        >
            <LinearGradient
                colors={[`${BRAND_GRADIENT[0]}10`, `${BRAND_GRADIENT[1]}10`]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ padding: 20, gap: 8 }}
            >
                <Text
                    variant="labelMedium"
                    style={{ color: theme.colors.primary, letterSpacing: 1.2 }}
                >
                    HOW IT WORKS
                </Text>
                <Text variant="titleMedium" style={{ fontWeight: "700" }}>
                    Save a trip → Sample drive times → Read the heatmap
                </Text>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                    A real heatmap: 7 days × 15-minute slots, both directions.
                    Green = fast, red = sit in traffic.
                </Text>
            </LinearGradient>
        </View>
    );
}

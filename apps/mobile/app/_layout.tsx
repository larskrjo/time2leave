/**
 * Root layout for the Expo Router stack.
 *
 * Two phases:
 *   1. **Env gate** — `loadEnvOnce()` is checked first thing. If any
 *      required env var is missing, we render `<SetupRequired>` and
 *      stop. Nothing downstream (api/client, AuthProvider, etc.) is
 *      mounted, so they can call `requireEnv()` freely without
 *      defensive checks.
 *   2. **App** — once env is valid, mount every cross-cutting provider
 *      exactly once:
 *        - SafeAreaProvider   — insets for notch / home indicator.
 *        - PaperProvider      — Material Design 3 components + theme.
 *        - QueryClientProvider — React Query for trips + heatmap data.
 *        - AuthProvider       — bearer-token sign-in state + secure
 *          storage.
 *      Then renders the Expo Router stack.
 */
import { useEffect, useMemo } from "react";
import { useColorScheme } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { PaperProvider } from "react-native-paper";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as SplashScreen from "expo-splash-screen";

import { AuthProvider } from "~/auth/AuthProvider";
import { SetupRequired } from "~/components/SetupRequired";
import { loadEnvOnce } from "~/config/env";
import { darkTheme, lightTheme } from "~/theme";

SplashScreen.preventAutoHideAsync().catch(() => {
    // Best-effort: in some hot-reload edge cases the splash is already
    // gone, which throws. Swallow because the app is fine either way.
});

export default function RootLayout() {
    const colorScheme = useColorScheme();
    const theme = colorScheme === "dark" ? darkTheme : lightTheme;
    const envResult = loadEnvOnce();

    const queryClient = useMemo(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        // Trip data churns once a week — re-fetching on
                        // every focus is overkill. The detail screen
                        // opts back in for backfill polling explicitly.
                        refetchOnWindowFocus: false,
                        retry: 1,
                        staleTime: 30 * 1000,
                    },
                },
            }),
        [],
    );

    useEffect(() => {
        // Hide the native splash screen as soon as React has mounted —
        // for the env-error path we want the SetupRequired screen
        // visible immediately; for the happy path the AuthProvider
        // shows its own Loading until /me resolves.
        const id = setTimeout(() => {
            SplashScreen.hideAsync().catch(() => {});
        }, 0);
        return () => clearTimeout(id);
    }, []);

    if (!envResult.ok) {
        // Render Paper + SafeArea so SetupRequired can use theme tokens
        // and proper safe-area insets, but skip Auth / QueryClient
        // (both of which depend on the API client, which depends on
        // env being valid).
        return (
            <GestureHandlerRootView style={{ flex: 1 }}>
                <SafeAreaProvider>
                    <PaperProvider theme={theme}>
                        <StatusBar
                            style={colorScheme === "dark" ? "light" : "dark"}
                        />
                        <SetupRequired
                            appEnv={envResult.appEnv}
                            missing={envResult.missing}
                        />
                    </PaperProvider>
                </SafeAreaProvider>
            </GestureHandlerRootView>
        );
    }

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaProvider>
                <PaperProvider theme={theme}>
                    <QueryClientProvider client={queryClient}>
                        <AuthProvider>
                            <StatusBar
                                style={colorScheme === "dark" ? "light" : "dark"}
                            />
                            <Stack
                                screenOptions={{
                                    headerShown: false,
                                    contentStyle: {
                                        backgroundColor: theme.colors.background,
                                    },
                                }}
                            />
                        </AuthProvider>
                    </QueryClientProvider>
                </PaperProvider>
            </SafeAreaProvider>
        </GestureHandlerRootView>
    );
}

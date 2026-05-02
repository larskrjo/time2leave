/**
 * Root layout for the Expo Router stack.
 *
 * Sets up every cross-cutting provider exactly once:
 *   - SafeAreaProvider  — insets for notch / home indicator.
 *   - PaperProvider      — Material Design 3 components + theme.
 *   - QueryClientProvider — React Query for trips + heatmap data.
 *   - AuthProvider       — bearer-token sign-in state + secure storage.
 *
 * Then renders the Expo Router stack. Individual route groups (auth,
 * tabs) declare their own `_layout.tsx` to add per-section navigation.
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
import { darkTheme, lightTheme } from "~/theme";

SplashScreen.preventAutoHideAsync().catch(() => {
    // Best-effort: in some hot-reload edge cases the splash is already
    // gone, which throws. Swallow because the app is fine either way.
});

export default function RootLayout() {
    const colorScheme = useColorScheme();
    const theme = colorScheme === "dark" ? darkTheme : lightTheme;

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
        // the AuthProvider will swap to a Loading screen until /me
        // resolves, but we don't want the OS splash to linger.
        const id = setTimeout(() => {
            SplashScreen.hideAsync().catch(() => {});
        }, 0);
        return () => clearTimeout(id);
    }, []);

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

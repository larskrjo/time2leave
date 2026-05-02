/**
 * "Your saved trips" — phone equivalent of `apps/web/app/routes/trips.tsx`.
 *
 * Lists every active trip the signed-in user owns, with the same
 * mutation-cap and slot-cap chips as the web UI. Tapping a card
 * pushes onto the trip detail screen; the "+ New trip" button is
 * disabled when the user is at their cap (with the cap chip
 * explaining why).
 */
import { useCallback } from "react";
import { Alert, RefreshControl, ScrollView, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import {
    ActivityIndicator,
    Button,
    Card,
    Chip,
    Divider,
    IconButton,
    Text,
    useTheme,
} from "react-native-paper";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
    deleteTrip as sharedDeleteTrip,
    listTrips as sharedListTrips,
    getTripQuota as sharedGetTripQuota,
    type TripSummary,
} from "@time2leave/shared";

import { API, apiFetch } from "~/api/client";
import { useAuth } from "~/auth/AuthProvider";
import { Wordmark } from "~/components/Wordmark";

export default function TripList() {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();
    const { user, signOut } = useAuth();

    const tripsQuery = useQuery({
        queryKey: ["trips"],
        queryFn: () => sharedListTrips(apiFetch, API),
    });
    const quotaQuery = useQuery({
        queryKey: ["trips", "quota"],
        queryFn: () => sharedGetTripQuota(apiFetch, API),
    });

    const handleDelete = useCallback(
        (trip: TripSummary) => {
            Alert.alert(
                "Delete trip?",
                `Remove "${trip.name ?? trip.origin_address}" from your saved trips?`,
                [
                    { text: "Cancel", style: "cancel" },
                    {
                        text: "Delete",
                        style: "destructive",
                        onPress: async () => {
                            try {
                                await sharedDeleteTrip(apiFetch, API, trip.id);
                                await queryClient.invalidateQueries({
                                    queryKey: ["trips"],
                                });
                                await queryClient.invalidateQueries({
                                    queryKey: ["trips", "quota"],
                                });
                            } catch (err) {
                                Alert.alert(
                                    "Delete failed",
                                    err instanceof Error ? err.message : "Try again.",
                                );
                            }
                        },
                    },
                ],
            );
        },
        [queryClient],
    );

    const quota = quotaQuery.data;
    const newTripDisabled =
        quota != null &&
        (quota.used >= quota.limit ||
            quota.mutations_used >= quota.mutations_limit);

    return (
        <>
            <Stack.Screen
                options={{
                    headerTitle: () => <Wordmark size={18} />,
                    headerRight: () => (
                        <IconButton icon="logout" onPress={() => void signOut()} />
                    ),
                }}
            />
            <ScrollView
                contentContainerStyle={{
                    padding: 20,
                    paddingTop: 8,
                    paddingBottom: insets.bottom + 24,
                    gap: 16,
                }}
                refreshControl={
                    <RefreshControl
                        refreshing={tripsQuery.isFetching && !tripsQuery.isLoading}
                        onRefresh={() => {
                            void tripsQuery.refetch();
                            void quotaQuery.refetch();
                        }}
                    />
                }
            >
                <View style={{ gap: 6 }}>
                    <Text
                        variant="labelMedium"
                        style={{ color: theme.colors.primary, letterSpacing: 1.2 }}
                    >
                        HI, {user?.name?.split(" ")[0]?.toUpperCase() ?? "THERE"}
                    </Text>
                    <Text variant="headlineMedium" style={{ fontWeight: "800" }}>
                        Your saved trips
                    </Text>
                    <Text
                        variant="bodyMedium"
                        style={{ color: theme.colors.onSurfaceVariant }}
                    >
                        We sample both directions, every day Mon–Sun, from 6am to
                        9pm — refreshed every Monday at 1am PT.
                    </Text>
                </View>

                {quota ? (
                    <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                        <Chip
                            mode={
                                quota.mutations_used >= quota.mutations_limit
                                    ? "flat"
                                    : "outlined"
                            }
                            selected={quota.mutations_used >= quota.mutations_limit}
                            icon="repeat"
                        >
                            {quota.mutations_used} / {quota.mutations_limit} changes / wk
                        </Chip>
                        <Chip mode="outlined" icon="bookmark-outline">
                            {quota.used} / {quota.limit} slots
                        </Chip>
                    </View>
                ) : null}

                <Button
                    mode="contained"
                    icon="plus"
                    disabled={newTripDisabled}
                    onPress={() => router.push("/trips/new")}
                >
                    New trip
                </Button>

                <Divider />

                {tripsQuery.isLoading ? (
                    <ActivityIndicator
                        size="large"
                        color={theme.colors.primary}
                        style={{ marginTop: 32 }}
                    />
                ) : tripsQuery.isError ? (
                    <Text style={{ color: theme.colors.error }}>
                        Couldn&apos;t load trips:{" "}
                        {tripsQuery.error instanceof Error
                            ? tripsQuery.error.message
                            : "unknown error"}
                    </Text>
                ) : tripsQuery.data && tripsQuery.data.length > 0 ? (
                    tripsQuery.data.map((trip) => (
                        <Card
                            key={trip.id}
                            mode="elevated"
                            onPress={() =>
                                router.push({
                                    pathname: "/trips/[tripId]",
                                    params: { tripId: trip.id },
                                })
                            }
                        >
                            <Card.Title
                                title={trip.name ?? "Untitled trip"}
                                titleVariant="titleMedium"
                                right={(props) => (
                                    <IconButton
                                        {...props}
                                        icon="trash-can-outline"
                                        onPress={() => handleDelete(trip)}
                                    />
                                )}
                            />
                            <Card.Content style={{ gap: 6 }}>
                                <Row label="From" value={trip.origin_address} />
                                <Row label="To" value={trip.destination_address} />
                            </Card.Content>
                        </Card>
                    ))
                ) : (
                    <EmptyState />
                )}
            </ScrollView>
        </>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    const theme = useTheme();
    return (
        <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
            <Text
                variant="labelSmall"
                style={{
                    color: theme.colors.primary,
                    minWidth: 36,
                    paddingTop: 2,
                }}
            >
                {label}
            </Text>
            <Text variant="bodyMedium" style={{ flex: 1 }}>
                {value}
            </Text>
        </View>
    );
}

function EmptyState() {
    const theme = useTheme();
    return (
        <View
            style={{
                padding: 24,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: theme.colors.outline,
                alignItems: "center",
                gap: 8,
            }}
        >
            <Text variant="titleMedium" style={{ fontWeight: "700" }}>
                No trips yet
            </Text>
            <Text
                variant="bodyMedium"
                style={{
                    color: theme.colors.onSurfaceVariant,
                    textAlign: "center",
                }}
            >
                Save an origin → destination pair and we&apos;ll start sampling
                drive times for the whole week.
            </Text>
        </View>
    );
}

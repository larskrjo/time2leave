/**
 * Trip detail with two-direction heatmap and live backfill polling.
 *
 * Mirrors `apps/web/app/routes/trips.$tripId.tsx`:
 *   - Loads the trip + heatmap on mount.
 *   - If backfill < 100%, polls /backfill-status every 4s and
 *     re-fetches the heatmap until ready.
 *   - Direction tabs (outbound / return).
 *   - Week toggle (current / next) when next_week_available flips on.
 *   - Best-slot-per-day chip strip + the full heatmap grid.
 *   - Delete with confirmation.
 */
import { useEffect, useState } from "react";
import {
    Alert,
    RefreshControl,
    ScrollView,
    View,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
    Banner,
    Button,
    IconButton,
    ProgressBar,
    SegmentedButtons,
    Text,
    useTheme,
} from "react-native-paper";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
    deleteTrip as sharedDeleteTrip,
    getTrip as sharedGetTrip,
    getTripBackfillStatus as sharedGetTripBackfillStatus,
    getTripHeatmap as sharedGetTripHeatmap,
    type Direction,
    type Week,
} from "@time2leave/shared";

import { API, apiFetch } from "~/api/client";
import { Loading } from "~/components/Loading";
import { TripHeatmap } from "~/components/TripHeatmap";

const POLL_INTERVAL_MS = 4_000;

export default function TripDetailRoute() {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();
    const { tripId } = useLocalSearchParams<{ tripId: string }>();

    const [direction, setDirection] = useState<Direction>("outbound");
    const [week, setWeek] = useState<Week>("current");

    const tripQuery = useQuery({
        queryKey: ["trip", tripId],
        queryFn: () => sharedGetTrip(apiFetch, API, tripId!),
        enabled: !!tripId,
    });

    const heatmapQuery = useQuery({
        queryKey: ["trip", tripId, "heatmap", week],
        queryFn: () => sharedGetTripHeatmap(apiFetch, API, tripId!, week),
        enabled: !!tripId,
    });

    const backfillQuery = useQuery({
        queryKey: ["trip", tripId, "backfill", week],
        queryFn: () =>
            sharedGetTripBackfillStatus(apiFetch, API, tripId!, week),
        enabled: !!tripId && week === "current",
        // Stop polling as soon as we hit 100% — saves battery + API calls.
        refetchInterval: (query) => {
            const data = query.state.data;
            if (!data) return POLL_INTERVAL_MS;
            return data.percent_complete >= 100 ? false : POLL_INTERVAL_MS;
        },
    });

    // When backfill % moves, force the heatmap to re-fetch so the new
    // cells appear without the user pulling-to-refresh.
    const backfillPct = backfillQuery.data?.percent_complete ?? 100;
    useEffect(() => {
        if (backfillPct < 100) {
            void queryClient.invalidateQueries({
                queryKey: ["trip", tripId, "heatmap", week],
            });
        }
    }, [backfillPct, queryClient, tripId, week]);

    const deleteMutation = useMutation({
        mutationFn: () => sharedDeleteTrip(apiFetch, API, tripId!),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["trips"] });
            router.replace("/trips");
        },
        onError: (err) => {
            Alert.alert(
                "Delete failed",
                err instanceof Error ? err.message : "Try again.",
            );
        },
    });

    if (!tripId) return null;
    if (tripQuery.isLoading) return <Loading label="Loading trip..." />;
    if (tripQuery.isError) {
        return (
            <View style={{ padding: 24, gap: 12 }}>
                <Text variant="titleMedium">Trip not found</Text>
                <Text style={{ color: theme.colors.onSurfaceVariant }}>
                    {tripQuery.error instanceof Error
                        ? tripQuery.error.message
                        : "This trip may have been removed."}
                </Text>
                <Button mode="outlined" onPress={() => router.replace("/trips")}>
                    Back to trips
                </Button>
            </View>
        );
    }

    const trip = tripQuery.data!;
    const showWeekToggle = heatmapQuery.data?.next_week_available === true;

    return (
        <>
            <Stack.Screen
                options={{
                    title: trip.name ?? "Trip",
                    headerRight: () => (
                        <IconButton
                            icon="trash-can-outline"
                            iconColor={theme.colors.error}
                            onPress={() =>
                                Alert.alert(
                                    "Delete trip?",
                                    `Remove "${trip.name ?? trip.origin_address}"?`,
                                    [
                                        { text: "Cancel", style: "cancel" },
                                        {
                                            text: "Delete",
                                            style: "destructive",
                                            onPress: () =>
                                                deleteMutation.mutate(),
                                        },
                                    ],
                                )
                            }
                        />
                    ),
                }}
            />
            <ScrollView
                contentContainerStyle={{
                    padding: 16,
                    paddingBottom: insets.bottom + 24,
                    gap: 16,
                }}
                refreshControl={
                    <RefreshControl
                        refreshing={
                            heatmapQuery.isFetching && !heatmapQuery.isLoading
                        }
                        onRefresh={() => {
                            void heatmapQuery.refetch();
                            void tripQuery.refetch();
                            void backfillQuery.refetch();
                        }}
                    />
                }
            >
                {/* Header: addresses + week label */}
                <View style={{ gap: 6 }}>
                    {heatmapQuery.data?.week_start_date ? (
                        <Text
                            variant="labelMedium"
                            style={{
                                color: theme.colors.primary,
                                letterSpacing: 1.2,
                            }}
                        >
                            WEEK OF{" "}
                            {formatWeekStart(heatmapQuery.data.week_start_date)}
                        </Text>
                    ) : null}
                    <Text variant="headlineSmall" style={{ fontWeight: "800" }}>
                        {trip.name ?? "Trip"}
                    </Text>
                    <Row label="From" value={trip.origin_address} />
                    <Row label="To" value={trip.destination_address} />
                </View>

                {/* Backfill progress banner — only while < 100% on the
                    current week. Deliberately quiet (no spinner) because
                    we already animate cells in as they arrive. */}
                {week === "current" && backfillPct < 100 ? (
                    <View style={{ gap: 8 }}>
                        <Banner visible icon="progress-clock">
                            {`Building your heatmap — ${Math.round(backfillPct)}% complete. Cells will fill in as samples arrive.`}
                        </Banner>
                        <ProgressBar
                            progress={Math.max(0, Math.min(1, backfillPct / 100))}
                        />
                    </View>
                ) : null}

                {showWeekToggle ? (
                    <SegmentedButtons
                        value={week}
                        onValueChange={(v) => setWeek(v as Week)}
                        buttons={[
                            { value: "current", label: "This week" },
                            { value: "next", label: "Next week" },
                        ]}
                    />
                ) : null}

                <SegmentedButtons
                    value={direction}
                    onValueChange={(v) => setDirection(v as Direction)}
                    buttons={[
                        {
                            value: "outbound",
                            label: "Outbound",
                            icon: "arrow-right",
                        },
                        {
                            value: "return",
                            label: "Return",
                            icon: "arrow-left",
                        },
                    ]}
                />

                {heatmapQuery.data ? (
                    <TripHeatmap
                        heatmap={heatmapQuery.data}
                        direction={direction}
                        showNow={week === "current"}
                    />
                ) : (
                    <Loading />
                )}

                <Text
                    variant="bodySmall"
                    style={{
                        color: theme.colors.onSurfaceVariant,
                        textAlign: "center",
                    }}
                >
                    Viewing {trip.name ?? "trip"} ·{" "}
                    {week === "current" ? "this" : "next"} week
                </Text>
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

function formatWeekStart(iso: string): string {
    // Backend hands us "YYYY-MM-DD"; format it as "MMM D, YYYY" without
    // any heavy date library.
    const [y, m, d] = iso.split("-").map(Number);
    if (!y || !m || !d) return iso;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.toLocaleDateString(undefined, {
        timeZone: "UTC",
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

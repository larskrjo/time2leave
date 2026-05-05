/**
 * Trip detail with two-direction heatmap and live backfill polling.
 *
 * Mirrors `apps/web/app/routes/trips.$tripId.tsx`:
 *   - Loads the trip + heatmap on mount.
 *   - If backfill < 100%, polls /backfill-status every 4s and
 *     re-fetches the heatmap until ready.
 *   - Direction tabs (outbound / return) — iOS UISegmentedControl style.
 *   - Week toggle (current / next) when next_week_available flips on.
 *   - Best-time-per-day list rendered as an accordion (`TripHeatmap`).
 *   - Delete with confirmation.
 *
 * Visual model (iOS):
 *   - Native large-title nav bar (configured by `trips/_layout.tsx`)
 *     so the trip name lives in the toolbar and shrinks as the user
 *     scrolls. Header right is a destructive `trash` SF symbol.
 *   - From / To addresses live in an iOS inset-grouped list — the
 *     Settings.app aesthetic.
 *   - Section labels above the heatmap follow the iOS pattern: small
 *     uppercase header on the leading edge with a quiet status pill
 *     ("Week of Apr 27") on the trailing edge.
 */
import { useEffect, useState } from "react";
import {
    Alert,
    Pressable,
    RefreshControl,
    ScrollView,
    View,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
    Banner,
    Button,
    ProgressBar,
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

import { apiFetch, getApi } from "~/api/client";
import { Loading } from "~/components/Loading";
import { TripHeatmap } from "~/components/TripHeatmap";
import { ScrollEdgeFade } from "~/components/native/Glass";
import { GroupedList, GroupedRow } from "~/components/native/GroupedList";
import { IOSSegmentedControl } from "~/components/native/IOSSegmentedControl";
import { IOSStatusPill } from "~/components/native/StatusPill";
import { Symbol } from "~/components/native/Symbol";

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
        queryFn: () => sharedGetTrip(apiFetch, getApi(), tripId!),
        enabled: !!tripId,
    });

    const heatmapQuery = useQuery({
        queryKey: ["trip", tripId, "heatmap", week],
        queryFn: () => sharedGetTripHeatmap(apiFetch, getApi(), tripId!, week),
        enabled: !!tripId,
    });

    const backfillQuery = useQuery({
        queryKey: ["trip", tripId, "backfill", week],
        queryFn: () =>
            sharedGetTripBackfillStatus(apiFetch, getApi(), tripId!, week),
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
        mutationFn: () => sharedDeleteTrip(apiFetch, getApi(), tripId!),
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
    if (tripQuery.isLoading) return <Loading />;
    if (tripQuery.isError) {
        return (
            <View
                style={{
                    flex: 1,
                    backgroundColor: theme.colors.background,
                    padding: 24,
                    paddingTop: insets.top + 24,
                    gap: 12,
                }}
            >
                <Stack.Screen options={{ title: "Trip not found" }} />
                <Text
                    variant="titleMedium"
                    style={{ color: theme.colors.onBackground }}
                >
                    Trip not found
                </Text>
                <Text style={{ color: theme.colors.onSurfaceVariant }}>
                    {tripQuery.error instanceof Error
                        ? tripQuery.error.message
                        : "This trip may have been removed."}
                </Text>
                <Button
                    mode="outlined"
                    icon="arrow-left"
                    onPress={() => router.replace("/trips")}
                >
                    Back to trips
                </Button>
            </View>
        );
    }

    const trip = tripQuery.data!;
    const showWeekToggle = heatmapQuery.data?.next_week_available === true;
    const weekLabel = heatmapQuery.data?.week_start_date
        ? formatWeekStart(heatmapQuery.data.week_start_date)
        : null;
    const tripTitle = trip.name?.trim() || "Untitled trip";

    const confirmDelete = () => {
        Alert.alert(
            "Delete trip?",
            `Remove "${trip.name ?? trip.origin_address}"?`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: () => deleteMutation.mutate(),
                },
            ],
        );
    };

    return (
        <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
            {/* Static `headerBackTitle: "Trips"` comes from the layout
                so iOS knows the back-chevron label before the push
                transition starts. We inject the *dynamic* trip title
                (only known after the trip query resolves) and the
                destructive header-right action here. */}
            <Stack.Screen
                options={{
                    title: tripTitle,
                    headerRight: () => (
                        <Pressable
                            onPress={confirmDelete}
                            accessibilityRole="button"
                            accessibilityLabel="Delete trip"
                            hitSlop={12}
                            style={({ pressed }) => ({
                                opacity: pressed ? 0.5 : 1,
                                paddingHorizontal: 4,
                                paddingVertical: 4,
                            })}
                        >
                            <Symbol
                                name={{
                                    ios: "trash",
                                    android: "trash-can-outline",
                                }}
                                size={22}
                                color={theme.colors.error}
                            />
                        </Pressable>
                    ),
                }}
            />

            <ScrollView
                contentInsetAdjustmentBehavior="automatic"
                contentContainerStyle={{
                    paddingHorizontal: 20,
                    paddingTop: 4,
                    paddingBottom: insets.bottom + 32,
                    gap: 22,
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
                        tintColor={theme.colors.primary}
                    />
                }
            >
                {/* Route — iOS inset grouped list with two address rows. */}
                <Section header="Route">
                    <GroupedList>
                        <GroupedRow
                            icon={{
                                ios: "house.fill",
                                android: "home-outline",
                            }}
                            iconTint={theme.colors.primary}
                            title="From"
                            subtitle={trip.origin_address}
                        />
                        <GroupedRow
                            icon={{
                                ios: "mappin.circle.fill",
                                android: "map-marker",
                            }}
                            iconTint={theme.colors.secondary}
                            title="To"
                            subtitle={trip.destination_address}
                        />
                    </GroupedList>
                </Section>

                {/* Backfill progress — quiet banner; cells animate in
                    independently as samples arrive. */}
                {week === "current" && backfillPct < 100 ? (
                    <View style={{ gap: 8 }}>
                        <Banner visible icon="progress-clock">
                            {`Building your heatmap — ${Math.round(backfillPct)}% complete. Cells will fill in as samples arrive.`}
                        </Banner>
                        <ProgressBar
                            progress={Math.max(0, Math.min(1, backfillPct / 100))}
                            color={theme.colors.primary}
                        />
                    </View>
                ) : null}

                {/* Direction + week filters. The week toggle only
                    appears once the next-week samples are ready, to
                    avoid offering an empty selector on a brand-new
                    trip. */}
                <View style={{ gap: 10 }}>
                    <IOSSegmentedControl<Direction>
                        value={direction}
                        onChange={setDirection}
                        options={[
                            { value: "outbound", label: "Outbound" },
                            { value: "return", label: "Return" },
                        ]}
                    />
                    {showWeekToggle ? (
                        <IOSSegmentedControl<Week>
                            value={week}
                            onChange={setWeek}
                            options={[
                                { value: "current", label: "This week" },
                                { value: "next", label: "Next week" },
                            ]}
                        />
                    ) : null}
                </View>

                <Section
                    header="Best time per day"
                    accessory={
                        weekLabel ? (
                            <IOSStatusPill
                                icon={{
                                    ios: "calendar",
                                    android: "calendar",
                                }}
                                label={`Week of ${weekLabel}`}
                            />
                        ) : null
                    }
                    footer="Sampled every 15 min, 6am–9pm, Mon–Sun."
                >
                    {heatmapQuery.data ? (
                        <TripHeatmap
                            heatmap={heatmapQuery.data}
                            direction={direction}
                            showNow={week === "current"}
                        />
                    ) : (
                        <Loading />
                    )}
                </Section>
            </ScrollView>

            {/* Soft fade at the bottom edge so heatmap cells gracefully
                disappear into the background near the home indicator
                instead of cutting off at a hard line. */}
            <ScrollEdgeFade edge="bottom" height={insets.bottom + 48} />
        </View>
    );
}

/**
 * iOS-style section block with a header on the leading edge, an
 * optional accessory pill on the trailing edge, and an optional
 * footer note below the children. Modelled on `<GroupedSection>`
 * but adds the right-side accessory slot.
 */
function Section({
    header,
    accessory,
    footer,
    children,
}: {
    header: string;
    accessory?: React.ReactNode;
    footer?: string;
    children?: React.ReactNode;
}) {
    const theme = useTheme();
    return (
        <View style={{ gap: 8 }}>
            <View
                style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginLeft: 14,
                    marginRight: 4,
                }}
            >
                <Text
                    style={{
                        color: theme.colors.onSurfaceVariant,
                        textTransform: "uppercase",
                        fontSize: 12,
                        letterSpacing: 0.7,
                        fontWeight: "600",
                    }}
                >
                    {header}
                </Text>
                {accessory}
            </View>
            {children}
            {footer ? (
                <Text
                    style={{
                        color: theme.colors.onSurfaceVariant,
                        fontSize: 12,
                        lineHeight: 16,
                        marginLeft: 14,
                        marginRight: 14,
                        marginTop: 2,
                    }}
                >
                    {footer}
                </Text>
            ) : null}
        </View>
    );
}

function formatWeekStart(iso: string): string {
    // Backend hands us "YYYY-MM-DD"; format it as "MMM D" for the
    // status pill (year is implicit in "this week" and noisy in a
    // pill). Parse as local time to match the web app's
    // `new Date(iso + "T00:00:00")` so the week label doesn't
    // jump a day in non-UTC locales.
    const [y, m, d] = iso.split("-").map(Number);
    if (!y || !m || !d) return iso;
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
    });
}

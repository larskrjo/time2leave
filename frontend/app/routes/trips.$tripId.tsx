/**
 * Trip detail with two-direction heatmap, summary strip, and live
 * backfill progress polling.
 *
 * Behavior:
 *   - Loads the trip + heatmap on mount.
 *   - If backfill < 100%, polls `GET /trips/:id/backfill-status` every
 *     4s and re-fetches the heatmap until it's complete.
 *   - Switches between Outbound / Return via MUI tabs.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Link as RouterLink,
    useNavigate,
    useParams,
} from "react-router";
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    LinearProgress,
    Paper,
    Stack,
    Tab,
    Tabs,
    Typography,
} from "@mui/material";
import {
    ArrowBackRounded,
    ArrowRightAltRounded,
    DeleteOutlineRounded,
} from "@mui/icons-material";

import { AppShell } from "~/components/AppShell";
import { ProtectedRoute } from "~/components/ProtectedRoute";
import { TripHeatmap, TripHeatmapSummary } from "~/components/TripHeatmap";
import { ROUTES } from "~/constants/path";
import { isApiError } from "~/lib/api";
import {
    deleteTrip,
    getTrip,
    getTripBackfillStatus,
    getTripHeatmap,
    type BackfillStatus,
    type Direction,
    type HeatmapPayload,
    type TripDetail,
} from "~/lib/trips";

export function meta() {
    return [{ title: "Trip · Commute Heatmap" }];
}

const POLL_INTERVAL_MS = 4_000;

function TripDetailInner({ tripId }: { tripId: string }) {
    const navigate = useNavigate();
    const [trip, setTrip] = useState<TripDetail | null>(null);
    const [heatmap, setHeatmap] = useState<HeatmapPayload | null>(null);
    const [backfill, setBackfill] = useState<BackfillStatus | null>(null);
    const [direction, setDirection] = useState<Direction>("outbound");
    const [error, setError] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);
    const pollRef = useRef<number | null>(null);

    const loadAll = useCallback(async () => {
        try {
            const [tripDetail, h] = await Promise.all([
                getTrip(tripId),
                getTripHeatmap(tripId),
            ]);
            setTrip(tripDetail);
            setHeatmap(h);
            setBackfill(tripDetail.backfill);
        } catch (err) {
            setError(isApiError(err) ? err.detail : "Failed to load trip");
        }
    }, [tripId]);

    useEffect(() => {
        void loadAll();
    }, [loadAll]);

    const stopPolling = useCallback(() => {
        if (pollRef.current !== null) {
            window.clearInterval(pollRef.current);
            pollRef.current = null;
        }
    }, []);

    useEffect(() => {
        if (!backfill) return;
        if (backfill.percent_complete >= 100) {
            stopPolling();
            return;
        }
        if (pollRef.current !== null) return;

        pollRef.current = window.setInterval(async () => {
            try {
                const fresh = await getTripBackfillStatus(tripId);
                setBackfill(fresh);
                // Re-fetch the heatmap when meaningful progress lands so
                // cells visibly fill in instead of waiting for 100%.
                if (
                    fresh.ready > (backfill?.ready ?? 0) ||
                    fresh.percent_complete >= 100
                ) {
                    const h = await getTripHeatmap(tripId);
                    setHeatmap(h);
                }
                if (fresh.percent_complete >= 100) {
                    stopPolling();
                }
            } catch {
                // Soft-fail: leave whatever we have on screen and try again.
            }
        }, POLL_INTERVAL_MS);

        return stopPolling;
    }, [backfill, stopPolling, tripId]);

    const onDelete = async () => {
        if (!confirm("Delete this trip? This can't be undone.")) return;
        setDeleting(true);
        try {
            await deleteTrip(tripId);
            navigate(ROUTES.trips, { replace: true });
        } catch (err) {
            setError(isApiError(err) ? err.detail : "Failed to delete trip");
            setDeleting(false);
        }
    };

    const headerTitle = useMemo(() => {
        if (!trip) return "Trip";
        return trip.name ?? `Trip #${trip.id}`;
    }, [trip]);

    if (!trip || !heatmap) {
        return (
            <Stack alignItems="center" sx={{ py: 10 }} spacing={2}>
                <CircularProgress />
                {error && <Alert severity="error">{error}</Alert>}
            </Stack>
        );
    }

    const inProgress = backfill !== null && backfill.percent_complete < 100;

    return (
        <Stack spacing={3}>
            <Button
                component={RouterLink}
                to={ROUTES.trips}
                startIcon={<ArrowBackRounded />}
                sx={{ alignSelf: "flex-start" }}
            >
                Back to trips
            </Button>

            <Stack
                direction={{ xs: "column", md: "row" }}
                alignItems={{ md: "flex-start" }}
                justifyContent="space-between"
                spacing={2}
            >
                <Box>
                    <Typography variant="h4" fontWeight={700}>
                        {headerTitle}
                    </Typography>
                    <Stack
                        direction={{ xs: "column", sm: "row" }}
                        alignItems={{ sm: "center" }}
                        spacing={1}
                        sx={{ mt: 1 }}
                    >
                        <Typography variant="body2" color="text.secondary">
                            {trip.origin_address}
                        </Typography>
                        <ArrowRightAltRounded
                            fontSize="small"
                            sx={{ color: "text.disabled" }}
                        />
                        <Typography variant="body2" color="text.secondary">
                            {trip.destination_address}
                        </Typography>
                    </Stack>
                    <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ mt: 1, display: "block" }}
                    >
                        Week of {heatmap.week_start_date}
                    </Typography>
                </Box>
                <Button
                    variant="outlined"
                    color="error"
                    startIcon={<DeleteOutlineRounded />}
                    onClick={onDelete}
                    disabled={deleting}
                >
                    Delete trip
                </Button>
            </Stack>

            {error && (
                <Alert severity="error" onClose={() => setError(null)}>
                    {error}
                </Alert>
            )}

            {inProgress && backfill && (
                <Paper
                    variant="outlined"
                    sx={{ p: 2, borderRadius: 2 }}
                    aria-live="polite"
                >
                    <Stack
                        direction="row"
                        spacing={2}
                        alignItems="center"
                        sx={{ mb: 1 }}
                    >
                        <Chip label="Backfilling" color="warning" size="small" />
                        <Typography variant="body2" color="text.secondary">
                            {backfill.ready} / {backfill.total} samples ready
                            ({backfill.percent_complete.toFixed(0)}%)
                        </Typography>
                    </Stack>
                    <LinearProgress
                        variant="determinate"
                        value={backfill.percent_complete}
                        sx={{ height: 6, borderRadius: 3 }}
                    />
                </Paper>
            )}

            <Paper
                variant="outlined"
                sx={{ borderRadius: 3, overflow: "hidden" }}
            >
                <Tabs
                    value={direction}
                    onChange={(_e, v: Direction) => setDirection(v)}
                    sx={{
                        borderBottom: 1,
                        borderColor: "divider",
                        px: 2,
                    }}
                >
                    <Tab
                        value="outbound"
                        label={`Outbound · ${trip.origin_address.split(",")[0]} → ${trip.destination_address.split(",")[0]}`}
                    />
                    <Tab
                        value="return"
                        label={`Return · ${trip.destination_address.split(",")[0]} → ${trip.origin_address.split(",")[0]}`}
                    />
                </Tabs>
                <Box sx={{ p: { xs: 2, md: 3 } }}>
                    <Stack spacing={3}>
                        <Box>
                            <Typography
                                variant="overline"
                                color="text.secondary"
                            >
                                Best time per day
                            </Typography>
                            <Box sx={{ mt: 1 }}>
                                <TripHeatmapSummary
                                    heatmap={heatmap}
                                    direction={direction}
                                />
                            </Box>
                        </Box>
                        <Box>
                            <Typography
                                variant="overline"
                                color="text.secondary"
                            >
                                Drive time, 06:00 – 21:00, every 15 minutes
                            </Typography>
                            <Box sx={{ mt: 1 }}>
                                <TripHeatmap
                                    heatmap={heatmap}
                                    direction={direction}
                                />
                            </Box>
                        </Box>
                    </Stack>
                </Box>
            </Paper>
        </Stack>
    );
}

export default function TripDetailPage() {
    const { tripId } = useParams();
    return (
        <ProtectedRoute>
            <AppShell>
                {tripId ? (
                    <TripDetailInner tripId={tripId} />
                ) : (
                    <Alert severity="error">Missing trip id in URL</Alert>
                )}
            </AppShell>
        </ProtectedRoute>
    );
}

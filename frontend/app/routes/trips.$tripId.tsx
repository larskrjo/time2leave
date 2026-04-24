/**
 * Trip detail with two-direction heatmap, summary strip, and live
 * backfill progress polling.
 *
 * Behavior:
 *   - Loads the trip + heatmap on mount.
 *   - If backfill < 100%, polls `GET /trips/:id/backfill-status` every
 *     4s and re-fetches the heatmap until it's complete.
 *   - Tab switcher between Outbound and Return.
 *   - Inline rename: click the title or addresses to edit in place.
 *   - Swap A↔B button flips origin/destination and re-backfills.
 *   - Keyboard: ArrowLeft/ArrowRight switch tabs; Escape goes back.
 *   - Delete uses the shared undo-delete flow in /trips.
 */
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type KeyboardEvent as ReactKeyboardEvent,
} from "react";
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
    IconButton,
    LinearProgress,
    Paper,
    Skeleton,
    Stack,
    Tab,
    Tabs,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import {
    ArrowBackRounded,
    CalendarMonthRounded,
    CheckRounded,
    CloseRounded,
    DeleteOutlineRounded,
    EastRounded,
    EditRounded,
    FlagOutlined,
    PlaceOutlined,
    SwapHorizRounded,
    WestRounded,
} from "@mui/icons-material";
import { AnimatePresence, motion } from "framer-motion";

import { AppShell } from "~/components/AppShell";
import { ProtectedRoute } from "~/components/ProtectedRoute";
import {
    TripHeatmap,
    TripHeatmapSummary,
    type HeatmapHighlight,
} from "~/components/TripHeatmap";
import { FadeIn, PageHero, glassCardSx } from "~/components/motion";
import { ROUTES } from "~/constants/path";
import { isApiError } from "~/lib/api";
import {
    getTrip,
    getTripBackfillStatus,
    getTripHeatmap,
    updateTrip,
    type BackfillStatus,
    type Direction,
    type HeatmapPayload,
    type TripDetail,
    type TripPatch,
} from "~/lib/trips";

export function meta() {
    return [{ title: "Trip · time2leave" }];
}

const POLL_INTERVAL_MS = 4_000;

/**
 * Silhouette of the real trip detail layout (hero w/ action buttons,
 * tab bar, best-time chip strip, heatmap grid). Using proportional
 * widths + a row-wise hero ensures the skeleton fills the `maxWidth="lg"`
 * container on desktop instead of rendering as a narrow phone-width
 * column pinned to the top-left.
 */
function TripDetailSkeleton() {
    return (
        <Stack spacing={3}>
            <Skeleton variant="text" width={120} height={28} />

            <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={{ xs: 2, md: 3 }}
                alignItems={{ md: "flex-start" }}
                justifyContent="space-between"
            >
                <Stack
                    spacing={1.25}
                    sx={{ flex: 1, minWidth: 0, maxWidth: 720 }}
                >
                    <Skeleton variant="text" width={220} height={18} />
                    <Skeleton variant="text" width="70%" height={52} />
                    <Skeleton variant="text" width="95%" height={20} />
                </Stack>
                <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                    <Skeleton variant="rounded" width={44} height={44} />
                    <Skeleton variant="rounded" width={120} height={44} />
                </Stack>
            </Stack>

            <Skeleton
                variant="rounded"
                height={56}
                sx={{ borderRadius: 2 }}
            />

            <Paper
                elevation={0}
                sx={{
                    ...glassCardSx,
                    p: { xs: 2, md: 3 },
                }}
            >
                <Stack spacing={3}>
                    <Box>
                        <Skeleton
                            variant="text"
                            width={160}
                            height={16}
                            sx={{ mb: 1.5 }}
                        />
                        <Stack
                            direction="row"
                            spacing={1}
                            sx={{ flexWrap: { xs: "wrap", md: "nowrap" } }}
                        >
                            {Array.from({ length: 7 }).map((_, i) => (
                                <Skeleton
                                    key={i}
                                    variant="rounded"
                                    height={72}
                                    sx={{
                                        flex: "1 1 0",
                                        minWidth: { xs: 96, md: 0 },
                                        borderRadius: 2,
                                    }}
                                />
                            ))}
                        </Stack>
                    </Box>

                    <Box>
                        <Skeleton
                            variant="text"
                            width={240}
                            height={16}
                            sx={{ mb: 0.5 }}
                        />
                        <Skeleton
                            variant="text"
                            width="40%"
                            height={14}
                            sx={{ mb: 1.5 }}
                        />
                        <Skeleton
                            variant="rounded"
                            height={360}
                            sx={{ borderRadius: 2 }}
                        />
                    </Box>
                </Stack>
            </Paper>
        </Stack>
    );
}

/**
 * Header-embedded inline editor for trip name + addresses.
 * Closed state shows the values; clicking "Edit" swaps to a form.
 */
function EditableHero({
    trip,
    weekLabel,
    saving,
    onSave,
    onCancel,
    editing,
    setEditing,
    onDelete,
    onSwap,
    swapping,
    deleting,
}: {
    trip: TripDetail;
    weekLabel: string;
    saving: boolean;
    onSave: (patch: TripPatch) => Promise<void>;
    onCancel: () => void;
    editing: boolean;
    setEditing: (v: boolean) => void;
    onDelete: () => void;
    onSwap: () => void;
    swapping: boolean;
    deleting: boolean;
}) {
    const [name, setName] = useState(trip.name ?? "");
    const [origin, setOrigin] = useState(trip.origin_address);
    const [destination, setDestination] = useState(trip.destination_address);

    // Keep editor in sync if the trip itself changes (e.g. after a swap).
    useEffect(() => {
        setName(trip.name ?? "");
        setOrigin(trip.origin_address);
        setDestination(trip.destination_address);
    }, [trip.id, trip.name, trip.origin_address, trip.destination_address]);

    const canSave =
        origin.trim().length >= 3 &&
        destination.trim().length >= 3 &&
        origin.trim().toLowerCase() !== destination.trim().toLowerCase() &&
        (name.trim() !== (trip.name ?? "") ||
            origin.trim() !== trip.origin_address ||
            destination.trim() !== trip.destination_address);

    const commit = async () => {
        if (!canSave) return;
        const patch: TripPatch = {};
        const trimmedName = name.trim();
        if (trimmedName !== (trip.name ?? "")) {
            if (trimmedName === "") patch.clear_name = true;
            else patch.name = trimmedName;
        }
        if (origin.trim() !== trip.origin_address)
            patch.origin_address = origin.trim();
        if (destination.trim() !== trip.destination_address)
            patch.destination_address = destination.trim();
        await onSave(patch);
    };

    const onFieldKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void commit();
        } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
        }
    };

    const headlineEl = editing ? (
        <TextField
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={onFieldKey}
            placeholder="Name this trip (optional)"
            variant="standard"
            autoFocus
            slotProps={{
                input: {
                    sx: {
                        fontSize: { xs: 32, md: 40 },
                        fontWeight: 800,
                        letterSpacing: "-0.01em",
                    },
                },
            }}
            sx={{ flexGrow: 1 }}
        />
    ) : (
        trip.name ?? `Trip #${trip.id}`
    );

    const subEl = editing ? (
        <Stack spacing={1} sx={{ mt: 1, maxWidth: 720 }}>
            <TextField
                size="small"
                fullWidth
                label="From"
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                onKeyDown={onFieldKey}
                slotProps={{
                    input: {
                        startAdornment: (
                            <PlaceOutlined
                                fontSize="small"
                                sx={{ color: "primary.main", mr: 1 }}
                            />
                        ),
                    },
                }}
            />
            <TextField
                size="small"
                fullWidth
                label="To"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                onKeyDown={onFieldKey}
                slotProps={{
                    input: {
                        startAdornment: (
                            <FlagOutlined
                                fontSize="small"
                                sx={{ color: "warning.main", mr: 1 }}
                            />
                        ),
                    },
                }}
            />
            <Typography variant="caption" color="text.secondary">
                Enter saves · Esc cancels · Changing the addresses
                rebuilds the heatmap.
            </Typography>
        </Stack>
    ) : (
        <Stack
            direction={{ xs: "column", sm: "row" }}
            alignItems={{ sm: "center" }}
            spacing={{ xs: 0.5, sm: 1.25 }}
        >
            <Stack direction="row" spacing={0.75} alignItems="center">
                <PlaceOutlined
                    fontSize="small"
                    sx={{ color: "primary.main" }}
                />
                <Typography variant="body2" color="text.secondary">
                    {trip.origin_address}
                </Typography>
            </Stack>
            <Tooltip title="Swap A ↔ B (rebuilds heatmap)">
                <span>
                    <IconButton
                        size="small"
                        aria-label="swap origin and destination"
                        onClick={onSwap}
                        disabled={swapping}
                        sx={{
                            mx: 0.25,
                            color: "text.disabled",
                            "&:hover": { color: "primary.main" },
                        }}
                    >
                        <SwapHorizRounded fontSize="small" />
                    </IconButton>
                </span>
            </Tooltip>
            <Stack direction="row" spacing={0.75} alignItems="center">
                <FlagOutlined
                    fontSize="small"
                    sx={{ color: "warning.main" }}
                />
                <Typography variant="body2" color="text.secondary">
                    {trip.destination_address}
                </Typography>
            </Stack>
        </Stack>
    );

    const rightEl = editing ? (
        <Stack direction="row" spacing={1}>
            <Button
                variant="contained"
                color="primary"
                disabled={saving || !canSave}
                startIcon={<CheckRounded />}
                onClick={commit}
                sx={{ borderRadius: 2, fontWeight: 700 }}
            >
                Save
            </Button>
            <Button
                color="inherit"
                disabled={saving}
                startIcon={<CloseRounded />}
                onClick={onCancel}
                sx={{ borderRadius: 2, fontWeight: 600 }}
            >
                Cancel
            </Button>
        </Stack>
    ) : (
        <Stack direction="row" spacing={1}>
            <Tooltip title="Edit trip">
                <IconButton
                    aria-label="edit trip"
                    onClick={() => setEditing(true)}
                    sx={{
                        color: "text.secondary",
                        backgroundColor: "rgba(255,255,255,0.5)",
                        border: "1px solid rgba(30,64,175,0.15)",
                        backdropFilter: "blur(6px)",
                        transition:
                            "color 160ms ease, background 160ms ease, border-color 160ms ease",
                        "&:hover": {
                            color: "primary.main",
                            backgroundColor: "rgba(255,255,255,0.8)",
                            borderColor: "rgba(30,64,175,0.35)",
                        },
                        "[data-mui-color-scheme='dark'] &": {
                            backgroundColor: "rgba(18,26,51,0.55)",
                            borderColor: "rgba(147,176,255,0.2)",
                        },
                        "[data-mui-color-scheme='dark'] &:hover": {
                            backgroundColor: "rgba(18,26,51,0.85)",
                            borderColor: "rgba(147,176,255,0.4)",
                        },
                    }}
                >
                    <EditRounded fontSize="small" />
                </IconButton>
            </Tooltip>
            <Tooltip title="Delete trip">
                <Button
                    variant="outlined"
                    color="error"
                    startIcon={<DeleteOutlineRounded />}
                    onClick={onDelete}
                    disabled={deleting}
                    sx={{
                        borderRadius: 2,
                        fontWeight: 600,
                        borderColor: "rgba(211,47,47,0.4)",
                        backgroundColor: "rgba(255,255,255,0.5)",
                        backdropFilter: "blur(6px)",
                        transition:
                            "background 160ms ease, border-color 160ms ease",
                        "&:hover": {
                            backgroundColor: "rgba(255,255,255,0.8)",
                            borderColor: "rgba(211,47,47,0.7)",
                        },
                        "[data-mui-color-scheme='dark'] &": {
                            backgroundColor: "rgba(18,26,51,0.55)",
                            borderColor: "rgba(255,112,112,0.35)",
                        },
                        "[data-mui-color-scheme='dark'] &:hover": {
                            backgroundColor: "rgba(18,26,51,0.85)",
                            borderColor: "rgba(255,112,112,0.6)",
                        },
                    }}
                >
                    Delete
                </Button>
            </Tooltip>
        </Stack>
    );

    return (
        <PageHero
            eyebrow={`Week of ${weekLabel}`}
            headline={headlineEl}
            sub={subEl}
            right={rightEl}
        />
    );
}

function TripDetailInner({ tripId }: { tripId: string }) {
    const navigate = useNavigate();
    const [trip, setTrip] = useState<TripDetail | null>(null);
    const [heatmap, setHeatmap] = useState<HeatmapPayload | null>(null);
    const [backfill, setBackfill] = useState<BackfillStatus | null>(null);
    const [view, setView] = useState<Direction>("outbound");
    const [highlight, setHighlight] = useState<HeatmapHighlight>(null);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [swapping, setSwapping] = useState(false);
    const [editing, setEditing] = useState(false);
    const pollRef = useRef<number | null>(null);

    const direction: Direction = view;

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

    const onDelete = () => {
        if (!trip) return;
        // Hand the delete off to the list page, which has the undo
        // snackbar. The list page picks up `pendingDelete` from state.
        navigate(ROUTES.trips, {
            replace: true,
            state: {
                pendingDelete: {
                    id: trip.id,
                    name: trip.name,
                    origin_address: trip.origin_address,
                    destination_address: trip.destination_address,
                    created_at: trip.created_at,
                },
            },
        });
    };

    const onSave = useCallback(
        async (patch: TripPatch) => {
            setSaving(true);
            setError(null);
            try {
                const updated = await updateTrip(tripId, patch);
                setTrip(updated);
                setBackfill(updated.backfill);
                setEditing(false);
                // Address change → heatmap is going to be stale; re-fetch.
                if (patch.origin_address || patch.destination_address) {
                    const h = await getTripHeatmap(tripId);
                    setHeatmap(h);
                }
            } catch (err) {
                setError(isApiError(err) ? err.detail : "Failed to save trip");
            } finally {
                setSaving(false);
            }
        },
        [tripId],
    );

    const onSwap = useCallback(async () => {
        if (!trip) return;
        setSwapping(true);
        setError(null);
        try {
            const updated = await updateTrip(tripId, { swap_addresses: true });
            setTrip(updated);
            setBackfill(updated.backfill);
            const h = await getTripHeatmap(tripId);
            setHeatmap(h);
        } catch (err) {
            setError(isApiError(err) ? err.detail : "Failed to swap trip");
        } finally {
            setSwapping(false);
        }
    }, [tripId, trip]);

    // Keyboard shortcuts: Esc back; ←/→ tabs; e edit.
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            const t = e.target as HTMLElement | null;
            const isTyping =
                t &&
                (t.tagName === "INPUT" ||
                    t.tagName === "TEXTAREA" ||
                    t.isContentEditable);
            if (e.key === "Escape" && !editing) {
                navigate(ROUTES.trips);
                return;
            }
            if (isTyping || e.metaKey || e.ctrlKey || e.altKey) return;
            if (e.key === "ArrowLeft") {
                setView((v) => (v === "return" ? "outbound" : v));
                setHighlight(null);
            } else if (e.key === "ArrowRight") {
                setView((v) => (v === "outbound" ? "return" : v));
                setHighlight(null);
            } else if ((e.key === "e" || e.key === "E") && !editing) {
                e.preventDefault();
                setEditing(true);
            }
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [editing, navigate]);

    const headerTitle = useMemo(() => {
        if (!trip) return "Trip";
        return trip.name ?? `Trip #${trip.id}`;
    }, [trip]);

    if (!trip || !heatmap) {
        return (
            <Stack spacing={3}>
                {error && <Alert severity="error">{error}</Alert>}
                <TripDetailSkeleton />
            </Stack>
        );
    }

    const inProgress = backfill !== null && backfill.percent_complete < 100;
    const weekStart = new Date(heatmap.week_start_date + "T00:00:00");
    const weekLabel = weekStart.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
    });

    return (
        <Stack spacing={3}>
            <FadeIn>
                <Button
                    component={RouterLink}
                    to={ROUTES.trips}
                    startIcon={<ArrowBackRounded />}
                    sx={{ alignSelf: "flex-start", fontWeight: 600 }}
                    color="inherit"
                >
                    Back to trips
                </Button>
            </FadeIn>

            <EditableHero
                trip={trip}
                weekLabel={weekLabel}
                saving={saving}
                editing={editing}
                setEditing={setEditing}
                onSave={onSave}
                onCancel={() => setEditing(false)}
                onDelete={onDelete}
                onSwap={onSwap}
                swapping={swapping}
                deleting={false}
            />
            {error && (
                <FadeIn>
                    <Alert severity="error" onClose={() => setError(null)}>
                        {error}
                    </Alert>
                </FadeIn>
            )}

            {inProgress && backfill && (
                <FadeIn>
                    <Paper
                        elevation={0}
                        sx={{
                            ...glassCardSx,
                            p: 2,
                            borderRadius: 3,
                            borderColor: "rgba(237,108,2,0.35)",
                            backgroundColor: "rgba(255,244,229,0.72)",
                        }}
                        aria-live="polite"
                    >
                        <Stack
                            direction="row"
                            spacing={2}
                            alignItems="center"
                            sx={{ mb: 1 }}
                        >
                            <Chip
                                icon={<CalendarMonthRounded />}
                                label="Building your heatmap"
                                color="warning"
                                size="small"
                                sx={{ fontWeight: 600 }}
                            />
                            <Typography variant="body2" color="text.secondary">
                                {backfill.ready} / {backfill.total} samples
                                ready ({backfill.percent_complete.toFixed(0)}%)
                            </Typography>
                        </Stack>
                        <LinearProgress
                            variant="determinate"
                            value={backfill.percent_complete}
                            sx={{
                                height: 6,
                                borderRadius: 3,
                                backgroundColor: "rgba(237,108,2,0.15)",
                            }}
                        />
                    </Paper>
                </FadeIn>
            )}

            <FadeIn delay={0.12}>
                <Paper
                    elevation={0}
                    sx={{
                        ...glassCardSx,
                        overflow: "hidden",
                    }}
                >
                    {/* Short labels + icons keep both Outbound and Return
                        comfortably tappable even on narrow phones. The
                        full origin→destination context lives in the
                        caption above the heatmap. */}
                    <Tabs
                        value={view}
                        onChange={(_e, v: Direction) => {
                            setView(v);
                            setHighlight(null);
                        }}
                        variant="fullWidth"
                        aria-label="Direction"
                        sx={{
                            borderBottom: "1px solid rgba(30,64,175,0.08)",
                            "& .MuiTab-root": {
                                textTransform: "none",
                                fontWeight: 600,
                                fontSize: 14,
                                minHeight: 56,
                            },
                            "& .MuiTabs-indicator": {
                                height: 3,
                                borderRadius: "3px 3px 0 0",
                                background:
                                    "linear-gradient(90deg, #1e40af, #ef6c00)",
                            },
                        }}
                    >
                        <Tab
                            value="outbound"
                            icon={<EastRounded fontSize="small" />}
                            iconPosition="start"
                            label="Outbound"
                        />
                        <Tab
                            value="return"
                            icon={<WestRounded fontSize="small" />}
                            iconPosition="start"
                            label="Return"
                        />
                    </Tabs>
                    <Box sx={{ p: { xs: 2, md: 3 } }}>
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={view}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -6 }}
                                transition={{ duration: 0.25 }}
                            >
                                <Stack spacing={3}>
                                    <Box>
                                        <Typography
                                            variant="overline"
                                            color="text.secondary"
                                            sx={{
                                                letterSpacing: 1.5,
                                                fontWeight: 700,
                                            }}
                                        >
                                            Best time per day
                                        </Typography>
                                        <Box sx={{ mt: 1.25 }}>
                                            <TripHeatmapSummary
                                                heatmap={heatmap}
                                                direction={direction}
                                                highlight={highlight}
                                                onHoverSlot={setHighlight}
                                            />
                                        </Box>
                                    </Box>
                                    <Box>
                                        <Typography
                                            variant="overline"
                                            color="text.secondary"
                                            sx={{
                                                letterSpacing: 1.5,
                                                fontWeight: 700,
                                                display: "block",
                                            }}
                                        >
                                            Drive time · 6am – 9pm, every
                                            15 min
                                        </Typography>
                                        <Box sx={{ mt: 1.25 }}>
                                            <TripHeatmap
                                                heatmap={heatmap}
                                                direction={direction}
                                                highlight={highlight}
                                            />
                                        </Box>
                                    </Box>
                                </Stack>
                            </motion.div>
                        </AnimatePresence>
                    </Box>
                </Paper>
            </FadeIn>

            <Typography
                variant="caption"
                color="text.secondary"
                sx={{ textAlign: "center" }}
            >
                Viewing {headerTitle} · week of {weekLabel}
            </Typography>
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

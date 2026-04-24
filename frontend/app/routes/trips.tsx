/**
 * Authenticated trips list.
 *
 * Renders a shared PageHero, a stagger-fade-in list of TripCards, and
 * a polished empty state. Delete is a deferred commit: we hide the
 * card immediately, show an undo snackbar, and only call the API once
 * the snackbar dismisses. That removes the "are you sure?" friction
 * for a reversible action.
 *
 * Shortcuts:
 *   - n: go to /trips/new
 *   - / or focus-in-input: ignored so users can type normally
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link as RouterLink, useLocation, useNavigate } from "react-router";
import {
    Alert,
    Box,
    Button,
    Chip,
    IconButton,
    Paper,
    Skeleton,
    Snackbar,
    Stack,
    Tooltip,
    Typography,
} from "@mui/material";
import {
    AddRounded,
    CloseRounded,
    MapOutlined,
    UndoRounded,
} from "@mui/icons-material";

import { AppShell } from "~/components/AppShell";
import { ProtectedRoute } from "~/components/ProtectedRoute";
import { TripCard } from "~/components/TripCard";
import { FadeIn, PageHero, glassCardSx } from "~/components/motion";
import { ROUTES } from "~/constants/path";
import {
    deleteTrip,
    getTripQuota,
    listTrips,
    type TripQuota,
    type TripSummary,
} from "~/lib/trips";
import { isApiError } from "~/lib/api";
import { useSession } from "~/lib/session";

export function meta() {
    return [{ title: "My trips · time2leave" }];
}

const UNDO_WINDOW_MS = 5_500;

type PendingDelete = {
    trip: TripSummary;
    // Keep the original index so we can re-insert into the list on
    // undo without rebuilding the whole thing.
    insertAt: number;
    timer: number;
};

function TripListSkeleton() {
    return (
        <Stack spacing={2} aria-hidden>
            {[0, 1, 2].map((i) => (
                <Paper
                    key={i}
                    elevation={0}
                    sx={{ ...glassCardSx, p: { xs: 2.5, md: 3 } }}
                >
                    <Stack direction="row" spacing={1.5} alignItems="center">
                        <Skeleton variant="rounded" width={36} height={36} />
                        <Skeleton
                            variant="text"
                            sx={{ fontSize: "1.25rem", flex: 1 }}
                        />
                        <Skeleton variant="rounded" width={92} height={24} />
                    </Stack>
                    <Box sx={{ mt: 2 }}>
                        <Skeleton variant="rounded" height={42} />
                    </Box>
                </Paper>
            ))}
        </Stack>
    );
}

function TripsListInner() {
    const { user } = useSession();
    const navigate = useNavigate();
    const location = useLocation();
    const [trips, setTrips] = useState<TripSummary[] | null>(null);
    const [quota, setQuota] = useState<TripQuota | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState<PendingDelete | null>(null);

    const reload = useCallback(async () => {
        try {
            const [fresh, q] = await Promise.all([
                listTrips(),
                getTripQuota().catch(() => null),
            ]);
            setTrips(fresh);
            if (q) setQuota(q);
            setError(null);
        } catch (err) {
            const detail = isApiError(err) ? err.detail : "Failed to load trips";
            setError(detail);
            setTrips([]);
        }
    }, []);

    useEffect(() => {
        void reload();
    }, [reload]);

    // If the detail page redirected here with "delete me", defer-queue it
    // just like a normal delete so the undo affordance is consistent.
    useEffect(() => {
        const state = location.state as { pendingDelete?: TripSummary } | null;
        if (!state?.pendingDelete || !trips) return;
        const t = state.pendingDelete;
        scheduleDelete(t, trips.findIndex((x) => x.id === t.id));
        // Clear the state so a reload doesn't re-queue.
        navigate(location.pathname, { replace: true, state: null });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.state, trips]);

    const commitDelete = useCallback(
        async (trip: TripSummary) => {
            try {
                await deleteTrip(trip.id);
                // Refresh quota, silently — don't block on errors.
                void getTripQuota()
                    .then(setQuota)
                    .catch(() => undefined);
            } catch (err) {
                setError(
                    isApiError(err) ? err.detail : "Failed to delete trip",
                );
                // Put it back — our optimistic removal was wrong.
                setTrips((current) =>
                    current && !current.some((t) => t.id === trip.id)
                        ? [...current, trip].sort(
                              (a, b) => b.id - a.id,
                          )
                        : current,
                );
            }
        },
        [],
    );

    const scheduleDelete = useCallback(
        (trip: TripSummary, insertAt: number) => {
            // If another delete is already pending, commit it first
            // (no more than one pending at a time keeps logic simple).
            if (pending) {
                window.clearTimeout(pending.timer);
                void commitDelete(pending.trip);
            }
            setTrips((current) =>
                current ? current.filter((t) => t.id !== trip.id) : current,
            );
            const timer = window.setTimeout(() => {
                setPending(null);
                void commitDelete(trip);
            }, UNDO_WINDOW_MS);
            setPending({ trip, insertAt: Math.max(0, insertAt), timer });
        },
        [pending, commitDelete],
    );

    const handleDelete = useCallback(
        (trip: TripSummary) => {
            if (!trips) return;
            const idx = trips.findIndex((t) => t.id === trip.id);
            scheduleDelete(trip, idx);
        },
        [trips, scheduleDelete],
    );

    const undoDelete = useCallback(() => {
        if (!pending) return;
        window.clearTimeout(pending.timer);
        setTrips((current) => {
            if (!current) return current;
            if (current.some((t) => t.id === pending.trip.id)) return current;
            const next = [...current];
            next.splice(pending.insertAt, 0, pending.trip);
            return next;
        });
        setPending(null);
    }, [pending]);

    // Keyboard shortcut: `n` to create a trip. Skip when typing.
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            const t = e.target as HTMLElement | null;
            const isTyping =
                t &&
                (t.tagName === "INPUT" ||
                    t.tagName === "TEXTAREA" ||
                    t.isContentEditable);
            if (isTyping || e.metaKey || e.ctrlKey || e.altKey) return;
            if (e.key === "n" || e.key === "N") {
                e.preventDefault();
                navigate(ROUTES.newTrip);
            }
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [navigate]);

    // Flush any pending delete when the user navigates away.
    const pendingRef = useRef(pending);
    pendingRef.current = pending;
    useEffect(() => {
        return () => {
            const p = pendingRef.current;
            if (p) {
                window.clearTimeout(p.timer);
                void commitDelete(p.trip);
            }
        };
    }, [commitDelete]);

    const greetingName =
        user?.name?.split(" ")[0] ?? user?.email.split("@")[0] ?? "there";

    const atLimit =
        quota !== null &&
        trips !== null &&
        trips.length >= quota.limit &&
        !pending;

    const quotaBadge = quota && (
        <Chip
            size="small"
            variant={atLimit ? "filled" : "outlined"}
            color={atLimit ? "warning" : "default"}
            label={`${(trips?.length ?? quota.used)} / ${quota.limit} slots`}
            sx={{
                fontWeight: 700,
                letterSpacing: 0.3,
                borderRadius: 1.5,
                backdropFilter: "blur(6px)",
            }}
        />
    );

    const newTripButton = (
        <Tooltip
            title={
                atLimit
                    ? `Trip limit is ${quota?.limit}. Delete one to add another.`
                    : "Add a new trip (n)"
            }
        >
            <span>
                <Button
                    variant="contained"
                    size="large"
                    startIcon={<AddRounded />}
                    component={RouterLink}
                    to={ROUTES.newTrip}
                    disabled={Boolean(atLimit)}
                    sx={{
                        borderRadius: 2,
                        px: 2.5,
                        py: 1.1,
                        fontWeight: 700,
                        boxShadow: "0 10px 24px -12px rgba(30,64,175,0.55)",
                        background:
                            "linear-gradient(135deg, #1e40af 0%, #ef6c00 100%)",
                        "&:hover": {
                            background:
                                "linear-gradient(135deg, #1a3aa0 0%, #d65f00 100%)",
                            boxShadow: "0 14px 28px -14px rgba(30,64,175,0.65)",
                        },
                    }}
                >
                    New trip
                </Button>
            </span>
        </Tooltip>
    );

    const heroRight = (
        <Stack direction="row" spacing={1.25} alignItems="center">
            {quotaBadge}
            {newTripButton}
        </Stack>
    );

    return (
        <Stack spacing={4}>
            <PageHero
                eyebrow={`Hi, ${greetingName}`}
                headline="Your saved trips"
                accent="saved"
                sub="We sample both directions, every day Mon–Sun, from 6am to 9pm — refreshed every Friday at 11pm PT."
                right={heroRight}
            />

            {error && (
                <FadeIn>
                    <Alert severity="error" onClose={() => setError(null)}>
                        {error}
                    </Alert>
                </FadeIn>
            )}

            {trips === null ? (
                <TripListSkeleton />
            ) : trips.length === 0 ? (
                <FadeIn delay={0.1}>
                    <Paper
                        elevation={0}
                        sx={{
                            ...glassCardSx,
                            textAlign: "center",
                            p: { xs: 5, md: 8 },
                            borderStyle: "dashed",
                            borderWidth: 2,
                        }}
                    >
                        <Box
                            sx={{
                                width: 72,
                                height: 72,
                                mx: "auto",
                                mb: 2.5,
                                borderRadius: "50%",
                                display: "grid",
                                placeItems: "center",
                                background:
                                    "linear-gradient(135deg, rgba(30,64,175,0.12), rgba(239,108,0,0.12))",
                                color: "primary.main",
                            }}
                        >
                            <MapOutlined sx={{ fontSize: 36 }} />
                        </Box>
                        <Typography variant="h5" fontWeight={700} gutterBottom>
                            No trips yet
                        </Typography>
                        <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ mb: 3, maxWidth: 380, mx: "auto" }}
                        >
                            Add your first commute, school run, or gym drive
                            and we'll build the heatmap for this week in a
                            minute or two.
                        </Typography>
                        <Button
                            variant="contained"
                            startIcon={<AddRounded />}
                            component={RouterLink}
                            to={ROUTES.newTrip}
                            sx={{
                                borderRadius: 2,
                                fontWeight: 700,
                                background:
                                    "linear-gradient(135deg, #1e40af 0%, #ef6c00 100%)",
                            }}
                        >
                            Add your first trip
                        </Button>
                    </Paper>
                </FadeIn>
            ) : (
                <Stack spacing={2}>
                    {trips.map((trip, idx) => (
                        <FadeIn key={trip.id} delay={0.06 * idx}>
                            <TripCard trip={trip} onDelete={async (t) => handleDelete(t)} />
                        </FadeIn>
                    ))}
                </Stack>
            )}

            <Snackbar
                open={Boolean(pending)}
                autoHideDuration={UNDO_WINDOW_MS}
                onClose={(_e, reason) => {
                    // MUI swallows clickaway by default; we only act on timeouts.
                    if (reason === "timeout" && pending) {
                        window.clearTimeout(pending.timer);
                        void commitDelete(pending.trip);
                        setPending(null);
                    }
                }}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
                message={
                    pending
                        ? `Deleted "${pending.trip.name ?? `Trip #${pending.trip.id}`}"`
                        : ""
                }
                action={
                    <>
                        <Button
                            color="warning"
                            size="small"
                            onClick={undoDelete}
                            startIcon={<UndoRounded fontSize="small" />}
                            sx={{ fontWeight: 700 }}
                        >
                            Undo
                        </Button>
                        <IconButton
                            size="small"
                            aria-label="close"
                            color="inherit"
                            onClick={() => {
                                if (!pending) return;
                                window.clearTimeout(pending.timer);
                                void commitDelete(pending.trip);
                                setPending(null);
                            }}
                        >
                            <CloseRounded fontSize="small" />
                        </IconButton>
                    </>
                }
            />
        </Stack>
    );
}

export default function TripsPage() {
    return (
        <ProtectedRoute>
            <AppShell>
                <TripsListInner />
            </AppShell>
        </ProtectedRoute>
    );
}

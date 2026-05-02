/**
 * Authenticated trips list.
 *
 * Renders a shared PageHero, a stagger-fade-in list of TripCards, and
 * a polished empty state. Delete is a deferred commit: we hide the
 * card immediately, show an undo snackbar, and only call the API once
 * the snackbar dismisses. That removes the "are you sure?" friction
 * for a reversible action.
 *
 * The undo timer is owned exclusively by the Snackbar's
 * `autoHideDuration` — its `onClose("timeout")` is the single trigger
 * for committing the delete. The unmount-cleanup effect handles the
 * "user navigated away mid-undo" case. The detail-page entry path
 * passes the trip via `location.state.pendingDelete`; a `useRef` guard
 * stops React's effect-deps churn from queueing the same delete more
 * than once.
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
import { FadeIn, PageHero, glassCardSx, primaryCtaSx } from "~/components/motion";
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
    //
    // The ref guard is load-bearing: `scheduleDelete` calls `setTrips`
    // (optimistic removal), which is in this effect's dep array, so
    // without the guard the effect would re-fire on the very same
    // pendingDelete before React Router has flushed `state: null` —
    // and we'd schedule the delete twice.
    const handledPendingRef = useRef(false);
    useEffect(() => {
        if (handledPendingRef.current) return;
        const state = location.state as { pendingDelete?: TripSummary } | null;
        if (!state?.pendingDelete || !trips) return;
        handledPendingRef.current = true;
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
                // Re-sort by `created_at` desc to match the backend's
                // newest-first ordering. Slugs are opaque strings, so we
                // can't sort by `id` numerically anymore.
                setTrips((current) =>
                    current && !current.some((t) => t.id === trip.id)
                        ? [...current, trip].sort((a, b) =>
                              (b.created_at ?? "").localeCompare(
                                  a.created_at ?? "",
                              ),
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
            // The Snackbar's autoHideDuration is the single source of
            // truth for the 5.5s undo window — there used to be a
            // sibling setTimeout that fired commitDelete in parallel,
            // and the resulting double-fire would 404 the second call.
            if (pending) {
                void commitDelete(pending.trip);
            }
            setTrips((current) =>
                current ? current.filter((t) => t.id !== trip.id) : current,
            );
            setPending({ trip, insertAt: Math.max(0, insertAt) });
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
                void commitDelete(p.trip);
            }
        };
    }, [commitDelete]);

    const greetingName =
        user?.name?.split(" ")[0] ?? user?.email.split("@")[0] ?? "there";

    const atSlotLimit =
        quota !== null &&
        trips !== null &&
        trips.length >= quota.limit &&
        !pending;

    // Per-user weekly cost cap. Each create / address-change patch
    // counts; this gates the New Trip CTA before the user wastes a
    // round-trip filling out the form.
    const atMutationLimit =
        quota !== null && quota.mutations_used >= quota.mutations_limit;

    const atLimit = atSlotLimit || atMutationLimit;

    const quotaBadge = quota && (
        <Chip
            variant={atSlotLimit ? "filled" : "outlined"}
            color={atSlotLimit ? "warning" : "default"}
            label={`${(trips?.length ?? quota.used)} / ${quota.limit} slots`}
            sx={{
                fontWeight: 700,
                letterSpacing: 0.3,
                borderRadius: 1.5,
                height: 36,
                px: 0.5,
                backdropFilter: "blur(6px)",
            }}
        />
    );

    // Only show the changes-this-week chip once the user has used at
    // least one mutation; otherwise it's just noise on first load.
    const mutationsBadge = quota && quota.mutations_used > 0 && (
        <Tooltip
            title={
                atMutationLimit
                    ? "You've used your weekly limit for trip changes. Older edits roll off automatically."
                    : "Adding a trip or changing its addresses runs a fresh week of Google Maps lookups, so we cap weekly changes."
            }
        >
            <Chip
                variant={atMutationLimit ? "filled" : "outlined"}
                color={atMutationLimit ? "warning" : "default"}
                label={`${quota.mutations_used} / ${quota.mutations_limit} changes / wk`}
                sx={{
                    fontWeight: 700,
                    letterSpacing: 0.3,
                    borderRadius: 1.5,
                    height: 36,
                    px: 0.5,
                    backdropFilter: "blur(6px)",
                }}
            />
        </Tooltip>
    );

    const newTripButton = (
        <Tooltip
            title={
                atSlotLimit
                    ? `Trip limit is ${quota?.limit}. Delete one to add another.`
                    : atMutationLimit
                      ? "You've hit your weekly limit for trip changes. Try again in a few days."
                      : "Add a new trip (n)"
            }
        >
            {/* Span needs to fill the row on xs so the wrapped button
                stretches edge-to-edge instead of sitting compact on its
                own line. `display: block` lets `width: 100%` apply even
                inside the inline tooltip wrapper. */}
            <Box
                component="span"
                sx={{
                    display: "block",
                    width: { xs: "100%", sm: "auto" },
                }}
            >
                <Button
                    variant="contained"
                    startIcon={<AddRounded />}
                    component={RouterLink}
                    to={ROUTES.newTrip}
                    disabled={Boolean(atLimit)}
                    sx={{
                        ...primaryCtaSx,
                        width: { xs: "100%", sm: "auto" },
                    }}
                >
                    New trip
                </Button>
            </Box>
        </Tooltip>
    );

    // `useFlexGap` is required so wrapping rows get a real row-gap; with
    // the default Stack `spacing` (margin-based), wrapped rows have no
    // vertical breathing room. On xs we force the button onto its own
    // row by giving its container `flexBasis: 100%`, then it stretches
    // to fill via the inner `width: 100%`. On sm+ everything sits
    // inline at the right edge of the hero.
    const heroRight = (
        <Stack
            direction="row"
            useFlexGap
            flexWrap="wrap"
            alignItems="center"
            justifyContent={{ xs: "flex-start", md: "flex-end" }}
            sx={{
                rowGap: 1.5,
                columnGap: 1.25,
                width: { xs: "100%", md: "auto" },
                "& > .new-trip-cta": {
                    flexBasis: { xs: "100%", sm: "auto" },
                },
            }}
        >
            {mutationsBadge}
            {quotaBadge}
            <Box className="new-trip-cta">{newTripButton}</Box>
        </Stack>
    );

    return (
        <Stack spacing={4}>
            <PageHero
                eyebrow={`Hi, ${greetingName}`}
                headline="Your saved trips"
                accent="saved"
                sub="We sample both directions, every day Mon–Sun, from 6am to 9pm — refreshed every Monday at 1am PT."
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
                        <Tooltip
                            title={
                                atMutationLimit
                                    ? "You've hit your weekly limit for trip changes. Try again in a few days."
                                    : ""
                            }
                        >
                            <span>
                                <Button
                                    variant="contained"
                                    startIcon={<AddRounded />}
                                    component={RouterLink}
                                    to={ROUTES.newTrip}
                                    disabled={Boolean(atMutationLimit)}
                                    sx={primaryCtaSx}
                                >
                                    Add your first trip
                                </Button>
                            </span>
                        </Tooltip>
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

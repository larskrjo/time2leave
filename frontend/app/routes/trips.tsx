/**
 * Authenticated trips list.
 *
 * Fetches `GET /api/v1/trips` on mount and renders one TripCard per
 * trip, plus a prominent "New trip" CTA. Empty state nudges the user
 * to create their first trip. Delete is optimistic-with-rollback:
 * remove locally, call the API, re-fetch on failure.
 */
import { useCallback, useEffect, useState } from "react";
import { Link as RouterLink } from "react-router";
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    Paper,
    Stack,
    Typography,
} from "@mui/material";
import { AddRounded, MapOutlined } from "@mui/icons-material";

import { AppShell } from "~/components/AppShell";
import { ProtectedRoute } from "~/components/ProtectedRoute";
import { TripCard } from "~/components/TripCard";
import { ROUTES } from "~/constants/path";
import { deleteTrip, listTrips, type TripSummary } from "~/lib/trips";
import { isApiError } from "~/lib/api";

export function meta() {
    return [{ title: "My trips · Commute Heatmap" }];
}

function TripsListInner() {
    const [trips, setTrips] = useState<TripSummary[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    const reload = useCallback(async () => {
        try {
            const fresh = await listTrips();
            setTrips(fresh);
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

    const handleDelete = useCallback(
        async (trip: TripSummary) => {
            setTrips((current) =>
                current ? current.filter((t) => t.id !== trip.id) : current,
            );
            try {
                await deleteTrip(trip.id);
            } catch (err) {
                setError(
                    isApiError(err) ? err.detail : "Failed to delete trip",
                );
                await reload();
            }
        },
        [reload],
    );

    if (trips === null) {
        return (
            <Stack alignItems="center" sx={{ py: 10 }}>
                <CircularProgress />
            </Stack>
        );
    }

    return (
        <Stack spacing={3}>
            <Stack
                direction={{ xs: "column", sm: "row" }}
                alignItems={{ sm: "center" }}
                justifyContent="space-between"
                spacing={2}
            >
                <Box>
                    <Typography variant="h4" fontWeight={700}>
                        My trips
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Heatmaps refresh every Friday at 23:00 PT. Each trip
                        samples both directions from 06:00 to 21:00, seven
                        days a week.
                    </Typography>
                </Box>
                <Button
                    variant="contained"
                    size="large"
                    startIcon={<AddRounded />}
                    component={RouterLink}
                    to={ROUTES.newTrip}
                >
                    New trip
                </Button>
            </Stack>

            {error && (
                <Alert severity="error" onClose={() => setError(null)}>
                    {error}
                </Alert>
            )}

            {trips.length === 0 ? (
                <Paper
                    variant="outlined"
                    sx={{
                        textAlign: "center",
                        p: { xs: 5, md: 8 },
                        borderRadius: 4,
                        borderStyle: "dashed",
                    }}
                >
                    <MapOutlined
                        sx={{ fontSize: 56, color: "text.disabled", mb: 2 }}
                    />
                    <Typography variant="h6" fontWeight={600} gutterBottom>
                        No trips yet
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        Add your first commute, school run, or gym drive to
                        see when you should leave.
                    </Typography>
                    <Button
                        variant="contained"
                        startIcon={<AddRounded />}
                        component={RouterLink}
                        to={ROUTES.newTrip}
                    >
                        Add your first trip
                    </Button>
                </Paper>
            ) : (
                <Stack spacing={2}>
                    {trips.map((trip) => (
                        <TripCard
                            key={trip.id}
                            trip={trip}
                            onDelete={handleDelete}
                        />
                    ))}
                </Stack>
            )}
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

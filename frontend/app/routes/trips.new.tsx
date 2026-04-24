/**
 * "Create a trip" form.
 *
 * Two required address fields plus an optional name. Submits to
 * `POST /api/v1/trips`; on 2xx we redirect to the new trip's detail
 * page so the user watches their heatmap populate. Per-user cap and
 * same-origin errors come back as structured ApiError and are shown
 * inline.
 */
import { useState, type FormEvent } from "react";
import { Link as RouterLink, useNavigate } from "react-router";
import {
    Alert,
    Box,
    Button,
    Paper,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import { ArrowBackRounded, RouteRounded } from "@mui/icons-material";

import { AppShell } from "~/components/AppShell";
import { ProtectedRoute } from "~/components/ProtectedRoute";
import { ROUTES } from "~/constants/path";
import { createTrip } from "~/lib/trips";
import { isApiError } from "~/lib/api";

export function meta() {
    return [{ title: "New trip · Commute Heatmap" }];
}

function NewTripForm() {
    const navigate = useNavigate();
    const [name, setName] = useState("");
    const [origin, setOrigin] = useState("");
    const [destination, setDestination] = useState("");
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const disabled =
        pending ||
        origin.trim().length < 3 ||
        destination.trim().length < 3 ||
        origin.trim().toLowerCase() === destination.trim().toLowerCase();

    const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        try {
            const trip = await createTrip({
                name: name.trim() || null,
                origin_address: origin.trim(),
                destination_address: destination.trim(),
            });
            navigate(ROUTES.trip(trip.id));
        } catch (err) {
            setError(
                isApiError(err) ? err.detail : "Failed to create trip",
            );
        } finally {
            setPending(false);
        }
    };

    return (
        <Stack spacing={3} sx={{ maxWidth: 640 }}>
            <Button
                component={RouterLink}
                to={ROUTES.trips}
                startIcon={<ArrowBackRounded />}
                sx={{ alignSelf: "flex-start" }}
            >
                Back to trips
            </Button>

            <Box>
                <Typography variant="h4" fontWeight={700} gutterBottom>
                    Add a trip
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    Paste full addresses so we can route accurately. You can
                    use cross-streets or landmarks, but "1600 Pennsylvania
                    Ave NW, Washington DC" works best.
                </Typography>
            </Box>

            <Paper
                variant="outlined"
                sx={{ p: { xs: 3, md: 4 }, borderRadius: 3 }}
            >
                <Box component="form" onSubmit={onSubmit}>
                    <Stack spacing={2.5}>
                        <TextField
                            label="Trip name (optional)"
                            placeholder="e.g. Home → Work"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            fullWidth
                            inputProps={{ maxLength: 255 }}
                        />
                        <TextField
                            label="Origin address"
                            placeholder="Starting address"
                            value={origin}
                            onChange={(e) => setOrigin(e.target.value)}
                            required
                            fullWidth
                            autoFocus
                            inputProps={{ "aria-label": "origin address" }}
                        />
                        <TextField
                            label="Destination address"
                            placeholder="Where you're going"
                            value={destination}
                            onChange={(e) => setDestination(e.target.value)}
                            required
                            fullWidth
                            inputProps={{ "aria-label": "destination address" }}
                        />
                        {error && <Alert severity="error">{error}</Alert>}
                        <Stack
                            direction="row"
                            spacing={1.5}
                            justifyContent="flex-end"
                        >
                            <Button
                                component={RouterLink}
                                to={ROUTES.trips}
                                color="inherit"
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                variant="contained"
                                disabled={disabled}
                                startIcon={<RouteRounded />}
                            >
                                {pending ? "Creating…" : "Create trip"}
                            </Button>
                        </Stack>
                    </Stack>
                </Box>
            </Paper>
            <Typography variant="caption" color="text.secondary">
                We'll start collecting both-direction samples at 15-minute
                intervals from 06:00 to 21:00 immediately. The full heatmap
                usually appears within a minute or two.
            </Typography>
        </Stack>
    );
}

export default function NewTripPage() {
    return (
        <ProtectedRoute>
            <AppShell>
                <NewTripForm />
            </AppShell>
        </ProtectedRoute>
    );
}

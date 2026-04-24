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
import {
    ArrowBackRounded,
    FlagOutlined,
    PlaceOutlined,
    RouteRounded,
} from "@mui/icons-material";

import { AppShell } from "~/components/AppShell";
import { PlacesAutocompleteField } from "~/components/PlacesAutocompleteField";
import { ProtectedRoute } from "~/components/ProtectedRoute";
import { FadeIn, PageHero, glassCardSx } from "~/components/motion";
import { ROUTES } from "~/constants/path";
import { createTrip } from "~/lib/trips";
import { isApiError } from "~/lib/api";

export function meta() {
    return [{ title: "New trip · time2leave" }];
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
        <Box sx={{ maxWidth: 720, mx: "auto" }}>
            <FadeIn>
                <Button
                    component={RouterLink}
                    to={ROUTES.trips}
                    startIcon={<ArrowBackRounded />}
                    sx={{ mb: 3, fontWeight: 600 }}
                    color="inherit"
                >
                    Back to trips
                </Button>
            </FadeIn>

            <PageHero
                eyebrow="New trip"
                headline="Name the drive you repeat"
                accent="repeat"
                sub="Paste full addresses so we can route accurately. Cross-streets work, but street-level addresses give the crispest heatmap."
            />

            <FadeIn delay={0.22}>
                <Paper
                    elevation={0}
                    sx={{
                        ...glassCardSx,
                        p: { xs: 3, md: 4 },
                    }}
                >
                    <Box component="form" onSubmit={onSubmit}>
                        <Stack spacing={3}>
                            <TextField
                                label="Trip name"
                                placeholder="e.g. Home → Work"
                                helperText="Optional. Shown on the trips list."
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                fullWidth
                                inputProps={{ maxLength: 255 }}
                            />
                            <PlacesAutocompleteField
                                label="Origin address"
                                placeholder="Starting address"
                                value={origin}
                                onChange={setOrigin}
                                required
                                fullWidth
                                autoFocus
                                InputProps={{
                                    startAdornment: (
                                        <PlaceOutlined
                                            fontSize="small"
                                            sx={{
                                                mr: 1,
                                                color: "primary.main",
                                            }}
                                        />
                                    ),
                                }}
                                inputProps={{ "aria-label": "origin address" }}
                            />
                            <PlacesAutocompleteField
                                label="Destination address"
                                placeholder="Where you're going"
                                value={destination}
                                onChange={setDestination}
                                required
                                fullWidth
                                InputProps={{
                                    startAdornment: (
                                        <FlagOutlined
                                            fontSize="small"
                                            sx={{
                                                mr: 1,
                                                color: "warning.main",
                                            }}
                                        />
                                    ),
                                }}
                                inputProps={{ "aria-label": "destination address" }}
                            />
                            {error && <Alert severity="error">{error}</Alert>}
                            <Stack
                                direction="row"
                                spacing={1.5}
                                justifyContent="flex-end"
                                sx={{ pt: 1 }}
                            >
                                <Button
                                    component={RouterLink}
                                    to={ROUTES.trips}
                                    color="inherit"
                                    sx={{ fontWeight: 600 }}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    variant="contained"
                                    disabled={disabled}
                                    startIcon={<RouteRounded />}
                                    sx={{
                                        borderRadius: 2,
                                        px: 3,
                                        fontWeight: 700,
                                        background: disabled
                                            ? undefined
                                            : "linear-gradient(135deg, #1e40af 0%, #ef6c00 100%)",
                                        boxShadow: disabled
                                            ? undefined
                                            : "0 10px 24px -12px rgba(30,64,175,0.55)",
                                        "&:hover": {
                                            background: disabled
                                                ? undefined
                                                : "linear-gradient(135deg, #1a3aa0 0%, #d65f00 100%)",
                                        },
                                    }}
                                >
                                    {pending ? "Creating…" : "Create trip"}
                                </Button>
                            </Stack>
                        </Stack>
                    </Box>
                </Paper>
            </FadeIn>
            <FadeIn delay={0.35}>
                <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", mt: 2, textAlign: "center" }}
                >
                    We start sampling both directions at 15-minute intervals
                    right away. The full heatmap usually fills in within a
                    minute or two.
                </Typography>
            </FadeIn>
        </Box>
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

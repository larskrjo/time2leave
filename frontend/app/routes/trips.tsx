/**
 * Trips list placeholder.
 *
 * Flesh-out of the actual list + mini heatmaps lands in a later commit.
 * For now this route just confirms the auth + shell plumbing works.
 */
import { Link as RouterLink } from "react-router";
import { Button, Paper, Stack, Typography } from "@mui/material";

import { AppShell } from "~/components/AppShell";
import { ProtectedRoute } from "~/components/ProtectedRoute";
import { ROUTES } from "~/constants/path";

export function meta() {
    return [{ title: "My trips · Commute Heatmap" }];
}

export default function TripsPage() {
    return (
        <ProtectedRoute>
            <AppShell>
                <Stack spacing={3}>
                    <Stack
                        direction="row"
                        alignItems="center"
                        justifyContent="space-between"
                    >
                        <Typography variant="h4" fontWeight={700}>
                            My trips
                        </Typography>
                        <Button
                            variant="contained"
                            component={RouterLink}
                            to={ROUTES.newTrip}
                        >
                            New trip
                        </Button>
                    </Stack>
                    <Paper
                        variant="outlined"
                        sx={{
                            p: 4,
                            textAlign: "center",
                            borderRadius: 3,
                            borderStyle: "dashed",
                        }}
                    >
                        <Typography variant="body1" color="text.secondary">
                            The real list view lands in the next commit.
                        </Typography>
                    </Paper>
                </Stack>
            </AppShell>
        </ProtectedRoute>
    );
}

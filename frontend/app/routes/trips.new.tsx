/**
 * New-trip form placeholder. Real form with validation + optional
 * Places autocomplete lands in a later commit.
 */
import { Link as RouterLink } from "react-router";
import { Button, Paper, Stack, Typography } from "@mui/material";

import { AppShell } from "~/components/AppShell";
import { ProtectedRoute } from "~/components/ProtectedRoute";
import { ROUTES } from "~/constants/path";

export function meta() {
    return [{ title: "New trip · Commute Heatmap" }];
}

export default function NewTripPage() {
    return (
        <ProtectedRoute>
            <AppShell>
                <Stack spacing={3}>
                    <Button component={RouterLink} to={ROUTES.trips}>
                        ← Back to trips
                    </Button>
                    <Typography variant="h4" fontWeight={700}>
                        New trip
                    </Typography>
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
                            The real form lands in the next commit.
                        </Typography>
                    </Paper>
                </Stack>
            </AppShell>
        </ProtectedRoute>
    );
}

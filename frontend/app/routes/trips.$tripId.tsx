/**
 * Trip detail placeholder. Real tabs + summary strip + heatmaps lands
 * in a later commit.
 */
import { Link as RouterLink, useParams } from "react-router";
import { Button, Paper, Stack, Typography } from "@mui/material";

import { AppShell } from "~/components/AppShell";
import { ProtectedRoute } from "~/components/ProtectedRoute";
import { ROUTES } from "~/constants/path";

export function meta() {
    return [{ title: "Trip · Commute Heatmap" }];
}

export default function TripDetailPage() {
    const { tripId } = useParams();
    return (
        <ProtectedRoute>
            <AppShell>
                <Stack spacing={3}>
                    <Button component={RouterLink} to={ROUTES.trips}>
                        ← Back to trips
                    </Button>
                    <Typography variant="h4" fontWeight={700}>
                        Trip #{tripId}
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
                            The real heatmap view lands in the next commit.
                        </Typography>
                    </Paper>
                </Stack>
            </AppShell>
        </ProtectedRoute>
    );
}

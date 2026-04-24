/**
 * Compact card for the /trips list.
 *
 * Shows the trip name (falling back to "Trip #<id>"), the origin →
 * destination, and a delete button. The whole card is a link into
 * the detail route, but the delete button stops propagation so users
 * don't navigate when they just want to remove the trip.
 */
import { useState, type MouseEvent } from "react";
import {
    Box,
    Card,
    CardActionArea,
    CardContent,
    Chip,
    IconButton,
    Stack,
    Tooltip,
    Typography,
} from "@mui/material";
import {
    ArrowRightAltRounded,
    DeleteOutlineRounded,
} from "@mui/icons-material";
import { Link as RouterLink } from "react-router";

import { ROUTES } from "~/constants/path";
import type { TripSummary } from "~/lib/trips";

type Props = {
    trip: TripSummary;
    onDelete: (trip: TripSummary) => Promise<void>;
    deleting?: boolean;
};

export function TripCard({ trip, onDelete, deleting = false }: Props) {
    const [busy, setBusy] = useState(false);

    const handleDelete = async (e: MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (!confirm("Delete this trip? This can't be undone.")) return;
        setBusy(true);
        try {
            await onDelete(trip);
        } finally {
            setBusy(false);
        }
    };

    return (
        <Card
            elevation={0}
            sx={{
                borderRadius: 3,
                border: (theme) => `1px solid ${theme.palette.divider}`,
                transition: "transform 180ms ease, box-shadow 180ms ease",
                "&:hover": {
                    transform: "translateY(-2px)",
                    boxShadow: "0 8px 24px -12px rgba(30,64,175,0.25)",
                },
            }}
        >
            <Box sx={{ position: "relative" }}>
                <CardActionArea
                    component={RouterLink}
                    to={ROUTES.trip(trip.id)}
                    sx={{ borderRadius: 3 }}
                >
                    <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
                        <Stack spacing={1.5}>
                            <Stack
                                direction="row"
                                alignItems="center"
                                spacing={1}
                            >
                                <Typography variant="h6" fontWeight={700}>
                                    {trip.name ?? `Trip #${trip.id}`}
                                </Typography>
                                <Chip
                                    size="small"
                                    label="Both directions"
                                    color="primary"
                                    variant="outlined"
                                />
                            </Stack>
                            <Stack
                                direction={{ xs: "column", sm: "row" }}
                                spacing={1}
                                alignItems={{ sm: "center" }}
                            >
                                <Typography
                                    variant="body2"
                                    color="text.secondary"
                                    sx={{ flex: 1, minWidth: 0 }}
                                >
                                    {trip.origin_address}
                                </Typography>
                                <ArrowRightAltRounded
                                    fontSize="small"
                                    sx={{ color: "text.disabled" }}
                                />
                                <Typography
                                    variant="body2"
                                    color="text.secondary"
                                    sx={{ flex: 1, minWidth: 0 }}
                                >
                                    {trip.destination_address}
                                </Typography>
                            </Stack>
                        </Stack>
                    </CardContent>
                </CardActionArea>
                <Tooltip title="Delete trip">
                    <span>
                        <IconButton
                            onClick={handleDelete}
                            disabled={busy || deleting}
                            aria-label="delete trip"
                            size="small"
                            sx={{
                                position: "absolute",
                                top: 8,
                                right: 8,
                                color: "text.secondary",
                                "&:hover": { color: "error.main" },
                            }}
                        >
                            <DeleteOutlineRounded fontSize="small" />
                        </IconButton>
                    </span>
                </Tooltip>
            </Box>
        </Card>
    );
}

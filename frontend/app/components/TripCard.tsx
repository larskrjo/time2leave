/**
 * Glass-style card for the /trips list.
 *
 * The card is the clickable surface; the delete affordance is a
 * floating absolute-positioned button that stops propagation so
 * clicking it doesn't navigate. Inherits the shared `glassCardSx`
 * tokens so it feels like part of the splash page's card family.
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
    ArrowForwardRounded,
    DeleteOutlineRounded,
    PlaceRounded,
    RouteOutlined,
} from "@mui/icons-material";
import { Link as RouterLink } from "react-router";

import { ROUTES } from "~/constants/path";
import type { TripSummary } from "~/lib/trips";
import { glassCardSx } from "~/components/motion";

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
                ...glassCardSx,
                "&:hover": {
                    transform: "translateY(-3px)",
                    boxShadow: "0 18px 36px -20px rgba(30,64,175,0.45)",
                    borderColor: "rgba(30,64,175,0.25)",
                },
                "[data-mui-color-scheme='dark'] &:hover": {
                    boxShadow: "0 18px 36px -20px rgba(0,0,0,0.6)",
                    borderColor: "rgba(147,176,255,0.3)",
                },
            }}
        >
            <Box sx={{ position: "relative" }}>
                <CardActionArea
                    component={RouterLink}
                    to={ROUTES.trip(trip.id)}
                    sx={{
                        borderRadius: "inherit",
                        "& .MuiCardActionArea-focusHighlight": {
                            borderRadius: "inherit",
                        },
                    }}
                >
                    <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
                        <Stack spacing={1.75}>
                            <Stack
                                direction="row"
                                alignItems="center"
                                spacing={1.25}
                                sx={{ pr: 5 }}
                            >
                                <Box
                                    aria-hidden
                                    sx={{
                                        width: 36,
                                        height: 36,
                                        borderRadius: 2,
                                        display: "grid",
                                        placeItems: "center",
                                        background:
                                            "linear-gradient(135deg, rgba(30,64,175,0.12), rgba(239,108,0,0.12))",
                                        color: "primary.main",
                                    }}
                                >
                                    <RouteOutlined fontSize="small" />
                                </Box>
                                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                    <Typography
                                        variant="h6"
                                        fontWeight={700}
                                        noWrap
                                        sx={{ letterSpacing: "-0.005em" }}
                                    >
                                        {trip.name ?? `Trip #${trip.id}`}
                                    </Typography>
                                </Box>
                                <Chip
                                    size="small"
                                    label="Both directions"
                                    sx={{
                                        fontWeight: 600,
                                        color: "primary.main",
                                        backgroundColor: "rgba(30,64,175,0.08)",
                                        border: "1px solid rgba(30,64,175,0.18)",
                                        "[data-mui-color-scheme='dark'] &": {
                                            backgroundColor:
                                                "rgba(147,176,255,0.14)",
                                            border: "1px solid rgba(147,176,255,0.25)",
                                        },
                                    }}
                                />
                            </Stack>

                            <Stack
                                direction={{ xs: "column", sm: "row" }}
                                spacing={{ xs: 1, sm: 1.5 }}
                                alignItems={{ sm: "center" }}
                                sx={{
                                    px: 1.25,
                                    py: 1.25,
                                    borderRadius: 2,
                                    backgroundColor: "rgba(30,64,175,0.04)",
                                    "[data-mui-color-scheme='dark'] &": {
                                        backgroundColor: "rgba(147,176,255,0.08)",
                                    },
                                }}
                            >
                                <Stack
                                    direction="row"
                                    spacing={1}
                                    alignItems="center"
                                    sx={{ flex: 1, minWidth: 0 }}
                                >
                                    <PlaceRounded
                                        fontSize="small"
                                        sx={{ color: "primary.main" }}
                                    />
                                    <Typography
                                        variant="body2"
                                        color="text.secondary"
                                        noWrap
                                        title={trip.origin_address}
                                    >
                                        {trip.origin_address}
                                    </Typography>
                                </Stack>
                                <ArrowForwardRounded
                                    fontSize="small"
                                    sx={{
                                        color: "text.disabled",
                                        transform: { xs: "rotate(90deg)", sm: "none" },
                                        flexShrink: 0,
                                    }}
                                />
                                <Stack
                                    direction="row"
                                    spacing={1}
                                    alignItems="center"
                                    sx={{ flex: 1, minWidth: 0 }}
                                >
                                    <PlaceRounded
                                        fontSize="small"
                                        sx={{ color: "warning.main" }}
                                    />
                                    <Typography
                                        variant="body2"
                                        color="text.secondary"
                                        noWrap
                                        title={trip.destination_address}
                                    >
                                        {trip.destination_address}
                                    </Typography>
                                </Stack>
                            </Stack>
                        </Stack>
                    </CardContent>
                </CardActionArea>
                <Tooltip title="Delete trip">
                    {/*
                        The <span> wrapper is required so the tooltip can
                        attach listeners even while the button is disabled
                        (MUI refuses to bind events to disabled elements).
                        Keep the absolute positioning *on the span* so
                        Tooltip's anchor measurement sees the real on-screen
                        location; otherwise the span collapses to a 0×0 box
                        in document flow and the tooltip ends up floating
                        near the card's top-left (or the viewport corner).
                    */}
                    <Box
                        component="span"
                        sx={{
                            position: "absolute",
                            top: 10,
                            right: 10,
                            display: "inline-flex",
                        }}
                    >
                        <IconButton
                            onClick={handleDelete}
                            disabled={busy || deleting}
                            aria-label="delete trip"
                            size="small"
                            sx={{
                                color: "text.secondary",
                                backgroundColor: "rgba(255,255,255,0.6)",
                                backdropFilter: "blur(6px)",
                                transition: "color 160ms ease, background 160ms ease",
                                "&:hover": {
                                    color: "error.main",
                                    backgroundColor: "rgba(255,255,255,0.9)",
                                },
                                "[data-mui-color-scheme='dark'] &": {
                                    backgroundColor: "rgba(18,26,51,0.6)",
                                },
                                "[data-mui-color-scheme='dark'] &:hover": {
                                    backgroundColor: "rgba(18,26,51,0.9)",
                                },
                            }}
                        >
                            <DeleteOutlineRounded fontSize="small" />
                        </IconButton>
                    </Box>
                </Tooltip>
            </Box>
        </Card>
    );
}

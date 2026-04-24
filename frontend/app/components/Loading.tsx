/**
 * Full-viewport loading screen used in three places:
 *   - `<HydrateFallback />` in `root.tsx` (i.e. the flash you see on
 *     every hard refresh before React hydrates).
 *   - `<ProtectedRoute>` while the `/me` request resolves.
 *   - The splash route while the session probe is in flight.
 *
 * Design goals:
 *   - Match the splash's light/dark gradient so the visual identity
 *     is continuous from the first paint onwards.
 *   - Lead with the `time2leave` wordmark so even the loading flash
 *     is branded.
 *   - Use a heatmap-flavored "bar wave" animation instead of a raw
 *     `CircularProgress`. It references the product and feels less
 *     generic.
 *
 * IMPORTANT: this component is rendered as a `HydrateFallback`, which
 * means it ships as static HTML on the initial load — before React
 * hydrates, before framer-motion can run, and before any effect has
 * fired. Everything here must therefore animate purely via CSS
 * keyframes so the screen is alive even during the pre-hydration
 * window.
 */
import { Box, Stack, Typography } from "@mui/material";

import { Wordmark } from "~/components/Wordmark";

const BAR_COUNT = 12;
const BAR_STAGGER_MS = 80;
const BAR_DURATION_MS = 1300;

export default function Loading() {
    return (
        <Box
            role="status"
            aria-live="polite"
            aria-label="Loading time2leave"
            sx={{
                width: "100%",
                minHeight: "100vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                color: "text.primary",
                background:
                    "linear-gradient(180deg, #f5f8ff 0%, #ffffff 60%, #fff8f0 100%)",
                "[data-mui-color-scheme='dark'] &": {
                    background:
                        "linear-gradient(180deg, #0b1020 0%, #121a33 60%, #1a1528 100%)",
                },
                "@keyframes tlhLoadWave": {
                    "0%, 100%": {
                        opacity: 0.22,
                        transform: "scaleY(0.45)",
                    },
                    "50%": {
                        opacity: 1,
                        transform: "scaleY(1.15)",
                    },
                },
                "@keyframes tlhLoadFade": {
                    "0%": { opacity: 0, transform: "translateY(6px)" },
                    "100%": { opacity: 1, transform: "translateY(0)" },
                },
                // Respect reduced-motion users: hold each bar at its
                // mid-pulse state instead of waving, and skip the
                // hero fade-in entirely.
                "@media (prefers-reduced-motion: reduce)": {
                    "& .tlh-load-stage": { animation: "none" },
                    "& .tlh-load-bar": {
                        animation: "none",
                        opacity: 0.75,
                        transform: "scaleY(0.9)",
                    },
                },
            }}
        >
            <Stack
                className="tlh-load-stage"
                spacing={3.5}
                alignItems="center"
                sx={{
                    px: 3,
                    animation: `tlhLoadFade 450ms ease-out both`,
                }}
            >
                <Wordmark size="lg" />

                <Box
                    aria-hidden
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                        height: 34,
                    }}
                >
                    {Array.from({ length: BAR_COUNT }).map((_, i) => (
                        <Box
                            key={i}
                            className="tlh-load-bar"
                            component="span"
                            sx={{
                                display: "inline-block",
                                width: 8,
                                height: 24,
                                borderRadius: "3px",
                                background:
                                    "linear-gradient(180deg, #1e40af 0%, #ef6c00 100%)",
                                transformOrigin: "center",
                                animation: `tlhLoadWave ${BAR_DURATION_MS}ms ease-in-out infinite`,
                                animationDelay: `${i * BAR_STAGGER_MS}ms`,
                            }}
                        />
                    ))}
                </Box>

                <Typography
                    variant="body2"
                    sx={{
                        color: "text.secondary",
                        fontWeight: 500,
                        letterSpacing: 0.3,
                    }}
                >
                    Plotting your week&hellip;
                </Typography>
            </Stack>
        </Box>
    );
}

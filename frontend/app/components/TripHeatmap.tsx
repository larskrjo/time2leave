/**
 * Full-fidelity heatmap grid for a single trip + direction.
 *
 * Renders a `weekdays × 15-min-slots-from-06:00-to-21:00` grid. Cells
 * without data yet (the common "backfill in progress" case) render as
 * a subtle hatched placeholder so the layout never jumps as samples
 * fill in.
 */
import { useMemo } from "react";
import { Box, Stack, Tooltip, Typography, useTheme } from "@mui/material";

import type { Direction, HeatmapPayload, Weekday } from "~/lib/trips";
import { WEEKDAYS, weekTimeSlots } from "~/lib/trips";

type Props = {
    heatmap: HeatmapPayload;
    direction: Direction;
};

function colorFor(minutes: number, maxMinutes: number): string {
    if (maxMinutes <= 0) return "hsl(200 20% 92%)";
    const t = Math.min(1, minutes / maxMinutes);
    const hue = 135 - t * 135; // green -> red
    const sat = 72;
    const light = 48 + (1 - t) * 20;
    return `hsl(${hue} ${sat}% ${light}%)`;
}

function minutesLabel(minutes: number): string {
    if (minutes < 60) return `${Math.round(minutes)}m`;
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes - h * 60);
    return m ? `${h}h${m}m` : `${h}h`;
}

export function TripHeatmap({ heatmap, direction }: Props) {
    const theme = useTheme();
    const slots = useMemo(() => weekTimeSlots(), []);
    const weekdays: Weekday[] = heatmap.weekdays ?? WEEKDAYS;
    const directionPayload = heatmap[direction] ?? {};

    const maxMinutes = useMemo(() => {
        let max = 0;
        for (const day of weekdays) {
            const row = directionPayload[day] ?? {};
            for (const slot of slots) {
                const v = row[slot];
                if (typeof v === "number" && v > max) max = v;
            }
        }
        return max;
    }, [weekdays, slots, directionPayload]);

    // Show the hour label only at :00 so the axis stays scannable.
    const labelFor = (slot: string) => (slot.endsWith(":00") ? slot : "");

    return (
        <Box sx={{ overflowX: "auto", pb: 1 }}>
            <Box sx={{ minWidth: slots.length * 16 + 100 }}>
                <Stack direction="row" sx={{ pl: "72px", mb: 0.5 }}>
                    {slots.map((slot) => (
                        <Box
                            key={slot}
                            sx={{
                                width: 16,
                                textAlign: "center",
                                color: "text.secondary",
                                fontSize: 10,
                                fontVariantNumeric: "tabular-nums",
                            }}
                        >
                            {labelFor(slot).slice(0, 2)}
                        </Box>
                    ))}
                </Stack>
                <Stack spacing={0.5}>
                    {weekdays.map((day) => {
                        const row = directionPayload[day] ?? {};
                        return (
                            <Stack
                                key={day}
                                direction="row"
                                sx={{ alignItems: "center" }}
                            >
                                <Typography
                                    sx={{
                                        width: 72,
                                        pr: 1,
                                        fontSize: 12,
                                        fontWeight: 600,
                                        color: "text.secondary",
                                        textAlign: "right",
                                    }}
                                >
                                    {day}
                                </Typography>
                                {slots.map((slot) => {
                                    const v = row[slot];
                                    const hasData = typeof v === "number";
                                    const title = hasData
                                        ? `${day} ${slot} · ${direction} · ${minutesLabel(v)}`
                                        : `${day} ${slot} · ${direction} · not sampled yet`;
                                    return (
                                        <Tooltip
                                            key={slot}
                                            title={title}
                                            arrow
                                            enterDelay={200}
                                            placement="top"
                                        >
                                            <Box
                                                sx={{
                                                    width: 16,
                                                    height: 20,
                                                    mr: "1px",
                                                    borderRadius: "3px",
                                                    background: hasData
                                                        ? colorFor(
                                                              v as number,
                                                              maxMinutes,
                                                          )
                                                        : `repeating-linear-gradient(
                                                            45deg,
                                                            ${theme.palette.action.hover},
                                                            ${theme.palette.action.hover} 2px,
                                                            transparent 2px,
                                                            transparent 4px)`,
                                                }}
                                            />
                                        </Tooltip>
                                    );
                                })}
                            </Stack>
                        );
                    })}
                </Stack>
            </Box>
        </Box>
    );
}

/**
 * Tiny summary strip: fastest departure per weekday for the given direction.
 * Empty days (nothing sampled yet) are omitted.
 */
export function TripHeatmapSummary({
    heatmap,
    direction,
}: Props) {
    const weekdays: Weekday[] = heatmap.weekdays ?? WEEKDAYS;
    const directionPayload = heatmap[direction] ?? {};

    type Best = { day: Weekday; slot: string; minutes: number };
    const bestPerDay: Best[] = [];
    for (const day of weekdays) {
        const row = directionPayload[day] ?? {};
        let best: Best | null = null;
        for (const [slot, minutes] of Object.entries(row)) {
            if (typeof minutes !== "number") continue;
            if (!best || minutes < best.minutes) {
                best = { day, slot, minutes };
            }
        }
        if (best) bestPerDay.push(best);
    }

    if (bestPerDay.length === 0) {
        return (
            <Typography variant="body2" color="text.secondary">
                Fastest slots will appear here once samples start coming in.
            </Typography>
        );
    }

    return (
        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            {bestPerDay.map((b) => (
                <Box
                    key={b.day}
                    sx={{
                        px: 1.5,
                        py: 1,
                        borderRadius: 2,
                        bgcolor: "success.light",
                        color: "success.contrastText",
                        minWidth: 96,
                    }}
                >
                    <Typography variant="caption" sx={{ opacity: 0.85 }}>
                        {b.day} · best
                    </Typography>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        {b.slot} · {minutesLabel(b.minutes)}
                    </Typography>
                </Box>
            ))}
        </Stack>
    );
}

/**
 * Full-fidelity heatmap grid for a single trip + direction.
 *
 * Features:
 *   - `weekdays × 15-min-slots-from-06:00-to-21:00` grid. Cells
 *     without data yet render as a subtle hatched placeholder so the
 *     layout never jumps as samples fill in.
 *   - An animated "NOW" indicator highlights the current 15-minute
 *     bucket (America/Los_Angeles) so users can answer "should I
 *     leave right now?" at a glance.
 *   - `highlight` coordinates with the summary chips to flash the
 *     corresponding cell.
 *   - Under ~600px the grid collapses into a per-weekday accordion
 *     so mobile users can scan one day at a time.
 */
import { useEffect, useMemo, useState } from "react";
import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Box,
    Chip,
    Stack,
    Tooltip,
    Typography,
    useMediaQuery,
    useTheme,
} from "@mui/material";
import { ExpandMoreRounded } from "@mui/icons-material";
import { motion, useReducedMotion } from "framer-motion";

import type { Direction, HeatmapPayload, Weekday } from "~/lib/trips";
import { WEEKDAYS, weekTimeSlots } from "~/lib/trips";
import { formatHour12h, formatSlot12h } from "~/lib/time";

/**
 * A specific (day, slot) cell that should render in a highlighted
 * state. Passed from a coordinating parent (e.g. trip detail page)
 * when the user hovers the matching chip in the summary strip so the
 * two views stay visually linked.
 */
export type HeatmapHighlight = { day: Weekday; slot: string } | null;

type BaseProps = {
    heatmap: HeatmapPayload;
    direction: Direction;
    highlight?: HeatmapHighlight;
    /** Optional NOW marker — omitted on the splash demo preview. */
    showNow?: boolean;
};

type Props = BaseProps;

type SummaryProps = {
    heatmap: HeatmapPayload;
    direction: Direction;
    highlight?: HeatmapHighlight;
    onHoverSlot?: (h: HeatmapHighlight) => void;
};

const WEEKDAY_LONG: Record<Weekday, string> = {
    Mon: "Monday",
    Tue: "Tuesday",
    Wed: "Wednesday",
    Thu: "Thursday",
    Fri: "Friday",
    Sat: "Saturday",
    Sun: "Sunday",
};

function colorFor(minutes: number, maxMinutes: number): string {
    if (maxMinutes <= 0) return "hsl(200 20% 92%)";
    const t = Math.min(1, minutes / maxMinutes);
    // Soft green → warm amber → red.
    const hue = 138 - t * 138;
    const sat = 68;
    const light = 52 + (1 - t) * 18;
    return `hsl(${hue} ${sat}% ${light}%)`;
}

function minutesLabel(minutes: number): string {
    if (minutes < 60) return `${Math.round(minutes)}m`;
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes - h * 60);
    return m ? `${h}h${m}m` : `${h}h`;
}

/**
 * Return the weekday + 15-minute slot for the current time in
 * America/Los_Angeles. Returns null outside the 06:00–21:00 sampling
 * window so we don't render a NOW dot where there's no grid.
 */
export function nowBucketLA(reference: Date = new Date()): {
    day: Weekday;
    slot: string;
} | null {
    const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Los_Angeles",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
    const parts = fmt.formatToParts(reference);
    const weekday = parts.find((p) => p.type === "weekday")?.value as
        | Weekday
        | undefined;
    const hourStr = parts.find((p) => p.type === "hour")?.value ?? "00";
    const minuteStr = parts.find((p) => p.type === "minute")?.value ?? "00";
    const hour = Number(hourStr) % 24;
    const minute = Number(minuteStr);
    if (!weekday) return null;
    if (hour < 6 || hour >= 21) return null;
    const rounded = Math.floor(minute / 15) * 15;
    const slot = `${String(hour).padStart(2, "0")}:${String(rounded).padStart(
        2,
        "0",
    )}`;
    return { day: weekday, slot };
}

export function TripHeatmap({
    heatmap,
    direction,
    highlight,
    showNow = true,
}: Props) {
    const theme = useTheme();
    const reduce = useReducedMotion();
    // Below `md` (<900px viewport) we don't have enough horizontal
    // room to fit all 60 fifteen-minute slots legibly side-by-side, so
    // we show the accordion-per-day layout instead. This also happens
    // to be the tablet-portrait cutoff, which is the right call from a
    // touch-target standpoint too.
    const isMobile = useMediaQuery(theme.breakpoints.down("md"));
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

    const [now, setNow] = useState<{ day: Weekday; slot: string } | null>(() =>
        showNow ? nowBucketLA() : null,
    );
    useEffect(() => {
        if (!showNow) {
            setNow(null);
            return;
        }
        setNow(nowBucketLA());
        const id = window.setInterval(() => setNow(nowBucketLA()), 30_000);
        return () => window.clearInterval(id);
    }, [showNow]);

    const labelFor = (slot: string) => formatHour12h(slot);

    function cellColor(day: Weekday, slot: string): string {
        const v = directionPayload[day]?.[slot];
        if (typeof v === "number") return colorFor(v, maxMinutes);
        return "transparent";
    }

    function cellTitle(day: Weekday, slot: string): string {
        const label = formatSlot12h(slot);
        const v = directionPayload[day]?.[slot];
        if (typeof v === "number") {
            return `${day} ${label} · ${direction} · ${minutesLabel(v)}`;
        }
        return `${day} ${label} · ${direction} · not sampled yet`;
    }

    if (isMobile) {
        return (
            <MobileAccordionHeatmap
                heatmap={heatmap}
                direction={direction}
                highlight={highlight ?? null}
                maxMinutes={maxMinutes}
                now={now}
                weekdays={weekdays}
            />
        );
    }

    return (
        // Cells share the available container width via `flex: 1 1 0`
        // (with a small `minWidth` floor), so the grid always fits its
        // panel — no sideways scrolling. We still clamp to a sensible
        // `maxWidth` on the outer so cells don't stretch awkwardly on
        // very wide monitors.
        <Box sx={{ pb: 1, width: "100%", maxWidth: 1400, mx: "auto" }}>
            <Box>
                <Stack direction="row" sx={{ pl: "72px", mb: 0.5 }}>
                    {slots.map((slot) => (
                        <Box
                            key={slot}
                            sx={{
                                flex: "1 1 0",
                                minWidth: 10,
                                mr: "1px",
                                textAlign: "center",
                                color: "text.secondary",
                                fontSize: 10,
                                fontVariantNumeric: "tabular-nums",
                                fontWeight: 600,
                            }}
                        >
                            {labelFor(slot)}
                        </Box>
                    ))}
                </Stack>
                <Stack spacing={0.5}>
                    {weekdays.map((day, rowIdx) => {
                        return (
                            <motion.div
                                key={day}
                                initial={
                                    reduce
                                        ? { opacity: 1 }
                                        : { opacity: 0, x: -6 }
                                }
                                animate={{ opacity: 1, x: 0 }}
                                transition={{
                                    duration: 0.28,
                                    delay: reduce ? 0 : rowIdx * 0.03,
                                    ease: "easeOut",
                                }}
                            >
                                <Stack
                                    direction="row"
                                    sx={{ alignItems: "center" }}
                                >
                                    <Typography
                                        sx={{
                                            width: 72,
                                            flexShrink: 0,
                                            pr: 1,
                                            fontSize: 12,
                                            fontWeight: 700,
                                            color:
                                                now && now.day === day
                                                    ? "primary.main"
                                                    : "text.secondary",
                                            textAlign: "right",
                                            letterSpacing: 0.5,
                                        }}
                                    >
                                        {day}
                                    </Typography>
                                    {slots.map((slot) => {
                                        const title = cellTitle(day, slot);
                                        const hasData =
                                            typeof directionPayload[day]?.[
                                                slot
                                            ] === "number";
                                        const isHighlighted =
                                            highlight?.day === day &&
                                            highlight?.slot === slot;
                                        const someoneElseHighlighted =
                                            highlight !== null &&
                                            highlight !== undefined &&
                                            !isHighlighted;
                                        const isNow =
                                            !!now &&
                                            now.day === day &&
                                            now.slot === slot;
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
                                                        position: "relative",
                                                        flex: "1 1 0",
                                                        minWidth: 10,
                                                        height: 20,
                                                        mr: "1px",
                                                        borderRadius: "4px",
                                                        transition:
                                                            "transform 180ms ease, box-shadow 180ms ease, opacity 180ms ease, outline 180ms ease",
                                                        outline: isHighlighted
                                                            ? "2px solid #1e40af"
                                                            : "none",
                                                        outlineOffset:
                                                            isHighlighted
                                                                ? "2px"
                                                                : 0,
                                                        opacity:
                                                            someoneElseHighlighted
                                                                ? 0.32
                                                                : 1,
                                                        transform: isHighlighted
                                                            ? "scale(1.5)"
                                                            : undefined,
                                                        zIndex:
                                                            isHighlighted ||
                                                            isNow
                                                                ? 2
                                                                : 0,
                                                        boxShadow: isHighlighted
                                                            ? "0 6px 18px -4px rgba(30,64,175,0.55)"
                                                            : undefined,
                                                        "&:hover": {
                                                            transform:
                                                                isHighlighted
                                                                    ? "scale(1.55)"
                                                                    : "scale(1.25)",
                                                            zIndex: 1,
                                                            boxShadow:
                                                                "0 4px 10px -4px rgba(0,0,0,0.25)",
                                                        },
                                                        background: hasData
                                                            ? cellColor(
                                                                  day,
                                                                  slot,
                                                              )
                                                            : `repeating-linear-gradient(
                                                                45deg,
                                                                ${theme.palette.action.hover},
                                                                ${theme.palette.action.hover} 2px,
                                                                transparent 2px,
                                                                transparent 4px)`,
                                                    }}
                                                >
                                                    {isNow && <NowDot />}
                                                </Box>
                                            </Tooltip>
                                        );
                                    })}
                                </Stack>
                            </motion.div>
                        );
                    })}
                </Stack>
            </Box>
        </Box>
    );
}

/**
 * NOW marker for the desktop grid.
 *
 * Previously this was a small CSS triangle hovering 7px above the cell.
 * Because the row-to-row gap is only 4px, the triangle straddled the
 * border between weekdays and it wasn't clear which slot it was
 * pointing to. We keep the marker strictly *inside* the cell now: a
 * high-contrast filled dot, centered, with a soft pulsing halo so it
 * still catches the eye. The halo is purely decorative and is
 * suppressed when the user prefers reduced motion.
 */
function NowDot() {
    const reduce = useReducedMotion();
    return (
        <Box
            aria-label="Now"
            sx={{
                position: "absolute",
                inset: 0,
                display: "grid",
                placeItems: "center",
                pointerEvents: "none",
            }}
        >
            {!reduce && (
                <Box
                    component={motion.div}
                    animate={{
                        scale: [1, 2.4, 1],
                        opacity: [0.55, 0, 0.55],
                    }}
                    transition={{
                        repeat: Infinity,
                        duration: 2.0,
                        ease: "easeInOut",
                    }}
                    sx={{
                        position: "absolute",
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        backgroundColor: "#1e40af",
                    }}
                />
            )}
            <Box
                sx={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    backgroundColor: "#1e40af",
                    boxShadow:
                        "0 0 0 2px rgba(255,255,255,0.95), 0 0 4px rgba(30,64,175,0.45)",
                }}
            />
        </Box>
    );
}

function MobileAccordionHeatmap({
    heatmap,
    direction,
    highlight,
    maxMinutes,
    now,
    weekdays,
}: {
    heatmap: HeatmapPayload;
    direction: Direction;
    highlight: HeatmapHighlight;
    maxMinutes: number;
    now: { day: Weekday; slot: string } | null;
    weekdays: Weekday[];
}) {
    const theme = useTheme();
    const slots = useMemo(() => weekTimeSlots(), []);
    const payload = heatmap[direction] ?? {};
    const todayOrFirst =
        (now && weekdays.includes(now.day) ? now.day : weekdays[0]) ?? "Mon";
    const [expanded, setExpanded] = useState<Weekday | null>(todayOrFirst);

    return (
        <Stack spacing={1}>
            {weekdays.map((day) => {
                const row = payload[day] ?? {};
                const entries = Object.entries(row)
                    .filter(([, v]) => typeof v === "number")
                    .map(([slot, v]) => ({ slot, minutes: v as number }));
                const fastest = entries.reduce<{
                    slot: string;
                    minutes: number;
                } | null>(
                    (acc, cur) =>
                        !acc || cur.minutes < acc.minutes ? cur : acc,
                    null,
                );
                const isToday = now?.day === day;
                return (
                    <Accordion
                        key={day}
                        disableGutters
                        expanded={expanded === day}
                        onChange={(_e, open) =>
                            setExpanded(open ? day : null)
                        }
                        elevation={0}
                        sx={{
                            borderRadius: 2,
                            border: "1px solid rgba(30,64,175,0.12)",
                            "&:before": { display: "none" },
                            overflow: "hidden",
                        }}
                    >
                        <AccordionSummary
                            expandIcon={<ExpandMoreRounded />}
                            sx={{
                                px: 1.5,
                                "& .MuiAccordionSummary-content": {
                                    alignItems: "center",
                                    gap: 1,
                                },
                            }}
                        >
                            <Typography
                                variant="subtitle2"
                                fontWeight={800}
                                sx={{ minWidth: 44 }}
                            >
                                {day}
                            </Typography>
                            {isToday && (
                                <Chip
                                    size="small"
                                    color="primary"
                                    label="Today"
                                    sx={{ fontWeight: 700 }}
                                />
                            )}
                            {fastest && (
                                <Typography
                                    variant="body2"
                                    color="text.secondary"
                                    sx={{ ml: "auto", mr: 1 }}
                                >
                                    Fastest {formatSlot12h(fastest.slot)} ·{" "}
                                    <Box
                                        component="span"
                                        sx={{
                                            color: "success.main",
                                            fontWeight: 700,
                                        }}
                                    >
                                        {minutesLabel(fastest.minutes)}
                                    </Box>
                                </Typography>
                            )}
                        </AccordionSummary>
                        <AccordionDetails sx={{ px: 1.5, pt: 0, pb: 1.5 }}>
                            <Box
                                sx={{
                                    display: "grid",
                                    gridTemplateColumns:
                                        "repeat(auto-fill, minmax(76px, 1fr))",
                                    gap: 0.75,
                                }}
                            >
                                {slots.map((slot) => {
                                    const v = row[slot];
                                    const hasData = typeof v === "number";
                                    const isHighlighted =
                                        highlight?.day === day &&
                                        highlight?.slot === slot;
                                    const isNowCell =
                                        !!now &&
                                        now.day === day &&
                                        now.slot === slot;
                                    return (
                                        <Box
                                            key={slot}
                                            sx={{
                                                position: "relative",
                                                px: 0.5,
                                                py: 0.75,
                                                textAlign: "center",
                                                borderRadius: 1,
                                                fontSize: 11,
                                                fontWeight: 700,
                                                color: hasData
                                                    ? "black"
                                                    : "text.disabled",
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
                                                outline: isHighlighted
                                                    ? "2px solid #1e40af"
                                                    : "none",
                                            }}
                                        >
                                            <Box
                                                sx={{
                                                    fontVariantNumeric:
                                                        "tabular-nums",
                                                }}
                                            >
                                                {formatSlot12h(slot)}
                                            </Box>
                                            <Box
                                                sx={{
                                                    fontSize: 10,
                                                    opacity: 0.8,
                                                }}
                                            >
                                                {hasData
                                                    ? minutesLabel(v as number)
                                                    : "…"}
                                            </Box>
                                            {isNowCell && (
                                                <Box
                                                    aria-label="Now"
                                                    sx={{
                                                        position: "absolute",
                                                        top: -4,
                                                        left: 4,
                                                        px: 0.5,
                                                        fontSize: 9,
                                                        borderRadius: 0.5,
                                                        backgroundColor:
                                                            "primary.main",
                                                        color: "white",
                                                        fontWeight: 800,
                                                    }}
                                                >
                                                    NOW
                                                </Box>
                                            )}
                                        </Box>
                                    );
                                })}
                            </Box>
                        </AccordionDetails>
                    </Accordion>
                );
            })}
        </Stack>
    );
}

/**
 * Tiny summary strip: fastest departure per weekday for the given direction.
 * Empty days (nothing sampled yet) are omitted.
 */
export function TripHeatmapSummary({
    heatmap,
    direction,
    highlight,
    onHoverSlot,
}: SummaryProps) {
    const reduce = useReducedMotion();
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
        <Stack direction="row" spacing={1.25} flexWrap="wrap" useFlexGap>
            {bestPerDay.map((b, idx) => {
                const isActive =
                    highlight?.day === b.day && highlight?.slot === b.slot;
                return (
                    <motion.div
                        key={b.day}
                        initial={reduce ? { opacity: 1 } : { opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                            duration: 0.28,
                            delay: reduce ? 0 : idx * 0.04,
                            ease: "easeOut",
                        }}
                    >
                        <Box
                            role={onHoverSlot ? "button" : undefined}
                            tabIndex={onHoverSlot ? 0 : undefined}
                            aria-label={
                                onHoverSlot
                                    ? `Highlight ${WEEKDAY_LONG[b.day]} ${b.slot} on heatmap`
                                    : undefined
                            }
                            onMouseEnter={
                                onHoverSlot
                                    ? () =>
                                          onHoverSlot({
                                              day: b.day,
                                              slot: b.slot,
                                          })
                                    : undefined
                            }
                            onMouseLeave={
                                onHoverSlot ? () => onHoverSlot(null) : undefined
                            }
                            onFocus={
                                onHoverSlot
                                    ? () =>
                                          onHoverSlot({
                                              day: b.day,
                                              slot: b.slot,
                                          })
                                    : undefined
                            }
                            onBlur={
                                onHoverSlot ? () => onHoverSlot(null) : undefined
                            }
                            sx={{
                                px: 1.75,
                                py: 1,
                                borderRadius: 2,
                                minWidth: 112,
                                border: isActive
                                    ? "1px solid rgba(30,64,175,0.55)"
                                    : "1px solid rgba(30,64,175,0.14)",
                                cursor: onHoverSlot ? "pointer" : "default",
                                transition:
                                    "transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease",
                                transform: isActive
                                    ? "translateY(-2px)"
                                    : undefined,
                                boxShadow: isActive
                                    ? "0 10px 24px -12px rgba(30,64,175,0.5)"
                                    : undefined,
                                outline: "none",
                                "&:focus-visible": {
                                    borderColor: "rgba(30,64,175,0.7)",
                                    boxShadow:
                                        "0 0 0 3px rgba(30,64,175,0.2)",
                                },
                                background: isActive
                                    ? "linear-gradient(135deg, rgba(30,64,175,0.16), rgba(239,108,0,0.18))"
                                    : "linear-gradient(135deg, rgba(30,64,175,0.06), rgba(239,108,0,0.08))",
                            }}
                        >
                            <Typography
                                variant="caption"
                                sx={{
                                    color: "text.secondary",
                                    fontWeight: 700,
                                    letterSpacing: 1,
                                    textTransform: "uppercase",
                                    fontSize: 10,
                                }}
                            >
                                {b.day} · best
                            </Typography>
                            <Typography
                                variant="subtitle2"
                                sx={{
                                    fontWeight: 800,
                                    fontVariantNumeric: "tabular-nums",
                                    color: "text.primary",
                                }}
                            >
                                {formatSlot12h(b.slot)}{" "}
                                <Box
                                    component="span"
                                    sx={{
                                        color: "success.main",
                                        fontWeight: 700,
                                    }}
                                >
                                    {minutesLabel(b.minutes)}
                                </Box>
                            </Typography>
                        </Box>
                    </motion.div>
                );
            })}
        </Stack>
    );
}

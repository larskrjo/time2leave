/**
 * A non-interactive but high-fidelity preview of the real TripHeatmap.
 *
 * Used on the splash page so newcomers see exactly what they'll get
 * once signed in: a full week × 15-minute grid with the same palette,
 * the same summary-chip strip, the same row stagger, and a pulsing
 * "best time" highlight that cycles through weekdays to show off the
 * chip↔cell linking feature.
 *
 * Data is synthetic — a soft gaussian centered on rush hour with a
 * weekend drop — but the look/feel is identical to
 * `~/components/TripHeatmap` on purpose.
 */
import { useEffect, useMemo, useState } from "react";
import {
    Box,
    Chip,
    Stack,
    Typography,
    useMediaQuery,
    useTheme,
} from "@mui/material";
import { ExpandMoreRounded } from "@mui/icons-material";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { glassCardSx } from "~/components/motion";
import { formatHour12h, formatSlot12h } from "~/lib/time";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// 15-minute slots from 06:00 to 21:00 inclusive (60 slots).
const SLOTS = (() => {
    const out: string[] = [];
    for (let h = 6; h < 21; h += 1) {
        for (let q = 0; q < 4; q += 1) {
            const mm = q * 15;
            out.push(
                `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`,
            );
        }
    }
    return out;
})();

// Cells flex to fill the card horizontally so the demo uses every pixel
// of the preview panel. We still keep a fixed height to preserve the
// "dense grid" rhythm and a minimum width so the grid never collapses
// below the point where individual slots stop being distinguishable.
const CELL_H = 18;
const CELL_MIN_W = 6;
const CELL_GAP = 1;
const LABEL_W = 40;

/**
 * Synthetic minutes for a (day, slot) with two rush-hour bumps and a
 * weekend relaxation. Mirrors the shape the real heatmap typically
 * produces so the demo feels representative.
 *
 * Real-world rush intensity: Tuesday–Thursday are the busiest commute
 * days, Monday is a bit lighter (post-weekend ramp-up) and Friday is
 * the lightest weekday thanks to widespread WFH. The per-day scale
 * multiplies the rush-hour curve so midweek cells read noticeably
 * redder than the bookend days.
 */
const DAY_RUSH_SCALE = [0.78, 1.02, 1.1, 1.05, 0.82, 0.32, 0.28];

function synthMinutes(dayIdx: number, slotIdx: number): number {
    const hour = 6 + Math.floor(slotIdx / 4) + (slotIdx % 4) * 0.25;
    const morning = Math.exp(-((hour - 8.0) ** 2) / (2 * 1.3));
    const evening = Math.exp(-((hour - 17.5) ** 2) / (2 * 1.8));
    const dayScale = DAY_RUSH_SCALE[dayIdx] ?? 1;
    const base = 22;
    const amp = 42;
    const noise = (((dayIdx * 31 + slotIdx * 7) % 11) - 5) * 0.35;
    const m = base + amp * dayScale * (morning + 0.85 * evening) + noise;
    return Math.max(18, Math.round(m));
}

/** Same palette function as `TripHeatmap` so the demo matches. */
function colorFor(minutes: number, maxMinutes: number): string {
    if (maxMinutes <= 0) return "hsl(200 20% 92%)";
    const t = Math.min(1, Math.max(0, minutes / maxMinutes));
    const hue = 138 - t * 138;
    const sat = 68;
    const light = 52 + (1 - t) * 18;
    return `hsl(${hue} ${sat}% ${light}%)`;
}

function minutesLabel(m: number): string {
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem ? `${h}h${rem}m` : `${h}h`;
}

type Best = { day: string; dayIdx: number; slotIdx: number; slot: string; minutes: number };

export function DemoHeatmap() {
    const reduce = useReducedMotion();
    const theme = useTheme();
    // Match the real TripHeatmap's mobile breakpoint so the splash
    // preview actually advertises the UI the visitor will get on
    // whatever device they signed up from. On phones we show the same
    // per-day accordion layout the app falls back to; everywhere else
    // we render the full desktop grid below.
    const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

    const { matrix, maxMinutes, bestPerDay } = useMemo(() => {
        const m: number[][] = [];
        let mx = 0;
        for (let d = 0; d < DAYS.length; d += 1) {
            const row: number[] = [];
            for (let s = 0; s < SLOTS.length; s += 1) {
                const v = synthMinutes(d, s);
                row.push(v);
                if (v > mx) mx = v;
            }
            m.push(row);
        }
        const best: Best[] = [];
        for (let d = 0; d < DAYS.length; d += 1) {
            let bestIdx = 0;
            for (let s = 1; s < SLOTS.length; s += 1) {
                if (m[d][s] < m[d][bestIdx]) bestIdx = s;
            }
            best.push({
                day: DAYS[d],
                dayIdx: d,
                slotIdx: bestIdx,
                slot: SLOTS[bestIdx],
                minutes: m[d][bestIdx],
            });
        }
        return { matrix: m, maxMinutes: mx, bestPerDay: best };
    }, []);

    // Cycle through weekdays' "best" cells so the preview demonstrates
    // the chip↔cell linking feature without requiring user interaction.
    const [cursor, setCursor] = useState(0);
    useEffect(() => {
        if (reduce) return;
        const id = window.setInterval(() => {
            setCursor((c) => (c + 1) % bestPerDay.length);
        }, 1800);
        return () => window.clearInterval(id);
    }, [reduce, bestPerDay.length]);

    const highlight = bestPerDay[cursor];

    // Label every other hour (6a, 8a, 10a, 12p, 2p, 4p, 6p, 8p) so
    // the axis covers the whole 6am–9pm window evenly. A 3-hour stride
    // would leave the right ~20% of the grid without any tick label
    // and make the whole thing look lopsided.
    const hourTicks = SLOTS.map((s, i) => {
        const h24 = Number(s.slice(0, 2));
        return {
            i,
            label: s.endsWith(":00") && h24 % 2 === 0 ? formatHour12h(s) : "",
        };
    });

    return (
        <Box
            role="img"
            aria-label="Preview of the real heatmap: a full week, 6am to 9pm in 15-minute slots, both directions"
            sx={{
                ...glassCardSx,
                p: { xs: 2.5, md: 3 },
                position: "relative",
                overflow: "hidden",
            }}
        >
            {/* Small window-chrome + preview chip, so it reads as a
                product screenshot. `minWidth: 0` on the Stack + the
                inner Typography is what lets the long route caption
                actually shrink/ellipsis on narrow viewports instead of
                forcing the whole panel wider than its column. */}
            <Stack
                direction="row"
                alignItems="center"
                spacing={1}
                sx={{ mb: 1.5, minWidth: 0 }}
            >
                <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                    {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
                        <Box
                            key={c}
                            sx={{
                                width: 10,
                                height: 10,
                                borderRadius: "50%",
                                bgcolor: c,
                                opacity: 0.9,
                            }}
                        />
                    ))}
                </Stack>
                <Typography
                    variant="caption"
                    noWrap
                    sx={{
                        color: "text.secondary",
                        fontWeight: 600,
                        fontVariantNumeric: "tabular-nums",
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        flex: 1,
                    }}
                >
                    Home → Office · Mon–Sun · 6am–9pm
                </Typography>
                <Box
                    sx={{
                        flexShrink: 0,
                        px: 1,
                        py: 0.25,
                        borderRadius: 1,
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: 1,
                        textTransform: "uppercase",
                        color: "primary.main",
                        backgroundColor: "rgba(30,64,175,0.08)",
                        border: "1px solid rgba(30,64,175,0.18)",
                    }}
                >
                    Preview
                </Box>
            </Stack>

            {isMobile ? (
                <MobileDemoBody
                    matrix={matrix}
                    maxMinutes={maxMinutes}
                    bestPerDay={bestPerDay}
                    cursor={cursor}
                    reduce={reduce ?? false}
                />
            ) : (
                <DesktopDemoBody
                    matrix={matrix}
                    maxMinutes={maxMinutes}
                    bestPerDay={bestPerDay}
                    cursor={cursor}
                    reduce={reduce ?? false}
                    highlight={highlight}
                    hourTicks={hourTicks}
                />
            )}

            {/* Live read-out that mirrors the pulsing cell so viewers
                understand the chip→cell link without hovering. */}
            <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                sx={{ mt: 1.5, minWidth: 0 }}
            >
                <Box
                    sx={{
                        flexShrink: 0,
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        bgcolor: "primary.main",
                        animation: reduce ? undefined : "pulse 1.8s ease-in-out infinite",
                        "@keyframes pulse": {
                            "0%, 100%": { opacity: 0.6 },
                            "50%": { opacity: 1, boxShadow: "0 0 8px #1e40af" },
                        },
                    }}
                />
                <Typography
                    variant="caption"
                    sx={{
                        color: "text.secondary",
                        fontVariantNumeric: "tabular-nums",
                        minWidth: 0,
                    }}
                >
                    Best on {highlight.day}: leave at{" "}
                    <Box
                        component="span"
                        sx={{ fontWeight: 700, color: "text.primary" }}
                    >
                        {formatSlot12h(highlight.slot)}
                    </Box>{" "}
                    · drive{" "}
                    <Box
                        component="span"
                        sx={{ fontWeight: 700, color: "success.main" }}
                    >
                        {minutesLabel(highlight.minutes)}
                    </Box>
                </Typography>
            </Stack>
        </Box>
    );
}

type BodyProps = {
    matrix: number[][];
    maxMinutes: number;
    bestPerDay: Best[];
    cursor: number;
    reduce: boolean;
};

/**
 * Desktop preview: the full week × 15-min grid with a cycling
 * highlight and the "best per day" chip strip above the grid.
 * Mirrors the real `TripHeatmap` desktop layout.
 */
function DesktopDemoBody({
    matrix,
    maxMinutes,
    bestPerDay,
    cursor,
    reduce,
    highlight,
    hourTicks,
}: BodyProps & {
    highlight: Best;
    hourTicks: { i: number; label: string }[];
}) {
    return (
        <>
            {/* Best-time-per-day chips. Each chip takes an equal flex
                share of the row so all seven always fit regardless of
                card width — no more "SUN" clipped off the right. The
                inner Typography is noWrap + ellipsis as a last-resort
                safety net on extremely narrow cards. */}
            <Stack
                direction="row"
                spacing={0.75}
                sx={{
                    mb: 1.5,
                    pt: 0.5,
                    minWidth: 0,
                }}
            >
                {bestPerDay.map((b, i) => {
                    const active = i === cursor;
                    return (
                        <motion.div
                            key={b.day}
                            initial={
                                reduce ? { opacity: 1 } : { opacity: 0, y: 6 }
                            }
                            animate={{ opacity: 1, y: 0 }}
                            transition={{
                                delay: reduce ? 0 : i * 0.05,
                                duration: 0.3,
                            }}
                            style={{ flex: 1, minWidth: 0 }}
                        >
                            <Box
                                sx={{
                                    px: 0.75,
                                    py: 0.5,
                                    borderRadius: 1.5,
                                    minWidth: 0,
                                    border: active
                                        ? "1px solid rgba(30,64,175,0.55)"
                                        : "1px solid rgba(30,64,175,0.14)",
                                    transition:
                                        "transform 200ms ease, border-color 200ms ease, box-shadow 200ms ease, background 200ms ease",
                                    transform: active
                                        ? "translateY(-2px)"
                                        : "none",
                                    boxShadow: active
                                        ? "0 8px 20px -12px rgba(30,64,175,0.5)"
                                        : "none",
                                    background: active
                                        ? "linear-gradient(135deg, rgba(30,64,175,0.18), rgba(239,108,0,0.2))"
                                        : "linear-gradient(135deg, rgba(30,64,175,0.05), rgba(239,108,0,0.06))",
                                }}
                            >
                                <Typography
                                    sx={{
                                        fontSize: 9,
                                        letterSpacing: 1,
                                        fontWeight: 700,
                                        color: "text.secondary",
                                        textTransform: "uppercase",
                                        lineHeight: 1.1,
                                    }}
                                >
                                    {b.day}
                                </Typography>
                                <Typography
                                    noWrap
                                    sx={{
                                        fontSize: 11,
                                        fontWeight: 800,
                                        fontVariantNumeric: "tabular-nums",
                                        lineHeight: 1.25,
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                    }}
                                >
                                    {formatSlot12h(b.slot)}
                                    <Box
                                        component="span"
                                        sx={{
                                            ml: 0.5,
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

            {/* Hour axis. Cells flex to match the grid below so the tick
                labels stay aligned regardless of the card width. */}
            <Stack
                direction="row"
                sx={{
                    pl: `${LABEL_W}px`,
                    mb: 0.5,
                    fontVariantNumeric: "tabular-nums",
                }}
            >
                {hourTicks.map((t) => (
                    <Box
                        key={t.i}
                        sx={{
                            flex: 1,
                            minWidth: CELL_MIN_W,
                            mr: `${CELL_GAP}px`,
                            textAlign: "center",
                            color: "text.secondary",
                            fontSize: 9,
                            fontWeight: 600,
                        }}
                    >
                        {t.label}
                    </Box>
                ))}
            </Stack>

            {/* Grid. */}
            <Stack spacing={`${CELL_GAP}px`}>
                {DAYS.map((day, dayIdx) => (
                    <motion.div
                        key={day}
                        initial={
                            reduce ? { opacity: 1 } : { opacity: 0, x: -6 }
                        }
                        animate={{ opacity: 1, x: 0 }}
                        transition={{
                            delay: reduce ? 0 : dayIdx * 0.04,
                            duration: 0.32,
                            ease: "easeOut",
                        }}
                    >
                        <Stack direction="row" sx={{ alignItems: "center" }}>
                            <Typography
                                sx={{
                                    width: LABEL_W,
                                    flexShrink: 0,
                                    pr: 1,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: "text.secondary",
                                    textAlign: "right",
                                    letterSpacing: 0.5,
                                }}
                            >
                                {day}
                            </Typography>
                            {SLOTS.map((slot, slotIdx) => {
                                const v = matrix[dayIdx][slotIdx];
                                const isHighlight =
                                    highlight?.dayIdx === dayIdx &&
                                    highlight?.slotIdx === slotIdx;
                                const dim =
                                    !!highlight && !isHighlight
                                        ? 0.45
                                        : 1;
                                return (
                                    <Box
                                        key={slot}
                                        sx={{
                                            flex: 1,
                                            minWidth: CELL_MIN_W,
                                            height: CELL_H,
                                            mr: `${CELL_GAP}px`,
                                            borderRadius: "2px",
                                            background: colorFor(v, maxMinutes),
                                            opacity: dim,
                                            transition:
                                                "opacity 260ms ease, outline 260ms ease, transform 260ms ease, box-shadow 260ms ease",
                                            outline: isHighlight
                                                ? "2px solid #1e40af"
                                                : "none",
                                            outlineOffset: isHighlight ? "1px" : 0,
                                            transform: isHighlight
                                                ? "scale(1.6)"
                                                : "none",
                                            zIndex: isHighlight ? 2 : 0,
                                            position: "relative",
                                            boxShadow: isHighlight
                                                ? "0 6px 14px -4px rgba(30,64,175,0.55)"
                                                : "none",
                                        }}
                                    />
                                );
                            })}
                        </Stack>
                    </motion.div>
                ))}
            </Stack>
        </>
    );
}

/**
 * Mobile preview: mirrors the real `MobileAccordionHeatmap`. A
 * stack of per-day rows, exactly one of which is "expanded" to
 * reveal its time-of-day grid. The expanded row rotates through the
 * week on the same 1.8s cadence as the desktop cursor, so the demo
 * still looks alive and communicates the "best slot of the day"
 * feature without asking the visitor to tap anything.
 *
 * We sample every 2-hour slot (06, 08, …, 20) so the grid stays
 * legible inside the narrow card. The real app shows every 15-min
 * slot once a day is tapped.
 */
const MOBILE_PREVIEW_SLOT_STRIDE = 8; // every 2 hours (8 × 15min)

function MobileDemoBody({
    matrix,
    maxMinutes,
    bestPerDay,
    cursor,
    reduce,
}: BodyProps) {
    return (
        <Stack spacing={0.75}>
            {DAYS.map((day, dayIdx) => {
                const best = bestPerDay[dayIdx];
                const row = matrix[dayIdx];
                const isExpanded = dayIdx === bestPerDay[cursor].dayIdx;
                return (
                    <Box
                        key={day}
                        sx={{
                            borderRadius: 2,
                            border: isExpanded
                                ? "1px solid rgba(30,64,175,0.45)"
                                : "1px solid rgba(30,64,175,0.14)",
                            backgroundColor: isExpanded
                                ? "rgba(30,64,175,0.04)"
                                : "transparent",
                            overflow: "hidden",
                            transition:
                                "border-color 220ms ease, background-color 220ms ease",
                        }}
                    >
                        <Stack
                            direction="row"
                            alignItems="center"
                            spacing={1}
                            sx={{
                                px: 1.25,
                                py: 0.75,
                                minWidth: 0,
                            }}
                        >
                            <Typography
                                sx={{
                                    fontSize: 13,
                                    fontWeight: 800,
                                    minWidth: 40,
                                    flexShrink: 0,
                                }}
                            >
                                {day}
                            </Typography>
                            {isExpanded && (
                                <Chip
                                    size="small"
                                    color="primary"
                                    label="Today"
                                    sx={{
                                        height: 20,
                                        fontSize: 10,
                                        fontWeight: 700,
                                        flexShrink: 0,
                                    }}
                                />
                            )}
                            <Typography
                                noWrap
                                sx={{
                                    ml: "auto",
                                    fontSize: 11,
                                    color: "text.secondary",
                                    fontVariantNumeric: "tabular-nums",
                                    minWidth: 0,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                }}
                            >
                                Fastest {formatSlot12h(best.slot)} ·{" "}
                                <Box
                                    component="span"
                                    sx={{
                                        color: "success.main",
                                        fontWeight: 700,
                                    }}
                                >
                                    {minutesLabel(best.minutes)}
                                </Box>
                            </Typography>
                            <ExpandMoreRounded
                                sx={{
                                    flexShrink: 0,
                                    fontSize: 18,
                                    color: "text.secondary",
                                    transition: "transform 220ms ease",
                                    transform: isExpanded
                                        ? "rotate(180deg)"
                                        : "rotate(0deg)",
                                }}
                            />
                        </Stack>
                        <AnimatePresence initial={false}>
                            {isExpanded && (
                                <motion.div
                                    key="details"
                                    initial={
                                        reduce
                                            ? { opacity: 1, height: "auto" }
                                            : { opacity: 0, height: 0 }
                                    }
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={
                                        reduce
                                            ? { opacity: 0 }
                                            : { opacity: 0, height: 0 }
                                    }
                                    transition={{
                                        duration: 0.28,
                                        ease: "easeOut",
                                    }}
                                    style={{ overflow: "hidden" }}
                                >
                                    <Box sx={{ px: 1.25, pb: 1.25 }}>
                                        <Box
                                            sx={{
                                                display: "grid",
                                                gridTemplateColumns:
                                                    "repeat(auto-fill, minmax(68px, 1fr))",
                                                gap: 0.75,
                                            }}
                                        >
                                            {SLOTS.filter(
                                                (_, i) =>
                                                    i %
                                                        MOBILE_PREVIEW_SLOT_STRIDE ===
                                                    0,
                                            ).map((slot) => {
                                                const slotIdx = SLOTS.indexOf(slot);
                                                const v = row[slotIdx];
                                                const isBest =
                                                    slotIdx === best.slotIdx;
                                                return (
                                                    <Box
                                                        key={slot}
                                                        sx={{
                                                            position: "relative",
                                                            px: 0.5,
                                                            py: 0.75,
                                                            textAlign: "center",
                                                            borderRadius: 1,
                                                            background: colorFor(
                                                                v,
                                                                maxMinutes,
                                                            ),
                                                            color: "rgba(0,0,0,0.85)",
                                                            outline: isBest
                                                                ? "2px solid #1e40af"
                                                                : "none",
                                                            outlineOffset: isBest
                                                                ? 1
                                                                : 0,
                                                            transition:
                                                                "outline 220ms ease, transform 220ms ease, box-shadow 220ms ease",
                                                            transform: isBest
                                                                ? "scale(1.04)"
                                                                : "none",
                                                            boxShadow: isBest
                                                                ? "0 6px 14px -6px rgba(30,64,175,0.55)"
                                                                : "none",
                                                        }}
                                                    >
                                                        <Box
                                                            sx={{
                                                                fontSize: 11,
                                                                fontWeight: 700,
                                                                fontVariantNumeric:
                                                                    "tabular-nums",
                                                                lineHeight: 1.1,
                                                            }}
                                                        >
                                                            {formatSlot12h(slot)}
                                                        </Box>
                                                        <Box
                                                            sx={{
                                                                fontSize: 10,
                                                                fontWeight: 700,
                                                                opacity: 0.85,
                                                                lineHeight: 1.2,
                                                            }}
                                                        >
                                                            {minutesLabel(v)}
                                                        </Box>
                                                    </Box>
                                                );
                                            })}
                                        </Box>
                                    </Box>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </Box>
                );
            })}
        </Stack>
    );
}

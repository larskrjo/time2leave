/**
 * A tiny non-interactive heatmap used on the splash page.
 *
 * Purely decorative — the colors come from a synthetic "rush hour"
 * curve so visitors immediately see "light in the middle of the day,
 * dark at 8am and 6pm". Cells stagger in with framer-motion.
 */
import { Box, Stack, Typography } from "@mui/material";
import { motion, useReducedMotion } from "framer-motion";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
// Hours from 6am to 9pm on a 3-hour tick so the demo stays readable.
const TIMES = ["6a", "9a", "12p", "3p", "6p", "9p"];

function synthMinutes(day: number, hour: number, direction: "am" | "pm"): number {
    const peak = direction === "am" ? 8 : 18;
    const base = 22;
    const amp = 35;
    const bell = Math.exp(-((hour - peak) ** 2) / (2 * 2.4));
    const weekdayBump = [0, 2, 3, 4, 6][day] ?? 0;
    return Math.round(base + amp * bell + weekdayBump);
}

function cellColor(minutes: number): string {
    const hue = Math.max(0, 140 - (minutes - 15) * 3);
    const sat = 70;
    const light = Math.max(35, 85 - minutes * 0.6);
    return `hsl(${hue}, ${sat}%, ${light}%)`;
}

function Row({ day, idx }: { day: number; idx: number }) {
    const reduce = useReducedMotion();
    return (
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
            <Typography
                variant="caption"
                sx={{
                    width: 32,
                    color: "text.secondary",
                    fontWeight: 600,
                    textAlign: "right",
                    pr: 1,
                }}
            >
                {DAYS[day]}
            </Typography>
            {TIMES.map((label, i) => {
                const hour = 6 + i * 3;
                const dir = hour < 13 ? "am" : "pm";
                const mins = synthMinutes(day, hour, dir);
                return (
                    <motion.div
                        key={label}
                        initial={reduce ? { opacity: 1 } : { opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                            delay: reduce ? 0 : idx * 0.05 + i * 0.03,
                            duration: 0.35,
                            ease: "easeOut",
                        }}
                        style={{
                            width: 36,
                            height: 28,
                            borderRadius: 6,
                            background: cellColor(mins),
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 10,
                            color: mins > 45 ? "white" : "rgba(0,0,0,0.7)",
                            fontWeight: 600,
                        }}
                        aria-label={`${DAYS[day]} ${label} ${mins} minutes`}
                    >
                        {mins}
                    </motion.div>
                );
            })}
        </Stack>
    );
}

export function DemoHeatmap() {
    return (
        <Box
            role="img"
            aria-label="Example heatmap showing heavier commutes around 8am and 6pm"
            sx={{
                p: 3,
                borderRadius: 4,
                bgcolor: "rgba(255,255,255,0.7)",
                backdropFilter: "blur(12px)",
                boxShadow:
                    "0 20px 60px -20px rgba(30,64,175,0.25), 0 0 0 1px rgba(30,64,175,0.08)",
            }}
        >
            <Stack direction="row" spacing={0.75} sx={{ pl: "40px" }}>
                {TIMES.map((label) => (
                    <Typography
                        key={label}
                        variant="caption"
                        sx={{
                            width: 36,
                            textAlign: "center",
                            color: "text.secondary",
                        }}
                    >
                        {label}
                    </Typography>
                ))}
            </Stack>
            <Stack spacing={0.75} sx={{ mt: 1 }}>
                {DAYS.map((_, i) => (
                    <Row key={i} day={i} idx={i} />
                ))}
            </Stack>
        </Box>
    );
}

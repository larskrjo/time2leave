/**
 * Phone heatmap rendered as a list of seven per-day accordions instead
 * of one tiny 7×60 grid. Mirrors the web's `MobileAccordionHeatmap`
 * (see `apps/web/app/components/TripHeatmap.tsx`) so the experience is
 * consistent with what users get when they shrink the web app.
 *
 * Why a per-day list?
 *   - 60 cells across a phone width is a ~5 px column — unreadable
 *     and untappable.
 *   - Glanceable: the collapsed row tells you the day's fastest slot
 *     and how many minutes; that's the most-asked-for answer.
 *   - One day at a time fits a typical commute mental model — "what's
 *     the best time *today*?".
 *
 * Color mapping, "best slot per day" reduction, and the LA-time NOW
 * bucket all come from `@time2leave/shared` so colors and best slots
 * match the web heatmap byte-for-byte.
 */
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Surface, Text, useTheme } from "react-native-paper";

import {
    bestSlotPerDay,
    colorFor,
    formatSlot12h,
    heatmapMinMax,
    minutesLabel,
    nowBucketLA,
    weekTimeSlots,
    WEEKDAYS,
    type Direction,
    type HeatmapPayload,
    type Weekday,
} from "@time2leave/shared";

import { Symbol } from "~/components/native/Symbol";

type Props = {
    heatmap: HeatmapPayload;
    direction: Direction;
    /** Show the "NOW" badge on today's current cell. Off for splash. */
    showNow?: boolean;
};

export function TripHeatmap({ heatmap, direction, showNow = true }: Props) {
    const theme = useTheme();
    const slots = useMemo(() => weekTimeSlots(), []);
    const weekdays = (heatmap.weekdays ?? WEEKDAYS) as readonly Weekday[];
    const directionPayload = heatmap[direction] ?? {};

    const { minMinutes, maxMinutes } = useMemo(
        () => heatmapMinMax(heatmap, direction, weekdays, slots),
        [heatmap, direction, weekdays, slots],
    );

    const [now, setNow] = useState(() => (showNow ? nowBucketLA() : null));
    useEffect(() => {
        if (!showNow) {
            setNow(null);
            return;
        }
        setNow(nowBucketLA());
        const id = setInterval(() => setNow(nowBucketLA()), 30_000);
        return () => clearInterval(id);
    }, [showNow]);

    const bests = useMemo(
        () => bestSlotPerDay(heatmap, direction),
        [heatmap, direction],
    );
    const fastestByDay = useMemo(() => {
        const map = new Map<Weekday, { slot: string; minutes: number }>();
        for (const b of bests) map.set(b.day, { slot: b.slot, minutes: b.minutes });
        return map;
    }, [bests]);

    // Default-expand today, otherwise the first day with samples,
    // otherwise the first weekday. Keeps the screen useful before
    // the user touches anything.
    const defaultDay = useMemo(() => {
        if (now && weekdays.includes(now.day)) return now.day;
        const firstWithData = weekdays.find((d) => fastestByDay.has(d));
        return firstWithData ?? weekdays[0] ?? ("Mon" as Weekday);
    }, [now, weekdays, fastestByDay]);
    const [expanded, setExpanded] = useState<Weekday | null>(defaultDay);

    if (bests.length === 0) {
        return (
            <Surface
                mode="flat"
                elevation={0}
                style={{
                    padding: 16,
                    borderRadius: 12,
                    backgroundColor: tintBg(theme.colors.primary, 0.04),
                }}
            >
                <Text
                    variant="bodyMedium"
                    style={{ color: theme.colors.onSurfaceVariant }}
                >
                    Fastest slots will appear here as samples come in.
                </Text>
            </Surface>
        );
    }

    return (
        <View style={{ gap: 8 }}>
            {weekdays.map((day) => (
                <DayAccordion
                    key={day}
                    day={day}
                    isToday={now?.day === day}
                    isExpanded={expanded === day}
                    onToggle={() => setExpanded(expanded === day ? null : day)}
                    fastest={fastestByDay.get(day) ?? null}
                    row={directionPayload[day] ?? {}}
                    slots={slots}
                    minMinutes={minMinutes}
                    maxMinutes={maxMinutes}
                    nowSlot={now?.day === day ? now.slot : null}
                />
            ))}
        </View>
    );
}

function DayAccordion({
    day,
    isToday,
    isExpanded,
    onToggle,
    fastest,
    row,
    slots,
    minMinutes,
    maxMinutes,
    nowSlot,
}: {
    day: Weekday;
    isToday: boolean;
    isExpanded: boolean;
    onToggle: () => void;
    fastest: { slot: string; minutes: number } | null;
    row: Record<string, number | null>;
    slots: readonly string[];
    minMinutes: number;
    maxMinutes: number;
    nowSlot: string | null;
}) {
    const theme = useTheme();

    const borderColor = theme.dark
        ? "rgba(255,255,255,0.08)"
        : "rgba(0,0,0,0.06)";

    return (
        <Surface
            mode="flat"
            elevation={0}
            style={{
                borderRadius: 12,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor,
                backgroundColor: theme.colors.surface,
                overflow: "hidden",
            }}
        >
            <Pressable
                onPress={onToggle}
                android_ripple={{ color: theme.colors.surfaceVariant }}
                accessibilityRole="button"
                accessibilityState={{ expanded: isExpanded }}
                accessibilityLabel={`${day}${isToday ? ", today" : ""}${
                    fastest
                        ? `, fastest ${formatSlot12h(fastest.slot)} ${minutesLabel(fastest.minutes)}`
                        : ""
                }`}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
                <View
                    style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                        paddingVertical: 12,
                        paddingHorizontal: 14,
                    }}
                >
                    <Text
                        variant="titleMedium"
                        style={{
                            minWidth: 44,
                            color: theme.colors.onSurface,
                            fontWeight: "700",
                            letterSpacing: -0.2,
                        }}
                    >
                        {day}
                    </Text>
                    {isToday ? <TodayPill /> : null}
                    {fastest ? (
                        <Text
                            variant="bodySmall"
                            style={{
                                marginLeft: "auto",
                                color: theme.colors.onSurfaceVariant,
                            }}
                            numberOfLines={1}
                        >
                            Fastest {formatSlot12h(fastest.slot)} ·{" "}
                            <Text
                                style={{
                                    color: theme.dark
                                        ? "#34c759"
                                        : "#15803d",
                                    fontWeight: "700",
                                }}
                            >
                                {minutesLabel(fastest.minutes)}
                            </Text>
                        </Text>
                    ) : (
                        <Text
                            variant="bodySmall"
                            style={{
                                marginLeft: "auto",
                                color: theme.colors.onSurfaceVariant,
                            }}
                        >
                            No samples yet
                        </Text>
                    )}
                    <View style={{ marginLeft: 4, padding: 4 }}>
                        <Symbol
                            name={
                                isExpanded
                                    ? {
                                          ios: "chevron.up",
                                          android: "chevron-up",
                                      }
                                    : {
                                          ios: "chevron.down",
                                          android: "chevron-down",
                                      }
                            }
                            size={14}
                            color={theme.colors.onSurfaceVariant}
                            weight="semibold"
                        />
                    </View>
                </View>
            </Pressable>

            {isExpanded ? (
                <CellGrid
                    row={row}
                    slots={slots}
                    minMinutes={minMinutes}
                    maxMinutes={maxMinutes}
                    nowSlot={nowSlot}
                />
            ) : null}
        </Surface>
    );
}

/**
 * iOS-style "Today" badge — quiet tinted pill, not a Material chip.
 * Uses the brand primary as the tint so it picks up the user's
 * theme without any extra wiring.
 */
function TodayPill() {
    const theme = useTheme();
    return (
        <View
            style={{
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 999,
                backgroundColor: tintBg(theme.colors.primary, 0.18),
            }}
        >
            <Text
                style={{
                    fontSize: 11,
                    fontWeight: "700",
                    color: theme.colors.primary,
                    letterSpacing: 0.4,
                    textTransform: "uppercase",
                }}
            >
                Today
            </Text>
        </View>
    );
}

const CELL_MIN_WIDTH = 76;
const CELL_GAP = 6;

function CellGrid({
    row,
    slots,
    minMinutes,
    maxMinutes,
    nowSlot,
}: {
    row: Record<string, number | null>;
    slots: readonly string[];
    minMinutes: number;
    maxMinutes: number;
    nowSlot: string | null;
}) {
    const theme = useTheme();
    // Use the brand primary for the "NOW" badge so it picks up the
    // user's theme automatically — previously hardcoded to a deep
    // blue that no longer matches the lavender brand colour.
    const nowAccent = theme.colors.primary;
    return (
        <View
            style={{
                paddingHorizontal: 12,
                paddingBottom: 12,
                flexDirection: "row",
                flexWrap: "wrap",
                gap: CELL_GAP,
            }}
        >
            {slots.map((slot) => {
                const v = row[slot];
                const hasData = typeof v === "number";
                const isNow = nowSlot === slot;
                const bg = hasData
                    ? colorFor(v, minMinutes, maxMinutes)
                    : tintBg(theme.colors.onSurface, 0.06);
                return (
                    <View
                        key={slot}
                        style={{
                            minWidth: CELL_MIN_WIDTH,
                            flexGrow: 1,
                            flexBasis: CELL_MIN_WIDTH,
                            paddingVertical: 8,
                            paddingHorizontal: 6,
                            borderRadius: 8,
                            alignItems: "center",
                            backgroundColor: bg,
                            borderWidth: isNow ? 2 : 0,
                            borderColor: isNow ? nowAccent : "transparent",
                            position: "relative",
                        }}
                    >
                        <Text
                            style={{
                                fontSize: 12,
                                fontWeight: "700",
                                fontVariant: ["tabular-nums"],
                                color: hasData
                                    ? "#0b1020"
                                    : theme.colors.onSurfaceVariant,
                            }}
                        >
                            {formatSlot12h(slot)}
                        </Text>
                        <Text
                            style={{
                                fontSize: 11,
                                color: hasData
                                    ? "rgba(11, 16, 32, 0.78)"
                                    : theme.colors.onSurfaceVariant,
                                fontWeight: hasData ? "600" : "400",
                            }}
                        >
                            {hasData ? minutesLabel(v) : "…"}
                        </Text>
                        {isNow ? (
                            <View
                                style={{
                                    position: "absolute",
                                    top: -6,
                                    left: 6,
                                    paddingHorizontal: 5,
                                    paddingVertical: 1,
                                    borderRadius: 4,
                                    backgroundColor: nowAccent,
                                }}
                                pointerEvents="none"
                            >
                                <Text
                                    style={{
                                        fontSize: 9,
                                        fontWeight: "800",
                                        color: "#fff",
                                        letterSpacing: 0.4,
                                    }}
                                >
                                    NOW
                                </Text>
                            </View>
                        ) : null}
                    </View>
                );
            })}
        </View>
    );
}

function tintBg(hex: string, alpha: number): string {
    const m = hex.match(/^#([0-9a-f]{6})$/i);
    if (!m) return hex;
    const n = parseInt(m[1]!, 16);
    const r = (n >> 16) & 0xff;
    const g = (n >> 8) & 0xff;
    const b = n & 0xff;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

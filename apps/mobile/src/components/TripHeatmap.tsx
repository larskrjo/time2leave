/**
 * Phone heatmap: 7 rows (Mon–Sun) × 60 columns (15-min slots from
 * 06:00–20:45) of color-mapped tiles, plus a "best slot per day" chip
 * strip and a NOW indicator.
 *
 * Why `<View>` tiles instead of SVG / @nivo/heatmap?
 *   - 420 cells render in one frame on every modern phone.
 *   - We avoid pulling in `react-native-svg` + a charting lib for one
 *     trivial layout.
 *   - Touch targets are real rows/cells, so the OS handles haptics
 *     and accessibility for free.
 *
 * Color mapping, "best slot per day" reduction, and the LA-time NOW
 * bucket all come from `@time2leave/shared` so this screen is a
 * pixel-faithful sibling of the web heatmap.
 */
import { useEffect, useMemo, useState } from "react";
import {
    Pressable,
    StyleSheet,
    View,
    type LayoutChangeEvent,
} from "react-native";
import { Surface, Text, useTheme } from "react-native-paper";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming,
} from "react-native-reanimated";

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

const HOUR_LABELS = ["6a", "9a", "12p", "3p", "6p", "9p"];
const ROW_LABEL_WIDTH = 36;
const HOUR_LABEL_HEIGHT = 18;
const CELL_HEIGHT = 14;
const CELL_GAP = 1;

type Props = {
    heatmap: HeatmapPayload;
    direction: Direction;
    /** Show the pulsing "you are here" cell. Off for the splash demo. */
    showNow?: boolean;
};

export function TripHeatmap({ heatmap, direction, showNow = true }: Props) {
    const theme = useTheme();
    const [width, setWidth] = useState(0);
    const [selected, setSelected] = useState<{
        day: Weekday;
        slot: string;
    } | null>(null);

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

    const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
    const cellWidth = useMemo(() => {
        if (width <= 0) return 0;
        // 60 cells + 59 gaps + a row label gutter on the left.
        const usable = width - ROW_LABEL_WIDTH - CELL_GAP * (slots.length - 1);
        return Math.max(2, usable / slots.length);
    }, [width, slots.length]);

    const bests = useMemo(
        () => bestSlotPerDay(heatmap, direction),
        [heatmap, direction],
    );

    return (
        <Surface
            mode="flat"
            style={{
                padding: 12,
                borderRadius: 12,
                gap: 12,
                backgroundColor: theme.colors.surface,
            }}
        >
            {/* Best-slot-per-day chip strip. On phones this is the most
                important glanceable summary of the week. */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {bests.length === 0 ? (
                    <Text
                        variant="bodySmall"
                        style={{ color: theme.colors.onSurfaceVariant }}
                    >
                        Fastest slots will appear here once samples start
                        coming in.
                    </Text>
                ) : (
                    bests.map((b) => (
                        <BestChip
                            key={b.day}
                            day={b.day}
                            slot={b.slot}
                            minutes={b.minutes}
                            onPress={() =>
                                setSelected({ day: b.day, slot: b.slot })
                            }
                        />
                    ))
                )}
            </View>

            {/* Hour-axis labels above the grid. Six labels evenly spaced
                across the 06:00–21:00 range. */}
            <View
                style={{
                    flexDirection: "row",
                    paddingLeft: ROW_LABEL_WIDTH,
                    height: HOUR_LABEL_HEIGHT,
                }}
            >
                {HOUR_LABELS.map((label) => (
                    <Text
                        key={label}
                        variant="labelSmall"
                        style={{
                            flex: 1,
                            color: theme.colors.onSurfaceVariant,
                        }}
                    >
                        {label}
                    </Text>
                ))}
            </View>

            <View onLayout={onLayout} style={{ gap: CELL_GAP }}>
                {weekdays.map((day) => {
                    const row = directionPayload[day] ?? {};
                    return (
                        <View
                            key={day}
                            style={{
                                flexDirection: "row",
                                gap: CELL_GAP,
                                alignItems: "center",
                            }}
                        >
                            <Text
                                variant="labelSmall"
                                style={{
                                    width: ROW_LABEL_WIDTH,
                                    color:
                                        now?.day === day
                                            ? theme.colors.primary
                                            : theme.colors.onSurfaceVariant,
                                    fontWeight: now?.day === day ? "700" : "500",
                                }}
                            >
                                {day}
                            </Text>
                            {slots.map((slot) => {
                                const v = row[slot];
                                const sampled = typeof v === "number";
                                const bg = sampled
                                    ? colorFor(v, minMinutes, maxMinutes)
                                    : theme.colors.surfaceVariant;
                                const isNow =
                                    now?.day === day && now?.slot === slot;
                                const isSelected =
                                    selected?.day === day &&
                                    selected?.slot === slot;
                                return (
                                    <Pressable
                                        key={slot}
                                        onPress={() =>
                                            setSelected({ day, slot })
                                        }
                                        style={{
                                            width: cellWidth,
                                            height: CELL_HEIGHT,
                                            backgroundColor: bg,
                                            borderRadius: 1,
                                            opacity: sampled ? 1 : 0.5,
                                            borderWidth: isSelected ? 1 : 0,
                                            borderColor: theme.colors.primary,
                                        }}
                                    >
                                        {isNow ? <NowDot /> : null}
                                    </Pressable>
                                );
                            })}
                        </View>
                    );
                })}
            </View>

            {/* Selected cell read-out. Tapping a cell pins it; a second
                tap on the same cell or any other cell updates it. */}
            <Text
                variant="bodySmall"
                style={{ color: theme.colors.onSurfaceVariant }}
            >
                {selected
                    ? formatSelected(selected, directionPayload, direction)
                    : "Tap a cell to see the exact drive time."}
            </Text>
        </Surface>
    );
}

function formatSelected(
    sel: { day: Weekday; slot: string },
    directionPayload: HeatmapPayload["outbound"],
    direction: Direction,
): string {
    const v = directionPayload[sel.day]?.[sel.slot];
    const label = formatSlot12h(sel.slot);
    if (typeof v === "number") {
        return `${sel.day} · ${label} · ${direction} · ${minutesLabel(v)}`;
    }
    return `${sel.day} · ${label} · ${direction} · not sampled yet`;
}

function NowDot() {
    const scale = useSharedValue(1);
    useEffect(() => {
        scale.value = withRepeat(
            withSequence(
                withTiming(1.4, { duration: 700 }),
                withTiming(1, { duration: 700 }),
            ),
            -1,
            false,
        );
    }, [scale]);
    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));
    return (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
            <View
                style={{
                    flex: 1,
                    alignItems: "center",
                    justifyContent: "center",
                }}
            >
                <Animated.View
                    style={[
                        {
                            width: 6,
                            height: 6,
                            borderRadius: 3,
                            backgroundColor: "#1e40af",
                        },
                        animatedStyle,
                    ]}
                />
            </View>
        </View>
    );
}

function BestChip({
    day,
    slot,
    minutes,
    onPress,
}: {
    day: Weekday;
    slot: string;
    minutes: number;
    onPress: () => void;
}) {
    const theme = useTheme();
    return (
        <Pressable
            onPress={onPress}
            style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: theme.colors.outline,
                gap: 2,
                minWidth: 96,
            }}
        >
            <Text
                variant="labelSmall"
                style={{ color: theme.colors.onSurfaceVariant }}
            >
                {day} · best
            </Text>
            <Text variant="bodyMedium" style={{ fontWeight: "700" }}>
                {formatSlot12h(slot)}
            </Text>
            <Text variant="labelSmall" style={{ color: "#15803d" }}>
                {minutesLabel(minutes)}
            </Text>
        </Pressable>
    );
}

/** Re-export so the detail screen can render a hour-axis legend. */
export const HOUR_AXIS_LABELS = HOUR_LABELS;

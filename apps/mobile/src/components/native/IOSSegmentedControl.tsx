/**
 * Segmented control with iOS 26 native Liquid Glass styling.
 *
 * What this renders on iOS:
 *   A Phone-app-style unified Liquid Glass *track* with a sliding
 *   *thumb* that spring-animates between segments — built from real
 *   SwiftUI primitives via `@expo/ui`, embedded in a
 *   `UIHostingController`. The shape of the rendered tree on the
 *   device is:
 *
 *     ZStack(.leading) {
 *       Capsule().glassEffect(.regular)              // track
 *       Capsule().glassEffect(.regular.tint(brand))  // sliding thumb
 *         .frame(width: segmentWidth)
 *         .offset(x: selectedIndex * segmentWidth)
 *         .animation(.spring, value: selectedIndex)
 *       HStack { Button(label){ … }.buttonStyle(.plain) … } // hit targets
 *     }
 *
 *   Apple's framework handles the Liquid Glass material, the
 *   refraction, the dark/light adaptation, and — importantly — the
 *   spring animation on the thumb's `offset` whenever
 *   `selectedIndex` changes. Tap a segment, the thumb slides; same
 *   visual language as iOS 26's Phone, Mail and Notes apps.
 *
 * Why not just `UISegmentedControl`?
 *   iOS 26's automatic Liquid Glass adoption hasn't reached
 *   `UISegmentedControl` outside nav bars / toolbars — see
 *   `expo/expo#44739`. Both `@expo/ui`'s `Picker(.segmented)` and
 *   the community segmented-control package still render the *old*
 *   bordered style on iOS 26. So we compose the same visual from
 *   first principles using Apple's `glassEffect` modifier on
 *   `Capsule` shapes (the iOS 26 documented pattern).
 *
 * Why we measure width in JS:
 *   SwiftUI normally uses `GeometryReader` for "this view's
 *   percentage of available space" math, but `@expo/ui` doesn't
 *   expose `GeometryReader`. We measure the wrapping React Native
 *   `View`'s width via `onLayout` and pass concrete pixel widths to
 *   the SwiftUI `frame(width:)` and `offset(x:)` modifiers. Cheap
 *   and reliable; the host view rarely resizes.
 *
 * Fallbacks:
 *   - Android: the JS-built control below (track + sliding thumb
 *     using `LayoutAnimation`). SwiftUI obviously isn't available.
 *   - iOS < 26: `glassEffect` is a no-op on older OSs, falling back
 *     to plain capsules. Acceptable for the small slice of users
 *     we expect on iOS 25 or below.
 */
import { useEffect, useRef, useState } from "react";
import {
    LayoutAnimation,
    Platform,
    Pressable,
    StyleSheet,
    UIManager,
    View,
    type LayoutChangeEvent,
    type StyleProp,
    type ViewStyle,
} from "react-native";
import { Text, useTheme } from "react-native-paper";
import {
    Button,
    Capsule,
    Host,
    HStack,
    Text as SwiftUIText,
    ZStack,
} from "@expo/ui/swift-ui";
import {
    Animation,
    animation,
    buttonStyle,
    font,
    foregroundStyle,
    frame,
    glassEffect,
    offset,
} from "@expo/ui/swift-ui/modifiers";

if (
    Platform.OS === "android" &&
    UIManager.setLayoutAnimationEnabledExperimental
) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

export type SegmentedOption<V extends string> = {
    value: V;
    label: string;
};

type Props<V extends string> = {
    value: V;
    options: ReadonlyArray<SegmentedOption<V>>;
    onChange: (value: V) => void;
    style?: StyleProp<ViewStyle>;
};

export function IOSSegmentedControl<V extends string>(props: Props<V>) {
    if (Platform.OS === "ios") {
        return <NativeGlassSegmentedControl {...props} />;
    }
    return <FallbackSegmentedControl {...props} />;
}

/**
 * iOS 26 path — Phone-app-style sliding Liquid Glass segmented control.
 *
 * Composition (top-down inside the ZStack):
 *   1. Track:   full-width `Capsule` with `glassEffect(.regular)`.
 *   2. Thumb:   1/N-width `Capsule` with `glassEffect(.regular,
 *               tint: brand)`, positioned via `offset(x:)` and
 *               spring-animated against `selectedIndex`.
 *   3. Targets: an `HStack` of `Button(.plain)` hit-targets that
 *               just call `onChange`. They live above the thumb so
 *               taps register, and they each carry a `Text` label
 *               whose colour we flip when selected.
 *
 * The trick that makes the slide work without `GeometryReader`:
 *   We measure the React Native wrapper `View`'s width via
 *   `onLayout`, divide by `options.length`, and feed concrete
 *   pixel widths to SwiftUI's `frame(width:)` + `offset(x:)`. The
 *   `animation()` modifier ties the offset change to a spring
 *   keyed on `selectedIndex`, so SwiftUI does the easing.
 */
const TRACK_HEIGHT = 36;
const THUMB_INSET = 3;

function NativeGlassSegmentedControl<V extends string>({
    value,
    options,
    onChange,
    style,
}: Props<V>) {
    const theme = useTheme();
    const [width, setWidth] = useState(0);

    const selectedIdx = Math.max(
        0,
        options.findIndex((o) => o.value === value),
    );

    const onLayout = (e: LayoutChangeEvent) => {
        const w = e.nativeEvent.layout.width;
        if (w !== width) setWidth(w);
    };

    const segmentWidth = width > 0 ? width / options.length : 0;
    const thumbWidth = Math.max(0, segmentWidth - THUMB_INSET * 2);
    const thumbOffsetX = THUMB_INSET + segmentWidth * selectedIdx;
    const thumbHeight = TRACK_HEIGHT - THUMB_INSET * 2;

    return (
        <View
            onLayout={onLayout}
            style={[{ height: TRACK_HEIGHT }, style]}
        >
            {width > 0 ? (
                <Host style={{ flex: 1 }}>
                    <ZStack alignment="leading">
                        {/* Track — soft Liquid Glass capsule. */}
                        <Capsule
                            modifiers={[
                                frame({
                                    width,
                                    height: TRACK_HEIGHT,
                                }),
                                glassEffect({
                                    glass: { variant: "regular" },
                                    shape: "capsule",
                                }),
                            ]}
                        />

                        {/* Sliding thumb — prominent tinted glass
                            capsule. The `animation()` modifier turns
                            any change in `selectedIdx` into a spring
                            slide of the offset. */}
                        <Capsule
                            modifiers={[
                                frame({
                                    width: thumbWidth,
                                    height: thumbHeight,
                                }),
                                offset({ x: thumbOffsetX, y: THUMB_INSET }),
                                glassEffect({
                                    glass: {
                                        variant: "regular",
                                        tint: theme.colors.primary,
                                    },
                                    shape: "capsule",
                                }),
                                animation(
                                    Animation.spring({
                                        response: 0.35,
                                        dampingFraction: 0.85,
                                    }),
                                    selectedIdx,
                                ),
                            ]}
                        />

                        {/* Hit targets — plain (chromeless) buttons
                            laid out edge-to-edge. The label colour
                            flips to `onPrimary` when its segment is
                            the active one so the text reads against
                            the tinted thumb. */}
                        <HStack spacing={0}>
                            {options.map((opt) => {
                                const selected = opt.value === value;
                                return (
                                    <Button
                                        key={opt.value}
                                        onPress={() => {
                                            if (opt.value !== value)
                                                onChange(opt.value);
                                        }}
                                        modifiers={[
                                            buttonStyle("plain"),
                                            frame({
                                                width: segmentWidth,
                                                height: TRACK_HEIGHT,
                                            }),
                                            foregroundStyle(
                                                selected
                                                    ? theme.colors.onPrimary
                                                    : theme.colors
                                                          .onBackground,
                                            ),
                                        ]}
                                    >
                                        <SegmentLabel label={opt.label} />
                                    </Button>
                                );
                            })}
                        </HStack>
                    </ZStack>
                </Host>
            ) : null}
        </View>
    );
}

/**
 * Tiny SwiftUI `Text` wrapped to centre inside the parent `Button`
 * frame. We use `@expo/ui`'s Text rather than React Native's so it
 * stays inside the SwiftUI render tree (no UIKit↔SwiftUI bridging
 * for every label, which would defeat the point).
 */
function SegmentLabel({ label }: { label: string }) {
    return (
        <SwiftUIText
            modifiers={[font({ size: 13, weight: "semibold" })]}
        >
            {label}
        </SwiftUIText>
    );
}

/**
 * Android fallback — the same JS-built track + sliding thumb
 * approach we shipped before. Keeps Android visually consistent
 * with what users got pre-Liquid-Glass; SwiftUI obviously isn't
 * available outside iOS.
 */
function FallbackSegmentedControl<V extends string>({
    value,
    options,
    onChange,
    style,
}: Props<V>) {
    const theme = useTheme();
    const isDark = theme.dark;
    const trackBg = isDark
        ? "rgba(118, 118, 128, 0.24)"
        : "rgba(118, 118, 128, 0.12)";
    const thumbBg = isDark ? "#5e5e62" : "#FFFFFF";

    const selectedIdx = Math.max(
        0,
        options.findIndex((o) => o.value === value),
    );

    const prevIdx = useRef(selectedIdx);
    useEffect(() => {
        if (prevIdx.current !== selectedIdx) {
            LayoutAnimation.configureNext({
                duration: 220,
                update: { type: "easeInEaseOut", property: "scaleXY" },
            });
            prevIdx.current = selectedIdx;
        }
    }, [selectedIdx]);

    return (
        <View
            style={[
                {
                    flexDirection: "row",
                    backgroundColor: trackBg,
                    borderRadius: 9,
                    padding: 2,
                    alignSelf: "stretch",
                    position: "relative",
                    minHeight: 36,
                },
                style,
            ]}
        >
            <View
                pointerEvents="none"
                style={[StyleSheet.absoluteFillObject, { padding: 2 }]}
            >
                <View
                    style={{
                        width: `${100 / options.length}%`,
                        marginLeft: `${(100 / options.length) * selectedIdx}%`,
                        height: "100%",
                        borderRadius: 7,
                        backgroundColor: thumbBg,
                    }}
                />
            </View>

            {options.map((opt) => {
                const selected = opt.value === value;
                return (
                    <Pressable
                        key={opt.value}
                        onPress={() => {
                            if (opt.value !== value) onChange(opt.value);
                        }}
                        style={({ pressed }) => ({
                            flex: 1,
                            alignItems: "center",
                            justifyContent: "center",
                            paddingVertical: 6,
                            paddingHorizontal: 8,
                            opacity: pressed && !selected ? 0.5 : 1,
                        })}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={opt.label}
                    >
                        <Text
                            variant="labelLarge"
                            numberOfLines={1}
                            style={{
                                color: theme.colors.onBackground,
                                fontWeight: selected ? "600" : "500",
                                fontSize: 13,
                            }}
                        >
                            {opt.label}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

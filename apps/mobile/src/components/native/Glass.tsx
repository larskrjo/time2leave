/**
 * Liquid Glass primitives.
 *
 * `expo-glass-effect` ships native `UIVisualEffectView`-based views
 * that adopt iOS 26's Liquid Glass material. The native module is
 * iOS-only AND only available when running iOS 26 or newer, so every
 * call site has to gate on `isGlassEffectAPIAvailable()` to avoid
 * crashing older devices and Android. We do that gating once here.
 *
 * Two opinionated wrappers:
 *
 *   <GlassSurface> — a card / panel / chrome surface. On iOS 26 it's
 *                    a `GlassView`. Anywhere else it's a plain `View`
 *                    with the `theme.colors.surface` background and
 *                    an outline so the layout still looks intentional
 *                    rather than empty.
 *
 *   <GlassPill>    — a tall (52 px) full-width pill button used for
 *                    primary CTAs. iOS 26 gets a real Liquid Glass
 *                    material; older iOS / Android gets a flat
 *                    brand-tinted pill — same shape and tap target.
 *
 * Why no `tintColor` by default?
 * `tintColor` on a `GlassView` *colourises* the entire material, so
 * passing the brand primary turns the pill into a near-opaque blue
 * blob — the opposite of "glass". To stay true to Apple's iOS 26
 * Liquid Glass aesthetic the pill is left tint-less by default and
 * the brand colour shows up *only* in the icon + label inside it.
 * Callers that want a tinted CTA can opt in with `tone="accent"`
 * (subtle white tint) or pass a custom `tintColor` directly.
 */
import {
    Pressable,
    StyleSheet,
    View,
    type GestureResponderEvent,
    type StyleProp,
    type ViewStyle,
} from "react-native";
import { useTheme } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import {
    GlassView,
    isGlassEffectAPIAvailable,
} from "expo-glass-effect";

/**
 * Cached single check — `isGlassEffectAPIAvailable()` is a synchronous
 * native call, but evaluating it once on module load avoids any
 * per-render bridge crossings. The result is true only when the
 * device is running iOS 26+ AND the native module is linked.
 */
const HAS_GLASS = isGlassEffectAPIAvailable();

/** Whether Liquid Glass material is available on the current device. */
export function hasLiquidGlass(): boolean {
    return HAS_GLASS;
}

/**
 * Soft fade overlay that masks scrolling content as it approaches a
 * screen edge — gives the iOS 26 "content disappears into the chrome"
 * feel that Apple's Notes / Reminders / Mail apps have above their
 * floating CTAs and below their large-title nav bars.
 *
 * The fade is rendered as a `LinearGradient` from transparent → the
 * provided `color` (defaults to `theme.colors.background`). It sits
 * absolutely-positioned at the named `edge` and is `pointerEvents:
 * "none"` so it never blocks taps on whatever's underneath.
 *
 * Use this in tandem with `GlassPill` for the bottom-floating CTA
 * pattern: the fade gradient erases content above the pill, the pill
 * itself sits on top with its own Liquid Glass material.
 *
 *     <ScrollEdgeFade edge="bottom" height={insets.bottom + 80} />
 *     <View style={{ position: "absolute", bottom: 12, ... }}>
 *         <GlassPill ...>...</GlassPill>
 *     </View>
 */
type ScrollEdgeFadeProps = {
    /** Which screen edge to fade. Defaults to `"bottom"`. */
    edge?: "top" | "bottom";
    /** Pixel height of the fade region. Defaults to 80. */
    height?: number;
    /**
     * Final colour the fade resolves to. Defaults to the theme
     * background — pick something else only when the screen has a
     * non-background area at the relevant edge (e.g. a tinted hero).
     */
    color?: string;
};

export function ScrollEdgeFade({
    edge = "bottom",
    height = 80,
    color,
}: ScrollEdgeFadeProps) {
    const theme = useTheme();
    const target = color ?? theme.colors.background;
    // Append `00` alpha so we get the same RGB but fully transparent.
    // Hex inputs only — matches the rest of the theme tokens.
    const transparent = target.startsWith("#") ? `${target}00` : "transparent";
    const colors =
        edge === "bottom"
            ? ([transparent, target] as const)
            : ([target, transparent] as const);
    const positionStyle: ViewStyle =
        edge === "bottom"
            ? { position: "absolute", left: 0, right: 0, bottom: 0, height }
            : { position: "absolute", left: 0, right: 0, top: 0, height };
    return (
        <LinearGradient
            pointerEvents="none"
            colors={colors as unknown as [string, string]}
            style={positionStyle}
        />
    );
}

/**
 * Liquid Glass background for the navigation bar.
 *
 * Visual model — mirror image of the bottom `ScrollEdgeFade`:
 *
 *   ┌─────────────────────────┐  ◀ status-bar zone, fully opaque
 *   │■■■■■■■■■■■■■■■■■■■■■■■■■│    background colour (clean chrome)
 *   │░░░░░░░░░░░░░░░░░░░░░░░░░│  ◀ gradient blends solid → glass
 *   │~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~│  ◀ Liquid Glass material visible
 *   │~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~│    (frosts content scrolling under)
 *   └─────────────────────────┘  ◀ NO hairline / border; pure fade
 *
 * Plumbed in via the Stack's `headerBackground` slot together with
 * `headerTransparent: true` so the screen's scrolling content can
 * pass *under* the bar. On iOS 26+ that produces Apple's signature
 * scroll-edge effect — and our overlay gradient gives it the same
 * soft fade language we use at the bottom: chrome at the top,
 * gradually dissolving into bare glass at the bottom edge so
 * scrolling content disappears into the bar without a hard line.
 *
 * On iOS < 26 / Android there's no Liquid Glass material, so we
 * just render the gradient on its own — solid bg at top, fading to
 * transparent at the bottom. Content underneath shows through
 * directly at the very bottom edge; the gradient masks it as it
 * moves up into the chrome.
 *
 * The component fills its parent (`StyleSheet.absoluteFill`) so it
 * works for both the regular bar height and the expanded
 * large-title height — react-native-screens passes the right frame.
 */
export function GlassNavBackground() {
    const theme = useTheme();
    const target = theme.colors.background;
    const transparent = target.startsWith("#") ? `${target}00` : "transparent";

    return (
        <View style={StyleSheet.absoluteFill}>
            {/* Liquid Glass material on iOS 26+ — refracts and frosts
                content scrolling underneath. Sits at the bottom of the
                z-stack so the gradient overlay can mask its top
                portion to keep the status-bar zone clean. */}
            {HAS_GLASS ? (
                <GlassView
                    glassEffectStyle="regular"
                    isInteractive={false}
                    style={StyleSheet.absoluteFill}
                />
            ) : null}

            {/* Solid → transparent gradient overlay. At the top
                (status-bar area) the chrome is fully opaque
                background colour — Apple keeps the status zone
                visually quiet. As you go down through the bar the
                overlay fades out, revealing the Liquid Glass (or the
                bare scroll content on older platforms) at the
                bottom edge. No `borderColor`, no hairline — the
                gradient itself IS the edge. */}
            <LinearGradient
                pointerEvents="none"
                colors={[target, target, transparent] as unknown as [string, string, string]}
                locations={[0, 0.4, 1] as unknown as [number, number, number]}
                style={StyleSheet.absoluteFill}
            />
        </View>
    );
}

type GlassSurfaceProps = {
    /** Glass material style. Defaults to `regular`. */
    glassEffectStyle?: "clear" | "regular";
    /** Optional tint colour — bleeds through the material on iOS 26+. */
    tintColor?: string;
    /** Whether the glass should react to touch (subtle ripple). */
    isInteractive?: boolean;
    /** Force the glass colour scheme regardless of the system setting. */
    colorScheme?: "auto" | "light" | "dark";
    style?: StyleProp<ViewStyle>;
    children?: React.ReactNode;
};

export function GlassSurface({
    glassEffectStyle = "regular",
    tintColor,
    isInteractive = false,
    colorScheme = "auto",
    style,
    children,
}: GlassSurfaceProps) {
    const theme = useTheme();
    if (HAS_GLASS) {
        return (
            <GlassView
                glassEffectStyle={glassEffectStyle}
                tintColor={tintColor}
                isInteractive={isInteractive}
                colorScheme={colorScheme}
                style={style}
            >
                {children}
            </GlassView>
        );
    }
    // Fallback: solid surface with outline so the visual hierarchy
    // still reads on iOS < 26 / Android.
    return (
        <View
            style={[
                {
                    backgroundColor: theme.colors.surface,
                    borderWidth: 1,
                    borderColor: theme.colors.outline,
                },
                style,
            ]}
        >
            {children}
        </View>
    );
}

/**
 * Visual variant for `GlassPill`.
 *   - `glass`  → tint-less Liquid Glass (most "glass" looking; default)
 *   - `accent` → subtle brand tint (very low alpha) so it still reads
 *                as a primary CTA without becoming an opaque colour
 *                block
 *   - `solid`  → no glass at all, just a solid brand pill (used as the
 *                fallback shape on iOS < 26 / Android, or when callers
 *                explicitly want a non-glass CTA)
 */
export type GlassPillTone = "glass" | "accent" | "solid";

type GlassPillProps = {
    onPress?: (event: GestureResponderEvent) => void;
    disabled?: boolean;
    /** Visual variant — see `GlassPillTone` docstring. Defaults to `glass`. */
    tone?: GlassPillTone;
    /** Outer style (e.g. `position: 'absolute'`, `width: '100%'`). */
    style?: StyleProp<ViewStyle>;
    /** Inner content style. Default padding is iOS-comfortable (52 px tall). */
    contentStyle?: StyleProp<ViewStyle>;
    accessibilityLabel?: string;
    children?: React.ReactNode;
};

export function GlassPill({
    onPress,
    disabled = false,
    tone = "glass",
    style,
    contentStyle,
    accessibilityLabel,
    children,
}: GlassPillProps) {
    const theme = useTheme();
    const isDark = theme.dark;

    // On iOS 26+ the GlassView itself draws the material; on older
    // platforms we paint a solid pill so the CTA still looks like
    // something tappable. Both paths share the same Pressable shell
    // so the press feedback feels identical.
    const wantsGlass = HAS_GLASS && tone !== "solid";

    // Subtle tint values — picked so Liquid Glass still reads as glass
    // (i.e. mostly transparent) but the CTA carries a hint of the
    // brand primary. The dark-theme primary (`#93b0ff`) is already a
    // pale lavender, so we go even lighter on dark mode to avoid the
    // pill turning into an opaque purple blob.
    const accentTint = isDark
        ? "rgba(255, 255, 255, 0.10)"
        : "rgba(255, 255, 255, 0.20)";
    const solidBg = theme.colors.primary;

    return (
        <Pressable
            onPress={disabled ? undefined : onPress}
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            accessibilityLabel={accessibilityLabel}
            style={({ pressed }) => [
                {
                    borderRadius: 28,
                    overflow: "hidden",
                    opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
                    // Subtle elevation so the pill reads as floating
                    // above the scroll view (iOS uses very soft
                    // shadows on glass chrome).
                    shadowColor: "#000",
                    shadowOpacity: isDark ? 0.5 : 0.18,
                    shadowRadius: 18,
                    shadowOffset: { width: 0, height: 8 },
                    elevation: 6,
                },
                style,
            ]}
        >
            {wantsGlass ? (
                <GlassSurface
                    glassEffectStyle="regular"
                    tintColor={
                        tone === "accent" ? accentTint : undefined
                    }
                    isInteractive
                    style={[
                        {
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 8,
                            minHeight: 52,
                            paddingHorizontal: 24,
                            // The native GlassView ignores
                            // backgroundColor; this is a no-op there
                            // and ignored on the fallback path too.
                            backgroundColor: "transparent",
                        },
                        contentStyle,
                    ]}
                >
                    {/* Hairline border just inside the pill so it has
                        a defined edge against very dark / very bright
                        backgrounds — Apple does this on glass chips
                        in iOS 26 (see Apple Music's "Listen Now"
                        category pills). */}
                    <View
                        pointerEvents="none"
                        style={[
                            StyleSheet.absoluteFillObject,
                            {
                                borderRadius: 28,
                                borderWidth: StyleSheet.hairlineWidth,
                                borderColor: isDark
                                    ? "rgba(255,255,255,0.18)"
                                    : "rgba(255,255,255,0.45)",
                            },
                        ]}
                    />
                    {children}
                </GlassSurface>
            ) : (
                <View
                    style={[
                        {
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 8,
                            minHeight: 52,
                            paddingHorizontal: 24,
                            backgroundColor: solidBg,
                            borderRadius: 28,
                        },
                        contentStyle,
                    ]}
                >
                    {children}
                </View>
            )}
        </Pressable>
    );
}

/**
 * Subtle iOS-style status pill — used to surface read-only state like
 * a quota count, a sync time, or a flag. Visually quieter than Paper's
 * MD3 `Chip` (which has a heavy outline / filled background) and
 * matches Apple's tinted "label" look from Settings or Mail.
 *
 * Layout:
 *
 *   ┌──────────────────────┐
 *   │  [icon] 12 / 100      │
 *   └──────────────────────┘
 *
 * - Background: thin tint of the accent colour (`tone === "default"`
 *   → onSurfaceVariant) or the error colour (`tone === "warning"`
 *   when the count is at the cap).
 * - No border. Apple uses borderless tinted pills for ambient state.
 * - Text uses tabular numerals so "12 / 100" doesn't shift width as
 *   the count climbs.
 */
import type { ComponentProps } from "react";
import { View } from "react-native";
import { Text, useTheme } from "react-native-paper";

import { Symbol } from "./Symbol";

type SymbolProps = ComponentProps<typeof Symbol>;

type Props = {
    /** SF symbol on iOS, MCI glyph on Android. */
    icon?: SymbolProps["name"];
    /** Body text — kept short ("12 / 100", "synced 2m ago"). */
    label: string;
    /** `warning` tints the pill red to flag at-cap / error state. */
    tone?: "default" | "warning";
};

export function IOSStatusPill({ icon, label, tone = "default" }: Props) {
    const theme = useTheme();
    const isWarning = tone === "warning";
    const accent = isWarning ? theme.colors.error : theme.colors.onSurfaceVariant;
    const bg = isWarning
        ? withAlpha(theme.colors.error, theme.dark ? 0.22 : 0.12)
        : withAlpha(theme.colors.onSurfaceVariant, theme.dark ? 0.18 : 0.1);

    return (
        <View
            style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 999,
                backgroundColor: bg,
            }}
        >
            {icon ? (
                <Symbol name={icon} size={11} color={accent} weight="semibold" />
            ) : null}
            <Text
                style={{
                    color: accent,
                    fontSize: 12,
                    fontWeight: "600",
                    fontVariant: ["tabular-nums"],
                    letterSpacing: 0.1,
                }}
            >
                {label}
            </Text>
        </View>
    );
}

function withAlpha(hex: string, alpha: number): string {
    if (!hex.startsWith("#") || hex.length !== 7) {
        // Anything that isn't 6-char hex (rgba(), named colour) we
        // can't rebuild safely; pass through and let RN ignore the
        // alpha hint. The brand palette only ships hex tokens, so in
        // practice we never hit this fallback.
        return hex;
    }
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 0xff;
    const g = (n >> 8) & 0xff;
    const b = n & 0xff;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Phone equivalent of the web `PageHero` component
 * (`apps/web/app/components/motion.tsx`).
 *
 * Layout (top to bottom):
 *
 *   [eyebrow] (small caps, primary tint)
 *   [headline ...accent... rest]   (large, 800 weight; the `accent`
 *                                    word is rendered in the brand
 *                                    secondary color to mimic the web's
 *                                    blue→orange gradient on words like
 *                                    "saved" / "trips")
 *   [sub] (body, onSurfaceVariant)
 *
 * The hero is intentionally text-only — buttons, chips, and other
 * actions live below it on the page rather than inside the hero, which
 * keeps tap targets predictable on small screens.
 */
import { View, type StyleProp, type ViewStyle } from "react-native";
import { Text, useTheme } from "react-native-paper";

type Props = {
    /** Small caps overline above the headline (e.g. `Hi, Lars`). */
    eyebrow?: string;
    /** Headline text. The `accent` word, if any, is highlighted. */
    headline: string;
    /**
     * Word inside `headline` to render in the secondary brand color.
     * The match is case-sensitive and only the *first* occurrence is
     * highlighted.
     */
    accent?: string;
    /** Optional sub-headline rendered in the muted body color. */
    sub?: string;
    style?: StyleProp<ViewStyle>;
};

export function PageHero({ eyebrow, headline, accent, sub, style }: Props) {
    const theme = useTheme();

    return (
        <View style={[{ gap: 8 }, style]}>
            {eyebrow ? (
                <Text
                    variant="labelMedium"
                    style={{
                        color: theme.colors.primary,
                        letterSpacing: 1.5,
                        textTransform: "uppercase",
                        fontWeight: "700",
                    }}
                >
                    {eyebrow}
                </Text>
            ) : null}
            <Text
                variant="headlineMedium"
                style={{
                    color: theme.colors.onBackground,
                    fontWeight: "800",
                    lineHeight: 36,
                }}
            >
                {renderHeadline(headline, accent, theme.colors.secondary)}
            </Text>
            {sub ? (
                <Text
                    variant="bodyMedium"
                    style={{
                        color: theme.colors.onSurfaceVariant,
                        lineHeight: 20,
                    }}
                >
                    {sub}
                </Text>
            ) : null}
        </View>
    );
}

function renderHeadline(
    headline: string,
    accent: string | undefined,
    accentColor: string,
) {
    if (!accent) return headline;
    const idx = headline.indexOf(accent);
    if (idx < 0) return headline;
    const before = headline.slice(0, idx);
    const after = headline.slice(idx + accent.length);
    return (
        <>
            {before}
            <Text style={{ color: accentColor, fontWeight: "800" }}>
                {accent}
            </Text>
            {after}
        </>
    );
}

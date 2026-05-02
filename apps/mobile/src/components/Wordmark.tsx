/**
 * "time2leave" wordmark with the italic gradient "2", matching the
 * logo treatment on the web splash + header.
 */
import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "react-native-paper";

import { BRAND_GRADIENT } from "~/theme";

type Props = {
    size?: number;
    style?: StyleProp<ViewStyle>;
};

/**
 * Renders the wordmark as plain Text. The italic "2" carries the
 * dominant warm tone from the brand gradient (`BRAND_GRADIENT[1]`),
 * which is what reads first on the web hero too. A future iteration
 * could swap in `@react-native-masked-view` for the full
 * blue→orange-on-glyph gradient if pixel parity is desired.
 */
export function Wordmark({ size = 22, style }: Props) {
    const theme = useTheme();
    return (
        <View
            style={[
                {
                    flexDirection: "row",
                    alignItems: "baseline",
                },
                style,
            ]}
        >
            <Text
                style={{
                    fontSize: size,
                    fontWeight: "800",
                    color: theme.colors.onBackground,
                    letterSpacing: -0.4,
                }}
            >
                time
            </Text>
            <Text
                style={{
                    fontSize: size,
                    fontWeight: "800",
                    fontStyle: "italic",
                    color: BRAND_GRADIENT[1],
                    letterSpacing: -0.4,
                }}
            >
                2
            </Text>
            <Text
                style={{
                    fontSize: size,
                    fontWeight: "800",
                    color: theme.colors.onBackground,
                    letterSpacing: -0.4,
                }}
            >
                leave
            </Text>
        </View>
    );
}

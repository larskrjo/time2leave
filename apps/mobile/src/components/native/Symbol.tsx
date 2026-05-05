/**
 * Cross-platform icon that renders an SF Symbol on iOS (via
 * `expo-symbols`, which is a thin wrapper over `UIImage(systemName:)`)
 * and falls back to a MaterialCommunityIcon-via-react-native-paper
 * `IconButton` glyph on Android.
 *
 * SF Symbols give us instant native polish — variable weight, optical
 * scaling, hierarchical / multicolor variants, and the same shapes
 * the rest of iOS uses for its system buttons. Doing this for every
 * icon in the app is the cheapest single change that makes a React
 * Native app stop looking like "a React Native app".
 *
 * Usage — pass a single `name` and we'll resolve it on each platform:
 *
 *     <Symbol name={{ ios: "trash", android: "trash-can-outline" }}
 *             size={22}
 *             color={theme.colors.error} />
 *
 * For brevity, you can also pass a single string and we'll use it as
 * the SF symbol on iOS and as the MCI name on Android (works whenever
 * the names happen to match, e.g. "person", "gear", "bell").
 *
 * Where this lives: `~/components/native/` is the bucket for components
 * that have meaningfully different iOS implementations (Glass, SF
 * Symbols, segmented controls). Plain cross-platform components stay
 * one level up in `~/components/`.
 */
import type { ComponentProps } from "react";
import { Platform, View, type StyleProp, type ViewStyle } from "react-native";
import { SymbolView, type SFSymbol } from "expo-symbols";
import { Icon } from "react-native-paper";

type IconName = ComponentProps<typeof Icon>["source"];

type Props = {
    /**
     * Symbol name. Pass a string and we use it on both platforms (only
     * works when iOS and MCI names match), or pass `{ ios, android }`
     * to map them explicitly. Most of the time you want the explicit
     * form so the iOS rendering picks a real SF symbol.
     */
    name:
        | SFSymbol
        | {
              ios: SFSymbol;
              android: IconName;
          };
    /** Square pixel size. Default 22 (iOS toolbar default). */
    size?: number;
    /** Tint color — applied to all symbol layers on iOS, to the glyph on Android. */
    color?: string;
    /** SF Symbol weight (iOS only). */
    weight?:
        | "ultraLight"
        | "thin"
        | "light"
        | "regular"
        | "medium"
        | "semibold"
        | "bold"
        | "heavy"
        | "black";
    /** SF Symbol render mode (iOS only). Default 'monochrome'. */
    type?: "monochrome" | "hierarchical" | "palette" | "multicolor";
    style?: StyleProp<ViewStyle>;
    accessibilityLabel?: string;
};

export function Symbol({
    name,
    size = 22,
    color,
    weight = "regular",
    type = "monochrome",
    style,
    accessibilityLabel,
}: Props) {
    if (Platform.OS === "ios") {
        const iosName: SFSymbol =
            typeof name === "string" ? name : name.ios;
        return (
            <SymbolView
                name={iosName}
                size={size}
                tintColor={color}
                weight={weight}
                type={type}
                style={style}
                accessibilityLabel={accessibilityLabel}
            />
        );
    }
    // Android: Paper's `Icon` renders MaterialCommunityIcons by default.
    const androidName: IconName =
        typeof name === "string" ? name : name.android;
    return (
        <View
            style={[{ width: size, height: size }, style]}
            accessibilityLabel={accessibilityLabel}
        >
            <Icon source={androidName} size={size} color={color} />
        </View>
    );
}

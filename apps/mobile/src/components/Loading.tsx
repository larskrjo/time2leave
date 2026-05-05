/**
 * Centered, very-quiet ActivityIndicator — shown while the
 * AuthProvider hydrates the stored token and pings /me, or while a
 * route is fetching its initial data.
 *
 * Visual choices:
 *   - Small spinner, secondary tint. iOS apps avoid the giant brand
 *     spinner during boot; you usually see a near-invisible spinner
 *     against the launch screen.
 *   - Optional label below the spinner. Kept small (`bodySmall`) so
 *     it reads as a status hint, not a headline.
 */
import { View } from "react-native";
import { ActivityIndicator, Text, useTheme } from "react-native-paper";

export function Loading({ label }: { label?: string }) {
    const theme = useTheme();
    return (
        <View
            style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: theme.colors.background,
                gap: 12,
            }}
        >
            <ActivityIndicator
                size="small"
                color={theme.colors.onSurfaceVariant}
            />
            {label ? (
                <Text
                    variant="bodySmall"
                    style={{ color: theme.colors.onSurfaceVariant }}
                >
                    {label}
                </Text>
            ) : null}
        </View>
    );
}

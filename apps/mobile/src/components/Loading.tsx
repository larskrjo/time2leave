/**
 * Centered ActivityIndicator with the brand wordmark — shown while
 * the AuthProvider hydrates the stored token and pings /me.
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
                gap: 16,
            }}
        >
            <ActivityIndicator size="large" color={theme.colors.primary} />
            {label ? (
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                    {label}
                </Text>
            ) : null}
        </View>
    );
}

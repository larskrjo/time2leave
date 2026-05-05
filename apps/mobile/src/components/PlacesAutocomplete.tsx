/**
 * Google Places autocomplete input for the new-trip form.
 *
 * Uses `react-native-google-places-autocomplete`, which calls the
 * Maps Places HTTP API directly with the configured key (no Google
 * SDK required). The Maps API key is a *required* env var validated
 * by `loadEnvOnce()` at boot, so this component never has to worry
 * about a missing key — by the time it mounts, the key is guaranteed.
 *
 * The library renders its own `FlatList` of suggestions, which
 * conflicts visually with our parent `ScrollView`. We wrap the field
 * in a fixed-height container and let suggestions overflow it (they
 * absolutely position above the next field) — same UX as the web
 * version.
 *
 * Visual: matches the iOS-native field style we use in the rest of
 * the app — soft tinted background, rounded corners, no Material
 * notch border.
 */
import { StyleSheet, View } from "react-native";
import { useTheme } from "react-native-paper";
import { GooglePlacesAutocomplete } from "react-native-google-places-autocomplete";

import { requireEnv } from "~/config/env";

type Props = {
    label: string;
    placeholder?: string;
    value: string;
    onChange: (value: string) => void;
};

export function PlacesAutocomplete({
    label,
    placeholder,
    value,
    onChange,
}: Props) {
    const theme = useTheme();
    const apiKey = requireEnv().googleMapsApiKey;

    const fieldBg = theme.dark
        ? "rgba(118,118,128,0.24)"
        : "rgba(118,118,128,0.12)";

    return (
        <View style={{ minHeight: 60, zIndex: 1 }}>
            <GooglePlacesAutocomplete
                placeholder={placeholder ?? label}
                fetchDetails={false}
                onPress={(_, details) => {
                    onChange(
                        details?.formatted_address ??
                            (details as { description?: string })?.description ??
                            "",
                    );
                }}
                textInputProps={{
                    value,
                    onChangeText: onChange,
                    placeholderTextColor: theme.colors.onSurfaceVariant,
                }}
                query={{ key: apiKey, language: "en" }}
                enablePoweredByContainer={false}
                styles={{
                    textInput: {
                        height: 50,
                        fontSize: 16,
                        backgroundColor: fieldBg,
                        color: theme.colors.onSurface,
                        borderRadius: 12,
                        paddingHorizontal: 14,
                    },
                    listView: {
                        marginTop: 4,
                        backgroundColor: theme.colors.surface,
                        borderRadius: 12,
                        borderWidth: StyleSheet.hairlineWidth,
                        borderColor: theme.dark
                            ? "rgba(255,255,255,0.12)"
                            : "rgba(0,0,0,0.08)",
                        overflow: "hidden",
                    },
                    row: {
                        backgroundColor: theme.colors.surface,
                        paddingVertical: 12,
                        paddingHorizontal: 14,
                    },
                    description: {
                        color: theme.colors.onSurface,
                        fontSize: 15,
                    },
                    separator: {
                        height: StyleSheet.hairlineWidth,
                        backgroundColor: theme.dark
                            ? "rgba(255,255,255,0.08)"
                            : "rgba(60,60,67,0.18)",
                    },
                }}
            />
        </View>
    );
}

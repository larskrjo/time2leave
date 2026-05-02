/**
 * Google Places autocomplete input for the new-trip form.
 *
 * Uses `react-native-google-places-autocomplete`, which calls the
 * Maps Places HTTP API directly with the configured key (no Google
 * SDK required). Falls back to a plain `TextInput` when the API key
 * is missing — that's the right behavior for first-boot dev and for
 * forks that don't want to wire up Google Cloud.
 *
 * The `react-native-google-places-autocomplete` library renders its
 * suggestions inside its own `FlatList`, which conflicts visually
 * with our parent `ScrollView`. We wrap the field in a fixed-height
 * container and let the suggestions overflow it (they'll absolutely
 * position above the next field) — same UX as the web version.
 */
import { View } from "react-native";
import { HelperText, TextInput, useTheme } from "react-native-paper";
import { GooglePlacesAutocomplete } from "react-native-google-places-autocomplete";

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

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

    if (!API_KEY) {
        return (
            <View>
                <TextInput
                    label={label}
                    placeholder={placeholder}
                    value={value}
                    onChangeText={onChange}
                    mode="outlined"
                    autoCapitalize="words"
                />
                <HelperText type="info" visible padding="none">
                    Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY to enable autocomplete.
                </HelperText>
            </View>
        );
    }

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
                query={{ key: API_KEY, language: "en" }}
                enablePoweredByContainer={false}
                styles={{
                    textInput: {
                        height: 56,
                        backgroundColor: theme.colors.surface,
                        color: theme.colors.onSurface,
                        borderRadius: 4,
                        borderWidth: 1,
                        borderColor: theme.colors.outline,
                        paddingHorizontal: 16,
                    },
                    listView: {
                        backgroundColor: theme.colors.surface,
                        borderColor: theme.colors.outline,
                        borderWidth: 1,
                        borderRadius: 4,
                    },
                }}
            />
        </View>
    );
}

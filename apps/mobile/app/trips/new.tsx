/**
 * "New trip" form — phone equivalent of `apps/web/app/routes/trips.new.tsx`.
 *
 * Two address fields (Google Places autocomplete on both, falling
 * back to plain text when the Maps API key is missing) plus an
 * optional name. POST /api/v1/trips, then push to the new trip's
 * detail page so the user watches their heatmap fill in.
 *
 * Mutation cap (HTTP 429) is rendered as a warning rather than an
 * error so users don't think the app is broken when they hit the
 * weekly cost-control limit.
 */
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import {
    Banner,
    Button,
    HelperText,
    Text,
    TextInput,
    useTheme,
} from "react-native-paper";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
    createTrip as sharedCreateTrip,
    isApiError,
} from "@time2leave/shared";

import { API, apiFetch } from "~/api/client";
import { PlacesAutocomplete } from "~/components/PlacesAutocomplete";

export default function NewTrip() {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();

    const [name, setName] = useState("");
    const [origin, setOrigin] = useState("");
    const [destination, setDestination] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [errorIsCap, setErrorIsCap] = useState(false);

    const createMutation = useMutation({
        mutationFn: () =>
            sharedCreateTrip(apiFetch, API, {
                name: name.trim() || null,
                origin_address: origin.trim(),
                destination_address: destination.trim(),
            }),
        onSuccess: async (trip) => {
            await queryClient.invalidateQueries({ queryKey: ["trips"] });
            await queryClient.invalidateQueries({ queryKey: ["trips", "quota"] });
            router.replace({
                pathname: "/trips/[tripId]",
                params: { tripId: trip.id },
            });
        },
        onError: (err) => {
            if (isApiError(err)) {
                setError(err.detail);
                setErrorIsCap(err.status === 429);
            } else {
                setError("Failed to create trip");
                setErrorIsCap(false);
            }
        },
    });

    const trimmedOrigin = origin.trim();
    const trimmedDestination = destination.trim();
    const sameAddress =
        trimmedOrigin.length > 0 &&
        trimmedOrigin.toLowerCase() === trimmedDestination.toLowerCase();
    const submitDisabled =
        createMutation.isPending ||
        trimmedOrigin.length < 3 ||
        trimmedDestination.length < 3 ||
        sameAddress;

    return (
        <>
            <Stack.Screen options={{ title: "New trip" }} />
            <ScrollView
                contentContainerStyle={{
                    padding: 20,
                    paddingBottom: insets.bottom + 24,
                    gap: 16,
                }}
                keyboardShouldPersistTaps="handled"
            >
                <View style={{ gap: 4 }}>
                    <Text
                        variant="labelMedium"
                        style={{ color: theme.colors.primary, letterSpacing: 1.2 }}
                    >
                        NEW TRIP
                    </Text>
                    <Text variant="headlineSmall" style={{ fontWeight: "800" }}>
                        Name the drive you repeat
                    </Text>
                    <Text
                        variant="bodyMedium"
                        style={{ color: theme.colors.onSurfaceVariant }}
                    >
                        Paste full street addresses for the crispest heatmap.
                    </Text>
                </View>

                {error ? (
                    <Banner
                        visible
                        icon={errorIsCap ? "alert-circle-outline" : "alert"}
                        actions={[
                            {
                                label: "Dismiss",
                                onPress: () => setError(null),
                            },
                        ]}
                        style={{
                            backgroundColor: errorIsCap
                                ? theme.colors.surfaceVariant
                                : theme.colors.errorContainer,
                        }}
                    >
                        {error}
                    </Banner>
                ) : null}

                <TextInput
                    label="Trip name"
                    placeholder="e.g. Home → Work"
                    value={name}
                    onChangeText={setName}
                    mode="outlined"
                    maxLength={80}
                />

                <PlacesAutocomplete
                    label="Origin address"
                    placeholder="123 Main St, San Jose, CA"
                    value={origin}
                    onChange={setOrigin}
                />

                <PlacesAutocomplete
                    label="Destination address"
                    placeholder="500 California St, San Francisco, CA"
                    value={destination}
                    onChange={setDestination}
                />

                {sameAddress ? (
                    <HelperText type="error" visible padding="none">
                        Origin and destination can&apos;t be the same address.
                    </HelperText>
                ) : null}

                <Button
                    mode="contained"
                    icon="map-marker-path"
                    loading={createMutation.isPending}
                    disabled={submitDisabled}
                    onPress={() => {
                        setError(null);
                        createMutation.mutate();
                    }}
                >
                    Save trip
                </Button>
            </ScrollView>
        </>
    );
}

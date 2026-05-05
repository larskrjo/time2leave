/**
 * "New trip" form — phone equivalent of `apps/web/app/routes/trips.new.tsx`.
 *
 * Presented as an iOS modal sheet (`presentation: "modal"`) so it
 * slides up from the bottom and gets the system grabber + dim backdrop.
 * Cancel/Save live in the nav bar — the modal pattern Apple uses for
 * almost every "New X" creation flow (Calendar event, Reminder,
 * Note share, …).
 *
 * Two address fields (Google Places autocomplete on both — the Maps
 * API key is a required env var, so the autocomplete is always on)
 * plus an optional name. POST /api/v1/trips, then push to the new
 * trip's detail page so the user watches their heatmap fill in.
 *
 * Mutation cap (HTTP 429) is rendered as a warning rather than an
 * error so users don't think the app is broken when they hit the
 * weekly cost-control limit.
 */
import { useState } from "react";
import {
    Pressable,
    ScrollView,
    TextInput as RNTextInput,
    View,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Banner, HelperText, Text, useTheme } from "react-native-paper";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
    createTrip as sharedCreateTrip,
    isApiError,
} from "@time2leave/shared";

import { apiFetch, getApi } from "~/api/client";
import { PlacesAutocomplete } from "~/components/PlacesAutocomplete";
import { GlassPill, ScrollEdgeFade } from "~/components/native/Glass";
import { Symbol } from "~/components/native/Symbol";

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
            sharedCreateTrip(apiFetch, getApi(), {
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
    const PILL_CLEARANCE = 52 + 24;

    return (
        <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
            {/* Title and modal `presentation` come from `_layout.tsx`
                so they're applied before the modal animates in (no
                "new" route-name flash). Here we only inject the
                dynamic header-left Cancel button. */}
            <Stack.Screen
                options={{
                    headerLeft: () => (
                        <Pressable
                            onPress={() => router.back()}
                            accessibilityRole="button"
                            accessibilityLabel="Cancel"
                            hitSlop={12}
                            style={({ pressed }) => ({
                                opacity: pressed ? 0.5 : 1,
                                paddingHorizontal: 4,
                                paddingVertical: 4,
                            })}
                        >
                            <Text
                                style={{
                                    color: theme.colors.primary,
                                    fontSize: 17,
                                    fontWeight: "400",
                                }}
                            >
                                Cancel
                            </Text>
                        </Pressable>
                    ),
                }}
            />
            <ScrollView
                contentInsetAdjustmentBehavior="automatic"
                contentContainerStyle={{
                    paddingHorizontal: 20,
                    paddingTop: 12,
                    paddingBottom: insets.bottom + PILL_CLEARANCE,
                    gap: 16,
                }}
                keyboardShouldPersistTaps="handled"
            >
                <Text
                    variant="bodyMedium"
                    style={{
                        color: theme.colors.onSurfaceVariant,
                        lineHeight: 20,
                    }}
                >
                    We&apos;ll measure drive times every 15 min for the whole
                    week — both directions. Pick from suggestions for the
                    best results.
                </Text>

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

                <FormSection label="NAME" optional>
                    <IOSTextField
                        placeholder="e.g. Home → Work"
                        value={name}
                        onChangeText={setName}
                        maxLength={80}
                        autoCapitalize="sentences"
                        returnKeyType="next"
                    />
                </FormSection>

                <FormSection label="ROUTE">
                    <View style={{ gap: 10 }}>
                        <PlacesAutocomplete
                            label="From"
                            placeholder="From — e.g. 123 Main St, San Jose"
                            value={origin}
                            onChange={setOrigin}
                        />

                        <PlacesAutocomplete
                            label="To"
                            placeholder="To — e.g. 500 California St, SF"
                            value={destination}
                            onChange={setDestination}
                        />

                        {sameAddress ? (
                            <HelperText type="error" visible padding="none">
                                From and To can&apos;t be the same address.
                            </HelperText>
                        ) : null}
                    </View>
                </FormSection>
            </ScrollView>

            {/* Soft fade behind the Save pill so form content fades
                gracefully as it scrolls past the chrome zone. */}
            <ScrollEdgeFade edge="bottom" height={insets.bottom + 96} />

            {/* Floating Liquid Glass primary CTA, pinned over the
                scroll view — same pattern as the trips list. */}
            <View
                pointerEvents="box-none"
                style={{
                    position: "absolute",
                    left: 20,
                    right: 20,
                    bottom: insets.bottom + 12,
                }}
            >
                <GlassPill
                    tone="accent"
                    onPress={() => {
                        setError(null);
                        createMutation.mutate();
                    }}
                    disabled={submitDisabled}
                    accessibilityLabel="Save trip"
                >
                    {createMutation.isPending ? (
                        <Symbol
                            name={{
                                ios: "arrow.triangle.2.circlepath",
                                android: "loading",
                            }}
                            size={18}
                            color={theme.colors.onBackground}
                            weight="bold"
                        />
                    ) : (
                        <Symbol
                            name={{
                                ios: "checkmark",
                                android: "check",
                            }}
                            size={18}
                            color={theme.colors.onBackground}
                            weight="bold"
                        />
                    )}
                    <Text
                        style={{
                            color: theme.colors.onBackground,
                            fontWeight: "700",
                            fontSize: 16,
                            letterSpacing: 0.2,
                        }}
                    >
                        {createMutation.isPending ? "Saving…" : "Save Trip"}
                    </Text>
                </GlassPill>
            </View>
        </View>
    );
}

/**
 * iOS-style form section — small uppercase label above the field
 * (Apple Settings.app pattern). Optional badge ("OPTIONAL") on the
 * trailing edge to make non-required fields explicit without
 * cluttering the placeholder copy.
 */
function FormSection({
    label,
    optional = false,
    children,
}: {
    label: string;
    optional?: boolean;
    children?: React.ReactNode;
}) {
    const theme = useTheme();
    return (
        <View style={{ gap: 8 }}>
            <View
                style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginLeft: 14,
                    marginRight: 14,
                }}
            >
                <Text
                    style={{
                        color: theme.colors.onSurfaceVariant,
                        textTransform: "uppercase",
                        fontSize: 12,
                        letterSpacing: 0.7,
                        fontWeight: "600",
                    }}
                >
                    {label}
                </Text>
                {optional ? (
                    <Text
                        style={{
                            color: theme.colors.onSurfaceVariant,
                            fontSize: 11,
                            letterSpacing: 0.5,
                            fontWeight: "500",
                            opacity: 0.7,
                        }}
                    >
                        OPTIONAL
                    </Text>
                ) : null}
            </View>
            {children}
        </View>
    );
}

/**
 * Soft-filled iOS text field — single rounded surface with no
 * border, matching `PlacesAutocomplete`'s field style. We could use
 * Paper's `TextInput` in flat mode but Material's animated label
 * doesn't fit the iOS aesthetic, so we render a vanilla RN
 * `TextInput` and theme it ourselves.
 */
function IOSTextField(
    props: React.ComponentProps<typeof RNTextInput>,
) {
    const theme = useTheme();
    const fieldBg = theme.dark
        ? "rgba(118,118,128,0.24)"
        : "rgba(118,118,128,0.12)";
    return (
        <RNTextInput
            {...props}
            placeholderTextColor={theme.colors.onSurfaceVariant}
            style={[
                {
                    height: 50,
                    fontSize: 16,
                    backgroundColor: fieldBg,
                    color: theme.colors.onSurface,
                    borderRadius: 12,
                    paddingHorizontal: 14,
                },
                props.style,
            ]}
        />
    );
}

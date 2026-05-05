/**
 * "Setup required" screen.
 *
 * Rendered by `app/_layout.tsx` whenever `loadEnvOnce()` returns a
 * `{ ok: false }` result. Lists every missing env var with a name,
 * description, and example value, plus the exact restart command,
 * so the developer doesn't have to dig through docs to recover.
 */
import { ScrollView, View } from "react-native";
import { Card, Divider, Text, useTheme } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { AppEnv, MissingVar } from "~/config/env";

type Props = {
    appEnv: AppEnv | "unset";
    missing: MissingVar[];
};

export function SetupRequired({ appEnv, missing }: Props) {
    const theme = useTheme();
    const insets = useSafeAreaInsets();

    const modeLabel =
        appEnv === "unset"
            ? "(EXPO_PUBLIC_APP_ENV not set)"
            : `EXPO_PUBLIC_APP_ENV = "${appEnv}"`;

    return (
        <ScrollView
            style={{ backgroundColor: theme.colors.background }}
            contentContainerStyle={{
                paddingTop: insets.top + 24,
                paddingBottom: insets.bottom + 24,
                paddingHorizontal: 20,
                gap: 16,
            }}
        >
            <Text
                variant="labelMedium"
                style={{ color: theme.colors.error, letterSpacing: 1.2 }}
            >
                SETUP REQUIRED
            </Text>
            <Text variant="headlineSmall" style={{ fontWeight: "800" }}>
                The app can&apos;t start until {missing.length} environment
                variable{missing.length === 1 ? "" : "s"}{" "}
                {missing.length === 1 ? "is" : "are"} configured.
            </Text>
            <Text
                variant="bodyMedium"
                style={{ color: theme.colors.onSurfaceVariant }}
            >
                Mode: {modeLabel}
                {"\n"}
                The values below live in GCP Secret Manager — populate
                each one and re-pull, then restart the dev server (kill
                `npm run dev:mobile` with Ctrl+C and run it again, since
                Expo only reads .env on cold start).
            </Text>

            <Divider />

            {missing.map((m) => (
                <Card
                    key={m.name}
                    mode="outlined"
                    style={{ borderColor: theme.colors.outline }}
                >
                    <Card.Content style={{ gap: 6 }}>
                        <Text
                            variant="titleSmall"
                            style={{
                                fontFamily: "Courier",
                                fontWeight: "700",
                            }}
                        >
                            {m.name}
                        </Text>
                        <Text
                            variant="bodySmall"
                            style={{ color: theme.colors.onSurfaceVariant }}
                        >
                            {m.description}
                        </Text>
                        <Text
                            variant="bodySmall"
                            style={{
                                fontFamily: "Courier",
                                color: theme.colors.primary,
                            }}
                            selectable
                        >
                            {m.name}={m.example}
                        </Text>
                    </Card.Content>
                </Card>
            ))}

            <Divider />

            <View
                style={{
                    padding: 16,
                    borderRadius: 12,
                    backgroundColor: theme.colors.surfaceVariant,
                    gap: 8,
                }}
            >
                <Text variant="titleSmall" style={{ fontWeight: "700" }}>
                    Quickstart
                </Text>
                <Text
                    variant="bodySmall"
                    style={{
                        fontFamily: "Courier",
                        color: theme.colors.onSurface,
                    }}
                    selectable
                >
                    {appEnv === "unset"
                        ? `# 1. Set each missing value in GCP Secret Manager:\nnpm run env:set:mobile -- <local|prod> <VAR_NAME>\n\n# 2. Pull them into apps/mobile/.env:\nnpm run env:pull:mobile -- <local|prod>\n\n# 3. Restart Expo:\nnpm run dev:mobile`
                        : `# 1. Set each missing value in GCP Secret Manager:\n${missing
                              .map(
                                  (m) =>
                                      `npm run env:set:mobile -- ${appEnv} ${m.name}`,
                              )
                              .join(
                                  "\n",
                              )}\n\n# 2. Pull them into apps/mobile/.env:\nnpm run env:pull:mobile -- ${appEnv}\n\n# 3. Restart Expo:\nnpm run dev:mobile`}
                </Text>
                <Text
                    variant="bodySmall"
                    style={{ color: theme.colors.onSurfaceVariant }}
                >
                    See apps/mobile/README.md for the full per-mode setup guide.
                </Text>
            </View>
        </ScrollView>
    );
}

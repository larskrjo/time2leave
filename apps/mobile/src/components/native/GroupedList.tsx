/**
 * iOS "inset grouped" list primitives — modelled on the Settings.app
 * style of grouped table view (`UITableViewStyle.insetGrouped`).
 *
 * Why we re-build it: React Native's stock `<View>` doesn't ship a
 * grouped-list look, and Paper's `List.Item` is a Material flat row
 * with a different rhythm. Recreating the native shape gives us a
 * single rounded surface, hair-line separators between rows, and a
 * dedicated section-header label above each group — the visual
 * vocabulary every iOS user instantly parses as "settings-style
 * list of related items".
 *
 * Composition:
 *
 *     <GroupedSection header="Trips" footer="Pull to refresh">
 *         <GroupedList>
 *             <GroupedRow icon="trash" title="Delete trip" />
 *             <GroupedRow icon="square.and.arrow.up" title="Share" />
 *         </GroupedList>
 *     </GroupedSection>
 *
 * Or just `<GroupedList>` alone when the section header is not
 * needed (e.g. when the screen's nav title is the only label).
 */
import { Children, isValidElement, cloneElement, type ComponentProps } from "react";
import {
    Pressable,
    StyleSheet,
    View,
    type StyleProp,
    type ViewStyle,
} from "react-native";
import { Text, useTheme } from "react-native-paper";

import { Symbol } from "./Symbol";

type SymbolName = ComponentProps<typeof Symbol>["name"];

type GroupedListProps = {
    style?: StyleProp<ViewStyle>;
    children?: React.ReactNode;
};

/**
 * Rounded inset container. Pass `<GroupedRow>` children — each row is
 * separated from the next by a hair-line; the last row's separator
 * is automatically suppressed.
 */
export function GroupedList({ style, children }: GroupedListProps) {
    const theme = useTheme();
    const items = Children.toArray(children);
    const lastIndex = items.length - 1;

    return (
        <View
            style={[
                {
                    borderRadius: 14,
                    overflow: "hidden",
                    backgroundColor: theme.colors.surface,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: theme.dark
                        ? "rgba(255,255,255,0.08)"
                        : "rgba(0,0,0,0.06)",
                },
                style,
            ]}
        >
            {items.map((child, idx) => {
                if (!isValidElement<{ _isLastRow?: boolean }>(child)) return child;
                // Inject the "is last" hint into each row so it can
                // suppress its own separator without the caller having
                // to thread the index through manually.
                return cloneElement(child, {
                    _isLastRow: idx === lastIndex,
                });
            })}
        </View>
    );
}

/**
 * iOS section header — renders an inset uppercase label above the
 * group, plus an optional footer note below. Both follow Apple's
 * Settings.app spacing (small caps, secondary text colour, generous
 * lead-in margin).
 */
export function GroupedSection({
    header,
    footer,
    style,
    children,
}: {
    header?: string;
    footer?: string;
    style?: StyleProp<ViewStyle>;
    children?: React.ReactNode;
}) {
    const theme = useTheme();
    return (
        <View style={[{ gap: 6 }, style]}>
            {header ? (
                <Text
                    style={{
                        color: theme.colors.onSurfaceVariant,
                        textTransform: "uppercase",
                        fontSize: 12,
                        letterSpacing: 0.7,
                        fontWeight: "600",
                        marginLeft: 14,
                    }}
                >
                    {header}
                </Text>
            ) : null}
            {children}
            {footer ? (
                <Text
                    style={{
                        color: theme.colors.onSurfaceVariant,
                        fontSize: 12,
                        lineHeight: 16,
                        marginLeft: 14,
                        marginRight: 14,
                        marginTop: 2,
                    }}
                >
                    {footer}
                </Text>
            ) : null}
        </View>
    );
}

type GroupedRowProps = {
    /**
     * Optional iconography on the leading edge. Pass a `{ ios, android }`
     * pair to get the default Settings.app-style tinted tile (white
     * SF symbol on coloured background), or pass a fully-rendered
     * `ReactNode` to take full control of the icon's appearance.
     */
    icon?: SymbolName | React.ReactNode;
    /** Tint colour for the leading icon's tile background. */
    iconTint?: string;
    /** Primary line of text. */
    title: string;
    /** Secondary line below `title` (e.g. an address, an email). */
    subtitle?: string;
    /** Trailing detail text (e.g. value in a key/value row). */
    detail?: string;
    /** Whether to render the iOS chevron-right disclosure on the trailing edge. */
    chevron?: boolean;
    /** Trailing accessory rendered to the right of `detail`. */
    accessory?: React.ReactNode;
    onPress?: () => void;
    /** Set on the destructive variant — turns title text red. */
    destructive?: boolean;
    /** Internal: separator suppression hint set by `GroupedList`. */
    _isLastRow?: boolean;
};

/**
 * One row inside a `<GroupedList>`. The row layout is:
 *
 *     [icon]  title              detail  [accessory]  ›
 *             subtitle (optional)
 *
 * Tap feedback is iOS dim-on-press (opacity 0.55) when `onPress` is
 * provided; without it the row is non-interactive (still readable
 * but no press response).
 */
export function GroupedRow({
    icon,
    iconTint,
    title,
    subtitle,
    detail,
    chevron = false,
    accessory,
    onPress,
    destructive = false,
    _isLastRow = false,
}: GroupedRowProps) {
    const theme = useTheme();
    const separatorColor = theme.dark
        ? "rgba(255,255,255,0.08)"
        : "rgba(60,60,67,0.18)";
    const titleColor = destructive
        ? theme.colors.error
        : theme.colors.onSurface;

    const Container = onPress ? Pressable : View;
    const containerProps = onPress
        ? {
              onPress,
              android_ripple: { color: theme.colors.surfaceVariant },
              style: ({ pressed }: { pressed: boolean }) => ({
                  opacity: pressed ? 0.55 : 1,
              }),
          }
        : {};

    return (
        <Container {...(containerProps as object)}>
            <View
                style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    minHeight: 44,
                    borderBottomWidth: _isLastRow ? 0 : StyleSheet.hairlineWidth,
                    borderBottomColor: separatorColor,
                }}
            >
                {icon != null ? (
                    isValidElement(icon) ? (
                        icon
                    ) : isPlainIconRef(icon) ? (
                        <View
                            style={{
                                width: 30,
                                height: 30,
                                borderRadius: 7,
                                alignItems: "center",
                                justifyContent: "center",
                                backgroundColor:
                                    iconTint ?? theme.colors.surfaceVariant,
                            }}
                        >
                            <Symbol
                                name={icon as SymbolName}
                                size={16}
                                color="#ffffff"
                                weight="semibold"
                            />
                        </View>
                    ) : null
                ) : null}

                <View style={{ flex: 1, gap: 2 }}>
                    <Text
                        variant="bodyLarge"
                        style={{
                            color: titleColor,
                            fontWeight: "500",
                            fontSize: 16,
                        }}
                        numberOfLines={1}
                    >
                        {title}
                    </Text>
                    {subtitle ? (
                        <Text
                            variant="bodySmall"
                            style={{
                                color: theme.colors.onSurfaceVariant,
                                fontSize: 13,
                            }}
                            numberOfLines={2}
                        >
                            {subtitle}
                        </Text>
                    ) : null}
                </View>

                {detail ? (
                    <Text
                        style={{
                            color: theme.colors.onSurfaceVariant,
                            fontSize: 15,
                            fontVariant: ["tabular-nums"],
                        }}
                    >
                        {detail}
                    </Text>
                ) : null}

                {accessory}

                {chevron ? (
                    <Symbol
                        name={{
                            ios: "chevron.right",
                            android: "chevron-right",
                        }}
                        size={12}
                        color={theme.colors.onSurfaceVariant}
                        weight="semibold"
                    />
                ) : null}
            </View>
        </Container>
    );
}

function isPlainIconRef(value: unknown): boolean {
    return (
        value != null &&
        typeof value === "object" &&
        "ios" in (value as object) &&
        "android" in (value as object)
    );
}

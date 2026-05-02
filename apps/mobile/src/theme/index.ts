/**
 * Material Design 3 themes for React Native Paper that mirror the
 * web app's blue → orange brand palette.
 *
 * The mobile app shares the web `time2leave.com` palette via these
 * tokens so trips, heatmaps, and chips read as the same product
 * regardless of platform.
 */
import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from "react-native-paper";

const PRIMARY_LIGHT = "#1e40af";
const PRIMARY_DARK = "#93b0ff";
const SECONDARY_LIGHT = "#ef6c00";
const SECONDARY_DARK = "#ffb86b";

export const lightTheme: MD3Theme = {
    ...MD3LightTheme,
    roundness: 3,
    colors: {
        ...MD3LightTheme.colors,
        primary: PRIMARY_LIGHT,
        secondary: SECONDARY_LIGHT,
        background: "#f8fafc",
        surface: "#ffffff",
        surfaceVariant: "#eef2f7",
        outline: "#dbe2ec",
    },
};

export const darkTheme: MD3Theme = {
    ...MD3DarkTheme,
    roundness: 3,
    colors: {
        ...MD3DarkTheme.colors,
        primary: PRIMARY_DARK,
        secondary: SECONDARY_DARK,
        background: "#0b1020",
        surface: "#121a33",
        surfaceVariant: "#1a2342",
        outline: "rgba(255,255,255,0.09)",
        onBackground: "#e8edf8",
        onSurface: "#e8edf8",
        onSurfaceVariant: "#a7b1c9",
    },
};

/** Brand gradient used in headlines and CTA buttons (mirrors web). */
export const BRAND_GRADIENT = ["#1e40af", "#ef6c00"] as const;

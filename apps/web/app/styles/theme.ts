/**
 * App theme with both light and dark color schemes.
 *
 * MUI's `cssVariables.colorSchemeSelector` emits CSS vars guarded by
 * the `data-mui-color-scheme` attribute we set on <html>. Components
 * should prefer palette tokens (e.g. `color: "text.primary"`) so the
 * swap happens automatically via CSS variables.
 *
 * When a bit of styling can't be expressed as a palette token, write
 * the light values as defaults and override them under a
 * `[data-mui-color-scheme='dark'] &` selector in sx. Do NOT check
 * `theme.palette.mode === "dark"` at render time — with CSS-variables
 * mode that value is pinned to the default scheme and never flips.
 *
 * Dark-mode palette leans warm-dark (not pure black) so the signature
 * blue → orange gradient accents still read well.
 */
import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
    cssVariables: {
        colorSchemeSelector: "[data-mui-color-scheme='%s']",
    },
    typography: {
        fontFamily:
            '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    },
    colorSchemes: {
        light: {
            palette: {
                mode: "light",
                primary: { main: "#1e40af" },
                secondary: { main: "#ef6c00" },
                background: {
                    default: "#f8fafc",
                    paper: "#ffffff",
                },
            },
        },
        dark: {
            palette: {
                mode: "dark",
                primary: { main: "#93b0ff" },
                secondary: { main: "#ffb86b" },
                background: {
                    default: "#0b1020",
                    paper: "#121a33",
                },
                text: {
                    primary: "#e8edf8",
                    secondary: "#a7b1c9",
                },
                divider: "rgba(255,255,255,0.09)",
            },
        },
    },
});

export type ColorMode = "light" | "dark";

/**
 * What the user has explicitly chosen for the signed-in experience.
 * `"auto"` means "follow time of day at my current location" (the
 * default). Signed-out visitors always get `"auto"` regardless of
 * what's stored.
 */
export type ColorPreference = "auto" | "light" | "dark";

/**
 * localStorage key for the persisted preference. A tiny inline script
 * in `root.tsx` reads this on first paint to avoid a light→dark flash.
 */
export const COLOR_PREFERENCE_STORAGE_KEY = "tlh.colorPref";

/**
 * Returns the mode that the current local wall-clock hour implies.
 * Used for the "auto" preference and for the signed-out splash.
 * Night is treated as before 07:00 or at/after 19:00; everything in
 * between is daytime. This matches common "dark after sunset" UX on
 * the continents the app targets without needing real sunrise data.
 */
export function autoModeForNow(now: Date = new Date()): ColorMode {
    const h = now.getHours();
    return h < 7 || h >= 19 ? "dark" : "light";
}

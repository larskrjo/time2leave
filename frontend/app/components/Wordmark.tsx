/**
 * `time2leave` brand wordmark.
 *
 * Split across three spans so the "2" can carry the signature
 * blue→orange gradient (and a subtle italic lean) — that digit is
 * the unique glyph in the domain name, so it earns the emphasis.
 * Everything else stays tight, dark, and lowercase to keep the
 * wordmark feeling contemporary.
 *
 * Use at `size="md"` inside the app bar, `size="lg"` in splash hero
 * chrome, and `size="sm"` for footers / secondary placements.
 */
import { Box } from "@mui/material";

export type WordmarkSize = "sm" | "md" | "lg";

const SIZE_PX: Record<WordmarkSize, number> = {
    sm: 16,
    md: 20,
    lg: 28,
};

export function Wordmark({ size = "md" }: { size?: WordmarkSize }) {
    const px = SIZE_PX[size];
    return (
        <Box
            component="span"
            aria-label="time2leave"
            sx={{
                display: "inline-flex",
                alignItems: "baseline",
                gap: 0,
                fontWeight: 800,
                fontSize: px,
                lineHeight: 1,
                letterSpacing: "-0.02em",
                fontFamily:
                    '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
                userSelect: "none",
            }}
        >
            <Box
                component="span"
                sx={{ color: "text.primary" }}
            >
                time
            </Box>
            <Box
                component="span"
                sx={{
                    mx: "1px",
                    fontStyle: "italic",
                    background:
                        "linear-gradient(135deg, #1e40af 0%, #ef6c00 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                }}
            >
                2
            </Box>
            <Box
                component="span"
                sx={{ color: "text.primary" }}
            >
                leave
            </Box>
        </Box>
    );
}

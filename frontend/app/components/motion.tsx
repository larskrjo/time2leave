/**
 * Shared motion + backdrop atoms.
 *
 * Both the splash page and the authenticated shell use the same soft
 * gradient background with drifting radial "blobs" and the same
 * fade-up stagger pattern for content entrance. This module
 * centralises those atoms so every page feels like it belongs to the
 * same app.
 *
 * All animations respect `prefers-reduced-motion` — on reduced-motion
 * the blobs stay still (but keep their soft tint) and content simply
 * appears without the fade+slide.
 */
import { type ReactNode } from "react";
import { Box } from "@mui/material";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Fade-up wrapper. `delay` lets callers stagger siblings, e.g.
 * `{items.map((it, i) => <FadeIn delay={0.08 * i} key={it.id}>…</FadeIn>)}`.
 */
export function FadeIn({
    children,
    delay = 0,
    y = 16,
    duration = 0.5,
}: {
    children: ReactNode;
    delay?: number;
    y?: number;
    duration?: number;
}) {
    const reduce = useReducedMotion();
    return (
        <motion.div
            initial={reduce ? { opacity: 1 } : { opacity: 0, y }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration, delay, ease: "easeOut" }}
        >
            {children}
        </motion.div>
    );
}

/**
 * Three slow-drifting radial blobs at a fixed z-index of -1. Sits at
 * the back of the page so the rest of the UI floats over a dreamy,
 * subtly-moving canvas. Intentionally identical to the splash so the
 * transition from signed-out to signed-in feels continuous.
 */
export function AnimatedBackdrop() {
    const reduce = useReducedMotion();
    return (
        <Box
            aria-hidden
            sx={{
                position: "absolute",
                inset: 0,
                overflow: "hidden",
                zIndex: -1,
                pointerEvents: "none",
            }}
        >
            {[0, 1, 2].map((i) => (
                <motion.div
                    key={i}
                    initial={{ opacity: 0.0 }}
                    animate={
                        reduce
                            ? { opacity: 0.3 }
                            : {
                                  opacity: [0.25, 0.5, 0.25],
                                  x: [0, 40, 0],
                                  y: [0, -20, 0],
                              }
                    }
                    transition={{
                        repeat: Infinity,
                        duration: 16 + i * 3,
                        ease: "easeInOut",
                    }}
                    style={{
                        position: "absolute",
                        top: `${8 + i * 22}%`,
                        left: `${[-8, 58, 18][i]}%`,
                        width: 420,
                        height: 420,
                        borderRadius: "50%",
                        background: [
                            "radial-gradient(circle at 30% 30%, #c7d8ff, transparent 60%)",
                            "radial-gradient(circle at 70% 40%, #ffe5c7, transparent 60%)",
                            "radial-gradient(circle at 40% 70%, #d2f5e7, transparent 60%)",
                        ][i],
                        filter: "blur(60px)",
                    }}
                />
            ))}
        </Box>
    );
}

/**
 * Full-bleed page container with the signature soft gradient + blobs.
 * Use as the outermost wrapper of any page that wants the splash-era
 * vibe — both splash and AppShell layer their own content on top of
 * this.
 *
 * The light/dark swap is driven by the `data-mui-color-scheme`
 * attribute we set on `<html>`, not by `theme.palette.mode` — with
 * MUI's CSS-variables mode that value stays pinned to the default
 * scheme, which would leave the backdrop frozen on light.
 */
export function PageBackdrop({ children }: { children: ReactNode }) {
    return (
        <Box
            sx={{
                position: "relative",
                minHeight: "100vh",
                overflow: "hidden",
                color: "text.primary",
                background:
                    "linear-gradient(180deg, #f5f8ff 0%, #ffffff 60%, #fff8f0 100%)",
                "[data-mui-color-scheme='dark'] &": {
                    background:
                        "linear-gradient(180deg, #0b1020 0%, #121a33 60%, #1a1528 100%)",
                },
            }}
        >
            <AnimatedBackdrop />
            {children}
        </Box>
    );
}

/**
 * Shared "eyebrow + gradient-accent headline" pair. Keeps every page
 * hero aligned on the same typography rhythm as the splash.
 *
 * Pass `accent` as a substring of `headline` to style it with the
 * splash's signature blue→orange gradient.
 */
export function PageHero({
    eyebrow,
    headline,
    accent,
    sub,
    right,
}: {
    eyebrow: string;
    headline: ReactNode;
    accent?: string;
    sub?: ReactNode;
    right?: ReactNode;
}) {
    const isString = typeof headline === "string";
    const hasAccent = Boolean(accent) && isString;
    const before = hasAccent && accent ? (headline as string).split(accent)[0] : "";
    const after =
        hasAccent && accent
            ? ((headline as string).split(accent)[1] ?? "")
            : "";
    return (
        <Box
            sx={{
                display: "flex",
                flexDirection: { xs: "column", md: "row" },
                gap: 3,
                alignItems: { md: "flex-end" },
                justifyContent: "space-between",
                mb: { xs: 3, md: 4 },
            }}
        >
            <Box>
                <FadeIn>
                    <Box
                        component="span"
                        sx={{
                            typography: "overline",
                            color: "primary.main",
                            fontWeight: 700,
                            letterSpacing: 2,
                        }}
                    >
                        {eyebrow}
                    </Box>
                </FadeIn>
                <FadeIn delay={0.08}>
                    <Box
                        component="h1"
                        sx={{
                            m: 0,
                            mt: 1,
                            fontWeight: 800,
                            lineHeight: 1.1,
                            fontSize: { xs: 30, sm: 38, md: 44 },
                            letterSpacing: "-0.01em",
                        }}
                    >
                        {hasAccent ? (
                            <>
                                {before}
                                <Box
                                    component="span"
                                    sx={{
                                        background:
                                            "linear-gradient(135deg, #1e40af 0%, #ef6c00 100%)",
                                        WebkitBackgroundClip: "text",
                                        WebkitTextFillColor: "transparent",
                                    }}
                                >
                                    {accent}
                                </Box>
                                {after}
                            </>
                        ) : (
                            headline
                        )}
                    </Box>
                </FadeIn>
                {sub && (
                    <FadeIn delay={0.16}>
                        <Box sx={{ mt: 1.25, color: "text.secondary", maxWidth: 620 }}>
                            {sub}
                        </Box>
                    </FadeIn>
                )}
            </Box>
            {right && (
                <FadeIn delay={0.22}>
                    <Box>{right}</Box>
                </FadeIn>
            )}
        </Box>
    );
}

/**
 * Shared glass-card style. The splash's "how it works" cards set the
 * pattern; the trips list, new-trip form, and detail panels all reuse
 * these tokens so they feel part of the same family.
 *
 * The swap is expressed with a `[data-mui-color-scheme='dark'] &`
 * selector because MUI's CSS-variables mode keeps `theme.palette.mode`
 * pinned to the default scheme — the only reliable runtime signal of
 * the active scheme is the attribute on `<html>`.
 */
export const glassCardSx = {
    borderRadius: 4,
    border: "1px solid rgba(30,64,175,0.12)",
    backgroundColor: "rgba(255,255,255,0.72)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    boxShadow: "0 10px 30px -18px rgba(30,64,175,0.35)",
    transition:
        "transform 200ms ease, box-shadow 200ms ease, border-color 200ms ease",
    "[data-mui-color-scheme='dark'] &": {
        border: "1px solid rgba(255,255,255,0.08)",
        backgroundColor: "rgba(18,26,51,0.72)",
        boxShadow: "0 10px 30px -18px rgba(0,0,0,0.6)",
    },
} as const;

/**
 * The single source of truth for the app's primary CTA — the gradient
 * pill used on /trips ("New trip", "Add your first trip"), /trips/new
 * ("Save"), and /admin/allowlist ("Add to allowlist").
 *
 * Centralising the styling keeps every primary action the same shape,
 * height, and hover/disabled behaviour across pages. Per-call-site sx
 * overrides still merge in the usual way (e.g. the admin form pins
 * `height: 56` to align with its outlined TextField).
 *
 * Height is intentional: ~44px so it pairs nicely with both the
 * stat chips ("0 / 3 slots") and the outlined inputs without feeling
 * chunky.
 */
export const primaryCtaSx = {
    borderRadius: 2,
    px: 2.75,
    py: 1.15,
    fontWeight: 700,
    letterSpacing: 0.3,
    color: "common.white",
    background: "linear-gradient(135deg, #1e40af 0%, #ef6c00 100%)",
    boxShadow: "0 10px 24px -12px rgba(30,64,175,0.55)",
    transition:
        "transform 160ms ease, box-shadow 200ms ease, background 200ms ease",
    "&:hover": {
        background: "linear-gradient(135deg, #1a3aa0 0%, #d65f00 100%)",
        boxShadow: "0 14px 28px -14px rgba(30,64,175,0.65)",
        transform: "translateY(-1px)",
    },
    "&:active": {
        transform: "translateY(0)",
    },
    // MUI's default disabled treatment doesn't override our gradient
    // background, so we reset it explicitly to a flat neutral.
    "&.Mui-disabled": {
        background: "rgba(99,102,124,0.18)",
        color: "rgba(99,102,124,0.55)",
        boxShadow: "none",
        transform: "none",
    },
} as const;

/**
 * Animated landing page for anonymous visitors.
 *
 * Three sections: hero with sign-in, how-it-works (3 steps), and a
 * demo heatmap that visualizes what signed-in users get. Authenticated
 * visitors are redirected straight to /trips so this page is only
 * ever seen by newcomers.
 */
import type { ReactNode } from "react";
import { Navigate, useSearchParams } from "react-router";
import {
    Avatar,
    Box,
    Card,
    CardContent,
    Container,
    Stack,
    Typography,
    useTheme,
} from "@mui/material";
import {
    AccessTimeRounded,
    PlaceRounded,
    TuneRounded,
} from "@mui/icons-material";
import { motion, useReducedMotion } from "framer-motion";

import { DemoHeatmap } from "~/components/DemoHeatmap";
import { DevLoginButton } from "~/components/DevLoginButton";
import { GoogleSignInButton } from "~/components/GoogleSignInButton";
import { ROUTES } from "~/constants/path";
import { useSession } from "~/lib/session";
import Loading from "~/components/Loading";

export function meta() {
    return [
        { title: "Commute Heatmap · Know when to leave" },
        {
            name: "description",
            content:
                "Save any A→B trip and see exactly when to leave — down to the 15-minute interval, every day of the week.",
        },
    ];
}

type Step = {
    icon: ReactNode;
    title: string;
    body: string;
};

const STEPS: Step[] = [
    {
        icon: <PlaceRounded />,
        title: "Add your addresses",
        body: "Drop in the two endpoints of any regular drive — home to work, school pickup, airport runs, whatever you repeat.",
    },
    {
        icon: <TuneRounded />,
        title: "We sample 15-minute windows, 6am-9pm, both ways",
        body: "Every Friday night we refresh the week ahead using the Google Routes Matrix API so your plan always reflects live traffic patterns.",
    },
    {
        icon: <AccessTimeRounded />,
        title: "Leave at the right time",
        body: "A color-coded heatmap shows exactly how long the drive will take at each departure slot — spot the gentle dip before rush hour and go.",
    },
];

function FadeIn({
    children,
    delay = 0,
}: {
    children: ReactNode;
    delay?: number;
}) {
    const reduce = useReducedMotion();
    return (
        <motion.div
            initial={reduce ? { opacity: 1 } : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay, ease: "easeOut" }}
        >
            {children}
        </motion.div>
    );
}

function AnimatedBackdrop() {
    const reduce = useReducedMotion();
    return (
        <Box
            aria-hidden
            sx={{
                position: "absolute",
                inset: 0,
                overflow: "hidden",
                zIndex: -1,
            }}
        >
            {[0, 1, 2].map((i) => (
                <motion.div
                    key={i}
                    initial={{ opacity: 0.0 }}
                    animate={
                        reduce
                            ? { opacity: 0.35 }
                            : {
                                  opacity: [0.3, 0.55, 0.3],
                                  x: [0, 40, 0],
                                  y: [0, -20, 0],
                              }
                    }
                    transition={{
                        repeat: Infinity,
                        duration: 14 + i * 3,
                        ease: "easeInOut",
                    }}
                    style={{
                        position: "absolute",
                        top: `${10 + i * 20}%`,
                        left: `${[-10, 55, 20][i]}%`,
                        width: 380,
                        height: 380,
                        borderRadius: "50%",
                        background: [
                            "radial-gradient(circle at 30% 30%, #c7d8ff, transparent 60%)",
                            "radial-gradient(circle at 70% 40%, #ffe5c7, transparent 60%)",
                            "radial-gradient(circle at 40% 70%, #d2f5e7, transparent 60%)",
                        ][i],
                        filter: "blur(40px)",
                    }}
                />
            ))}
        </Box>
    );
}

export default function SplashPage() {
    const theme = useTheme();
    const { status } = useSession();
    const [params] = useSearchParams();
    const next = params.get("next") ?? ROUTES.trips;

    if (status === "loading") return <Loading />;
    if (status === "authenticated") return <Navigate to={next} replace />;

    return (
        <Box
            component="main"
            sx={{
                position: "relative",
                minHeight: "100vh",
                overflow: "hidden",
                background:
                    "linear-gradient(180deg, #f5f8ff 0%, #ffffff 60%, #fff8f0 100%)",
            }}
        >
            <AnimatedBackdrop />

            {/* Hero */}
            <Container maxWidth="lg" sx={{ pt: { xs: 6, md: 12 }, pb: 8 }}>
                <Stack
                    direction={{ xs: "column", md: "row" }}
                    spacing={{ xs: 6, md: 8 }}
                    alignItems="center"
                >
                    <Stack spacing={3} sx={{ flex: 1 }}>
                        <FadeIn>
                            <Typography
                                variant="overline"
                                sx={{
                                    color: theme.palette.primary.main,
                                    fontWeight: 700,
                                    letterSpacing: 2,
                                }}
                            >
                                Know when to leave
                            </Typography>
                        </FadeIn>
                        <FadeIn delay={0.1}>
                            <Typography
                                variant="h2"
                                sx={{
                                    fontWeight: 800,
                                    lineHeight: 1.05,
                                    fontSize: { xs: 40, sm: 52, md: 64 },
                                }}
                            >
                                Stop{" "}
                                <Box
                                    component="span"
                                    sx={{
                                        background:
                                            "linear-gradient(135deg, #1e40af 0%, #ef6c00 100%)",
                                        WebkitBackgroundClip: "text",
                                        WebkitTextFillColor: "transparent",
                                    }}
                                >
                                    guessing
                                </Box>{" "}
                                when to leave.
                            </Typography>
                        </FadeIn>
                        <FadeIn delay={0.2}>
                            <Typography
                                variant="h6"
                                color="text.secondary"
                                sx={{ maxWidth: 520, fontWeight: 400 }}
                            >
                                Save a trip between any two addresses. We build
                                a heatmap of real drive times in 15-minute
                                intervals across the whole week — both
                                directions, weekends included.
                            </Typography>
                        </FadeIn>
                        <FadeIn delay={0.35}>
                            <Box sx={{ maxWidth: 360 }}>
                                <GoogleSignInButton />
                                <DevLoginButton />
                            </Box>
                        </FadeIn>
                    </Stack>

                    <FadeIn delay={0.3}>
                        <Box sx={{ flex: 1, width: "100%" }}>
                            <DemoHeatmap />
                            <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{
                                    display: "block",
                                    textAlign: "center",
                                    mt: 1.5,
                                }}
                            >
                                Example: weekday commute, minutes per 15-min slot.
                            </Typography>
                        </Box>
                    </FadeIn>
                </Stack>
            </Container>

            {/* How it works */}
            <Container maxWidth="lg" sx={{ py: { xs: 6, md: 10 } }}>
                <FadeIn>
                    <Typography
                        variant="h4"
                        sx={{
                            fontWeight: 700,
                            textAlign: "center",
                            mb: { xs: 4, md: 6 },
                        }}
                    >
                        How it works
                    </Typography>
                </FadeIn>
                <Stack
                    direction={{ xs: "column", md: "row" }}
                    spacing={{ xs: 2.5, md: 4 }}
                >
                    {STEPS.map((step, idx) => (
                        <FadeIn key={step.title} delay={0.15 * idx}>
                            <Card
                                variant="outlined"
                                sx={{
                                    height: "100%",
                                    borderRadius: 4,
                                    backgroundColor:
                                        "rgba(255,255,255,0.75)",
                                    backdropFilter: "blur(6px)",
                                    borderColor: "rgba(30,64,175,0.15)",
                                }}
                            >
                                <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                                    <Avatar
                                        sx={{
                                            bgcolor: "primary.main",
                                            color: "primary.contrastText",
                                            width: 48,
                                            height: 48,
                                            mb: 2,
                                        }}
                                    >
                                        {step.icon}
                                    </Avatar>
                                    <Typography
                                        variant="overline"
                                        color="text.secondary"
                                    >
                                        Step {idx + 1}
                                    </Typography>
                                    <Typography
                                        variant="h6"
                                        sx={{ fontWeight: 700, mt: 0.5, mb: 1 }}
                                    >
                                        {step.title}
                                    </Typography>
                                    <Typography
                                        variant="body2"
                                        color="text.secondary"
                                    >
                                        {step.body}
                                    </Typography>
                                </CardContent>
                            </Card>
                        </FadeIn>
                    ))}
                </Stack>
            </Container>

            {/* Footer */}
            <Container maxWidth="lg" sx={{ py: 4 }}>
                <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", textAlign: "center" }}
                >
                    Access is invite-only today. Ask the owner to add you to
                    the allowlist.
                </Typography>
            </Container>
        </Box>
    );
}

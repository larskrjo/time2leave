/**
 * Splash / landing page. Redirects authenticated users straight to
 * /trips; shows a minimal placeholder for anonymous visitors in this
 * commit and will grow a fancy animated marketing block in the next.
 */
import { Navigate, useSearchParams } from "react-router";
import { Box, Stack, Typography } from "@mui/material";

import { DevLoginButton } from "~/components/DevLoginButton";
import { GoogleSignInButton } from "~/components/GoogleSignInButton";
import { ROUTES } from "~/constants/path";
import { useSession } from "~/lib/session";
import Loading from "~/components/Loading";

export function meta() {
    return [
        { title: "Commute Heatmap" },
        {
            name: "description",
            content:
                "Know when to leave. Figure out the best time to start your drive between any two addresses.",
        },
    ];
}

export default function SplashPage() {
    const { status } = useSession();
    const [params] = useSearchParams();
    const next = params.get("next") ?? ROUTES.trips;

    if (status === "loading") return <Loading />;
    if (status === "authenticated") return <Navigate to={next} replace />;

    return (
        <Box
            component="main"
            sx={{
                minHeight: "100vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                p: 3,
                background:
                    "radial-gradient(ellipse at top, #e3f2fd, transparent 60%)",
            }}
        >
            <Stack spacing={3} sx={{ maxWidth: 420, width: "100%" }}>
                <Typography variant="h3" fontWeight={800}>
                    Commute Heatmap
                </Typography>
                <Typography variant="body1" color="text.secondary">
                    Sign in to save trips between any two addresses and see
                    exactly when you should leave to get there in time.
                </Typography>
                <GoogleSignInButton />
                <DevLoginButton />
            </Stack>
        </Box>
    );
}

/**
 * Dev-only login affordance shown when `authConfig.dev_login_enabled`
 * is true (i.e. APP_ENV != "prod" on the backend).
 *
 * Lets the local developer pick a seeded allowlist email without
 * needing a real Google OAuth client. Hidden entirely in prod because
 * the backend returns 404 on the route there.
 */
import { useState } from "react";
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    TextField,
    Typography,
} from "@mui/material";

import { useSession } from "~/lib/session";

export function DevLoginButton() {
    const { authConfig, loginDev } = useSession();
    const [email, setEmail] = useState("dev@example.com");
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!authConfig?.dev_login_enabled) return null;

    const submit = async () => {
        setPending(true);
        setError(null);
        try {
            await loginDev(email, "Local Dev");
        } catch (err: unknown) {
            const msg =
                err && typeof err === "object" && "detail" in err
                    ? String((err as { detail: string }).detail)
                    : "Login failed";
            setError(msg);
        } finally {
            setPending(false);
        }
    };

    return (
        <Box
            sx={{
                mt: 3,
                p: 2,
                borderRadius: 2,
                border: (theme) => `1px dashed ${theme.palette.divider}`,
                display: "flex",
                flexDirection: "column",
                gap: 1.25,
            }}
        >
            <Typography variant="overline" color="text.secondary">
                Dev shortcut (non-prod only)
            </Typography>
            <Box sx={{ display: "flex", gap: 1 }}>
                <TextField
                    size="small"
                    fullWidth
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    label="Email"
                    inputProps={{ "aria-label": "dev login email" }}
                />
                <Button
                    variant="outlined"
                    onClick={submit}
                    disabled={pending}
                    startIcon={
                        pending ? (
                            <CircularProgress size={14} />
                        ) : undefined
                    }
                >
                    Dev login
                </Button>
            </Box>
            {error && <Alert severity="error">{error}</Alert>}
        </Box>
    );
}

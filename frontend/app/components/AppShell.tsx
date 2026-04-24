/**
 * Top-level navigation shell for authenticated pages.
 *
 * Shows the product name (links back to /trips), and an avatar button
 * that opens a menu with "Sign out". Pages render inside a MUI
 * <Container>. Intentionally small — the look/feel polish lives in the
 * per-page components and the theme.
 */
import { useState, type ReactNode } from "react";
import {
    AppBar,
    Avatar,
    Box,
    Container,
    IconButton,
    Menu,
    MenuItem,
    Toolbar,
    Typography,
} from "@mui/material";
import { Link as RouterLink, useNavigate } from "react-router";

import { ROUTES } from "~/constants/path";
import { useSession } from "~/lib/session";

function initialsFor(name: string | null, email: string): string {
    if (name && name.trim().length > 0) {
        const parts = name.trim().split(/\s+/);
        const first = parts[0][0];
        const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
        return (first + last).toUpperCase();
    }
    return email.slice(0, 2).toUpperCase();
}

export function AppShell({ children }: { children: ReactNode }) {
    const { user, logout } = useSession();
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const navigate = useNavigate();

    const handleLogout = async () => {
        setAnchor(null);
        await logout();
        navigate(ROUTES.splash, { replace: true });
    };

    return (
        <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
            <AppBar
                position="sticky"
                elevation={0}
                color="transparent"
                sx={{
                    backdropFilter: "saturate(180%) blur(10px)",
                    backgroundColor: "rgba(255,255,255,0.75)",
                    borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
                }}
            >
                <Container maxWidth="lg">
                    <Toolbar disableGutters sx={{ gap: 2 }}>
                        <Typography
                            component={RouterLink}
                            to={ROUTES.trips}
                            variant="h6"
                            sx={{
                                textDecoration: "none",
                                color: "inherit",
                                fontWeight: 700,
                                letterSpacing: 0.5,
                                flexGrow: 1,
                            }}
                        >
                            Commute Heatmap
                        </Typography>
                        {user && (
                            <>
                                <IconButton
                                    onClick={(e) => setAnchor(e.currentTarget)}
                                    size="small"
                                    aria-label="account menu"
                                >
                                    {user.picture_url ? (
                                        <Avatar
                                            src={user.picture_url}
                                            alt={user.name ?? user.email}
                                            sx={{ width: 36, height: 36 }}
                                        />
                                    ) : (
                                        <Avatar sx={{ width: 36, height: 36 }}>
                                            {initialsFor(user.name, user.email)}
                                        </Avatar>
                                    )}
                                </IconButton>
                                <Menu
                                    anchorEl={anchor}
                                    open={Boolean(anchor)}
                                    onClose={() => setAnchor(null)}
                                    anchorOrigin={{
                                        vertical: "bottom",
                                        horizontal: "right",
                                    }}
                                    transformOrigin={{
                                        vertical: "top",
                                        horizontal: "right",
                                    }}
                                >
                                    <MenuItem disabled>
                                        <Box>
                                            <Typography variant="subtitle2">
                                                {user.name ?? user.email}
                                            </Typography>
                                            <Typography
                                                variant="caption"
                                                color="text.secondary"
                                            >
                                                {user.email}
                                            </Typography>
                                        </Box>
                                    </MenuItem>
                                    <MenuItem onClick={handleLogout}>
                                        Sign out
                                    </MenuItem>
                                </Menu>
                            </>
                        )}
                    </Toolbar>
                </Container>
            </AppBar>
            <Container
                component="main"
                maxWidth="lg"
                sx={{ py: { xs: 3, md: 5 }, flexGrow: 1 }}
            >
                {children}
            </Container>
        </Box>
    );
}

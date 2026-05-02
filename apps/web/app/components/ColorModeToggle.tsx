/**
 * Three-state color mode control for authenticated users.
 *
 * Opens a small popover with three options: Auto (follow local time),
 * Light, and Dark. The icon button shows whichever mode is currently
 * being rendered; when the preference is "auto" we overlay a tiny
 * dot badge so users can tell at a glance that the system is driving
 * the choice.
 *
 * The control is hidden on the splash because signed-out visitors
 * always render in auto mode — giving them a toggle would be a lie.
 * If you need the authenticated variant elsewhere, just drop this
 * component in; it handles its own state via `useColorMode`.
 */
import { useRef, useState } from "react";
import {
    Box,
    IconButton,
    ListItemIcon,
    ListItemText,
    Menu,
    MenuItem,
    Tooltip,
    Typography,
} from "@mui/material";
import {
    BrightnessAutoRounded,
    CheckRounded,
    DarkModeOutlined,
    LightModeOutlined,
} from "@mui/icons-material";

import { useColorMode } from "~/lib/colorMode";
import { useSession } from "~/lib/session";
import type { ColorPreference } from "~/styles/theme";

type Option = {
    value: ColorPreference;
    label: string;
    help: string;
    Icon: typeof LightModeOutlined;
};

const OPTIONS: Option[] = [
    {
        value: "auto",
        label: "Auto",
        help: "Follow local time — dark at night, light during the day",
        Icon: BrightnessAutoRounded,
    },
    {
        value: "light",
        label: "Light",
        help: "Always light, regardless of time",
        Icon: LightModeOutlined,
    },
    {
        value: "dark",
        label: "Dark",
        help: "Always dark, regardless of time",
        Icon: DarkModeOutlined,
    },
];

export function ColorModeToggle() {
    const { status } = useSession();
    const { mode, preference, isAuto, setPreference } = useColorMode();
    const anchorRef = useRef<HTMLButtonElement | null>(null);
    const [open, setOpen] = useState(false);

    // Signed-out visitors never see this; their experience is
    // auto-only by design.
    if (status !== "authenticated") return null;

    const currentIcon =
        mode === "dark" ? (
            <DarkModeOutlined fontSize="small" />
        ) : (
            <LightModeOutlined fontSize="small" />
        );

    return (
        <>
            <Tooltip
                title={
                    isAuto
                        ? `Theme: Auto (${mode} for now)`
                        : `Theme: ${preference === "dark" ? "Dark" : "Light"}`
                }
            >
                <IconButton
                    ref={anchorRef}
                    size="small"
                    aria-label="Change color theme"
                    aria-haspopup="menu"
                    aria-expanded={open || undefined}
                    onClick={() => setOpen((v) => !v)}
                    sx={{
                        color: "text.secondary",
                        transition:
                            "transform 200ms ease, color 160ms ease",
                        "&:hover": {
                            color: "primary.main",
                            transform: "rotate(15deg)",
                        },
                    }}
                >
                    <Box sx={{ position: "relative", display: "flex" }}>
                        {currentIcon}
                        {isAuto && (
                            <Box
                                aria-hidden
                                sx={{
                                    position: "absolute",
                                    right: -2,
                                    bottom: -2,
                                    width: 7,
                                    height: 7,
                                    borderRadius: "50%",
                                    background:
                                        "linear-gradient(135deg, #1e40af, #ef6c00)",
                                    boxShadow:
                                        "0 0 0 1.5px var(--mui-palette-background-default, #fff)",
                                }}
                            />
                        )}
                    </Box>
                </IconButton>
            </Tooltip>

            <Menu
                anchorEl={anchorRef.current}
                open={open}
                onClose={() => setOpen(false)}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                transformOrigin={{ vertical: "top", horizontal: "right" }}
                slotProps={{
                    paper: {
                        elevation: 0,
                        sx: {
                            mt: 1,
                            borderRadius: 3,
                            minWidth: 240,
                            border: "1px solid rgba(30,64,175,0.12)",
                            backdropFilter: "blur(10px)",
                            backgroundColor: "rgba(255,255,255,0.92)",
                            boxShadow:
                                "0 12px 32px -16px rgba(0,0,0,0.25)",
                            "[data-mui-color-scheme='dark'] &": {
                                border: "1px solid rgba(255,255,255,0.08)",
                                backgroundColor: "rgba(18,26,51,0.94)",
                            },
                        },
                    },
                }}
            >
                <Box sx={{ px: 2, py: 1.25 }}>
                    <Typography
                        variant="overline"
                        sx={{
                            color: "text.secondary",
                            fontWeight: 700,
                            letterSpacing: 1.4,
                        }}
                    >
                        Theme
                    </Typography>
                </Box>
                {OPTIONS.map((opt) => {
                    const selected = preference === opt.value;
                    const Icon = opt.Icon;
                    return (
                        <MenuItem
                            key={opt.value}
                            onClick={() => {
                                setPreference(opt.value);
                                setOpen(false);
                            }}
                            sx={{ py: 1.1 }}
                            selected={selected}
                        >
                            <ListItemIcon sx={{ minWidth: 36 }}>
                                <Icon
                                    fontSize="small"
                                    sx={{
                                        color: selected
                                            ? "primary.main"
                                            : "text.secondary",
                                    }}
                                />
                            </ListItemIcon>
                            <ListItemText
                                primary={
                                    <Typography
                                        variant="body2"
                                        sx={{
                                            fontWeight: selected ? 700 : 500,
                                        }}
                                    >
                                        {opt.label}
                                    </Typography>
                                }
                                secondary={
                                    <Typography
                                        variant="caption"
                                        color="text.secondary"
                                    >
                                        {opt.help}
                                    </Typography>
                                }
                            />
                            {selected && (
                                <CheckRounded
                                    fontSize="small"
                                    sx={{ ml: 1, color: "primary.main" }}
                                />
                            )}
                        </MenuItem>
                    );
                })}
            </Menu>
        </>
    );
}

/**
 * Admin allowlist management.
 *
 * Lists every email allowed to sign in, with the `added_by` provenance
 * (e.g. "bootstrap" for env-bootstrapped owners, an admin's email for
 * UI-added entries). Admins can add new emails or remove existing ones.
 *
 * Add is optimistic with a rollback on API failure; remove uses the same
 * deferred-undo affordance as the trips list so an accidental click is
 * recoverable for ~5s before it hits the backend.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
    Alert,
    Box,
    Button,
    IconButton,
    InputAdornment,
    Paper,
    Skeleton,
    Snackbar,
    Stack,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import {
    CloseRounded,
    DeleteOutlineRounded,
    LockPersonRounded,
    MailOutlineRounded,
    PersonAddRounded,
    UndoRounded,
} from "@mui/icons-material";

import { AdminRoute } from "~/components/AdminRoute";
import { AppShell } from "~/components/AppShell";
import { FadeIn, PageHero, glassCardSx, primaryCtaSx } from "~/components/motion";
import {
    addAllowlistEntry,
    listAllowlist,
    removeAllowlistEntry,
    type AllowlistEntry,
} from "~/lib/admin";
import { isApiError } from "~/lib/api";
import { useSession } from "~/lib/session";

export function meta() {
    return [{ title: "Allowlist · time2leave" }];
}

const UNDO_WINDOW_MS = 5_500;

// Permissive client-side check; the backend (pydantic EmailStr) is the
// real validator. We just want to skip the round-trip for obvious typos
// and surface a friendly error inline.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type PendingRemove = {
    entry: AllowlistEntry;
    insertAt: number;
    timer: number;
};

function AllowlistSkeleton() {
    return (
        <Stack spacing={1.5} aria-hidden>
            {[0, 1, 2].map((i) => (
                <Paper
                    key={i}
                    elevation={0}
                    sx={{ ...glassCardSx, p: { xs: 2, md: 2.5 } }}
                >
                    <Stack
                        direction="row"
                        spacing={1.5}
                        alignItems="center"
                    >
                        <Skeleton variant="rounded" width={36} height={36} />
                        <Skeleton
                            variant="text"
                            sx={{ fontSize: "1rem", flex: 1 }}
                        />
                        <Skeleton variant="rounded" width={32} height={32} />
                    </Stack>
                </Paper>
            ))}
        </Stack>
    );
}

function AllowlistInner() {
    const { user } = useSession();
    const [entries, setEntries] = useState<AllowlistEntry[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [draft, setDraft] = useState("");
    const [adding, setAdding] = useState(false);
    const [pending, setPending] = useState<PendingRemove | null>(null);

    const reload = useCallback(async () => {
        try {
            const fresh = await listAllowlist();
            // Stable sort: bootstrapped owners first, then by created_at
            // descending — newest invites bubble to the top of the list.
            fresh.sort((a, b) => {
                if (a.added_by === "bootstrap" && b.added_by !== "bootstrap")
                    return -1;
                if (b.added_by === "bootstrap" && a.added_by !== "bootstrap")
                    return 1;
                const aT = a.created_at ?? "";
                const bT = b.created_at ?? "";
                return bT.localeCompare(aT);
            });
            setEntries(fresh);
            setError(null);
        } catch (err) {
            const detail = isApiError(err)
                ? err.detail
                : "Failed to load allowlist";
            setError(detail);
            setEntries([]);
        }
    }, []);

    useEffect(() => {
        void reload();
    }, [reload]);

    const handleAdd = useCallback(async () => {
        const email = draft.trim().toLowerCase();
        if (!email) return;
        if (!EMAIL_RE.test(email)) {
            setError(`"${email}" doesn't look like a valid email address.`);
            return;
        }
        if (entries?.some((e) => e.email.toLowerCase() === email)) {
            setError(`${email} is already on the allowlist.`);
            return;
        }
        setAdding(true);
        setError(null);
        try {
            const created = await addAllowlistEntry(email);
            setEntries((current) =>
                current ? [created, ...current] : [created],
            );
            setDraft("");
        } catch (err) {
            setError(
                isApiError(err)
                    ? err.detail
                    : `Couldn't add ${email}. Please try again.`,
            );
        } finally {
            setAdding(false);
        }
    }, [draft, entries]);

    const commitRemove = useCallback(async (entry: AllowlistEntry) => {
        try {
            await removeAllowlistEntry(entry.email);
        } catch (err) {
            setError(
                isApiError(err) ? err.detail : "Failed to remove email",
            );
            setEntries((current) =>
                current && !current.some((e) => e.id === entry.id)
                    ? [entry, ...current]
                    : current,
            );
        }
    }, []);

    const scheduleRemove = useCallback(
        (entry: AllowlistEntry) => {
            if (!entries) return;
            if (pending) {
                window.clearTimeout(pending.timer);
                void commitRemove(pending.entry);
            }
            const insertAt = entries.findIndex((e) => e.id === entry.id);
            setEntries((current) =>
                current ? current.filter((e) => e.id !== entry.id) : current,
            );
            const timer = window.setTimeout(() => {
                setPending(null);
                void commitRemove(entry);
            }, UNDO_WINDOW_MS);
            setPending({ entry, insertAt: Math.max(0, insertAt), timer });
        },
        [entries, pending, commitRemove],
    );

    const undoRemove = useCallback(() => {
        if (!pending) return;
        window.clearTimeout(pending.timer);
        setEntries((current) => {
            if (!current) return current;
            if (current.some((e) => e.id === pending.entry.id)) return current;
            const next = [...current];
            next.splice(pending.insertAt, 0, pending.entry);
            return next;
        });
        setPending(null);
    }, [pending]);

    // Flush any pending remove if the admin navigates away mid-undo.
    const pendingRef = useRef(pending);
    pendingRef.current = pending;
    useEffect(() => {
        return () => {
            const p = pendingRef.current;
            if (p) {
                window.clearTimeout(p.timer);
                void commitRemove(p.entry);
            }
        };
    }, [commitRemove]);

    const totalLabel =
        entries === null
            ? ""
            : entries.length === 1
              ? "1 person can sign in."
              : `${entries.length} people can sign in.`;

    return (
        <Stack spacing={4}>
            <PageHero
                eyebrow="Admin"
                headline="Manage the allowlist"
                accent="allowlist"
                sub={
                    <>
                        Only emails on this list can sign in.{" "}
                        {totalLabel && (
                            <Box component="span" sx={{ fontWeight: 600 }}>
                                {totalLabel}
                            </Box>
                        )}
                    </>
                }
            />

            <FadeIn>
                <Paper
                    elevation={0}
                    sx={{ ...glassCardSx, p: { xs: 2.5, md: 3 } }}
                >
                    <Box
                        component="form"
                        noValidate
                        onSubmit={(e) => {
                            e.preventDefault();
                            void handleAdd();
                        }}
                    >
                        <Stack
                            direction={{ xs: "column", sm: "row" }}
                            spacing={1.5}
                            alignItems="stretch"
                        >
                            <TextField
                                fullWidth
                                label="Invite by email"
                                placeholder="friend@example.com"
                                type="email"
                                autoComplete="off"
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                disabled={adding}
                                slotProps={{
                                    input: {
                                        startAdornment: (
                                            <InputAdornment position="start">
                                                <MailOutlineRounded fontSize="small" />
                                            </InputAdornment>
                                        ),
                                    },
                                }}
                            />
                            <Button
                                type="submit"
                                variant="contained"
                                startIcon={<PersonAddRounded />}
                                disabled={adding || draft.trim().length === 0}
                                sx={{
                                    ...primaryCtaSx,
                                    whiteSpace: "nowrap",
                                    minWidth: { sm: 200 },
                                    // Pin to the outlined-TextField height so
                                    // the field + button share a baseline in
                                    // the row layout.
                                    height: { sm: 56 },
                                }}
                            >
                                Add to allowlist
                            </Button>
                        </Stack>
                    </Box>
                </Paper>
            </FadeIn>

            {error && (
                <FadeIn>
                    <Alert severity="error" onClose={() => setError(null)}>
                        {error}
                    </Alert>
                </FadeIn>
            )}

            {entries === null ? (
                <AllowlistSkeleton />
            ) : entries.length === 0 ? (
                <FadeIn delay={0.05}>
                    <Paper
                        elevation={0}
                        sx={{
                            ...glassCardSx,
                            p: { xs: 5, md: 7 },
                            textAlign: "center",
                            borderStyle: "dashed",
                            borderWidth: 2,
                        }}
                    >
                        <Box
                            sx={{
                                width: 64,
                                height: 64,
                                mx: "auto",
                                mb: 2,
                                borderRadius: "50%",
                                display: "grid",
                                placeItems: "center",
                                background:
                                    "linear-gradient(135deg, rgba(30,64,175,0.12), rgba(239,108,0,0.12))",
                                color: "primary.main",
                            }}
                        >
                            <LockPersonRounded sx={{ fontSize: 32 }} />
                        </Box>
                        <Typography variant="h6" fontWeight={700} gutterBottom>
                            Allowlist is empty
                        </Typography>
                        <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ maxWidth: 380, mx: "auto" }}
                        >
                            Add yourself or a friend above to let them sign in.
                        </Typography>
                    </Paper>
                </FadeIn>
            ) : (
                <Stack spacing={1.5}>
                    {entries.map((entry, idx) => (
                        <FadeIn key={entry.id} delay={0.04 * idx}>
                            <AllowlistRow
                                entry={entry}
                                isSelf={
                                    user?.email.toLowerCase() ===
                                    entry.email.toLowerCase()
                                }
                                onRemove={scheduleRemove}
                            />
                        </FadeIn>
                    ))}
                </Stack>
            )}

            <Snackbar
                open={Boolean(pending)}
                autoHideDuration={UNDO_WINDOW_MS}
                onClose={(_e, reason) => {
                    if (reason === "timeout" && pending) {
                        window.clearTimeout(pending.timer);
                        void commitRemove(pending.entry);
                        setPending(null);
                    }
                }}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
                message={pending ? `Removed ${pending.entry.email}` : ""}
                action={
                    <>
                        <Button
                            color="warning"
                            size="small"
                            onClick={undoRemove}
                            startIcon={<UndoRounded fontSize="small" />}
                            sx={{ fontWeight: 700 }}
                        >
                            Undo
                        </Button>
                        <IconButton
                            size="small"
                            aria-label="close"
                            color="inherit"
                            onClick={() => {
                                if (!pending) return;
                                window.clearTimeout(pending.timer);
                                void commitRemove(pending.entry);
                                setPending(null);
                            }}
                        >
                            <CloseRounded fontSize="small" />
                        </IconButton>
                    </>
                }
            />
        </Stack>
    );
}

function AllowlistRow({
    entry,
    isSelf,
    onRemove,
}: {
    entry: AllowlistEntry;
    isSelf: boolean;
    onRemove: (entry: AllowlistEntry) => void;
}) {
    const provenance = describeProvenance(entry);
    const removeDisabledReason = isSelf
        ? "You can't remove yourself."
        : entry.added_by === "bootstrap"
          ? "Bootstrap entries are seeded from ADMIN_EMAILS / AUTH_ALLOWLIST_BOOTSTRAP. Edit those env vars to change."
          : null;

    return (
        <Paper
            elevation={0}
            sx={{
                ...glassCardSx,
                p: { xs: 2, md: 2.25 },
                "&:hover": {
                    transform: "translateY(-1px)",
                    boxShadow: "0 14px 30px -18px rgba(30,64,175,0.45)",
                },
            }}
        >
            <Stack direction="row" spacing={2} alignItems="center">
                <Box
                    sx={{
                        width: 36,
                        height: 36,
                        borderRadius: 2,
                        display: "grid",
                        placeItems: "center",
                        background:
                            "linear-gradient(135deg, rgba(30,64,175,0.12), rgba(239,108,0,0.12))",
                        color: "primary.main",
                        flexShrink: 0,
                    }}
                >
                    <MailOutlineRounded fontSize="small" />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                        variant="body1"
                        fontWeight={600}
                        sx={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                        }}
                    >
                        {entry.email}
                        {isSelf && (
                            <Box
                                component="span"
                                sx={{
                                    ml: 1,
                                    px: 0.75,
                                    py: 0.1,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    letterSpacing: 0.5,
                                    borderRadius: 1,
                                    color: "primary.main",
                                    backgroundColor: "rgba(30,64,175,0.08)",
                                    verticalAlign: "middle",
                                }}
                            >
                                YOU
                            </Box>
                        )}
                    </Typography>
                    <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: "block", lineHeight: 1.4 }}
                    >
                        {provenance}
                    </Typography>
                </Box>
                <Tooltip
                    title={removeDisabledReason ?? "Remove from allowlist"}
                >
                    <span>
                        <IconButton
                            aria-label={`Remove ${entry.email} from allowlist`}
                            onClick={() => onRemove(entry)}
                            disabled={Boolean(removeDisabledReason)}
                            sx={{
                                color: "text.secondary",
                                "&:hover": { color: "error.main" },
                            }}
                        >
                            <DeleteOutlineRounded fontSize="small" />
                        </IconButton>
                    </span>
                </Tooltip>
            </Stack>
        </Paper>
    );
}

function describeProvenance(entry: AllowlistEntry): string {
    const when = entry.created_at
        ? formatRelative(entry.created_at)
        : null;
    const who =
        entry.added_by === "bootstrap"
            ? "Bootstrapped from env"
            : entry.added_by
              ? `Added by ${entry.added_by}`
              : "Added";
    return when ? `${who} · ${when}` : who;
}

function formatRelative(iso: string): string {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return iso;
    const diffSec = Math.round((Date.now() - t) / 1000);
    if (diffSec < 60) return "just now";
    const diffMin = Math.round(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.round(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.round(diffH / 24);
    if (diffD < 30) return `${diffD}d ago`;
    return new Date(t).toLocaleDateString();
}

export default function AdminAllowlistPage() {
    return (
        <AdminRoute>
            <AppShell>
                <AllowlistInner />
            </AppShell>
        </AdminRoute>
    );
}

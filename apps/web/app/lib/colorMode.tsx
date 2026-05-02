/**
 * Color mode, keyed off auth state.
 *
 * Rules:
 *   - Signed-out visitors (e.g. the splash page) ALWAYS render in
 *     "auto" mode, i.e. the app follows the local wall-clock hour:
 *     dark at night, light during the day. Any stored preference is
 *     ignored until the user signs in.
 *   - Signed-in users get a three-way preference: "auto" | "light" |
 *     "dark". It's persisted in localStorage and re-applied on every
 *     load. `"auto"` uses the same wall-clock heuristic as the
 *     splash, so it flips during a session if the user crosses the
 *     7am or 7pm boundaries.
 *
 * The effective mode is written to the `data-mui-color-scheme`
 * attribute on `<html>`, which MUI's CSS-variables theme watches to
 * swap palette tokens, plus our own `[data-mui-color-scheme='dark']
 * &` sx selectors used for custom glass surfaces.
 *
 * `ColorModeProvider` MUST sit inside `<SessionProvider>` because it
 * reads the current auth status to decide whether to honor the
 * persisted preference.
 */
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";

import {
    COLOR_PREFERENCE_STORAGE_KEY,
    autoModeForNow,
    type ColorMode,
    type ColorPreference,
} from "~/styles/theme";
import { useSession } from "~/lib/session";

type ColorModeState = {
    /** The currently rendered mode (after resolving auto/auth). */
    mode: ColorMode;
    /** The user's raw preference; only meaningful when authenticated. */
    preference: ColorPreference;
    /**
     * True when the mode is being driven by the wall-clock heuristic
     * (either unauthenticated, or authenticated with preference=auto).
     * Useful for UI copy like "Auto · light until 7 pm".
     */
    isAuto: boolean;
    setPreference: (p: ColorPreference) => void;
};

const Ctx = createContext<ColorModeState | null>(null);

const ATTR = "data-mui-color-scheme";

/**
 * useLayoutEffect warns on the server. This pattern lets us fall
 * back to useEffect during SSR while keeping the synchronous
 * pre-paint write on the client, which is what actually prevents the
 * "React says light, DOM still says dark" flash.
 */
const useIsoLayoutEffect =
    typeof window !== "undefined" ? useLayoutEffect : useEffect;

function readAttr(): ColorMode {
    if (typeof document === "undefined") return "light";
    return document.documentElement.getAttribute(ATTR) === "dark"
        ? "dark"
        : "light";
}

function writeAttr(mode: ColorMode) {
    if (typeof document === "undefined") return;
    if (document.documentElement.getAttribute(ATTR) !== mode) {
        document.documentElement.setAttribute(ATTR, mode);
    }
}

function readPreference(): ColorPreference {
    if (typeof window === "undefined") return "auto";
    try {
        const v = window.localStorage.getItem(COLOR_PREFERENCE_STORAGE_KEY);
        return v === "light" || v === "dark" || v === "auto" ? v : "auto";
    } catch {
        return "auto";
    }
}

function writePreference(p: ColorPreference) {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(COLOR_PREFERENCE_STORAGE_KEY, p);
    } catch {
        // Persistence is best-effort; the current session still works.
    }
}

/**
 * How often to re-evaluate wall-clock mode for active auto users.
 * A full minute is fine — we only need to catch the 07:00 / 19:00
 * transitions, and a one-minute skew on those boundaries is harmless.
 */
const AUTO_TICK_MS = 60 * 1000;

export function ColorModeProvider({ children }: { children: ReactNode }) {
    const { status } = useSession();
    const authenticated = status === "authenticated";

    const [preference, setPreferenceState] = useState<ColorPreference>(() =>
        readPreference(),
    );
    // Bumped each minute so the wall-clock heuristic re-runs in the
    // background for long-lived sessions.
    const [autoTick, setAutoTick] = useState(0);

    const isAuto = !authenticated || preference === "auto";
    const effective: ColorMode = useMemo(() => {
        if (isAuto) return autoModeForNow();
        return preference === "dark" ? "dark" : "light";
        // autoTick participates because it invalidates the memo on
        // each wall-clock check while in auto mode.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAuto, preference, autoTick]);

    // The `mode` we hand back to consumers. We keep a separate state
    // rather than returning `effective` directly so tooltip/menu UI
    // always reflects what the DOM actually shows — even during the
    // single frame between compute and DOM write, and even if a stray
    // HMR cycle leaves the attribute temporarily out of sync.
    const [mode, setMode] = useState<ColorMode>(() => readAttr());

    // Keep a stable reference to the desired mode so the observer
    // below always has access to the latest target without needing
    // to be re-created on every render.
    const effectiveRef = useRef<ColorMode>(effective);
    effectiveRef.current = effective;

    // Write the attribute BEFORE the next paint so we never show a
    // frame where React state and the DOM disagree. `useIsoLayoutEffect`
    // falls back to useEffect on the server, which is correct because
    // `document` doesn't exist there.
    useIsoLayoutEffect(() => {
        writeAttr(effective);
        setMode(effective);
    }, [effective]);

    // Some tools (browser extensions, MUI's own init script if
    // someone adds it back, a stale HMR module) occasionally set
    // data-mui-color-scheme behind our back. Listen for that and
    // snap the attribute back — and update `mode` so the UI stays
    // consistent with whatever actually applies.
    useEffect(() => {
        if (typeof window === "undefined") return;
        const obs = new MutationObserver(() => {
            const current = readAttr();
            if (current !== effectiveRef.current) {
                writeAttr(effectiveRef.current);
                setMode(effectiveRef.current);
            } else {
                setMode(current);
            }
        });
        obs.observe(document.documentElement, {
            attributes: true,
            attributeFilter: [ATTR],
        });
        return () => obs.disconnect();
    }, []);

    useEffect(() => {
        if (!isAuto) return;
        const id = window.setInterval(() => {
            setAutoTick((t) => t + 1);
        }, AUTO_TICK_MS);
        return () => window.clearInterval(id);
    }, [isAuto]);

    const setPreference = useCallback((next: ColorPreference) => {
        writePreference(next);
        setPreferenceState(next);
    }, []);

    const value = useMemo<ColorModeState>(
        () => ({ mode, preference, isAuto, setPreference }),
        [mode, preference, isAuto, setPreference],
    );

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useColorMode(): ColorModeState {
    const ctx = useContext(Ctx);
    if (!ctx) {
        throw new Error("useColorMode must be used inside <ColorModeProvider>");
    }
    return ctx;
}

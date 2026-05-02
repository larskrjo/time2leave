/**
 * Google Places Autocomplete-backed TextField.
 *
 * Degrades gracefully in four ways:
 *   1. If `VITE_GOOGLE_MAPS_API_KEY` is missing we render a plain
 *      TextField — e.g. tests, self-hosted forks, or a local dev
 *      environment without a browser key.
 *   2. On localhost we also render a plain TextField by default, even
 *      if a key is set. Most browser keys are referer-restricted to
 *      prod domains, so hitting Places from `http://localhost:5173`
 *      triggers `RefererNotAllowedMapError` and paints red error
 *      icons into the field. Devs who have a localhost-authorized
 *      key can opt back in with `VITE_ENABLE_PLACES_ON_LOCALHOST=true`.
 *   3. If the <script> tag itself fails to load (network, CSP, etc.)
 *      we catch the rejection and stay on the plain TextField.
 *   4. If the script loads but the Maps JS API rejects the call at
 *      runtime — e.g. the referer key turned out not to cover this
 *      host — Google calls the global `window.gm_authFailure` hook.
 *      We listen for that, mark the library permanently unavailable
 *      for this session, tear down any Autocomplete we already
 *      attached, and purge the `.pac-container` dropdowns Google
 *      injected into <body>.
 *
 * Loading the library is shared across all instances via a module-
 * level promise so we don't inject multiple <script> tags.
 */
import {
    forwardRef,
    useEffect,
    useRef,
    useState,
    type Ref,
} from "react";
import { TextField, type TextFieldProps } from "@mui/material";

type Props = Omit<TextFieldProps, "onChange"> & {
    value: string;
    onChange: (value: string) => void;
    country?: string;
};

type PlacesAutocompleteInstance = {
    addListener: (event: string, handler: () => void) => void;
    getPlace: () => { formatted_address?: string; name?: string };
};

type MapsPlacesNamespace = {
    Autocomplete: new (
        input: HTMLInputElement,
        opts?: Record<string, unknown>,
    ) => PlacesAutocompleteInstance;
};

type MapsEventNamespace = {
    clearInstanceListeners: (instance: unknown) => void;
};

declare global {
    interface Window {
        __tlhPlacesLoaderPromise?: Promise<void>;
        __tlhPlacesAuthFailed?: boolean;
        gm_authFailure?: () => void;
    }
}

const AUTH_FAIL_EVENT = "tlh:places-auth-failed";

function getGoogleMaps():
    | {
          places?: MapsPlacesNamespace;
          event?: MapsEventNamespace;
      }
    | undefined {
    if (typeof window === "undefined") return undefined;
    const w = window as unknown as {
        google?: {
            maps?: { places?: MapsPlacesNamespace; event?: MapsEventNamespace };
        };
    };
    return w.google?.maps;
}

function getPlacesNamespace(): MapsPlacesNamespace | undefined {
    return getGoogleMaps()?.places;
}

function purgePacContainers() {
    if (typeof document === "undefined") return;
    document
        .querySelectorAll(".pac-container")
        .forEach((el) => el.remove());
}

// Matches the hostnames devs hit Vite on: `localhost`, `127.0.0.1`,
// `0.0.0.0`, and LAN addresses Vite prints when `server.host` is on.
// We treat these as "probably not covered by the prod browser key"
// and skip Places entirely unless the user opts in.
function isLocalDevHost(): boolean {
    if (typeof window === "undefined") return false;
    const h = window.location.hostname;
    if (h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0") return true;
    if (h.endsWith(".localhost")) return true;
    // Private LAN ranges Vite commonly binds to with `--host`.
    if (/^10\./.test(h)) return true;
    if (/^192\.168\./.test(h)) return true;
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h)) return true;
    return false;
}

function placesEnabledOnLocalhost(): boolean {
    const optIn = import.meta.env
        .VITE_ENABLE_PLACES_ON_LOCALHOST as string | undefined;
    return optIn === "true" || optIn === "1";
}

function installAuthFailureHook() {
    if (typeof window === "undefined") return;
    if (window.gm_authFailure) return;
    window.gm_authFailure = () => {
        window.__tlhPlacesAuthFailed = true;
        purgePacContainers();
        // Fan out to every mounted field so they can fall back.
        window.dispatchEvent(new CustomEvent(AUTH_FAIL_EVENT));
    };
}

function loadPlacesLibrary(apiKey: string): Promise<void> {
    if (typeof window === "undefined") return Promise.resolve();
    if (window.__tlhPlacesAuthFailed)
        return Promise.reject(new Error("Places auth previously failed"));
    if (getPlacesNamespace()) return Promise.resolve();
    if (window.__tlhPlacesLoaderPromise)
        return window.__tlhPlacesLoaderPromise;

    installAuthFailureHook();

    window.__tlhPlacesLoaderPromise = new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
            apiKey,
        )}&libraries=places&v=weekly`;
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = () =>
            reject(new Error("Failed to load Google Maps JS API"));
        document.head.appendChild(script);
    });
    return window.__tlhPlacesLoaderPromise;
}

export const PlacesAutocompleteField = forwardRef(function PlacesField(
    { value, onChange, country, ...textFieldProps }: Props,
    ref: Ref<HTMLDivElement>,
) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const autoRef = useRef<PlacesAutocompleteInstance | null>(null);
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as
        | string
        | undefined;
    const [disabled, setDisabled] = useState<boolean>(() => {
        if (typeof window === "undefined") return false;
        if (window.__tlhPlacesAuthFailed) return true;
        if (isLocalDevHost() && !placesEnabledOnLocalhost()) return true;
        return false;
    });

    // React to a late `gm_authFailure` firing (another field triggered
    // the load, then Google rejected the key asynchronously).
    useEffect(() => {
        if (typeof window === "undefined") return;
        function onAuthFail() {
            setDisabled(true);
            if (autoRef.current) {
                const ev = getGoogleMaps()?.event;
                try {
                    ev?.clearInstanceListeners(autoRef.current);
                } catch {
                    // Best effort — we're tearing down anyway.
                }
                autoRef.current = null;
            }
            purgePacContainers();
        }
        window.addEventListener(AUTH_FAIL_EVENT, onAuthFail);
        return () => window.removeEventListener(AUTH_FAIL_EVENT, onAuthFail);
    }, []);

    useEffect(() => {
        if (!apiKey || disabled) return;
        let cancelled = false;
        loadPlacesLibrary(apiKey)
            .then(() => {
                if (cancelled || !inputRef.current) return;
                if (window.__tlhPlacesAuthFailed) {
                    setDisabled(true);
                    return;
                }
                const places = getPlacesNamespace();
                if (!places) return;
                const auto = new places.Autocomplete(inputRef.current, {
                    types: ["address"],
                    fields: ["formatted_address", "name"],
                    ...(country
                        ? { componentRestrictions: { country } }
                        : {}),
                });
                autoRef.current = auto;
                auto.addListener("place_changed", () => {
                    const place = auto.getPlace();
                    const addr =
                        place.formatted_address ?? place.name ?? "";
                    if (addr) onChange(addr);
                });
            })
            .catch(() => {
                // Script failed to load or auth failed before we
                // finished — stay on plain text entry.
                setDisabled(true);
            });
        return () => {
            cancelled = true;
            if (autoRef.current) {
                const ev = getGoogleMaps()?.event;
                try {
                    ev?.clearInstanceListeners(autoRef.current);
                } catch {
                    // Best effort.
                }
                autoRef.current = null;
            }
        };
    }, [apiKey, onChange, country, disabled]);

    return (
        <TextField
            {...textFieldProps}
            ref={ref}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            inputRef={(el: HTMLInputElement | null) => {
                inputRef.current = el;
            }}
            // Kill browser + password-manager autofill, which otherwise
            // stacks on top of the Google dropdown and makes it
            // unusable. `autocomplete="off"` alone is widely ignored on
            // address-ish fields, so we also set the vendor-specific
            // opt-out attributes. This also quiets the "Cannot create
            // item with duplicate id Add Address / Add Payment Card"
            // noise that password-manager extensions emit when they
            // decide to decorate our inputs.
            autoComplete="off"
            inputProps={{
                ...(textFieldProps.inputProps ?? {}),
                autoComplete: "new-password",
                "data-1p-ignore": "true",
                "data-lpignore": "true",
                "data-bwignore": "true",
                "data-form-type": "other",
            }}
        />
    );
});

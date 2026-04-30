/**
 * Test rendering helpers. All tests should go through `renderWithProviders`
 * so they get the same router + theme + session context the real app uses.
 *
 * MSW supplies the network responses, so callers don't need to pass mock
 * data — they just `server.use(...)` to override per-test.
 */
import type { ReactElement } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { MemoryRouter, Routes, Route } from "react-router";

import { SessionProvider } from "~/lib/session";
import { ColorModeProvider } from "~/lib/colorMode";
import { theme } from "~/styles/theme";

type ProviderOptions = {
    /** Initial route entries fed to MemoryRouter. */
    initialEntries?: string[];
    /**
     * Path pattern for the rendered element. Lets us mount routes that
     * use useParams (e.g. `/trips/:tripId`) by routing to the matching
     * URL in `initialEntries`.
     */
    path?: string;
    /**
     * Attach `location.state` to the *first* initial entry. Used to
     * simulate flows like "detail page navigated here with
     * `pendingDelete`" without spinning up two route components.
     */
    initialState?: unknown;
};

export function renderWithProviders(
    ui: ReactElement,
    {
        initialEntries = ["/"],
        path,
        initialState,
        ...options
    }: ProviderOptions & RenderOptions = {},
) {
    // Always wrap in <Routes> so <Navigate /> inside the rendered route
    // can change the URL and we can detect "I redirected somewhere else".
    // The "fallback" route catches any redirect target the test didn't
    // explicitly mount.
    const matchPath = path ?? initialEntries[0] ?? "/";
    const entries =
        initialState !== undefined && initialEntries.length > 0
            ? [
                  { pathname: initialEntries[0], state: initialState },
                  ...initialEntries.slice(1),
              ]
            : initialEntries;
    return render(
        <ThemeProvider theme={theme}>
            <CssBaseline />
            {/* Session must wrap ColorMode so useSession resolves
                for the color-mode provider. */}
            <SessionProvider>
                <ColorModeProvider>
                    <MemoryRouter initialEntries={entries}>
                        <Routes>
                            <Route path={matchPath} element={ui} />
                            <Route path="*" element={<>fallback</>} />
                        </Routes>
                    </MemoryRouter>
                </ColorModeProvider>
            </SessionProvider>
        </ThemeProvider>,
        options,
    );
}

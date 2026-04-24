import {isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration,} from "react-router";

import type {Route} from "./+types/root";
import "./styles/app.css";

import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';

import {CssBaseline, ThemeProvider} from '@mui/material';

import {theme, COLOR_PREFERENCE_STORAGE_KEY} from './styles/theme';
import Loading from "~/components/Loading";
import {SessionProvider} from "~/lib/session";
import {ColorModeProvider} from "~/lib/colorMode";

// Inline, runs before React hydrates; prevents a light→dark flash by
// setting the color-scheme attribute before any paint happens.
//
// Rules (mirror ColorModeProvider):
//   - If a "light" or "dark" preference is persisted, honor it.
//     The React layer will override back to auto for signed-out
//     visitors after hydration; that's a one-frame mismatch at most.
//   - Otherwise (no preference / "auto" / unknown), fall back to the
//     local wall-clock: dark before 7am or at/after 7pm, else light.
const noFlashScript = `(function(){try{var k=${JSON.stringify(
    COLOR_PREFERENCE_STORAGE_KEY,
)};var p=localStorage.getItem(k);var m;if(p==='light'||p==='dark'){m=p;}else{var h=new Date().getHours();m=(h<7||h>=19)?'dark':'light';}document.documentElement.setAttribute('data-mui-color-scheme',m);}catch(e){}})();`;


export function meta({}: Route.MetaArgs) {
    return [
        { title: "time2leave" },
        {
            name: "description",
            content:
                "Know exactly when to leave — per-trip commute heatmaps in 15-minute intervals, both directions.",
        },
    ];
}

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

export function HydrateFallback() {
    return <Loading />
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning on <html> covers the data-mui-color-scheme
    // flip done by <InitColorSchemeScript />. On <body> it covers attributes
    // injected by browser extensions (ColorZilla's `cz-shortcut-listen`,
    // Grammarly's `data-gr-*`, etc.) — these happen outside React's control
    // and would otherwise fail the React 19 hydration check.
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: noFlashScript }}
        />
      </head>
      <body suppressHydrationWarning>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          {/* ColorModeProvider reads session status (unauth'd visitors
              always get auto regardless of stored preference), so the
              session context must be mounted first. */}
          <SessionProvider>
            <ColorModeProvider>{children}</ColorModeProvider>
          </SessionProvider>
        </ThemeProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
      <main className="main-error-container">
          <h1>{message}</h1>
          <p>{details}</p>
          {stack && (
              <pre className="stack-block">
                  <code>{stack}</code>
              </pre>
          )}
      </main>
  );
}

# @time2leave/mobile

Native iOS + Android client for time2leave, built on Expo SDK 55 (React
Native 0.83) and Expo Router. Shares types, API client, and heatmap
math with the web SPA via [`@time2leave/shared`](../../packages/shared).

## Runtime: development build (not Expo Go)

This project ships native modules (`@react-native-google-signin/google-signin`,
`react-native-reanimated` v4, `react-native-worklets`) that **Expo Go
cannot host**, and the App Store's Expo Go is also frequently a major
SDK behind the project's pinned SDK version. Both reasons mean the
canonical runtime is a [development build](https://docs.expo.dev/develop/development-builds/introduction/) —
a custom binary of this app that hosts your JS bundle from Metro.

The first build takes ~5–10 minutes (xcodebuild + CocoaPods);
afterwards you only need Metro running and the time2leave app
installed on the simulator/device.

### iOS — first build

Prereqs: Xcode (App Store, ~15 GB), `xcode-select --install`, CocoaPods
(`sudo gem install cocoapods` — Apple Silicon may need `brew install
cocoapods` instead).

```bash
npm run env:pull:mobile -- <local|prod>   # hydrate apps/mobile/.env
npm run build:ios:mobile                  # = expo run:ios
```

The script auto-prebuilds (`apps/mobile/ios/` is generated and
gitignored), runs `pod install`, builds, installs on the iPhone
simulator, and launches the app. You should see the splash screen.

### iOS — day-to-day

```bash
npm run dev:mobile                        # = expo start --dev-client
```

Tap the **time2leave** app on the simulator (or scan the QR with the
dev client app on a physical device). Metro hot-reloads JS changes
instantly. You only need to re-run `build:ios:mobile` when:

- You add/remove a native module (anything starting with `react-native-*`
  or `expo-*`).
- You change `app.config.ts` in a way that affects `Info.plist`,
  `AndroidManifest.xml`, or registered config plugins (e.g. switching
  `EXPO_PUBLIC_APP_ENV` between `local` and `prod`, since the Google
  Sign-In plugin is only registered in `prod`).

### Android — first build

Prereqs: [Android Studio](https://developer.android.com/studio) +
`ANDROID_HOME` set + an emulator running, **or** a physical device
with USB debugging enabled and `adb devices` showing it.

```bash
npm run env:pull:mobile -- <local|prod>
npm run build:android:mobile              # = expo run:android
```

After the first build, `npm run dev:mobile` works for both iOS and
Android — Metro serves both.

### Cloud-built dev builds (no local Xcode/Android Studio)

If you'd rather not install Xcode locally, use EAS:

```bash
eas build --profile development --platform ios       # ~15 min in the cloud
# Install via QR code on a real device (TestFlight install link, no submission)
```

The `development` profile in `eas.json` is preconfigured for this.

### Why not Expo Go?

Expo Go works only when:
1. The project's SDK exactly matches Expo Go's SDK (frequently lags by
   one major version on the App Store).
2. The project uses **only** modules baked into Expo Go.

This project violates (2) — `@react-native-google-signin` is a native
SDK that Expo Go can't dynamically load. There's no way to test
`prod` mode in Expo Go even if (1) lined up.

## Configuration is strict

There are no optional / "if configured" runtime branches. Every env
var below for your chosen mode is required. If anything is missing
the app boots into a **Setup Required** screen that lists each
missing variable, what it's for, and an example value — instead of
crashing or silently doing the wrong thing.

The same rule applies to `app.config.ts`: misconfigured prod builds
fail at `expo start` / `eas build` time with a precise message.

There are exactly two modes, picked by `EXPO_PUBLIC_APP_ENV`:

|                       | `local`                                    | `prod`                                                                        |
| --------------------- | ------------------------------------------ | ----------------------------------------------------------------------------- |
| Sign-in path on splash | Dev-login button only                      | Native Google Sign-In button only                                             |
| Use it for            | Day-to-day UI iteration in Expo Go         | TestFlight / Play Internal Testing builds                                     |
| Required env          | `EXPO_PUBLIC_APP_ENV`<br>`EXPO_PUBLIC_API_BASE_URL`<br>`EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`<br>`EXPO_PUBLIC_DEV_LOGIN_EMAIL` | All of `local`'s, **plus**:<br>`EXPO_PUBLIC_GOOGLE_OAUTH_WEB_CLIENT_ID`<br>`EXPO_PUBLIC_GOOGLE_OAUTH_IOS_CLIENT_ID` |
| Native Google plugin   | Not registered (skipped in `app.config.ts`) | Registered with iOS URL scheme auto-derived from the iOS client ID            |

There is no "show both" or "fallback" mode by design: each build
target has exactly one sign-in surface.

## Secrets live in GCP — `.env` is generated, never hand-edited

The canonical store for every value above is **GCP Secret Manager**.
You never copy `.env.example` to `.env`; you run a script that pulls
the secrets down for the chosen mode. The resulting `apps/mobile/.env`
is gitignored at the repo root **and** in this workspace's
`.gitignore`, so it cannot be committed.

Naming convention in Secret Manager:

```
gcp://<PROJECT>/secrets/time2leave-mobile-<MODE>-<VAR_NAME>
```

For example: `time2leave-mobile-prod-EXPO_PUBLIC_GOOGLE_OAUTH_IOS_CLIENT_ID`.

### One-time setup

1. Install + authenticate the Google Cloud SDK:

   ```bash
   brew install --cask google-cloud-sdk
   gcloud auth login
   gcloud config set project <YOUR_GCP_PROJECT_ID>
   ```

2. Enable Secret Manager on the project (one click in the Console, or
   `gcloud services enable secretmanager.googleapis.com`).

3. Make sure your account has `roles/secretmanager.secretAccessor`
   (read) and, if you'll be setting values, `roles/secretmanager.admin`
   (create / add version) on the project.

4. Populate each required secret (see the per-mode lists above). The
   helper prompts for the value silently — it never lands in shell
   history or appears on screen:

   ```bash
   # local mode (4 vars):
   npm run env:set:mobile -- local EXPO_PUBLIC_API_BASE_URL
   npm run env:set:mobile -- local EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
   npm run env:set:mobile -- local EXPO_PUBLIC_DEV_LOGIN_EMAIL

   # prod mode (4 vars — EXPO_PUBLIC_API_BASE_URL and the Maps key
   # may share values with local; create them again under the prod
   # namespace anyway, so the two modes can drift if needed):
   npm run env:set:mobile -- prod  EXPO_PUBLIC_API_BASE_URL
   npm run env:set:mobile -- prod  EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
   npm run env:set:mobile -- prod  EXPO_PUBLIC_GOOGLE_OAUTH_WEB_CLIENT_ID
   npm run env:set:mobile -- prod  EXPO_PUBLIC_GOOGLE_OAUTH_IOS_CLIENT_ID
   ```

   `EXPO_PUBLIC_APP_ENV` itself is NOT stored in GCP — the pull script
   writes it as the first line of `.env` based on the mode you pass.

### Day-to-day workflow

```bash
# Pull the latest secrets for the mode you want to run in:
npm run env:pull:mobile -- local       # writes apps/mobile/.env
# or
npm run env:pull:mobile -- prod

# Then start Expo as usual:
npm run dev:mobile
```

Re-run `env:pull` after you (or anyone else) rotates a secret in GCP.
Expo only reads `.env` on cold start, so kill `expo start` and run it
again after pulling.

### Switching mode

Just run the pull script with the other mode — it overwrites
`apps/mobile/.env` atomically (a temp file is moved into place only
after every secret was fetched, so a partial pull never replaces a
working `.env`).

## Quickstart — `local` mode

```bash
# From the repo root, one time:
npm install
brew install --cask google-cloud-sdk
gcloud auth login
gcloud config set project <YOUR_GCP_PROJECT_ID>

# Hydrate apps/mobile/.env from GCP Secret Manager:
npm run env:pull:mobile -- local

# Backend in another terminal:
make dev

# First-time iOS build (~5–10 min — Xcode required):
npm run build:ios:mobile

# Day-to-day from then on (just Metro; tap the installed app):
npm run dev:mobile
```

The splash screen will show a single "Continue as &lt;email&gt;" button
(no Google Sign-In in `local` mode).

> **LAN tip.** Whatever you put in
> `time2leave-mobile-local-EXPO_PUBLIC_API_BASE_URL` has to be reachable
> from the phone. `localhost` from the phone means the phone itself,
> not your laptop. Use your laptop's LAN IP (`ipconfig getifaddr en0`
> on Wi-Fi, `en1` on Ethernet); for the iOS simulator `localhost`
> works; for the Android emulator use `http://10.0.2.2:8000`.

> **Backend prep.** `backend/.env` needs `APP_ENV=local`,
> `ENABLE_DEV_LOGIN=true`, and your `EXPO_PUBLIC_DEV_LOGIN_EMAIL`
> in `ADMIN_EMAILS` or `AUTH_ALLOWLIST_BOOTSTRAP`.

## Quickstart — `prod` mode (TestFlight / Play Internal Testing)

You'll need (one time):

1. **Three OAuth client IDs** in the Google Cloud Console for your
   project — Web, iOS (`com.time2leave.app`), Android (package
   `com.time2leave.app` + the SHA-1 of your EAS signing keystore).
2. The backend `GOOGLE_OAUTH_CLIENT_ID` set to a comma-separated list
   of all three IDs (so any of them validates a posted ID token).
3. A reserved bundle ID `com.time2leave.app` in **App Store Connect**
   and a reserved package name `com.time2leave.app` in **Google Play
   Console**.
4. The four `prod`-mode secrets populated in GCP Secret Manager (see
   "One-time setup" above).

Then:

```bash
npm run env:pull:mobile -- prod

npm install -g eas-cli
eas login

eas build --platform ios       # → TestFlight via `eas submit -p ios`
eas build --platform android   # → Play Internal Testing via `eas submit -p android`
```

> **EAS Build doesn't see your local `.env`.** EAS runs the build in
> its own cloud workers; pulling locally is for `expo start` and for
> exporting a JS bundle locally. To make the same secrets available
> inside EAS, mirror them into EAS environment variables (`eas env:create
> --environment production --name EXPO_PUBLIC_X --value ...`) or use
> `eas secret:create`. Future work: add an `env:push:eas` script that
> reads from GCP and writes to EAS in one step.

See [`STORE_RELEASE.md`](./STORE_RELEASE.md) for the full per-store
checklist (assets, privacy disclosures, etc.).

## Files of note

| Path                                                                         | Purpose                                                                                       |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [`scripts/pull-env.sh`](scripts/pull-env.sh)                                 | Hydrates `.env` from GCP Secret Manager for the chosen mode.                                  |
| [`scripts/set-env-var.sh`](scripts/set-env-var.sh)                           | Creates / rotates a single secret in GCP (interactive, silent input).                         |
| [`app.config.ts`](app.config.ts)                                             | Dynamic Expo config; throws at config-load if `APP_ENV` (or in prod, the iOS client ID) is missing. |
| [`app/_layout.tsx`](app/_layout.tsx)                                         | Root providers + env gate: renders `<SetupRequired>` if env is invalid.                       |
| [`app/index.tsx`](app/index.tsx)                                             | Splash + sign-in screen (dev-login in `local`, Google in `prod`).                             |
| [`app/trips/_layout.tsx`](app/trips/_layout.tsx)                             | Auth gate for the trips section.                                                              |
| [`app/trips/index.tsx`](app/trips/index.tsx)                                 | Trips list.                                                                                   |
| [`app/trips/new.tsx`](app/trips/new.tsx)                                     | New-trip form with Google Places autocomplete.                                                |
| [`app/trips/[tripId].tsx`](app/trips/[tripId].tsx)                           | Trip detail with heatmap + backfill polling.                                                  |
| [`src/config/env.ts`](src/config/env.ts)                                     | Strict env validator (the source of truth for what's required).                               |
| [`src/components/SetupRequired.tsx`](src/components/SetupRequired.tsx)       | The "fix your .env" screen rendered when `loadEnv()` fails.                                   |
| [`src/api/client.ts`](src/api/client.ts)                                     | Wraps `@time2leave/shared`'s `createApiFetch` with the bearer-token transport.                |
| [`src/api/storage.ts`](src/api/storage.ts)                                   | `expo-secure-store` adapter for the session JWT.                                              |
| [`src/auth/AuthProvider.tsx`](src/auth/AuthProvider.tsx)                     | Global auth context (mirror of web's `<SessionProvider>`).                                    |
| [`src/auth/GoogleSignInButton.tsx`](src/auth/GoogleSignInButton.tsx)         | Native "Continue with Google" wired to the shared login helper. Only rendered in `prod` mode. |
| [`src/components/TripHeatmap.tsx`](src/components/TripHeatmap.tsx)           | 7×60 cell grid built from `<View>`s and shared `colorFor()`.                                  |
| [`src/theme/index.ts`](src/theme/index.ts)                                   | Material Design 3 theme tokens that mirror the web brand palette.                             |

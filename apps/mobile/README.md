# @time2leave/mobile

Native iOS + Android client for time2leave, built on Expo SDK 55 (React
Native 0.83) and Expo Router. Shares types, API client, and heatmap
math with the web SPA via [`@time2leave/shared`](../../packages/shared).

## Quickstart (Expo Go on a phone)

```bash
# From the repo root:
npm install                        # workspaces; only needed once
cp apps/mobile/.env.example apps/mobile/.env

# Edit apps/mobile/.env so EXPO_PUBLIC_API_BASE_URL points at your
# laptop's LAN IP (NOT localhost) so a phone can reach the backend.

npm run dev:mobile                 # equivalent to: cd apps/mobile && npx expo start
```

Scan the QR code with the Expo Go app on iOS or Android. The splash
screen offers "Continue as dev@example.com" so you can iterate on the
UI without setting up Google sign-in first.

## Native sign-in (Google) setup

Production builds use `@react-native-google-signin/google-signin` with
three OAuth client IDs registered in your Google Cloud project (one
each for Web, iOS, Android). The backend `GOOGLE_OAUTH_CLIENT_ID`
setting accepts a comma-separated list, so any of the three IDs is
honored on `POST /api/v1/auth/google`.

Bare minimum env values for a real build:

| Var | Where it goes |
| --- | --- |
| `EXPO_PUBLIC_GOOGLE_OAUTH_WEB_CLIENT_ID` | The web OAuth client ID (Google Identity Services requires this even for native sign-in — see [`@react-native-google-signin` docs](https://react-native-google-signin.github.io/docs/install)). |
| `EXPO_PUBLIC_GOOGLE_OAUTH_IOS_CLIENT_ID` | iOS OAuth client ID. Also baked into the `GIDClientID` Info.plist key via `app.json`. |
| `GOOGLE_OAUTH_IOS_URL_SCHEME` (env at build time) | The reversed iOS client ID (e.g. `com.googleusercontent.apps.123456-abc`). Wired into the iOS URL scheme via the `@react-native-google-signin/google-signin` config plugin in `app.json`. |

Android uses the package name + signing-cert SHA-1 as the OAuth client
identity; no extra `EXPO_PUBLIC_*` is needed at runtime, but the
keystore SHA-1 must be registered in GCP for `eas build` to produce a
signing-compatible APK.

## Building for the stores

EAS Build produces signed binaries in the cloud — no local Xcode /
Android SDK required.

```bash
# One-time:
npx expo install -- --check
npm install -g eas-cli
eas login

# Per build:
eas build --platform ios       # → TestFlight via `eas submit -p ios`
eas build --platform android   # → Play Internal Testing via `eas submit -p android`
```

Bundle IDs (`com.time2leave.app`) are pre-set in `app.json`; reserve
them in App Store Connect and Google Play Console before the first
submission.

## Files of note

| Path | Purpose |
| --- | --- |
| [`app/_layout.tsx`](app/_layout.tsx) | Root providers (Paper, React Query, Auth, SafeArea, Reanimated). |
| [`app/index.tsx`](app/index.tsx) | Splash + sign-in screen. |
| [`app/trips/_layout.tsx`](app/trips/_layout.tsx) | Auth gate for the trips section. |
| [`app/trips/index.tsx`](app/trips/index.tsx) | Trips list. |
| [`app/trips/new.tsx`](app/trips/new.tsx) | New-trip form with Google Places autocomplete. |
| [`app/trips/[tripId].tsx`](app/trips/[tripId].tsx) | Trip detail with heatmap + backfill polling. |
| [`src/api/client.ts`](src/api/client.ts) | Wraps `@time2leave/shared`'s `createApiFetch` with the bearer-token transport. |
| [`src/api/storage.ts`](src/api/storage.ts) | `expo-secure-store` adapter for the session JWT. |
| [`src/auth/AuthProvider.tsx`](src/auth/AuthProvider.tsx) | Global auth context (mirror of web's `<SessionProvider>`). |
| [`src/auth/GoogleSignInButton.tsx`](src/auth/GoogleSignInButton.tsx) | Native "Continue with Google" wired to the shared login helper. |
| [`src/components/TripHeatmap.tsx`](src/components/TripHeatmap.tsx) | 7×60 cell grid built from `<View>`s and shared `colorFor()`. |
| [`src/theme/index.ts`](src/theme/index.ts) | Material Design 3 theme tokens that mirror the web brand palette. |

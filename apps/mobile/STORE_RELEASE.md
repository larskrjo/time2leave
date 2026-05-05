# Store release checklist (iOS + Android)

This file tracks the human-only parts of shipping **Time2Leave** to
the App Store and Google Play. Everything else (build config, signing,
upload) is automated through EAS — see [`eas.json`](eas.json).

The bundle ID `com.time2leave.app` is already reserved in
[`app.config.ts`](app.config.ts) for both platforms; the steps below
register it on each store and produce a first internal build.

## 1. Reserve the bundle ID

### App Store Connect

1. Log in to <https://appstoreconnect.apple.com/> with your team's
   Apple ID.
2. **Apps → +** → **New App**.
3. Fill in:
    - Platforms: **iOS**
    - Name: `Time2Leave`
    - Primary language: English (U.S.)
    - Bundle ID: **`com.time2leave.app`** (use the dropdown — if it's
      not there, add it via <https://developer.apple.com/account/resources/identifiers/list>
      first)
    - SKU: `time2leave-ios`
4. Hit Create. Note the **App Store Connect App ID** (10-digit
   numeric) and put it in `eas.json` under
   `submit.production.ios.ascAppId`.

### Google Play Console

1. Log in to <https://play.google.com/console>.
2. **Create app**:
    - App name: `Time2Leave`
    - Default language: English (United States)
    - App or game: App
    - Free or paid: Free
    - Declarations: tick all required acknowledgments.
3. After creation: **App information → Set up your app** and complete
    the privacy policy link, target audience, content rating
    questionnaire, and data-safety form (see §3 below).
4. Set **package name** to `com.time2leave.app` when prompted (only
    settable on the very first internal release).

## 2. Assets

App icon, adaptive-icon, splash, and favicon PNGs all live in
[`apps/mobile/assets/`](assets/) and are generated from a single SVG
source — see [`assets/README.md`](assets/README.md). They are already
wired into [`app.config.ts`](app.config.ts) (`icon`, `splash` plugin,
`android.adaptiveIcon`, `web.favicon`), so the only action item here
is to regenerate them after any brand-mark changes:

```bash
npm --prefix apps/mobile run icons
```

Marketing screenshots (uploaded directly in App Store Connect / Play
Console; not committed to git):

- iPhone 6.7" (mandatory) — at least 3 shots showing splash, trip
  list, trip detail with heatmap, and the new-trip form.
- iPad 12.9" (only if you intend to publish for iPad — you can skip
  this and ship iPhone-only first).
- Android phone — same set; portrait, ≥1080px wide.

## 3. Apple privacy + Google data-safety

The app collects and sends to its own backend:

- **Email** (Account creation, app functionality — gated by sign-in)
- **Coarse location** (Approximate; optional — not currently used,
  declare "No" until/unless we add geofenced "leave now" alerts)
- **Postal addresses** (App functionality — origin / destination
  entered by the user; saved server-side under the user's account)

Apple "App Privacy" (App Store Connect → App → Privacy):
- Data Linked to User: **Email Address**, **Other User Content**
  (the saved trip addresses).
- Data Used to Track You: **None**.
- Tracking: **No**.

Google "Data safety" (Play Console → App content → Data safety):
- Personal info → Email address: collected, processed, **not shared**
  with third parties, encrypted in transit, optional, used for
  account management + app functionality.
- App activity → Other actions: collected (saved trip addresses),
  same disclosures as above.

## 4. First build

```bash
# One-time:
npm install -g eas-cli
eas login
cd apps/mobile && eas init   # links the local app to its EAS project

# Production builds (cloud — no Mac for Android, no Android SDK for iOS):
eas build --platform ios --profile production
eas build --platform android --profile production
```

EAS handles signing automatically: it'll create / reuse an iOS
Distribution certificate and provisioning profile, and generate /
upload an Android upload key.

## 5. Submit

```bash
eas submit --platform ios --latest      # → TestFlight
eas submit --platform android --latest  # → Play Internal Testing
```

Manual rollout from each console after smoke-testing on real devices.

## 6. Post-launch

- Increment `expo.version` in `app.json` per release.
- `eas build --auto-submit` chains build + submit in one command once
  you trust the pipeline.
- Watch <https://expo.dev/accounts/time2leave/projects/time2leave/builds>
  for build status, logs, and downloadable artifacts.

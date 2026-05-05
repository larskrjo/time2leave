# apps/mobile/assets

Brand assets for the native app. Everything in this folder (except
[`brand/`](brand/)) is **generated** from
[`brand/icon.svg`](brand/icon.svg) by
[`scripts/generate-icons.mjs`](../scripts/generate-icons.mjs).

| File | Size | Used for |
| --- | --- | --- |
| `icon.png` | 1024×1024 | iOS app icon (universal). Wired via `icon` in [`app.config.ts`](../app.config.ts). |
| `adaptive-icon.png` | 1024×1024 | Android adaptive-icon foreground. Full-bleed gradient with the "2" inside the 66% safe-zone circle so launchers never crop it. Wired via `android.adaptiveIcon.foregroundImage`. |
| `splash-icon.png` | 1024×1024 | Centered brand mark on a transparent canvas. The `expo-splash-screen` plugin paints it on top of the splash `backgroundColor`. |
| `favicon.png` | 48×48 | Web bundle favicon. Wired via `web.favicon`. |

## Regenerating

```bash
npm --prefix apps/mobile run icons
```

The script is deterministic — same SVG in, same PNGs out — so re-running
it on a clean checkout produces byte-identical files. Edit
[`brand/icon.svg`](brand/icon.svg) (the canonical artwork) and re-run
the script to update every variant in one step.

## Brand cues (matches the web app)

- Linear gradient `#1e40af` (primary blue) → `#ef6c00` (secondary
  orange), 135° axis. Same ramp as the wordmark and primary CTAs in
  [`apps/web`](../../web).
- Bold italic "2" in white as the signature glyph (the unique
  character in the domain name, picked out in italic in the wordmark).
- Rounded square at ~22% radius — friendly with iOS's automatic
  squircle mask without becoming a pill at small sizes.

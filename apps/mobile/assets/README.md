# apps/mobile/assets

App icon, splash, and adaptive-icon source PNGs live here. They are
**not** committed yet — see [`../STORE_RELEASE.md`](../STORE_RELEASE.md)
§ "Assets" for the file list, sizes, and how they wire into
[`../app.json`](../app.json).

Designer brief:

- Subject: a stylized clock/dot tile motif aligned with the heatmap
  color scale (green → yellow → red on `hsl(120 70% L)` → `hsl(0 70% L)`).
- Wordmark color: `#1e40af` (primary) blue with the italic "2" in
  `#ef6c00` (secondary) orange — same gradient as the web hero.
- Safe zone for `adaptive-icon.png`: keep important art inside the
  central 66% diameter circle so Pixel and Galaxy launchers don't
  clip the corners.

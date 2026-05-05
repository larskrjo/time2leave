#!/usr/bin/env node
/**
 * Render every PNG icon variant the native app needs from the
 * canonical SVG source in `assets/brand/icon.svg`.
 *
 * Outputs (overwritten on every run):
 *
 *   assets/icon.png            1024x1024  iOS app icon (universal)
 *   assets/adaptive-icon.png   1024x1024  Android adaptive foreground
 *   assets/splash-icon.png     1024x1024  Splash mark (transparent)
 *   assets/favicon.png         48x48      Web favicon
 *   assets/notification-icon.png 96x96    Android notification monochrome
 *
 * Run with:
 *
 *   npm --prefix apps/mobile run icons
 *
 * The script relies on `sharp` (devDependency) which embeds resvg for
 * SVG rasterisation, so output is deterministic and doesn't depend on
 * any system-installed font for vector shapes — the only place a
 * system font is consulted is when rendering the "2" glyph, and we
 * pin it to a portable system-ui stack so resvg falls back to whatever
 * sans-serif the host machine ships (San Francisco on macOS, DejaVu
 * Sans on Linux CI). In practice both resolve to a bold italic "2"
 * that's visually indistinguishable at icon scale.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const HERE = dirname(fileURLToPath(import.meta.url));
const MOBILE_ROOT = dirname(HERE);
const ASSETS = join(MOBILE_ROOT, "assets");
const SOURCE_SVG = join(ASSETS, "brand", "icon.svg");

/**
 * Render the source SVG straight to a PNG of `size` x `size`. Used for
 * the iOS icon, the adaptive-icon foreground (full-bleed gradient with
 * the "2" sized to stay inside Android's 66% safe-zone circle), and
 * the small web favicon.
 */
async function renderFullBleed(svg, sizePx, outPath) {
    const png = await sharp(Buffer.from(svg), { density: 384 })
        .resize(sizePx, sizePx)
        .png({ compressionLevel: 9 })
        .toBuffer();
    await writeFile(outPath, png);
    process.stdout.write(`  wrote ${outPath} (${sizePx}x${sizePx})\n`);
}

/**
 * Render the source SVG centered inside a `canvasPx`-square transparent
 * canvas at `markPx` wide. Used for the splash-icon, which the
 * `expo-splash-screen` plugin paints on top of `backgroundColor`. The
 * surrounding transparency gives the mark a comfortable margin so it
 * never feels glued to the splash background.
 */
async function renderCenteredOnTransparent(svg, canvasPx, markPx, outPath) {
    const mark = await sharp(Buffer.from(svg), { density: 384 })
        .resize(markPx, markPx)
        .png()
        .toBuffer();
    const composed = await sharp({
        create: {
            width: canvasPx,
            height: canvasPx,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
    })
        .composite([{ input: mark, gravity: "center" }])
        .png({ compressionLevel: 9 })
        .toBuffer();
    await writeFile(outPath, composed);
    process.stdout.write(
        `  wrote ${outPath} (${canvasPx}x${canvasPx}, mark ${markPx}px)\n`,
    );
}

async function main() {
    const svg = await readFile(SOURCE_SVG, "utf8");
    await mkdir(ASSETS, { recursive: true });

    process.stdout.write("Generating icons from assets/brand/icon.svg...\n");

    await renderFullBleed(svg, 1024, join(ASSETS, "icon.png"));
    await renderFullBleed(svg, 1024, join(ASSETS, "adaptive-icon.png"));
    await renderFullBleed(svg, 48, join(ASSETS, "favicon.png"));
    await renderCenteredOnTransparent(
        svg,
        1024,
        720,
        join(ASSETS, "splash-icon.png"),
    );

    process.stdout.write("Done.\n");
}

main().catch((err) => {
    process.stderr.write(`Icon generation failed: ${err?.stack ?? err}\n`);
    process.exit(1);
});

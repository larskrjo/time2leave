/**
 * Pure-TS code shared between the web SPA (`apps/web`) and the
 * Expo mobile app (`apps/mobile`).
 *
 * No React, no DOM-only APIs, no `import.meta` / `process.env`. Everything
 * configurable (base URL, auth transport, fetch implementation) is
 * parameterized so the same code works in browser, React Native, and
 * Vitest's jsdom.
 */
export * from "./types";
export * from "./time";
export * from "./slots";
export * from "./paths";
export * from "./api";
export * from "./trips";
export * from "./session";
export * from "./heatmap";

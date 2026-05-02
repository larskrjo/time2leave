/**
 * Metro config for the Expo mobile workspace.
 *
 * Two pieces of monorepo wiring on top of the Expo defaults:
 *   1. `watchFolders` includes the repo root so Metro reloads when
 *      `packages/shared` changes.
 *   2. `nodeModulesPaths` includes the repo-root `node_modules` so
 *      hoisted workspace packages (most of them) resolve correctly.
 *
 * No symlink resolver tweaks needed — Metro 0.80+ follows symlinks by
 * default, which is how `@time2leave/shared` is wired up via
 * `node_modules/@time2leave/shared`.
 */
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];

config.resolver.nodeModulesPaths = [
    path.resolve(projectRoot, "node_modules"),
    path.resolve(monorepoRoot, "node_modules"),
];

config.resolver.disableHierarchicalLookup = true;

module.exports = config;

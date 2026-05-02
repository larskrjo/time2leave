/**
 * Re-export of the time-format helpers from `@time2leave/shared`.
 *
 * Kept as a local module so existing call sites (`from "~/lib/time"`)
 * don't need to change after the monorepo migration.
 */
export { formatHour12h, formatSlot12h } from "@time2leave/shared";

/**
 * Time-format helpers.
 *
 * The backend stores sample slots as `"HH:MM"` strings in 24-hour form
 * (`"06:00"`, `"13:45"`, `"21:00"`). That's the correct machine format
 * — sort-safe, unambiguous, trivially comparable — so it's kept as the
 * internal representation everywhere in the frontend as well. The
 * helpers below are *display-only* conversions to the 12-hour format
 * users actually expect on a commute-planning app.
 *
 * Two formats:
 *   - `formatSlot12h("06:15")` → `"6:15am"` — used wherever we show a
 *     concrete departure time (best-time chips, tooltips, mobile
 *     accordion cells).
 *   - `formatHour12h("06:00")` → `"6a"` — compact single-label form
 *     used for the heatmap hour-axis, where we only have a handful of
 *     pixels per tick and need the label to fit inside a ~12px cell.
 */

function twelveHourParts(slot: string): { h12: number; minutes: number; ampm: "am" | "pm" } {
    const [hStr, mStr] = slot.split(":");
    const h24 = Number(hStr) || 0;
    const minutes = Number(mStr) || 0;
    const ampm: "am" | "pm" = h24 >= 12 ? "pm" : "am";
    const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
    return { h12, minutes, ampm };
}

/**
 * Full 12-hour display for a slot. Minutes are always shown so that a
 * list of slots lines up visually (`6:00am`, `6:15am`, `6:30am`, …).
 */
export function formatSlot12h(slot: string): string {
    const { h12, minutes, ampm } = twelveHourParts(slot);
    return `${h12}:${String(minutes).padStart(2, "0")}${ampm}`;
}

/**
 * Compact hour-only display for axis labels. Drops the `:00` and
 * shrinks am/pm to a single letter, so `"06:00" → "6a"` and
 * `"21:00" → "9p"`. Only meaningful for on-the-hour slots; for
 * anything else the empty string is returned so the caller can treat
 * it as a spacer cell.
 */
export function formatHour12h(slot: string): string {
    if (!slot.endsWith(":00")) return "";
    const { h12, ampm } = twelveHourParts(slot);
    return `${h12}${ampm[0]}`;
}

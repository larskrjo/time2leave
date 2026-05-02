/**
 * Smoke tests for the pure helpers in `@time2leave/shared`.
 *
 * Heavier behavioral tests live in the consuming app's vitest suite
 * (which exercises the same functions transitively); the assertions
 * here just guard the contract of each helper so the shared package
 * stays self-checkable in CI without requiring jsdom.
 */
import { describe, expect, it } from "vitest";

import {
    bestSlotPerDay,
    colorFor,
    createApiPaths,
    formatHour12h,
    formatSlot12h,
    heatmapMinMax,
    minutesLabel,
    weekTimeSlots,
    type HeatmapPayload,
} from "./index";

describe("createApiPaths", () => {
    it("returns absolute URLs prefixed with the given base", () => {
        const p = createApiPaths("https://api.example.com");
        expect(p.me).toBe("https://api.example.com/api/v1/me");
        expect(p.trip("abc123def4")).toBe(
            "https://api.example.com/api/v1/trips/abc123def4",
        );
    });

    it("URL-encodes the email in the admin allowlist entry path", () => {
        const p = createApiPaths("http://x");
        expect(p.adminAllowlistEntry("a+b@x.com")).toBe(
            "http://x/api/v1/admin/allowlist/a%2Bb%40x.com",
        );
    });
});

describe("weekTimeSlots", () => {
    it("yields 60 slots for 06:00..20:45 in 15-min steps", () => {
        const slots = weekTimeSlots();
        expect(slots).toHaveLength(60);
        expect(slots[0]).toBe("06:00");
        expect(slots[1]).toBe("06:15");
        expect(slots[slots.length - 1]).toBe("20:45");
    });
});

describe("time formatters", () => {
    it("formatSlot12h zero-pads minutes", () => {
        expect(formatSlot12h("06:00")).toBe("6:00am");
        expect(formatSlot12h("06:15")).toBe("6:15am");
        expect(formatSlot12h("13:45")).toBe("1:45pm");
        expect(formatSlot12h("00:30")).toBe("12:30am");
        expect(formatSlot12h("12:00")).toBe("12:00pm");
        expect(formatSlot12h("21:00")).toBe("9:00pm");
    });

    it("formatHour12h is empty for non-hour slots", () => {
        expect(formatHour12h("06:00")).toBe("6a");
        expect(formatHour12h("13:00")).toBe("1p");
        expect(formatHour12h("06:15")).toBe("");
    });
});

describe("colorFor", () => {
    it("returns the neutral when the grid is empty", () => {
        expect(colorFor(0, 0, 0)).toMatch(/hsl\(200/);
    });

    it("returns the amber midpoint for zero variance", () => {
        expect(colorFor(50, 50, 50)).toMatch(/hsl\(60/);
    });

    it("maps the min minutes to pure green and the max to pure red", () => {
        expect(colorFor(10, 10, 60)).toMatch(/hsl\(120/);
        expect(colorFor(60, 10, 60)).toMatch(/hsl\(0 /);
    });
});

describe("minutesLabel", () => {
    it("is minutes-only under 60", () => {
        expect(minutesLabel(0)).toBe("0m");
        expect(minutesLabel(59)).toBe("59m");
    });
    it("is hours-and-minutes 60+", () => {
        expect(minutesLabel(60)).toBe("1h");
        expect(minutesLabel(125)).toBe("2h5m");
    });
});

const fixtureHeatmap: HeatmapPayload = {
    outbound: {
        Mon: { "07:00": 42, "08:00": 78 },
        Tue: { "07:00": 45 },
        Wed: {},
        Thu: {},
        Fri: { "08:00": 88 },
        Sat: {},
        Sun: {},
    },
    return: {
        Mon: {},
        Tue: {},
        Wed: {},
        Thu: {},
        Fri: {},
        Sat: {},
        Sun: {},
    },
    week_start_date: "2025-11-10",
    weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    next_week_available: false,
};

describe("heatmapMinMax", () => {
    it("scans every sampled cell and returns the absolute extremes", () => {
        const { minMinutes, maxMinutes } = heatmapMinMax(
            fixtureHeatmap,
            "outbound",
        );
        expect(minMinutes).toBe(42);
        expect(maxMinutes).toBe(88);
    });

    it("returns the empty fallback when nothing is sampled", () => {
        const { minMinutes, maxMinutes } = heatmapMinMax(
            fixtureHeatmap,
            "return",
        );
        expect(minMinutes).toBe(0);
        expect(maxMinutes).toBe(0);
    });
});

describe("bestSlotPerDay", () => {
    it("yields exactly one entry per weekday with at least one sample", () => {
        const out = bestSlotPerDay(fixtureHeatmap, "outbound");
        expect(out.map((b) => b.day)).toEqual(["Mon", "Tue", "Fri"]);
        expect(out[0]).toMatchObject({
            day: "Mon",
            slot: "07:00",
            minutes: 42,
        });
    });
});

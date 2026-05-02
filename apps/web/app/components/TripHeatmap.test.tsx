import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TripHeatmap, TripHeatmapSummary } from "~/components/TripHeatmap";
import { sampleHeatmapResponse } from "~/test/mocks/handlers";
import { renderWithProviders } from "~/test/render";

describe("TripHeatmap", () => {
    it("renders a row for every weekday", () => {
        renderWithProviders(
            <TripHeatmap heatmap={sampleHeatmapResponse} direction="outbound" />,
        );
        for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
            expect(screen.getByText(day)).toBeInTheDocument();
        }
    });
});

describe("TripHeatmapSummary", () => {
    it("shows the fastest slot per weekday with at least one sample", () => {
        renderWithProviders(
            <TripHeatmapSummary
                heatmap={sampleHeatmapResponse}
                direction="outbound"
            />,
        );

        // The summary chip for Mon should highlight the cheapest sample
        // (07:00 internal → "7:00am" in the UI = 42m for the outbound
        // fixture).
        expect(screen.getByText(/Mon · best/i)).toBeInTheDocument();
        // Time + duration render as adjacent spans, so look for each
        // across the full subtree via a text matcher.
        expect(screen.getByText(/42m/i)).toBeInTheDocument();
        expect(
            screen.getAllByText((_, el) =>
                (el?.textContent ?? "").includes("7:00am"),
            ).length,
        ).toBeGreaterThan(0);
    });

    it("shows a fallback when nothing has been sampled yet", () => {
        renderWithProviders(
            <TripHeatmapSummary
                heatmap={{
                    outbound: {},
                    return: {},
                    week_start_date: "2025-11-10",
                    weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
                    next_week_available: false,
                }}
                direction="outbound"
            />,
        );
        expect(
            screen.getByText(/will appear here once samples start coming in/i),
        ).toBeInTheDocument();
    });

    it("renders all best-day pills as siblings of one row spanning the section width", () => {
        // The user wants one even strip across the full section width
        // — not one row per day, not collision-stacked pills, and not
        // a left-only gutter that pushes the strip visually off-center
        // from the section header. Pin that down two ways:
        //   1. Every pill (one per sampled day) is a child of the
        //      same flex container.
        //   2. That container has *no* left padding, so the strip's
        //      left edge lines up with the section header rather than
        //      with the heatmap's day-label gutter.
        // The fixture has bests for Mon/Tue/Wed/Fri (4 days).
        renderWithProviders(
            <TripHeatmapSummary
                heatmap={sampleHeatmapResponse}
                direction="outbound"
                onHoverSlot={() => {}}
            />,
        );

        const pills = screen.getAllByRole("button", {
            name: /Highlight \w+ \d{2}:\d{2} on heatmap/i,
        });
        expect(pills).toHaveLength(4);

        const flexRow = pills[0].closest("[class*='MuiStack-root']");
        expect(flexRow).not.toBeNull();
        // All pills share the same parent flex row.
        for (const pill of pills) {
            expect(pill.closest("[class*='MuiStack-root']")).toBe(flexRow);
        }
        // And the flex row has no left/right padding, so the strip
        // sits symmetrically across the section width. (jsdom returns
        // "0" for an unset padding rather than "0px", hence the
        // string-or-numeric tolerance.)
        const cs = window.getComputedStyle(flexRow as HTMLElement);
        expect(parseFloat(cs.paddingLeft || "0")).toBe(0);
        expect(parseFloat(cs.paddingRight || "0")).toBe(0);
    });
});

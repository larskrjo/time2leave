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
                }}
                direction="outbound"
            />,
        );
        expect(
            screen.getByText(/will appear here once samples start coming in/i),
        ).toBeInTheDocument();
    });
});

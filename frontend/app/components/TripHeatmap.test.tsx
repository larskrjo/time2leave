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

        // Mon's fastest outbound sample is 09:00 (60 minutes), since 07:00=42
        // Wait — actually the lowest is 07:00 (42).
        expect(screen.getByText(/Mon · best/i)).toBeInTheDocument();
        expect(screen.getByText(/07:00 · 42m/i)).toBeInTheDocument();
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

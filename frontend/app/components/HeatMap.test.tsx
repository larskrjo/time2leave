import {describe, expect, it} from "vitest";
import {render, screen} from "@testing-library/react";

import HeatMap from "./HeatMap";
import {sampleHeatmapResponse} from "~/test/mocks/handlers";

describe("HeatMap", () => {
    it("shows loading state when data is null", () => {
        render(<HeatMap heatmapData={null} />);
        expect(screen.getByText(/Loading heatmap data/i)).toBeInTheDocument();
    });

    it("renders both direction tabs with period labels", () => {
        render(<HeatMap heatmapData={sampleHeatmapResponse} />);
        expect(screen.getByRole("tab", {name: /Home → Work \(Morning\)/i})).toBeInTheDocument();
        expect(screen.getByRole("tab", {name: /Work → Home \(Evening\)/i})).toBeInTheDocument();
    });

    it("shows the date range for the selected route", () => {
        render(<HeatMap heatmapData={sampleHeatmapResponse} />);
        expect(screen.getByText("Nov. 10 – Nov. 14")).toBeInTheDocument();
    });

    it("renders a fallback when the selected route has no data", () => {
        const minimal = {
            "Home → Work": sampleHeatmapResponse["Home → Work"],
        };
        render(<HeatMap heatmapData={minimal} />);
        expect(screen.getByRole("tab", {name: /Home → Work \(Morning\)/i})).toBeInTheDocument();
    });
});

import {describe, expect, it} from "vitest";

import {clientLoader} from "./index";
import {sampleHeatmapResponse} from "~/test/mocks/handlers";

describe("routes/index.clientLoader", () => {
    it("returns heatmap data from the API", async () => {
        const result = await (clientLoader as () => Promise<{heatmapData: unknown}>)();
        expect(result.heatmapData).toEqual(sampleHeatmapResponse);
    });
});

import {http, HttpResponse} from "msw";

export const sampleHeatmapResponse = {
    "Home → Work": {
        period: "Morning",
        date_range: "Nov. 10 – Nov. 14",
        heatmap_data: {
            Mon: {"07:00": 42, "08:00": 78, "09:00": 60},
            Tue: {"07:00": 45, "08:00": 80, "09:00": 62},
            Wed: {"07:00": 46, "08:00": 82, "09:00": 63},
            Thu: {"07:00": 47, "08:00": 85, "09:00": 65},
            Fri: {"07:00": 50, "08:00": 88, "09:00": 70},
        },
        weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
        times: ["07:00", "08:00", "09:00"],
    },
    "Work → Home": {
        period: "Evening",
        date_range: "Nov. 10 – Nov. 14",
        heatmap_data: {
            Mon: {"17:00": 85, "18:00": 70},
            Tue: {"17:00": 90, "18:00": 72},
            Wed: {"17:00": 92, "18:00": 74},
            Thu: {"17:00": 95, "18:00": 76},
            Fri: {"17:00": 100, "18:00": 80},
        },
        weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
        times: ["17:00", "18:00"],
    },
};

export const handlers = [
    http.get("*/api/v1/commute/heatmap", () =>
        HttpResponse.json(sampleHeatmapResponse),
    ),
];

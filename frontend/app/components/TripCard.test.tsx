import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TripCard } from "~/components/TripCard";
import { sampleTripSummary } from "~/test/mocks/handlers";
import { renderWithProviders } from "~/test/render";

describe("TripCard", () => {
    it("renders the trip name and addresses", () => {
        renderWithProviders(
            <TripCard trip={sampleTripSummary} onDelete={vi.fn()} />,
        );
        expect(screen.getByText(sampleTripSummary.name!)).toBeInTheDocument();
        expect(
            screen.getByText(sampleTripSummary.origin_address),
        ).toBeInTheDocument();
        expect(
            screen.getByText(sampleTripSummary.destination_address),
        ).toBeInTheDocument();
    });

    it("falls back to 'Trip #<id>' when name is null", () => {
        renderWithProviders(
            <TripCard
                trip={{ ...sampleTripSummary, name: null }}
                onDelete={vi.fn()}
            />,
        );
        expect(screen.getByText(`Trip #${sampleTripSummary.id}`)).toBeInTheDocument();
    });

    it("calls onDelete when the trash button is confirmed", async () => {
        const confirmSpy = vi
            .spyOn(window, "confirm")
            .mockReturnValue(true);
        const onDelete = vi.fn().mockResolvedValue(undefined);

        renderWithProviders(
            <TripCard trip={sampleTripSummary} onDelete={onDelete} />,
        );
        fireEvent.click(screen.getByRole("button", { name: /delete trip/i }));

        await waitFor(() => expect(onDelete).toHaveBeenCalledWith(sampleTripSummary));
        confirmSpy.mockRestore();
    });

    it("skips onDelete when the user cancels", () => {
        const confirmSpy = vi
            .spyOn(window, "confirm")
            .mockReturnValue(false);
        const onDelete = vi.fn();

        renderWithProviders(
            <TripCard trip={sampleTripSummary} onDelete={onDelete} />,
        );
        fireEvent.click(screen.getByRole("button", { name: /delete trip/i }));

        expect(onDelete).not.toHaveBeenCalled();
        confirmSpy.mockRestore();
    });
});

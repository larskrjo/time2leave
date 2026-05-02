/**
 * Generate the canonical 15-minute HH:MM labels for 06:00-21:00.
 * Kept on the client so we can show empty cells before any data
 * arrives (useful for the backfill-in-progress state).
 */
export function weekTimeSlots(): string[] {
    const slots: string[] = [];
    for (let h = 6; h < 21; h += 1) {
        for (let m = 0; m < 60; m += 15) {
            slots.push(
                `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
            );
        }
    }
    return slots;
}

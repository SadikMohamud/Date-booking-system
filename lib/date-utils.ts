import { addMinutes, format, isBefore, isAfter, startOfDay, endOfDay, parseISO, isEqual, isWithinInterval } from "date-fns";

/**
 * Generates available time slots for a specific date based on availability and existing bookings.
 */
export function generateAvailableSlots({
  date,
  duration,
  availability,
  bookings,
}: {
  date: Date;
  duration: number;
  availability: { startTime: string; endTime: string }[];
  bookings: { startTime: Date; endTime: Date }[];
}) {
  const slots: string[] = [];
  const dayStart = startOfDay(date);

  availability.forEach((window) => {
    const [startHour, startMin] = window.startTime.split(":").map(Number);
    const [endHour, endMin] = window.endTime.split(":").map(Number);

    let currentSlot = addMinutes(addMinutes(dayStart, startHour * 60), startMin);
    const windowEnd = addMinutes(addMinutes(dayStart, endHour * 60), endMin);

    while (isBefore(currentSlot, windowEnd)) {
      const slotEnd = addMinutes(currentSlot, duration);
      
      // Ensure the slot doesn't exceed the availability window
      if (isAfter(slotEnd, windowEnd)) break;

      // Check for conflicts with existing bookings
      const hasConflict = bookings.some((booking) => {
        const bStart = booking.startTime;
        const bEnd = booking.endTime;

        // Conflict if:
        // 1. New slot starts inside an existing booking
        // 2. New slot ends inside an existing booking
        // 3. Existing booking is entirely inside the new slot
        return (
          (isAfter(slotEnd, bStart) && isBefore(currentSlot, bEnd)) ||
          isEqual(currentSlot, bStart) ||
          isEqual(slotEnd, bEnd)
        );
      });

      if (!hasConflict) {
        slots.push(currentSlot.toISOString());
      }

      // Move to next slot (increments by duration, or a fixed interval like 15/30 mins)
      // For this boilerplate, we'll increment by duration to keep it simple.
      currentSlot = addMinutes(currentSlot, duration);
    }
  });

  return slots;
}

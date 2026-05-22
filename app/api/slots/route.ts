import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateAvailableSlots } from "@/lib/date-utils";
import { startOfDay, endOfDay, parseISO } from "date-fns";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dateStr = searchParams.get("date"); // YYYY-MM-DD
  const eventTypeId = searchParams.get("eventTypeId");

  if (!dateStr || !eventTypeId) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  const date = parseISO(dateStr);
  const dayOfWeek = date.getDay(); // 0 (Sun) to 6 (Sat)

  // 1. Fetch Event Type and the owner's details
  const eventType = await prisma.eventType.findUnique({
    where: { id: eventTypeId },
    include: {
      user: {
        include: {
          schedules: {
            include: {
              availability: {
                where: { dayOfWeek },
              },
            },
          },
        },
      },
    },
  });

  if (!eventType) {
    return NextResponse.json({ error: "Event type not found" }, { status: 404 });
  }

  // 2. Fetch existing bookings for this user on this day
  const bookings = await prisma.booking.findMany({
    where: {
      userId: eventType.userId,
      startTime: {
        gte: startOfDay(date),
        lte: endOfDay(date),
      },
    },
    select: {
      startTime: true,
      endTime: true,
    },
  });

  // 3. Collect availability windows for the day
  // For simplicity, we assume the first schedule is the active one
  const availability = eventType.user.schedules[0]?.availability || [];

  // 4. Generate slots
  const slots = generateAvailableSlots({
    date,
    duration: eventType.duration,
    availability,
    bookings,
  });

  return NextResponse.json({ slots });
}

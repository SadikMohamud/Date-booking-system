import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addMinutes, parseISO } from "date-fns";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { eventTypeId, startTime, attendeeName, attendeeEmail, attendeeTimeZone } = body;

    if (!eventTypeId || !startTime || !attendeeName || !attendeeEmail) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const eventType = await prisma.eventType.findUnique({
      where: { id: eventTypeId },
    });

    if (!eventType) {
      return NextResponse.json({ error: "Event type not found" }, { status: 404 });
    }

    const start = parseISO(startTime);
    const end = addMinutes(start, eventType.duration);

    // Atomic conflict check within a transaction
    const booking = await prisma.$transaction(async (tx) => {
      const conflict = await tx.booking.findFirst({
        where: {
          userId: eventType.userId,
          OR: [
            {
              startTime: { lte: start },
              endTime: { gt: start },
            },
            {
              startTime: { lt: end },
              endTime: { gte: end },
            },
          ],
        },
      });

      if (conflict) {
        throw new Error("This slot is already booked.");
      }

      return await tx.booking.create({
        data: {
          startTime: start,
          endTime: end,
          attendeeName,
          attendeeEmail,
          attendeeTimeZone,
          eventTypeId,
          userId: eventType.userId,
        },
      });
    });

    return NextResponse.json({ success: true, booking });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Something went wrong" }, { status: 500 });
  }
}

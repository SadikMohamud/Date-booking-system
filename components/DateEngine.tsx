"use client";

import React, { useState, useEffect } from "react";
import { format, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, parseISO, startOfToday } from "date-fns";

interface DateEngineProps {
  eventTypeId: string;
}

export default function DateEngine({ eventTypeId }: DateEngineProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(startOfToday());
  const [slots, setSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"date" | "form" | "success">("date");

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const today = startOfToday();
  const daysInMonth = eachDayOfInterval({
    start: startOfMonth(selectedDate),
    end: endOfMonth(selectedDate),
  });

  // Fetch slots whenever the date changes
  useEffect(() => {
    async function fetchSlots() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/slots?date=${format(selectedDate, "yyyy-MM-dd")}&eventTypeId=${eventTypeId}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setSlots(data.slots || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchSlots();
  }, [selectedDate, eventTypeId]);

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlot) return;

    setLoading(true);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventTypeId,
          startTime: selectedSlot,
          attendeeName: name,
          attendeeEmail: email,
          attendeeTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setStep("success");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (step === "success") {
    return (
      <div className="max-w-md mx-auto p-8 bg-white shadow-xl rounded-2xl text-center border border-gray-100">
        <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Booking Confirmed!</h2>
        <p className="text-gray-600">We've sent a confirmation email to {email}.</p>
        <button 
          onClick={() => window.location.reload()}
          className="mt-6 px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto bg-white shadow-2xl rounded-3xl overflow-hidden border border-gray-100 flex flex-col md:flex-row min-h-[500px]">
      {/* Left Panel: Info & Calendar */}
      <div className="md:w-1/2 p-8 border-r border-gray-100">
        <h1 className="text-sm font-semibold text-gray-500 uppercase tracking-widest mb-1">Schedule a Date</h1>
        <h2 className="text-3xl font-extrabold text-gray-900 mb-6">Booking Engine</h2>
        
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-800">{format(selectedDate, "MMMM yyyy")}</h3>
            <div className="flex gap-2">
              <button onClick={() => setSelectedDate(addDays(selectedDate, -30))} className="p-2 hover:bg-gray-100 rounded-full">
                &larr;
              </button>
              <button onClick={() => setSelectedDate(addDays(selectedDate, 30))} className="p-2 hover:bg-gray-100 rounded-full">
                &rarr;
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-gray-400 mb-2">
            <span>SUN</span><span>MON</span><span>TUE</span><span>WED</span><span>THU</span><span>FRI</span><span>SAT</span>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {/* Simple calendar grid placeholder for padding */}
            {Array.from({ length: daysInMonth[0].getDay() }).map((_, i) => <div key={i} />)}
            {daysInMonth.map((day) => (
              <button
                key={day.toISOString()}
                disabled={day < today}
                onClick={() => { setSelectedDate(day); setStep("date"); setSelectedSlot(null); }}
                className={`h-10 w-10 flex items-center justify-center rounded-full text-sm transition-all
                  ${isSameDay(day, selectedDate) ? "bg-black text-white font-bold" : "hover:bg-gray-100 text-gray-700"}
                  ${day < today ? "opacity-20 cursor-not-allowed" : "cursor-pointer"}
                `}
              >
                {format(day, "d")}
              </button>
            ))}
          </div>
        </div>

        <p className="text-xs text-gray-400 mt-auto">
          All times shown in your local timezone: <br/>
          <span className="font-semibold text-gray-600">{Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
        </p>
      </div>

      {/* Right Panel: Slots or Form */}
      <div className="md:w-1/2 p-8 bg-gray-50/50">
        {step === "date" ? (
          <>
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              {format(selectedDate, "EEEE, MMMM do")}
            </h3>
            
            {loading ? (
              <div className="flex items-center justify-center h-48">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
              </div>
            ) : error ? (
              <div className="p-4 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>
            ) : slots.length > 0 ? (
              <div className="grid grid-cols-1 gap-2 overflow-y-auto max-h-[400px] pr-2">
                {slots.map((slot) => (
                  <button
                    key={slot}
                    onClick={() => { setSelectedSlot(slot); setStep("form"); }}
                    className="w-full py-3 px-4 bg-white border border-gray-200 rounded-xl text-gray-800 font-semibold hover:border-black hover:bg-gray-50 transition-all text-center"
                  >
                    {format(parseISO(slot), "p")}
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-400">
                No slots available for this date.
              </div>
            )}
          </>
        ) : (
          <form onSubmit={handleBooking} className="space-y-4">
             <button onClick={() => setStep("date")} className="text-sm font-medium text-gray-500 hover:text-black mb-4 flex items-center">
              &larr; Back to slots
            </button>
            <h3 className="text-lg font-bold text-gray-900">Confirm Details</h3>
            <p className="text-sm text-gray-500 mb-6">
              {format(parseISO(selectedSlot!), "PPPP 'at' p")}
            </p>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Your Name</label>
              <input
                required
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
                className="w-full p-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-black outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Email Address</label>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@example.com"
                className="w-full p-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-black outline-none transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-black text-white rounded-xl font-bold hover:bg-gray-800 transition-all disabled:opacity-50 mt-4"
            >
              {loading ? "Confirming..." : "Book Date"}
            </button>
            
            {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
          </form>
        )}
      </div>
    </div>
  );
}

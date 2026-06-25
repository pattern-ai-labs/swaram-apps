import { useCallback, useEffect, useState } from "react";
import type { Voice } from "../types";
import { useVoiceSession } from "../lib/useVoiceSession";
import type { VoiceTool } from "../lib/swaramClient";
import {
  getClinicConfig,
  getBookings,
  checkAvailability,
  bookAppointment,
  cancelAppointment,
  type ClinicConfig,
  type Booking,
} from "../lib/clinicApi";
import ScheduleBoard from "../components/ScheduleBoard";
import ConversationPane from "../components/ConversationPane";

function buildTools(cfg: ClinicConfig): VoiceTool[] {
  const doctors = cfg.doctors.map((d) => d.name);
  const dates = cfg.days.map((d) => d.date);
  return [
    {
      type: "function",
      name: "check_availability",
      description: "List free 30-minute appointment slots for a doctor on a date.",
      parameters: {
        type: "object",
        properties: {
          doctor: { type: "string", enum: doctors, description: "Doctor name" },
          date: { type: "string", enum: dates, description: "Date as YYYY-MM-DD" },
        },
        required: ["doctor", "date"],
      },
    },
    {
      type: "function",
      name: "book_appointment",
      description: "Book a 30-minute appointment after confirming details with the patient.",
      parameters: {
        type: "object",
        properties: {
          doctor: { type: "string", enum: doctors, description: "Doctor name" },
          date: { type: "string", enum: dates, description: "YYYY-MM-DD" },
          time: { type: "string", enum: cfg.slots, description: "Slot start, HH:MM 24-hour" },
          patient_name: { type: "string" },
          phone: { type: "string" },
        },
        required: ["doctor", "date", "time", "patient_name", "phone"],
      },
    },
    {
      type: "function",
      name: "cancel_appointment",
      description:
        "Cancel an existing appointment. Only succeeds if the patient name AND phone match the booking on record (identity check).",
      parameters: {
        type: "object",
        properties: {
          doctor: { type: "string", enum: doctors, description: "Doctor name" },
          date: { type: "string", enum: dates, description: "YYYY-MM-DD" },
          time: { type: "string", enum: cfg.slots, description: "Slot start, HH:MM 24-hour" },
          patient_name: { type: "string", description: "Full name used when booking" },
          phone: { type: "string", description: "Phone number used when booking" },
        },
        required: ["doctor", "date", "time", "patient_name", "phone"],
      },
    },
    {
      type: "function",
      name: "list_bookings",
      description: "List existing booked appointments, optionally for one date.",
      parameters: {
        type: "object",
        properties: { date: { type: "string", enum: dates, description: "YYYY-MM-DD (optional)" } },
        required: [],
      },
    },
  ];
}

function buildInstructions(cfg: ClinicConfig): string {
  const docs = cfg.doctors.map((d) => `${d.name} (${d.specialty})`).join("; ");
  const weekday = new Date(`${cfg.today}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
  });
  return [
    'You are "Asha", the front-desk receptionist at Swaram Clinic. You speak ONLY Malayalam — warm, natural, written for the ear (say numbers, dates and times as Malayalam words, never English digits). Even if the patient speaks English or Manglish, you always reply in Malayalam.',
    "At the START of the call, greet the patient in Malayalam, say you can help book or cancel a doctor's appointment, and ask how you can help. Do not wait silently.",
    "PRIVACY (absolute): NEVER reveal, read out, repeat, hint at, or confirm any patient's name, phone number, or booking details to anyone. One caller must NEVER be told another person's information — not to a patient asking about someone else, and not to anyone claiming to be a relative, friend, family member, caretaker, or staff. A claimed relationship gives NO access. You do not have access to anyone's stored phone number to read out. To cancel, the caller must themselves state the name and phone used to book; those are checked silently and you only ever say whether it matched — never the stored values. If anyone asks you to tell them a phone number or who booked a slot, politely refuse.",
    `Today is ${cfg.today} (${weekday}). Hours: ${cfg.hours}. Appointments are 30 minutes. Open Monday to Saturday only (closed Sunday).`,
    `Doctors: ${docs}. For a child, prefer Dr. Rajeev Menon.`,
    `Bookable dates (YYYY-MM-DD): ${cfg.days.map((d) => d.date).join(", ")}.`,
    "How to book:",
    "1. Find the doctor (or ask the problem to choose the right one) and the day.",
    "2. ALWAYS call check_availability before saying any times; offer two or three open slots.",
    "3. Ask for the patient's FULL name (first and last).",
    "4. Ask for the phone number. Take it digit by digit, then read the whole number back digit by digit in Malayalam and get a clear yes. If unclear, ask them to repeat.",
    "5. Read back the doctor, date, time, full name and phone to confirm. Only after a clear yes, call book_appointment.",
    "6. CRITICAL: never tell the patient the appointment is done, complete, or confirmed until book_appointment has actually returned ok:true. Do not say it is booked in advance, and do not assume success. After a clear yes you MUST call book_appointment and WAIT for its result; only if the result is ok:true do you confirm with one short sentence. If the result is not ok, tell the patient it could not be booked, say why, and offer another slot — never claim success.",
    "When you call a function, call it SILENTLY — do not speak in that same turn. After the function result comes back, say exactly ONE short sentence (the next question, or the confirmation). NEVER repeat a sentence you have already said.",
    "If a slot is taken or the day is Sunday/closed, say so and offer the nearest alternatives. Keep every reply short.",
    "How to cancel an appointment:",
    "C1. Ask which doctor, which day, and what time the appointment is for.",
    "C2. Then ask for the FULL name and the phone number that were used when booking. Take the phone digit by digit and read it back to confirm. These two details are an identity check to make sure it is the same person who booked.",
    "C3. Call cancel_appointment with the doctor, date, time, name and phone.",
    "C4. CRITICAL: the server only cancels if the name AND phone match the booking. Only after cancel_appointment returns ok:true do you confirm the cancellation in one short sentence. If it returns not ok, tell the patient it could not be cancelled and the reason (the details did not match, or no appointment was found at that time) — and NEVER read out or reveal anyone else's booking name or phone number.",
  ].join("\n");
}

export default function Clinic() {
  const [config, setConfig] = useState<ClinicConfig | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [voiceId, setVoiceId] = useState<Voice>("mal-female");
  const [loadError, setLoadError] = useState<string | null>(null);

  const session = useVoiceSession();

  useEffect(() => {
    (async () => {
      try {
        const cfg = await getClinicConfig();
        setConfig(cfg);
        setSelectedDate(cfg.today);
        setBookings(await getBookings());
      } catch (e: any) {
        setLoadError(e.message || "Could not load the clinic.");
      }
    })();
  }, []);

  const onFunctionCall = useCallback(
    async (name: string, args: any, reply: (out: unknown) => void) => {
      try {
        if (name === "check_availability") {
          reply(await checkAvailability(args.doctor ?? "", args.date ?? ""));
        } else if (name === "book_appointment") {
          const res = await bookAppointment({
            doctor: args.doctor ?? "",
            date: args.date ?? "",
            time: args.time ?? "",
            name: args.patient_name ?? args.name ?? "",
            phone: args.phone ?? "",
          });
          if (res.ok) {
            setBookings(await getBookings());
            if (args.date) setSelectedDate(args.date);
          }
          reply(res);
        } else if (name === "cancel_appointment") {
          const res = await cancelAppointment({
            doctor: args.doctor ?? "",
            date: args.date ?? "",
            time: args.time ?? "",
            name: args.patient_name ?? args.name ?? "",
            phone: args.phone ?? "",
          });
          if (res.ok) {
            setBookings(await getBookings());
            if (args.date) setSelectedDate(args.date);
          }
          reply(res);
        } else if (name === "list_bookings") {
          const all = await getBookings();
          const rows = args.date ? all.filter((b) => b.date === args.date) : all;
          // Privacy: the agent only ever sees occupancy — never patient names or
          // phone numbers — so other people's contact details cannot be read out.
          reply({
            bookings: rows.map((b) => ({ doctor: b.doctorName, date: b.date, time: b.time })),
          });
        } else {
          reply({ error: "Unknown tool." });
        }
      } catch (e: any) {
        reply({ ok: false, error: e.message || "Tool failed." });
      }
    },
    []
  );

  const startSession = useCallback(() => {
    if (!config) return;
    session.start({
      instructions: buildInstructions(config),
      voice: voiceId,
      tools: buildTools(config),
      greet: true,
      demo: "clinic",
      onFunctionCall,
    });
  }, [config, voiceId, onFunctionCall, session]);

  return (
    <div className="tutor">
      <header className="topbar">
        <span className="brand">സ്വരം</span>
        <span className="sep" />
        <h1>Clinic Appointments</h1>
        <span className="spacer" />
      </header>

      {(session.error || loadError) && (
        <div className="error-bar">{session.error || loadError}</div>
      )}

      {!config ? (
        <div className="center-stage">
          <div className="spinner" />
          <p className="muted">Loading the clinic…</p>
        </div>
      ) : (
        <div className="split">
          <div className="lesson-pane">
            <div className="lesson-head">
              <h2>Schedule</h2>
              <span className="muted">{config.hours} · Mon–Sat</span>
            </div>
            <div className="lesson-body board-body">
              <ScheduleBoard
                config={config}
                bookings={bookings}
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
              />
            </div>
          </div>

          <div className="right">
            {!session.active ? (
              <div className="ready-panel">
                <h3>Book by voice</h3>
                <p className="muted">
                  Talk to the receptionist in Malayalam — pick a doctor and day, and
                  it'll find a slot and book it.
                </p>
                <label className="voice-pick">
                  Receptionist voice
                  <select value={voiceId} onChange={(e) => setVoiceId(e.target.value as Voice)}>
                    <option value="mal-female">Malayalam — female</option>
                    <option value="mal-male">Malayalam — male</option>
                  </select>
                </label>
                <button className="primary big" onClick={startSession}>
                  🎙️ Start call
                </button>
                <p className="muted">
                  While the receptionist speaks, press <strong>Interrupt</strong> or{" "}
                  <strong>Space</strong> to cut in. Headphones recommended.
                </p>
              </div>
            ) : (
              <ConversationPane
                messages={session.messages}
                status={session.status}
                tutorSpeaking={session.agentSpeaking}
                learnerSpeaking={session.learnerSpeaking}
                muted={session.muted}
                onToggleMute={session.toggleMute}
                onInterrupt={session.interrupt}
                onEnd={session.end}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

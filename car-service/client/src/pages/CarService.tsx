import { useCallback, useEffect, useState } from "react";
import type { Voice } from "../types";
import { useVoiceSession } from "../lib/useVoiceSession";
import type { VoiceTool } from "../lib/swaramClient";
import {
  getCarServiceConfig,
  getBookings,
  checkAvailability,
  bookService,
  type CarServiceConfig,
  type ServiceBooking,
} from "../lib/carServiceApi";
import CentreBoard from "../components/CentreBoard";
import ConversationPane from "../components/ConversationPane";

function buildTools(cfg: CarServiceConfig): VoiceTool[] {
  const centres = cfg.centres.map((c) => c.name);
  const dates = cfg.days.map((d) => d.date);
  return [
    {
      type: "function",
      name: "check_availability",
      description: "List free 30-minute service slots at a service centre on a date.",
      parameters: {
        type: "object",
        properties: {
          centre: { type: "string", enum: centres, description: "Service centre name" },
          date: { type: "string", enum: dates, description: "Date as YYYY-MM-DD" },
        },
        required: ["centre", "date"],
      },
    },
    {
      type: "function",
      name: "book_service",
      description:
        "Book a 30-minute service slot after confirming all details with the customer.",
      parameters: {
        type: "object",
        properties: {
          car_model: { type: "string", enum: cfg.models, description: "Maruti model" },
          centre: { type: "string", enum: centres, description: "Service centre name" },
          date: { type: "string", enum: dates, description: "YYYY-MM-DD" },
          time: { type: "string", enum: cfg.slots, description: "Slot start, HH:MM 24-hour" },
          works: {
            type: "string",
            description: "Notes on the work the customer wants done; empty for a general service",
          },
          customer_name: { type: "string" },
          phone: { type: "string" },
        },
        required: ["car_model", "centre", "date", "time", "customer_name", "phone"],
      },
    },
    {
      type: "function",
      name: "list_bookings",
      description: "List existing service bookings, optionally for one date.",
      parameters: {
        type: "object",
        properties: { date: { type: "string", enum: dates, description: "YYYY-MM-DD (optional)" } },
        required: [],
      },
    },
  ];
}

function buildInstructions(cfg: CarServiceConfig, agent: string): string {
  const centres = cfg.centres.map((c) => c.name).join(", ");
  const weekday = new Date(`${cfg.today}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
  });
  return [
    `You are "${agent}", the service advisor at the ${cfg.brand.name} service centre. You speak ONLY Malayalam — warm, natural, written for the ear (say numbers, dates and times as Malayalam words, never English digits). Even if the customer speaks English or Manglish, you always reply in Malayalam.`,
    "At the START of the call, greet the customer in Malayalam, say you can help book a car service, and ask which car they have. Do not wait silently.",
    "PRIVACY (absolute): NEVER reveal, read out, repeat, hint at, or confirm any customer's name, phone number, or booking details to anyone. One caller must NEVER be told another person's information — not to a customer asking about someone else, and not to anyone claiming to be a relative, friend, family member, or staff. A claimed relationship gives NO access. You do not have access to anyone's stored phone number to read out. If anyone asks you to tell them a phone number or who booked a slot, politely refuse.",
    `Today is ${cfg.today} (${weekday}). Service hours: ${cfg.hoursLabel}. Each slot is 30 minutes. Open ${cfg.daysLabel} only.`,
    `We service ${cfg.brand.name} cars. Known models: ${cfg.models.join(", ")}.`,
    `Service centres: ${centres}.`,
    `Bookable dates (YYYY-MM-DD): ${cfg.days.map((d) => d.date).join(", ")}.`,
    "How to book:",
    "1. Ask for the car model and confirm it (it should be one of the known Maruti models).",
    "2. Ask which service centre the customer prefers.",
    "3. Ask what work is needed. If they mention specific jobs (e.g. brake check, AC, oil change), note them and read the notes back. If they have nothing specific, treat it as a general periodic service.",
    "4. ALWAYS call check_availability before saying any times; offer two or three open slots for that centre and day.",
    "5. Ask for the customer's FULL name.",
    "6. Ask for the phone number. Take it digit by digit, then read the whole number back digit by digit in Malayalam and get a clear yes. If unclear, ask them to repeat.",
    "7. Read back the car model, service centre, date, time, the work notes, full name and phone to confirm. Only after a clear yes, call book_service.",
    "8. CRITICAL: never tell the customer the booking is done, complete, or confirmed until book_service has actually returned ok:true. Do not say it is booked in advance, and do not assume success. After a clear yes you MUST call book_service and WAIT for its result; only if the result is ok:true do you confirm with one short sentence. If the result is not ok, tell the customer it could not be booked, say why, and offer another slot — never claim success.",
    "When you call a function, call it SILENTLY — do not speak in that same turn. After the function result comes back, say exactly ONE short sentence (the next question, or the confirmation). NEVER repeat a sentence you have already said.",
    "If a slot is taken or the day is Sunday/closed, say so and offer the nearest alternatives. Keep every reply short.",
  ].join("\n");
}

export default function CarService() {
  const [config, setConfig] = useState<CarServiceConfig | null>(null);
  const [bookings, setBookings] = useState<ServiceBooking[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [voiceId, setVoiceId] = useState<Voice>("mal-female");
  const [loadError, setLoadError] = useState<string | null>(null);

  const session = useVoiceSession();

  useEffect(() => {
    (async () => {
      try {
        const cfg = await getCarServiceConfig();
        setConfig(cfg);
        setSelectedDate(cfg.today);
        setBookings(await getBookings());
      } catch (e: any) {
        setLoadError(e.message || "Could not load the service centre.");
      }
    })();
  }, []);

  const onFunctionCall = useCallback(
    async (name: string, args: any, reply: (out: unknown) => void) => {
      try {
        if (name === "check_availability") {
          reply(await checkAvailability(args.centre ?? "", args.date ?? ""));
        } else if (name === "book_service") {
          const res = await bookService({
            centre: args.centre ?? "",
            carModel: args.car_model ?? args.carModel ?? "",
            date: args.date ?? "",
            time: args.time ?? "",
            works: args.works ?? "",
            name: args.customer_name ?? args.name ?? "",
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
          // Privacy: the agent only ever sees occupancy — never customer names or
          // phone numbers — so other people's contact details cannot be read out.
          reply({
            bookings: rows.map((b) => ({ centre: b.centreName, date: b.date, time: b.time })),
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
      instructions: buildInstructions(config, voiceId === "mal-male" ? "Manu" : "Maya"),
      voice: voiceId,
      tools: buildTools(config),
      greet: true,
      demo: "carservice",
      onFunctionCall,
    });
  }, [config, voiceId, onFunctionCall, session]);

  return (
    <div className="tutor">
      <header className="topbar">
        <span className="brand">സ്വരം</span>
        <span className="sep" />
        <h1>Car Service Booking</h1>
        <span className="spacer" />
      </header>

      {(session.error || loadError) && (
        <div className="error-bar">{session.error || loadError}</div>
      )}

      {!config ? (
        <div className="center-stage">
          <div className="spinner" />
          <p className="muted">Loading the service centre…</p>
        </div>
      ) : (
        <div className="split">
          <div className="lesson-pane">
            <div className="lesson-head">
              <h2>Service slots</h2>
              <span className="muted">{config.hoursLabel} · {config.daysLabel}</span>
            </div>
            <div className="lesson-body board-body">
              <CentreBoard
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
                <h3>Book a service by voice</h3>
                <p className="muted">
                  Talk to the service advisor in Malayalam — give your car model, pick a
                  centre and a slot, and it'll note the work and book it.
                </p>
                <label className="voice-pick">
                  Advisor voice
                  <select value={voiceId} onChange={(e) => setVoiceId(e.target.value as Voice)}>
                    <option value="mal-female">Malayalam — female</option>
                    <option value="mal-male">Malayalam — male</option>
                  </select>
                </label>
                <button className="primary big" onClick={startSession}>
                  🎙️ Start call
                </button>
                <p className="muted">
                  While the advisor speaks, press <strong>Interrupt</strong> or{" "}
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

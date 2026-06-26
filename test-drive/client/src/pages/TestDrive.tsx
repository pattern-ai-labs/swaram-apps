import { useCallback, useEffect, useRef, useState } from "react";
import type { Voice } from "../types";
import { useVoiceSession } from "../lib/useVoiceSession";
import type { VoiceTool } from "../lib/swaramClient";
import {
  getTestDriveConfig,
  getTestDriveBookings,
  saveLead,
  checkAvailability,
  bookTestDrive,
  type TestDriveConfig,
  type Lead,
  type TestDrive,
  type TestDriveBooking,
} from "../lib/testdriveApi";
import LeadCard from "../components/LeadCard";
import DealershipBoard from "../components/DealershipBoard";
import ConversationPane from "../components/ConversationPane";

function buildTools(cfg: TestDriveConfig): VoiceTool[] {
  const dealerships = cfg.dealerships.map((d) => d.name);
  const dates = cfg.days.map((d) => d.date);
  return [
    {
      type: "function",
      name: "save_lead",
      description:
        "Save or update the prospect's details as you learn them. Call this each time the customer gives a new piece of information (name, city, interested models, budget, fuel, transmission, timeline, exchange, finance). Only include the fields you just learned; others are preserved.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Customer full name" },
          phone: { type: "string", description: "Phone number, digits only" },
          city: { type: "string", description: "Customer's city or area" },
          interestedModels: {
            type: "array",
            items: { type: "string", enum: cfg.modelNames },
            description: "Maruti model(s) the customer is interested in",
          },
          budget: { type: "string", enum: cfg.enrich.budget, description: "Budget band" },
          fuel: { type: "string", enum: cfg.enrich.fuel, description: "Preferred fuel" },
          transmission: {
            type: "string",
            enum: cfg.enrich.transmission,
            description: "Preferred transmission",
          },
          timeline: { type: "string", enum: cfg.enrich.timeline, description: "Purchase timeline" },
          exchange: { type: "string", description: "Old car to exchange, or 'No'" },
          finance: { type: "string", enum: cfg.enrich.finance, description: "Needs finance/loan?" },
        },
        required: [],
      },
    },
    {
      type: "function",
      name: "check_availability",
      description: "List free 30-minute test-drive slots at a dealership on a date.",
      parameters: {
        type: "object",
        properties: {
          dealership: { type: "string", enum: dealerships, description: "Dealership name" },
          date: { type: "string", enum: dates, description: "Date as YYYY-MM-DD" },
        },
        required: ["dealership", "date"],
      },
    },
    {
      type: "function",
      name: "book_test_drive",
      description:
        "Book a test drive after confirming all details with the customer. Call only after a clear yes.",
      parameters: {
        type: "object",
        properties: {
          car_model: { type: "string", enum: cfg.modelNames, description: "Maruti model" },
          dealership: { type: "string", enum: dealerships, description: "Dealership name" },
          date: { type: "string", enum: dates, description: "YYYY-MM-DD" },
          time: { type: "string", enum: cfg.slots, description: "Slot start, HH:MM 24-hour" },
          customer_name: { type: "string" },
          phone: { type: "string" },
        },
        required: ["car_model", "dealership", "date", "time", "customer_name", "phone"],
      },
    },
  ];
}

function buildInstructions(cfg: TestDriveConfig, agent: string): string {
  const weekday = new Date(`${cfg.today}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
  });
  const lineup = cfg.models
    .map(
      (m) =>
        `- ${m.name}: ${m.bodyType}, ${m.fuel.join("/")}, ${m.transmission.join("/")}, ${m.priceBand}, ${m.seats} seats`
    )
    .join("\n");
  return [
    `You are "${agent}", a friendly sales advisor for Maruti Suzuki. You speak ONLY Malayalam — warm, natural, written for the ear (say numbers, prices, dates and times as Malayalam words, never English digits). Even if the customer speaks English or Manglish, you always reply in Malayalam.`,
    "Your job is to understand what car the customer wants (qualify the lead) and then book a test drive. Be consultative, not pushy. Keep every reply short.",
    "At the START, greet the customer in Malayalam, say you can help them find the right Maruti and arrange a test drive, and ask what kind of car they are looking for. Do not wait silently.",
    `Today is ${cfg.today} (${weekday}). Test-drive hours: ${cfg.hours}, 30-minute slots, Monday to Saturday (closed Sunday).`,
    `Dealerships: ${cfg.dealerships.map((d) => d.name).join(", ")}.`,
    `Bookable dates (YYYY-MM-DD): ${cfg.days.map((d) => d.date).join(", ")}.`,
    "Maruti line-up (use this to recommend and match — never invent models or prices):",
    lineup,
    "",
    "Gather the prospect's details ONE AT A TIME, in a natural order. After each answer, call save_lead with just the new field(s). Capture all of these over the conversation:",
    "1. What they need / which model(s) they are interested in (recommend from the line-up based on body type, budget, fuel, seats).",
    "2. Budget band.",
    "3. Preferred fuel (note: Maruti has no diesel now — if they ask for diesel, gently say so and suggest petrol/CNG/hybrid).",
    "4. Preferred transmission (manual or automatic).",
    "5. When they plan to buy (timeline).",
    "6. Whether they have an old car to exchange.",
    "7. Whether they need finance/a loan.",
    "8. Their full name and city.",
    "Then offer a test drive: ask the preferred dealership and day, ALWAYS call check_availability before quoting any times, offer two or three open slots, and pick one.",
    "Take the phone number digit by digit, then read the whole number back digit by digit in Malayalam and get a clear yes.",
    "Read back the model, dealership, date, time, name and phone to confirm. Only after a clear yes, call book_test_drive.",
    "IMPORTANT: to save a lead, check availability, or book, you MUST use the provided function tools. Never speak or write a function name or its arguments out loud. Never state any available time or any booking unless it came back from a tool result.",
    "When you call a function, call it SILENTLY — do not speak in that same turn. After the function result comes back, say exactly ONE short sentence (the next question, or the confirmation). NEVER repeat a sentence you have already said.",
    "CRITICAL: never tell the customer the test drive is booked, done, or confirmed until book_test_drive has actually returned ok:true. Do not assume success. After a clear yes you MUST call book_test_drive and WAIT for its result; only if it returns ok:true do you confirm in one short sentence. If it is not ok, say it could not be booked, say why, and offer another slot.",
    "UPDATES: whenever the customer CHANGES or CORRECTS any detail — budget, model(s), fuel, transmission, timeline, exchange, finance, name, city — at ANY point in the call, INCLUDING after the test drive is booked, you MUST call save_lead again with the new value(s). Never just say you have updated or changed something — only say it is updated AFTER save_lead has actually returned ok:true. Do not claim a change you did not make through the tool.",
  ].join("\n");
}

export default function TestDrivePage() {
  const [config, setConfig] = useState<TestDriveConfig | null>(null);
  const [voiceId, setVoiceId] = useState<Voice>("mal-female");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lead, setLead] = useState<Partial<Lead> | null>(null);
  const [testDrive, setTestDrive] = useState<(TestDrive & { dealershipName?: string }) | null>(null);
  const [bookings, setBookings] = useState<TestDriveBooking[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const leadIdRef = useRef<string | undefined>(undefined);

  const session = useVoiceSession();

  useEffect(() => {
    (async () => {
      try {
        const cfg = await getTestDriveConfig();
        setConfig(cfg);
        setSelectedDate(cfg.today);
        setBookings(await getTestDriveBookings());
      } catch (e: any) {
        setLoadError(e.message || "Could not load the dealership.");
      }
    })();
  }, []);

  const onFunctionCall = useCallback(
    async (name: string, args: any, reply: (out: unknown) => void) => {
      try {
        if (name === "save_lead") {
          const res = await saveLead({ id: leadIdRef.current, ...args });
          if (res.ok) {
            leadIdRef.current = res.lead.id;
            setLead(res.lead);
            reply({ ok: true, saved: res.lead });
          } else {
            reply({ ok: false, error: "Could not save lead." });
          }
        } else if (name === "check_availability") {
          reply(await checkAvailability(args.dealership ?? "", args.date ?? ""));
        } else if (name === "book_test_drive") {
          const res = await bookTestDrive({
            leadId: leadIdRef.current,
            dealership: args.dealership ?? "",
            carModel: args.car_model ?? args.carModel ?? "",
            date: args.date ?? "",
            time: args.time ?? "",
            name: args.customer_name ?? args.name ?? "",
            phone: args.phone ?? "",
          });
          if (res.ok) {
            leadIdRef.current = res.lead?.id ?? leadIdRef.current;
            if (res.lead) setLead(res.lead);
            setTestDrive({ ...res.testDrive, dealershipName: res.dealership?.name });
            setBookings(await getTestDriveBookings());
            if (args.date) setSelectedDate(args.date);
          }
          reply(res);
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
    leadIdRef.current = undefined;
    setLead(null);
    setTestDrive(null);
    session.start({
      instructions: buildInstructions(config, voiceId === "mal-male" ? "Dev" : "Diya"),
      voice: voiceId,
      tools: buildTools(config),
      greet: true,
      demo: "testdrive",
      onFunctionCall,
    });
  }, [config, voiceId, onFunctionCall, session]);

  return (
    <div className="tutor">
      <header className="topbar">
        <span className="brand">സ്വരം</span>
        <span className="sep" />
        <h1>Test Drive & Lead Enrichment</h1>
        <span className="spacer" />
      </header>

      {(session.error || loadError) && (
        <div className="error-bar">{session.error || loadError}</div>
      )}

      {!config ? (
        <div className="center-stage">
          <div className="spinner" />
          <p className="muted">Loading the dealership…</p>
        </div>
      ) : (
        <div className="split">
          <div className="lesson-pane">
            <div className="lesson-head">
              <h2>{session.active ? "Prospect" : "Booked test drives"}</h2>
              <span className="muted">
                {session.active
                  ? `${config.brand.name} · ${config.dealerships.length} dealerships`
                  : `${config.hours} · Mon–Sat`}
              </span>
            </div>
            <div className="lesson-body board-body">
              {session.active ? (
                <LeadCard lead={lead} testDrive={testDrive} />
              ) : (
                <DealershipBoard
                  config={config}
                  bookings={bookings}
                  selectedDate={selectedDate}
                  onSelectDate={setSelectedDate}
                />
              )}
            </div>
          </div>

          <div className="right">
            {!session.active ? (
              <div className="ready-panel">
                <h3>Talk to a sales advisor</h3>
                <p className="muted">
                  The advisor will understand what Maruti you want — model, budget, fuel,
                  transmission, timeline — and book a test drive. Watch the lead card
                  fill in as you talk.
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

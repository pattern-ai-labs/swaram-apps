import { useCallback, useEffect, useRef, useState } from "react";
import type { Voice } from "../types";
import { useVoiceSession } from "../lib/useVoiceSession";
import type { VoiceTool } from "../lib/swaramClient";
import {
  getSupportConfig,
  getTickets,
  saveRequest,
  scheduleRequest,
  updateTicket,
  cancelTicket,
  type SupportConfig,
  type Ticket,
} from "../lib/supportApi";
import TicketCard from "../components/TicketCard";
import ConversationPane from "../components/ConversationPane";

/** Remove the stored phone before handing a tool result back to the model, so it
 * can never read out a saved number (the operator card uses the full response). */
function stripPhone(res: { ok: boolean; ticket?: Ticket; error?: string }) {
  if (!res?.ticket) return res;
  return { ...res, ticket: { ...res.ticket, phone: "" } };
}

function buildTools(cfg: SupportConfig): VoiceTool[] {
  const dates = cfg.days.map((d) => d.date);
  const requestFields = {
    appliance: { type: "string", enum: cfg.appliances, description: "Appliance type" },
    request_type: { type: "string", enum: cfg.requestTypes, description: "Repair, Pickup or Service" },
    issue: { type: "string", description: "The problem the customer described, in their words; empty for a regular service" },
    warranty: { type: "string", enum: cfg.warranty, description: "Is it under warranty?" },
    area: { type: "string", enum: cfg.areas, description: "Customer's locality" },
    address: { type: "string", description: "Address for the visit / pickup" },
    preferred_date: { type: "string", enum: dates, description: "Preferred date YYYY-MM-DD" },
    preferred_time: { type: "string", enum: cfg.timeBands, description: "Preferred time band" },
    name: { type: "string", description: "Customer name" },
    phone: { type: "string", description: "Phone number, digits only" },
  };
  return [
    {
      type: "function",
      name: "save_request",
      description:
        "Save or update the service request as you learn each detail. Call this after each answer with only the new field(s); others are preserved.",
      parameters: { type: "object", properties: requestFields, required: [] },
    },
    {
      type: "function",
      name: "schedule_request",
      description:
        "Finalize and log the service ticket after confirming all details. Call only after a clear yes. Returns a ticket number, or tells you which fields are still missing.",
      parameters: {
        type: "object",
        properties: requestFields,
        required: ["appliance", "request_type", "name", "phone", "area", "preferred_date", "preferred_time"],
      },
    },
    {
      type: "function",
      name: "update_ticket",
      description:
        "Modify an EXISTING ticket (change appliance, request type, issue, warranty, area, address, preferred date or time band). Only succeeds if customer_name AND phone match the ticket on record (identity check). Include only the field(s) being changed.",
      parameters: {
        type: "object",
        properties: {
          ref: { type: "string", description: "The ticket number, e.g. SR0007" },
          customer_name: { type: "string", description: "Full name used when booking (identity check)" },
          phone: { type: "string", description: "Phone number used when booking (identity check)" },
          appliance: requestFields.appliance,
          request_type: requestFields.request_type,
          issue: requestFields.issue,
          warranty: requestFields.warranty,
          area: requestFields.area,
          address: requestFields.address,
          preferred_date: requestFields.preferred_date,
          preferred_time: requestFields.preferred_time,
        },
        required: ["ref", "customer_name", "phone"],
      },
    },
    {
      type: "function",
      name: "cancel_ticket",
      description:
        "Cancel an EXISTING ticket. Only succeeds if customer_name AND phone match the ticket on record (identity check).",
      parameters: {
        type: "object",
        properties: {
          ref: { type: "string", description: "The ticket number, e.g. SR0007" },
          customer_name: { type: "string", description: "Full name used when booking (identity check)" },
          phone: { type: "string", description: "Phone number used when booking (identity check)" },
        },
        required: ["ref", "customer_name", "phone"],
      },
    },
  ];
}

function buildInstructions(cfg: SupportConfig, agent: string): string {
  const weekday = new Date(`${cfg.today}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
  });
  return [
    `You are "${agent}", a customer-care agent for home-appliance service. You speak ONLY Malayalam — warm, natural, written for the ear (say numbers, dates and times as Malayalam words, never English digits). Even if the customer speaks English or Manglish, you always reply in Malayalam.`,
    "You help customers schedule a repair, a pickup, or a regular service for their TV, refrigerator, AC or washing machine. Be calm and helpful. Keep every reply short.",
    "At the START, greet the customer in Malayalam, say you can help log a new appliance repair/service request OR change or cancel an existing one, and ask how you can help. Do not wait silently.",
    `Today is ${cfg.today} (${weekday}). We serve Monday to Saturday (closed Sunday).`,
    `Appliances we service: ${cfg.appliances.join(", ")}.`,
    `Service areas: ${cfg.areas.join(", ")}.`,
    `Bookable dates (YYYY-MM-DD): ${cfg.days.map((d) => d.date).join(", ")}.`,
    `Time bands: ${cfg.timeBands.join(", ")}.`,
    cfg.timeBandsToday.length
      ? `For TODAY (${cfg.today}) only these time bands are still available: ${cfg.timeBandsToday.join(", ")}. Never offer or accept an already-passed band for today.`
      : `TODAY (${cfg.today}) is no longer available — all of today's time bands have passed. Offer the next working day onwards.`,
    "",
    "Gather the details ONE AT A TIME, in a natural order, and after each answer call save_request with just the new field(s):",
    "1. Which appliance (TV, refrigerator, AC, washing machine).",
    "2. Whether they want a Repair, a Pickup, or a regular Service.",
    "3. The issue — ask them to describe the problem and note it in their own words. If it is just a regular service with no complaint, leave the issue empty.",
    "4. Whether the appliance is under warranty (yes / no / not sure).",
    "5. Their area (locality) and a full address for the technician visit or pickup.",
    "6. Preferred date and preferred time band.",
    "7. Their full name.",
    "8. Their phone number — take it digit by digit, then read the whole number back digit by digit in Malayalam and get a clear yes. If unclear, ask them to repeat.",
    "Then read back the appliance, request type, issue, date, time band, area and phone to confirm. Only after a clear yes, call schedule_request.",
    "IMPORTANT: to save, schedule, change or cancel, you MUST use the provided function tools. Never speak or write a function name or its arguments out loud. Never state a ticket number unless it came back from a tool result.",
    "When you call a function, call it SILENTLY — do not speak in that same turn. After the function result comes back, say exactly ONE short sentence (the next question, or the confirmation). NEVER repeat a sentence you have already said.",
    "CRITICAL: never tell the customer the request is logged, scheduled, done, or confirmed until schedule_request has actually returned ok:true. Do not assume success. After a clear yes you MUST call schedule_request and WAIT for its result; only if it returns ok:true do you confirm and read out the ticket number in one short sentence. If it returns an error listing missing fields, ask the customer for those and try again.",
    "",
    "To CHANGE or CANCEL an existing request:",
    "M1. Ask for the ticket number (for example, S R zero zero zero seven).",
    "M2. Ask for the full name and the phone number used when booking — these are an identity check to confirm it is the same person. Take the phone but DO NOT read it back and do NOT read out any stored number; just use it to verify.",
    "M3. Confirm what they want changed (or that they want to cancel). For a change, call update_ticket with the ticket number, name, phone and ONLY the field(s) being changed. For a cancellation, call cancel_ticket with the ticket number, name and phone.",
    "M4. CRITICAL: the server only makes the change if the name AND phone match the ticket. Only after the tool returns ok:true do you confirm the change or cancellation in one short sentence. If it returns not ok, say you could not find a matching request for that number, name and phone, and ask them to check the details — try again if they re-state them.",
    "PRIVACY (absolute): NEVER read out, reveal, repeat or confirm any stored phone number, name, address or ticket details to anyone. The identity check only ever tells you whether it matched — you never speak the stored values. A caller claiming to be a relative, friend or staff gets NO access; the name and phone must match.",
  ].join("\n");
}

export default function Support() {
  const [config, setConfig] = useState<SupportConfig | null>(null);
  const [voiceId, setVoiceId] = useState<Voice>("mal-female");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<Partial<Ticket> | null>(null);
  const [recent, setRecent] = useState<Ticket[]>([]);
  const ticketIdRef = useRef<string | undefined>(undefined);

  const session = useVoiceSession();

  useEffect(() => {
    (async () => {
      try {
        setConfig(await getSupportConfig());
        setRecent(await getTickets());
      } catch (e: any) {
        setLoadError(e.message || "Could not load customer care.");
      }
    })();
  }, []);

  const mapArgs = (args: any) => ({
    id: ticketIdRef.current,
    appliance: args.appliance,
    requestType: args.request_type ?? args.requestType,
    issue: args.issue,
    warranty: args.warranty,
    area: args.area,
    address: args.address,
    preferredDate: args.preferred_date ?? args.preferredDate,
    preferredTime: args.preferred_time ?? args.preferredTime,
    name: args.name,
    phone: args.phone,
  });

  const onFunctionCall = useCallback(
    async (name: string, args: any, reply: (out: unknown) => void) => {
      try {
        if (name === "save_request") {
          const res = await saveRequest(mapArgs(args));
          if (res.ok) {
            ticketIdRef.current = res.ticket.id;
            setTicket(res.ticket);
            reply({ ok: true, saved: res.ticket });
          } else {
            reply({ ok: false, error: "Could not save the request." });
          }
        } else if (name === "schedule_request") {
          const res = await scheduleRequest(mapArgs(args));
          if (res.ticket) {
            ticketIdRef.current = res.ticket.id;
            setTicket(res.ticket);
          }
          if (res.ok) setRecent(await getTickets());
          reply(res);
        } else if (name === "update_ticket") {
          const res = await updateTicket({
            ref: args.ref ?? "",
            name: args.customer_name ?? args.name ?? "",
            phone: args.phone ?? "",
            appliance: args.appliance,
            requestType: args.request_type ?? args.requestType,
            issue: args.issue,
            warranty: args.warranty,
            area: args.area,
            address: args.address,
            preferredDate: args.preferred_date ?? args.preferredDate,
            preferredTime: args.preferred_time ?? args.preferredTime,
          });
          if (res.ok && res.ticket) {
            setTicket(res.ticket);
            setRecent(await getTickets());
          }
          reply(stripPhone(res)); // the model never receives the stored phone
        } else if (name === "cancel_ticket") {
          const res = await cancelTicket({
            ref: args.ref ?? "",
            name: args.customer_name ?? args.name ?? "",
            phone: args.phone ?? "",
          });
          if (res.ok) {
            if (res.ticket) setTicket(res.ticket);
            setRecent(await getTickets());
          }
          reply(stripPhone(res)); // the model never receives the stored phone
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
    ticketIdRef.current = undefined;
    setTicket(null);
    session.start({
      instructions: buildInstructions(config, voiceId === "mal-male" ? "Nikhil" : "Nila"),
      voice: voiceId,
      tools: buildTools(config),
      greet: true,
      demo: "support",
      onFunctionCall,
    });
  }, [config, voiceId, onFunctionCall, session]);

  return (
    <div className="tutor">
      <header className="topbar">
        <span className="brand">സ്വരം</span>
        <span className="sep" />
        <h1>Appliance Customer Care</h1>
        <span className="spacer" />
      </header>

      {(session.error || loadError) && (
        <div className="error-bar">{session.error || loadError}</div>
      )}

      {!config ? (
        <div className="center-stage">
          <div className="spinner" />
          <p className="muted">Loading customer care…</p>
        </div>
      ) : (
        <div className="split">
          <div className="lesson-pane">
            <div className="lesson-head">
              <h2>Service ticket</h2>
              <span className="muted">TV · Fridge · AC · Washing machine</span>
            </div>
            <div className="lesson-body board-body">
              <TicketCard ticket={ticket} recent={recent} />
            </div>
          </div>

          <div className="right">
            {!session.active ? (
              <div className="ready-panel">
                <h3>Log a service request by voice</h3>
                <p className="muted">
                  Tell the agent what's wrong with your TV, fridge, AC or washing machine.
                  She'll note the issue, take your preferred time, and raise a ticket —
                  watch it fill in on the left.
                </p>
                <label className="voice-pick">
                  Agent voice
                  <select value={voiceId} onChange={(e) => setVoiceId(e.target.value as Voice)}>
                    <option value="mal-female">Malayalam — female</option>
                    <option value="mal-male">Malayalam — male</option>
                  </select>
                </label>
                <button className="primary big" onClick={startSession}>
                  🎙️ Start call
                </button>
                <p className="muted">
                  While the agent speaks, press <strong>Interrupt</strong> or{" "}
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

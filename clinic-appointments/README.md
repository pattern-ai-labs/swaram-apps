# Clinic Appointments — Malayalam voice booking agent

A complete, **standalone** example app: a Malayalam **voice receptionist** ("Asha")
that books doctor's appointments over a real-time voice call, backed by a live
schedule board. It demonstrates **[swaram.live](https://swaram.live)** real-time
voice **+ function calling** — the agent checks availability and makes bookings by
calling your server's functions mid-conversation.

You can **run it as-is** (you only need a swaram API key), or use it as a template
to build your own voice agent — the entire voice pipeline is reusable and the
clinic-specific parts are small and clearly marked.

```
┌──────────────┐   talk    ┌─────────────────┐   tools   ┌──────────────────┐
│   Browser    │ ───────▶  │  swaram.live    │ ────────▶ │  Your Express    │
│ (mic + UI)   │ ◀───────  │  realtime voice │ ◀──────── │  server (truth)  │
└──────────────┘  speech   └─────────────────┘  results  └──────────────────┘
```

---

## 1. What you get

- A **voice call** in Malayalam: press a button, talk, hear natural Malayalam back.
- **Function calling**: the agent calls `check_availability`, `book_appointment`,
  `cancel_appointment`, and `list_bookings` against your server.
- **Cancellation with an identity check**: a caller can cancel an appointment, but
  only if the **name and phone they give match the booking on record** (see §7.1).
- **Privacy by design**: the agent is never given other patients' names or phone
  numbers, and is instructed never to disclose them (see §7.1).
- A **live schedule board**: pick a day, see each doctor's free/booked 30-minute slots.
- **Both transcripts** stream into the conversation (what you said + what the agent said).
- A tiny JSON file as the booking "database" (no external DB needed).

## 2. Prerequisites

- **Node.js 18+**
- A **swaram.live API key** (looks like `swaram_...`). That is the **only** secret
  this app needs.
- A browser with microphone access. (For phones, serve over HTTPS — see
  [Exposing it publicly](#9-exposing-it-publicly).)

## 3. Quick start

```bash
# 1. configure the one secret
cd server
cp .env.example .env          # then edit .env and paste your SWARAM_API_KEY
cd ..

# 2. install (two small packages: a React client and an Express server)
(cd server && npm install)
(cd client && npm install)

# 3. run both together
./dev.sh
```

Open **http://localhost:5173**, press **Start call**, and talk to Asha.

> The server runs on `:8090`, the app on `:5173`, and Vite proxies `/api/*` to the
> server. Change the port in `server/.env` (`PORT=`) and `client/vite.config.ts` if
> needed.

## 4. How it works

### The voice pipeline (reusable, in `client/src/lib/` + `client/src/audio/`)
1. **Token minting.** The browser never sees your secret key. It calls
   `POST /api/swaram-token`; the server exchanges your `SWARAM_API_KEY` for a
   **short-lived** `swaram_ek_…` token and returns that. (`server/src/routes/swaramToken.ts`)
2. **Connect.** The browser opens a WebSocket to swaram using that token as a
   subprotocol, and sends a `session.update` with the agent's **instructions**,
   **voice**, and **tools**. (`client/src/lib/swaramClient.ts`)
3. **Mic → swaram.** The mic is captured, resampled to **24 kHz PCM16** in an
   AudioWorklet, and streamed as base64. (`client/src/audio/`)
4. **swaram → speaker.** Audio deltas are queued and played in order.
5. **Half-duplex + interrupt.** While the agent speaks, the mic is held so our
   stream can't make swaram cancel its own reply; the user cuts in with the
   **Interrupt** button / **Space** key. "Speaking" stays true until the queued
   audio actually finishes.
6. **Native transcripts.** Both sides' transcripts come from swaram directly — no
   browser speech recognition.

All of that lives in **`useVoiceSession.ts`** (a single React hook) and is **not
specific to clinics** — reuse it unchanged for any voice agent.

### The function-calling flow
```
You: "Book me with Dr. Meera tomorrow afternoon"
  └▶ swaram emits a function call:  check_availability { doctor, date }
       └▶ client runs it against /api/clinic/availability and returns the result
            └▶ swaram speaks the open slots, continues the conversation
You pick a time, give name + phone
  └▶ swaram emits:  book_appointment { doctor, date, time, patient_name, phone }
       └▶ client calls /api/clinic/book; server validates + saves
            └▶ swaram confirms; the board refreshes
```

## 5. Project layout

```
clinic-appointments/
├── dev.sh                    # runs server + client together
├── server/                   # Express API (the source of truth)
│   ├── .env.example          # your SWARAM_API_KEY goes here
│   └── src/
│       ├── index.ts          # app entry: mounts the routes
│       ├── config.ts         # reads .env (only needs SWARAM_API_KEY)
│       ├── clinic.ts         # ★ DOMAIN: doctors, slots, working days, validation, storage
│       └── routes/
│           ├── clinic.ts     # ★ clinic REST endpoints
│           ├── swaramToken.ts #   reusable: mints the browser token
│           └── log.ts         #   reusable: conversation logging
└── client/                   # React + Vite UI
    └── src/
        ├── pages/Clinic.tsx  # ★ the page: persona, tools, board, tool wiring
        ├── components/
        │   ├── ScheduleBoard.tsx   # ★ the clinic board
        │   └── ConversationPane.tsx#   reusable: transcript + controls
        ├── lib/
        │   ├── useVoiceSession.ts  #   reusable: the whole voice pipeline
        │   ├── swaramClient.ts     #   reusable: swaram WebSocket client
        │   ├── api.ts              #   reusable: token fetch
        │   └── clinicApi.ts        # ★ clinic fetch helpers
        ├── audio/                  #   reusable: mic capture + playback
        └── index.css               #   theme (dark, minimal)
```

★ = clinic-specific (the parts you change to make a different app). Everything else
is the reusable voice kit.

---

## 6. How to customize

Almost everything you'll want to change is in **two files**:
`server/src/clinic.ts` (the data + rules) and `client/src/pages/Clinic.tsx`
(the persona + tools).

### 6.1 Change the doctors
Edit the `DOCTORS` array in `server/src/clinic.ts`:
```ts
export const DOCTORS: Doctor[] = [
  { id: "dr-meera",  name: "Dr. Meera Nair",  specialty: "General Medicine" },
  { id: "dr-rajeev", name: "Dr. Rajeev Menon", specialty: "Pediatrics" },
  // add one:
  { id: "dr-anu",    name: "Dr. Anu Varghese", specialty: "Dermatology" },
];
```
`id` must be unique and stable (bookings reference it). That's it — the board, the
availability logic, and the tool's `doctor` enum all read from this list
automatically.

### 6.2 Change the working hours or slot length
Edit `HOURS` (and the slot step) in `server/src/clinic.ts`:
```ts
const HOURS: [string, string][] = [
  ["09:00", "13:00"],   // morning block
  ["14:00", "17:00"],   // afternoon block
];
```
Slots are generated every **30 minutes** by `slotTimes()`. To use a different
length, change the `m += 30` step inside `slotTimes()`. To run a single continuous
block (say 10:00–18:00), make `HOURS` a single pair.

### 6.3 Change the booking window or working days
In `server/src/clinic.ts`:
- `WINDOW_DAYS` — how many days ahead are bookable (default `14`).
- `workingDays()` skips Sundays via `if (d.getDay() === 0) continue;`. Change `0`
  (Sunday) to skip a different day, or remove the line to allow all days.

### 6.4 Change the agent's persona, language, or rules
Edit `buildInstructions(cfg)` in `client/src/pages/Clinic.tsx`. This string is the
agent's system prompt; it already contains today's date, the doctor list, the
bookable dates, and the booking steps. Rewrite it to change tone, the order of
questions, or the business rules. Keep the **mandatory tool-use rules** below.

### 6.5 Change the voice
The voice picker offers `mal-female` / `mal-male`. The default is set by
`useState<Voice>("mal-female")` in `Clinic.tsx`. swaram voices are passed straight
through in `session.start({ voice })`.

### 6.6 Add or change a tool (function the agent can call)

This is the most important customization. Follow these steps and **conventions** —
they are what make function calling reliable. (`check_availability`,
`book_appointment`, `cancel_appointment` and `list_bookings` ship built-in; the
`reschedule_appointment` below is a worked example of adding a new one — it's exactly
how `cancel_appointment` was wired in.)

**Step 1 — declare the tool** in `buildTools(cfg)` in `Clinic.tsx`:
```ts
{
  type: "function",
  name: "reschedule_appointment",
  description: "Move an existing appointment to a new slot, after confirming with the patient.",
  parameters: {
    type: "object",
    properties: {
      doctor:       { type: "string", enum: doctors,   description: "Doctor name" },
      date:         { type: "string", enum: dates,     description: "Current date YYYY-MM-DD" },
      time:         { type: "string", enum: cfg.slots, description: "Current slot HH:MM" },
      new_date:     { type: "string", enum: dates,     description: "New date YYYY-MM-DD" },
      new_time:     { type: "string", enum: cfg.slots, description: "New slot HH:MM" },
      patient_name: { type: "string" },
      phone:        { type: "string" },
    },
    required: ["doctor", "date", "time", "new_date", "new_time", "patient_name", "phone"],
  },
}
```

**Step 2 — handle it** in `onFunctionCall` in `Clinic.tsx`:
```ts
} else if (name === "reschedule_appointment") {
  const res = await rescheduleAppointment(args);  // add this in clinicApi.ts
  if (res.ok) setBookings(await getBookings());    // refresh the board
  reply(res);
}
```

**Step 3 — implement the endpoint** in `server/src/routes/clinic.ts` and the rule
in `server/src/clinic.ts`. The **server is the source of truth** — it must
re-validate everything and return `{ ok: false, error }` on any problem.

#### MANDATORY conventions when adding tools

These are requirements, not suggestions. The realtime model is reliable **only**
when you follow them:

1. **Constrain every closed-set parameter with an `enum`, built from live config.**
   Any field whose valid values are known — doctor, date (the bookable list), time
   (the slot list), a status, a category — must be an `enum` sourced from
   `/api/clinic/config`, exactly as `buildTools(cfg)` does. This forces the model
   to emit a *structured* call and snaps fuzzy or garbled speech to a canonical
   value. Use plain `string` **only** for genuinely open text (names, free-form
   notes) and for dictated identifiers like phone numbers (which you confirm by
   read-back).

2. **Validate again on the server.** Enums guide the model; they are not a
   guarantee. Re-check the doctor exists, the date is in range, the slot is valid,
   it isn't in the past, and there's no double-booking — then persist. Return a
   clear `{ ok: false, error }` so the agent can recover.

3. **Confirm success only after the tool returns `ok: true`.** The persona must
   never tell the user "booked / done / scheduled" before the booking tool has
   actually returned success. The instructions enforce this; keep that rule when
   you edit them.

4. **Call tools silently; never narrate.** Instruct the agent to call functions
   without speaking the function name or arguments aloud, and to say one short
   sentence only **after** the result. (This also avoids the agent repeating
   itself around a tool call.)

5. **Keep the tool set small and each tool single-purpose,** with a clear
   description that states *when* to use it.

> The persona in `buildInstructions` already encodes rules 3 and 4 — reuse those
> lines verbatim in any new agent you build.

---

## 7. Tools reference

| Tool | Args | Returns |
|---|---|---|
| `check_availability` | `doctor`, `date` (YYYY-MM-DD) | free 30-minute slots |
| `book_appointment` | `doctor`, `date`, `time`, `patient_name`, `phone` | the booking, or an error |
| `cancel_appointment` | `doctor`, `date`, `time`, `patient_name`, `phone` | cancels **only if name + phone match** (§7.1), else an error |
| `list_bookings` | `date?` | **occupancy only** — `{ doctor, date, time }`, deliberately **no names or phone numbers** (§7.1) |

REST endpoints (the browser tool handler maps tool calls to these):

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/api/clinic/config` | doctors, slot times, working days, today |
| `GET`  | `/api/clinic/availability?doctor=&date=` | free slots |
| `GET`  | `/api/clinic/bookings` | existing bookings (for the board) |
| `POST` | `/api/clinic/book` | validate + create a booking |
| `POST` | `/api/clinic/cancel` | cancel a booking after an identity check (§7.1) |
| `POST` | `/api/swaram-token` | mint the short-lived browser token |
| `POST` | `/api/log` · `GET /api/logs?session=` | conversation logging |

### 7.1 Cancellation & privacy (the identity check)

Cancellation must not let a caller drop someone else's appointment, or fish for a
stranger's contact details. Two safeguards, in two layers:

- **Identity check (server, `cancel()` in `clinic.ts`).** To cancel the booking at a
  given `doctor + date + time`, the caller must supply the **name and phone used to
  book**, and both must match: the name case/space-insensitively, the phone on its
  **last 10 digits** (so country code and spacing don't matter). On any mismatch the
  server refuses **without revealing** the stored values. Asha asks for these as the
  identity check before calling `cancel_appointment`.
- **No PII reaches the agent (data + prompt).** `list_bookings` returns **occupancy
  only** (`doctor, date, time`) — never names or phones — so the model has nothing to
  leak even if asked. On top of that, the persona has an **absolute privacy rule**:
  never reveal, read back, or confirm any patient's name/phone/booking to anyone,
  including a caller claiming to be the patient, a relative, or staff. A claimed
  relationship grants no access.

If you add tools that touch existing bookings, keep both layers: **don't hand the
model other people's PII, and gate destructive actions behind a server-side check.**

## 8. Data & persistence

Bookings are stored in `server/data/bookings.json` (created on first run, seeded
with a few samples). It's git-ignored. Delete the file to reset. There is no
database and no auth — this is a demo, not production.

The full call (every `user.said`, `agent.said`, `tool.call`, `tool.result`) is
appended to `server/src/data/conversations.jsonl` for debugging. Read it back with
`GET /api/logs?session=<id>`. **It contains whatever the caller said (including
phone numbers) — keep it private.**

## 9. Exposing it publicly

The mic needs a secure context on phones, so to test on a real phone, serve over
HTTPS. The quickest way is a tunnel:
```bash
cloudflared tunnel --url http://localhost:5173
```
Then add the tunnel hostname to `allowedHosts` in `client/vite.config.ts`.
**Anyone with the URL can spend your swaram credits — take the tunnel down when done.**

## 10. Building your own app from this template

1. Copy this whole folder.
2. Replace the **domain file** (`server/src/clinic.ts`) with your own data + rules,
   and the **routes** with your endpoints.
3. Replace the **board component** and **`*Api.ts`** with your UI + fetch helpers.
4. Rewrite **`buildTools`** (enum-constrained — see the mandatory conventions) and
   **`buildInstructions`** (your persona) in the page.
5. Leave the **voice kit untouched**: `useVoiceSession.ts`, `swaramClient.ts`,
   `audio/`, `ConversationPane.tsx`, `routes/swaramToken.ts`, `routes/log.ts`,
   `api.ts`, `config.ts`. These work for any voice agent.

That's the whole recipe: **swap the domain, keep the pipeline, follow the tool
conventions.**

## 11. Troubleshooting

- **"Could not start the voice session" / token 503** → `SWARAM_API_KEY` is missing
  or wrong in `server/.env`. The server logs a warning on start if it's unset.
- **No sound / mic not captured** → allow microphone permission; use headphones to
  avoid echo. The mic resumes the audio context on the first click (browsers block
  audio until a user gesture).
- **Agent talks over you / won't stop** → press **Interrupt** or **Space**. This is
  half-duplex by design (see the pipeline notes).
- **Port already in use** → change `PORT` in `server/.env` and the proxy target in
  `client/vite.config.ts`.

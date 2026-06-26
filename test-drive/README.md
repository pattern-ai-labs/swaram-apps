# Test Drive & Lead Enrichment — Malayalam voice sales advisor

A complete, **standalone** example app: a Malayalam **voice sales advisor** ("Diya")
that qualifies a car buyer over a real-time voice call — learning their needs
field by field — and books a **test drive**, backed by a live lead card. It
demonstrates **[swaram.live](https://swaram.live)** real-time voice **+ function
calling**: the agent enriches a lead and books a slot by calling your server's
functions mid-conversation.

You can **run it as-is** (you only need a swaram API key), or use it as a template
to build your own voice agent — the entire voice pipeline is reusable and the
test-drive-specific parts are small and clearly marked.

```
┌──────────────┐   talk    ┌─────────────────┐   tools   ┌──────────────────┐
│   Browser    │ ───────▶  │  swaram.live    │ ────────▶ │  Your Express    │
│ (mic + UI)   │ ◀───────  │  realtime voice │ ◀──────── │  server (truth)  │
└──────────────┘  speech   └─────────────────┘  results  └──────────────────┘
```

---

## 1. What you get

- A **voice call** in Malayalam: press a button, talk, hear natural Malayalam back.
- **Progressive lead enrichment**: the agent calls `save_lead` after every answer,
  merging one new field at a time into a single growing record.
- **Function calling**: the agent calls `save_lead`, `check_availability`, and
  `book_test_drive` against your server.
- A **live lead card**: watch the prospect's details, a capture-progress bar, and a
  "hot / warm / cold" tag fill in as the conversation goes, then a booked-test-drive
  panel at the end.
- **Both transcripts** stream into the conversation (what you said + what the agent said).
- Tiny JSON files as the "database" (no external DB needed).

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

Open **http://localhost:5173**, press **Start call**, and talk to Diya.

> The server runs on `:8090`, the app on `:5173`, and Vite proxies `/api/*` to the
> server. The ports are env-driven (`CLIENT_PORT` / `API_PORT`) — see the
> [port note](#12-ports) at the end.

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
specific to car sales** — reuse it unchanged for any voice agent.

### The function-calling flow
```
You: "I'm looking at a small petrol hatchback, around 8 lakh"
  └▶ swaram emits a function call:  save_lead { interestedModels:["Swift"], budget:"₹6–10 lakh", fuel:"Petrol" }
       └▶ client POSTs /api/testdrive/lead; server merges into the lead; card updates
            └▶ swaram asks the next single question
…several turns later, name + dealership + day captured…
  └▶ swaram emits:  check_availability { dealership, date }
       └▶ client GETs /api/testdrive/availability; swaram speaks two or three open slots
You pick a time and say yes
  └▶ swaram emits:  book_test_drive { car_model, dealership, date, time, customer_name, phone }
       └▶ client POSTs /api/testdrive/book; server validates + saves
            └▶ swaram confirms; the booked panel appears
```

### The progressive-enrichment pattern (the heart of this demo)

A buyer's profile is gathered over many turns — model, budget, fuel, transmission,
timeline, exchange, finance, name, city. Rather than wait for everything and submit
one giant form, the agent **enriches incrementally**:

- The agent calls **`save_lead` repeatedly**, each time with **only the field(s) it
  just learned** (e.g. just `budget`, or just `fuel`). The instructions tell it to
  do this after every answer.
- The **server merges**: `saveLead()` in `server/src/testdrive.ts` overwrites only
  the provided fields and **keeps everything already captured** — empty/missing
  fields never clobber existing values.
- A **per-session lead id is owned by the client.** The first `save_lead` returns a
  new `id`; the page stores it in `leadIdRef` and passes it back on every subsequent
  `save_lead` and on `book_test_drive`, so all the fragments attach to one record.
  (Starting a new call resets the ref, so a fresh lead is created.)
- **`book_test_drive` finalizes**: it re-links the same `leadId`, validates the slot,
  and writes the test-drive booking, which carries the enriched lead with it.

The visible payoff is the **lead card** (`components/LeadCard.tsx`): it re-renders
on each `save_lead`, advancing the capture-progress bar and flipping the lead's
temperature tag based on the timeline answer.

## 5. Project layout

```
test-drive/
├── dev.sh                      # runs server + client together
├── server/                     # Express API (the source of truth)
│   ├── .env.example            # your SWARAM_API_KEY goes here
│   ├── testdrive-config.example.json # ★ sample dealerships + hours + models + enrich sets
│   └── src/
│       ├── index.ts            # app entry: mounts the routes
│       ├── config.ts           # reads .env (only needs SWARAM_API_KEY)
│       ├── testdrive.ts        # ★ DOMAIN: loads testdrive-config.json, leads, validation, storage
│       ├── carCatalog.ts       #   default car line-up (seeds the config file)
│       └── routes/
│           ├── testdrive.ts    # ★ test-drive REST endpoints
│           ├── swaramToken.ts  #   reusable: mints the browser token
│           └── log.ts          #   reusable: conversation logging
└── client/                     # React + Vite UI
    └── src/
        ├── pages/TestDrive.tsx # ★ the page: persona, tools, lead card, tool wiring
        ├── components/
        │   ├── LeadCard.tsx          # ★ the live lead card
        │   └── ConversationPane.tsx  #   reusable: transcript + controls
        ├── lib/
        │   ├── useVoiceSession.ts    #   reusable: the whole voice pipeline
        │   ├── swaramClient.ts       #   reusable: swaram WebSocket client
        │   ├── api.ts                #   reusable: token fetch
        │   └── testdriveApi.ts       # ★ test-drive fetch helpers + types
        ├── audio/                    #   reusable: mic capture + playback
        └── index.css                 #   theme (dark, minimal)
```

★ = test-drive-specific (the parts you change to make a different app). Everything
else is the reusable voice kit.

---

## 6. How to customize

Most changes are in two places: **`server/data/testdrive-config.json`** (dealerships,
hours, working days, the car line-up, and the enrichment value sets — see §6.1) and
`client/src/pages/TestDrive.tsx` (the persona + tools).

### 6.1 Change dealerships, hours, models, and enrichment sets (no code)
The dealerships, working hours/days, booking window, the car **line-up**, and the
**enrichment value sets** (budget / fuel / transmission / timeline) all live in an
**editable config file**, not in code. On first run the server writes
`server/data/testdrive-config.json` from the built-in defaults; edit that file and
**restart** the server to change anything. A committed copy of the defaults lives at
**[`server/testdrive-config.example.json`](./server/testdrive-config.example.json)**
for reference (you can also `cp server/testdrive-config.example.json server/data/testdrive-config.json`
to start from it).

```jsonc
{
  "windowDays": 7,
  "slotMinutes": 30,
  "workingDays": ["Mon","Tue","Wed","Thu","Fri","Sat"],
  "hours": [["09:00","13:00"], ["14:00","17:00"]],
  "brand": { "id": "maruti", "name": "Maruti Suzuki" },
  "dealerships": [
    { "id": "kakkanad", "name": "Kakkanad", "area": "Kakkanad" }   // id unique + stable
    // add / remove dealerships here…
  ],
  "models": [
    { "name": "Swift", "bodyType": "Hatchback", "fuel": ["Petrol","CNG"],
      "transmission": ["Manual","Automatic"], "priceBand": "₹6.5–9.5 lakh", "seats": 5 }
    // add / remove models here… (attributes feed Diya's recommendations)
  ],
  "enrich": {
    "budget": ["Under ₹6 lakh","₹6–10 lakh","₹10–15 lakh","Above ₹15 lakh"],
    "fuel": ["Petrol","Diesel","CNG","Hybrid"],
    "transmission": ["Manual","Automatic"],
    "timeline": ["This month","1–3 months","Just exploring"]
  }
}
```

Everything reads from this file: the board columns, the day strip, availability,
booking validation, the `dealership` / `car_model` enums, the **lead-card pills**, and
the `save_lead` enum constraints (`budget`/`fuel`/`transmission`/`timeline`). So:

- **Dealerships / hours / window** → edit `dealerships` / `hours` / `slotMinutes` /
  `workingDays` / `windowDays` (a continuous block is `[["09:00","18:00"]]`; drop
  `"Sat"` to close Saturdays).
- **Models (the line-up)** → edit `models`; `name` is what the agent recognizes and
  reads back, and the attributes feed recommendations. *The agent is told never to
  invent a model or price.*
- **Enrichment sets** → edit `enrich.*` — e.g. add a finer band like `"Under ₹5 lakh"`
  to `budget`. (`finance` is a fixed Yes/No and stays in code.)

> The `timeline` value also drives the lead-temperature tag in `LeadCard.tsx`
> (`This month` → 🔥 Hot, `1–3 months` → Warm, `Just exploring` → Cold). Keep those
> labels in sync if you rename a timeline option. Adding a brand-new enriched **field**
> (say `colour`) still needs code — add it to the `Lead` type, `EMPTY_LEAD`, `saveLead`,
> the `save_lead` tool, the client `Lead` type, and `LeadCard.tsx`. The built-in
> defaults that seed the config live in `server/src/testdrive.ts` (+ `carCatalog.ts`
> for the model list).

### 6.2 Change the agent's persona, language, or rules
Edit `buildInstructions(cfg)` in `client/src/pages/TestDrive.tsx`. This string is
the agent's system prompt; it already contains today's date, the dealership list,
the bookable dates, the full line-up, the **order of questions to ask**, and the
booking steps. Rewrite it to change tone, the questions, or the business rules. Keep
the **mandatory tool-use rules** below.

### 6.3 Change the voice
The voice picker offers `mal-female` / `mal-male` (the only two swaram voices). The
default is set by `useState<Voice>("mal-female")` in `TestDrive.tsx`. The agent's
**name follows the chosen voice** — **"Diya"** (female) / **"Dev"** (male) — passed
into `buildInstructions`, so the spoken self-intro matches the voice.

### 6.4 Add or change a tool (function the agent can call)

This is the most important customization. Follow these steps and **conventions** —
they are what make function calling reliable.

**Step 1 — declare the tool** in `buildTools(cfg)` in `TestDrive.tsx`:
```ts
{
  type: "function",
  name: "cancel_test_drive",
  description: "Cancel an existing test drive after confirming with the customer.",
  parameters: {
    type: "object",
    properties: {
      dealership: { type: "string", enum: dealerships, description: "Dealership name" },
      date:       { type: "string", enum: dates,       description: "YYYY-MM-DD" },
      time:       { type: "string", enum: cfg.slots,   description: "HH:MM 24-hour" },
    },
    required: ["dealership", "date", "time"],
  },
}
```

**Step 2 — handle it** in `onFunctionCall` in `TestDrive.tsx`:
```ts
} else if (name === "cancel_test_drive") {
  const res = await cancelTestDrive(args);   // add this in testdriveApi.ts
  reply(res);
}
```

**Step 3 — implement the endpoint** in `server/src/routes/testdrive.ts` and the rule
in `server/src/testdrive.ts`. The **server is the source of truth** — it must
re-validate everything (dealership exists, slot is valid, not in the past, no clash)
and return `{ ok: false, error }` on any problem.

#### MANDATORY conventions when adding tools

These are requirements, not suggestions. The realtime model is reliable **only**
when you follow them:

1. **Constrain every closed-set parameter with an `enum`, built from live config.**
   Any field whose valid values are known — a dealership, a date (the bookable
   list), a time (the slot list), a car model, a budget band, a fuel, a
   transmission, a timeline — **must** be an `enum` sourced from
   `/api/testdrive/config`, exactly as `buildTools(cfg)` does
   (`cfg.dealerships`, `cfg.days`, `cfg.slots`, `cfg.modelNames`, `cfg.enrich.*`).
   This forces the model to emit a *structured* call and snaps fuzzy or garbled
   speech to a canonical value. Use plain `string` **only** for genuinely open text
   (names, city, free-form notes) and for dictated identifiers like phone numbers
   (which you confirm by read-back).

2. **Validate again on the server.** Enums guide the model; they are not a
   guarantee. Re-check the dealership exists, the date is in range, the slot is
   valid, it isn't in the past, and there's no double-booking — then persist. Return
   a clear `{ ok: false, error }` so the agent can recover.

3. **Confirm success only after the tool returns `ok: true`.** The persona must
   never tell the customer "booked / done / confirmed" before `book_test_drive` has
   actually returned success. The instructions enforce this (the CRITICAL line);
   keep that rule when you edit them.

4. **Call tools silently; never narrate.** Instruct the agent to call functions
   without speaking the function name or arguments aloud, and to say one short
   sentence only **after** the result. (This also avoids the agent repeating itself
   around a tool call.)

5. **Keep the tool set small and each tool single-purpose,** with a clear
   description that states *when* to use it. Here that's three tools: enrich, check,
   book.

> The persona in `buildInstructions` already encodes rules 3 and 4 — reuse those
> lines verbatim in any new agent you build.

---

## 7. Tools reference

| Tool | Args | Returns |
|---|---|---|
| `save_lead` | any of `name`, `phone`, `city`, `interestedModels[]`, `budget`, `fuel`, `transmission`, `timeline`, `exchange`, `finance` (all optional — only the new ones) | the merged lead |
| `check_availability` | `dealership`, `date` (YYYY-MM-DD) | free 30-minute slots |
| `book_test_drive` | `car_model`, `dealership`, `date`, `time`, `customer_name`, `phone` | the booking, or an error |

REST endpoints (the browser tool handler maps tool calls to these):

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/api/testdrive/config` | brand, models, dealerships, slot times, days, today, `hoursLabel`/`daysLabel`, enrichment value sets |
| `POST` | `/api/testdrive/lead` | create or **merge** a lead (enrichment) |
| `GET`  | `/api/testdrive/lead/:id` | fetch one lead |
| `GET`  | `/api/testdrive/availability?dealership=&date=` | free slots |
| `GET`  | `/api/testdrive/bookings` | existing test-drive bookings |
| `POST` | `/api/testdrive/book` | validate + create a test-drive booking |
| `POST` | `/api/swaram-token` | mint the short-lived browser token |
| `POST` | `/api/log` · `GET /api/logs?session=` | conversation logging |

## 8. Data & persistence

Leads are stored in `server/data/leads.json` and test-drive bookings in
`server/data/testdrive-bookings.json` (both created on first run). They're
git-ignored. Delete the files to reset. There is no database and no auth — this is a
demo, not production.

The full call (every `user.said`, `agent.said`, `tool.call`, `tool.result`) is
appended to `server/src/data/conversations.jsonl` for debugging. Read it back with
`GET /api/logs?session=<id>`. **All of this contains PII the caller dictated — name,
city, and phone number — keep it private and don't ship it as-is.**

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
2. Replace the **domain files** (`server/src/testdrive.ts`, `carCatalog.ts`) with
   your own data + rules, and the **routes** with your endpoints.
3. Replace the **lead card** and **`*Api.ts`** with your UI + fetch helpers.
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
- **Lead card not filling in** → the agent must call `save_lead`; if it narrates
  instead, tighten the silent-tool-call lines in `buildInstructions`.
- **Port already in use** → change the ports (next section).

## 12. Ports

Ports are env-driven so the app can run alongside others:

- **Server**: `PORT` in `server/.env` (default **8090**).
- **Client**: `CLIENT_PORT` (Vite dev server, default **5173**) and `API_PORT` (the
  Express port Vite proxies `/api/*` to, default **8090**) — both read in
  `client/vite.config.ts`. If you change the server `PORT`, set `API_PORT` to match.

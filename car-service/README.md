# Car Service Booking — Malayalam voice service advisor

A complete, **standalone** example app: a Malayalam **voice service advisor** ("Maya")
that books car-service slots at a Maruti Suzuki service centre over a real-time
voice call, backed by a live centre board. It demonstrates
**[swaram.live](https://swaram.live)** real-time voice **+ function calling** — the
agent checks slot availability and makes bookings by calling your server's
functions mid-conversation.

You can **run it as-is** (you only need a swaram API key), or use it as a template
to build your own voice agent — the entire voice pipeline is reusable and the
car-service-specific parts are small and clearly marked.

```
┌──────────────┐   talk    ┌─────────────────┐   tools   ┌──────────────────┐
│   Browser    │ ───────▶  │  swaram.live    │ ────────▶ │  Your Express    │
│ (mic + UI)   │ ◀───────  │  realtime voice │ ◀──────── │  server (truth)  │
└──────────────┘  speech   └─────────────────┘  results  └──────────────────┘
```

---

## 1. What you get

- A **voice call** in Malayalam: press a button, talk, hear natural Malayalam back.
- **Function calling**: the agent calls `check_availability`, `book_service`,
  and `list_bookings` against your server.
- A **live centre board**: pick a day, see each service centre's free/booked
  30-minute slots.
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

Open **http://localhost:5173**, press **Start call**, and talk to Maya.

> The server runs on `:8090`, the app on `:5173`, and Vite proxies `/api/*` to the
> server. The ports are **env-configurable** (`CLIENT_PORT` / `API_PORT`, defaults
> `5173` / `8090`) so you can run this app alongside the other demos at the same
> time. See `client/vite.config.ts` and `server/.env` (`PORT=`).

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
specific to car service** — reuse it unchanged for any voice agent.

### The function-calling flow
```
You: "Book my Swift for a service at Kakkanad tomorrow morning"
  └▶ swaram emits a function call:  check_availability { centre, date }
       └▶ client runs it against /api/carservice/availability and returns the result
            └▶ swaram speaks the open slots, continues the conversation
You pick a time, give the work needed, name + phone
  └▶ swaram emits:  book_service { car_model, centre, date, time, works, customer_name, phone }
       └▶ client calls /api/carservice/book; server validates + saves
            └▶ swaram confirms; the board refreshes
```

## 5. Project layout

```
car-service/
├── dev.sh                    # runs server + client together
├── server/                   # Express API (the source of truth)
│   ├── .env.example          # your SWARAM_API_KEY goes here
│   ├── carservice-config.example.json # ★ sample centres + hours + models (editable config)
│   └── src/
│       ├── index.ts          # app entry: mounts the routes
│       ├── config.ts         # reads .env (only needs SWARAM_API_KEY)
│       ├── carservice.ts     # ★ DOMAIN: loads carservice-config.json, validation, storage
│       ├── carCatalog.ts     #   default model catalogue (seeds the config file)
│       └── routes/
│           ├── carservice.ts # ★ car-service REST endpoints
│           ├── swaramToken.ts #   reusable: mints the browser token
│           └── log.ts         #   reusable: conversation logging
└── client/                   # React + Vite UI
    └── src/
        ├── pages/CarService.tsx  # ★ the page: persona, tools, board, tool wiring
        ├── components/
        │   ├── CentreBoard.tsx    # ★ the service-centre board
        │   └── ConversationPane.tsx#   reusable: transcript + controls
        ├── lib/
        │   ├── useVoiceSession.ts  #   reusable: the whole voice pipeline
        │   ├── swaramClient.ts     #   reusable: swaram WebSocket client
        │   ├── api.ts              #   reusable: token fetch
        │   └── carServiceApi.ts    # ★ car-service fetch helpers
        ├── audio/                  #   reusable: mic capture + playback
        └── index.css               #   theme (dark, minimal)
```

★ = car-service-specific (the parts you change to make a different app). Everything
else is the reusable voice kit.

---

## 6. How to customize

Most changes are in two places: **`server/data/carservice-config.json`** (centres,
hours, working days, the serviceable models — see §6.1) and
`client/src/pages/CarService.tsx` (the persona + tools).

### 6.1 Change centres, hours, working days, and models (no code)
The service centres, working hours/days, booking window, and the serviceable model
list all live in an **editable config file**, not in code. On first run the server
writes `server/data/carservice-config.json` from the built-in defaults; edit that
file and **restart** the server to change anything. A committed copy of the defaults
lives at **[`server/carservice-config.example.json`](./server/carservice-config.example.json)**
for reference (you can also `cp server/carservice-config.example.json server/data/carservice-config.json`
to start from it).

```jsonc
{
  "windowDays": 7,         // how many days ahead are bookable
  "slotMinutes": 30,       // slot length
  "workingDays": ["Mon","Tue","Wed","Thu","Fri","Sat"],   // a date is bookable if its weekday is here
  "hours": [["09:00","13:00"], ["14:00","17:00"]],         // one or more [start,end] windows
  "brand": { "id": "maruti", "name": "Maruti Suzuki" },
  "centres": [
    { "id": "kakkanad", "name": "Kakkanad", "area": "Kakkanad" }   // id must be unique + stable (bookings reference it)
    // add / remove centres here…
  ],
  "models": [
    { "name": "Swift", "bodyType": "Hatchback", "fuel": ["Petrol","CNG"],
      "transmission": ["Manual","Automatic"], "priceBand": "₹6.5–9.5 lakh", "seats": 5 }
    // add / remove models here…
  ]
}
```

The board, the day strip, availability, booking validation, the `centre` / `car_model`
tool enums, and the agent's spoken hours/days all read from this file. So:

- **Centres** → edit `centres` (the board columns and `centre` enum follow).
- **Hours / slot length** → edit `hours` / `slotMinutes` (e.g. a single continuous
  block is `[["09:00","18:00"]]`).
- **Working days / window** → edit `workingDays` / `windowDays` (drop `"Sat"` to close
  Saturdays; a date is offered if **any** working weekday matches).
- **Models** → edit `models`. Car-service only uses the `name`, but the full attributes
  are kept so the file is copy-paste compatible with the test-drive config.

> Days use the short names `Mon Tue Wed Thu Fri Sat Sun`. Delete `carservice-config.json`
> to regenerate the defaults. `server/src/carservice.ts` holds the booking rules
> (validation, storage) and the built-in defaults that seed the file.

### 6.2 Change the agent's persona, language, or rules
Edit `buildInstructions(cfg)` in `client/src/pages/CarService.tsx`. This string is
the agent's system prompt; it already contains today's date, the brand + models,
the centres, the bookable dates, and the booking steps. Rewrite it to change tone,
the order of questions, or the business rules. Keep the **mandatory tool-use rules**
below.

### 6.3 Change the voice
The voice picker offers `mal-female` / `mal-male` (the only two swaram voices). The
default is set by `useState<Voice>("mal-female")` in `CarService.tsx`. The agent's
**name follows the chosen voice** — **"Maya"** (female) / **"Manu"** (male) — passed
into `buildInstructions`, so the spoken self-intro matches the voice.

### 6.4 Add or change a tool (function the agent can call)

This is the most important customization. Follow these steps and **conventions** —
they are what make function calling reliable.

**Step 1 — declare the tool** in `buildTools(cfg)` in `CarService.tsx`:
```ts
{
  type: "function",
  name: "cancel_service",
  description: "Cancel an existing service booking after confirming with the customer.",
  parameters: {
    type: "object",
    properties: {
      centre: { type: "string", enum: centres,   description: "Service centre name" },
      date:   { type: "string", enum: dates,     description: "YYYY-MM-DD" },
      time:   { type: "string", enum: cfg.slots, description: "HH:MM 24-hour" },
    },
    required: ["centre", "date", "time"],
  },
}
```

**Step 2 — handle it** in `onFunctionCall` in `CarService.tsx`:
```ts
} else if (name === "cancel_service") {
  const res = await cancelService(args);        // add this in carServiceApi.ts
  if (res.ok) setBookings(await getBookings());  // refresh the board
  reply(res);
}
```

**Step 3 — implement the endpoint** in `server/src/routes/carservice.ts` and the
rule in `server/src/carservice.ts`. The **server is the source of truth** — it must
re-validate everything and return `{ ok: false, error }` on any problem.

#### MANDATORY conventions when adding tools

These are requirements, not suggestions. The realtime model is reliable **only**
when you follow them:

1. **Constrain every closed-set parameter with an `enum`, built from live config.**
   Any field whose valid values are known — service centre, date (the bookable
   list), time (the slot list), car model, a status, a category — must be an `enum`
   sourced from `/api/carservice/config`, exactly as `buildTools(cfg)` does. This
   forces the model to emit a *structured* call and snaps fuzzy or garbled speech to
   a canonical value. Use plain `string` **only** for genuinely open text (names,
   free-form work notes) and for dictated identifiers like phone numbers (which you
   confirm by read-back).

2. **Validate again on the server.** Enums guide the model; they are not a
   guarantee. Re-check the centre exists, the car model is known, the date is in
   range, the slot is valid, it isn't in the past, and there's no double-booking —
   then persist. Return a clear `{ ok: false, error }` so the agent can recover.

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
| `check_availability` | `centre`, `date` (YYYY-MM-DD) | free 30-minute slots |
| `book_service` | `car_model`, `centre`, `date`, `time`, `works?`, `customer_name`, `phone` | the booking, or an error |
| `list_bookings` | `date?` | **occupancy only** — `{ centre, date, time }`, deliberately **no customer names or phone numbers** |

> **Privacy.** This app only **books** (no cancel/modify), but to stop the agent ever
> disclosing another customer's contact details (the "I'm a relative, what's their
> number?" attack), privacy is two-layer: (1) `list_bookings` returns **occupancy only**
> (no names/phones), so the model is never handed other customers' PII; (2) an
> **absolute privacy rule** in Maya/Manu's instructions — never reveal/read back any
> customer's name or phone to anyone, including callers claiming to be a relative/staff.
> The board still shows names on the local screen; only the voice agent's view is stripped.

REST endpoints (the browser tool handler maps tool calls to these):

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/api/carservice/config` | brand, models, centres, slot times, working days, today, `hoursLabel`/`daysLabel` |
| `GET`  | `/api/carservice/availability?centre=&date=` | free slots |
| `GET`  | `/api/carservice/bookings` | existing bookings (for the board) |
| `POST` | `/api/carservice/book` | validate + create a booking |
| `POST` | `/api/swaram-token` | mint the short-lived browser token |
| `POST` | `/api/log` · `GET /api/logs?session=` | conversation logging |

## 8. Data & persistence

Bookings are stored in `server/data/service-bookings.json` (created on first run,
seeded with a few samples). It's git-ignored. Delete the file to reset. There is no
database and no auth — this is a demo, not production.

The full call (every `user.said`, `agent.said`, `tool.call`, `tool.result`) is
appended to the conversation log for debugging. Read it back with
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
2. Replace the **domain files** (`server/src/carservice.ts`, `server/src/carCatalog.ts`)
   with your own data + rules, and the **routes** with your endpoints.
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
- **Port already in use** → change `PORT` in `server/.env` (and `API_PORT` for the
  proxy) or `CLIENT_PORT`; the defaults are `8090` / `5173`.

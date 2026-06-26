# Appliance Customer Care — Malayalam voice support agent

A complete, **standalone** example app: a Malayalam **customer-care agent** ("Nila")
that logs a home-appliance **repair / pickup / service** ticket over a real-time
voice call, backed by a live ticket card that fills in as you talk. It demonstrates
**[swaram.live](https://swaram.live)** real-time voice **+ function calling** — the
agent captures each detail and raises a ticket by calling your server's functions
mid-conversation.

You can **run it as-is** (you only need a swaram API key), or use it as a template
to build your own voice agent — the entire voice pipeline is reusable and the
support-specific parts are small and clearly marked.

```
┌──────────────┐   talk    ┌─────────────────┐   tools   ┌──────────────────┐
│   Browser    │ ───────▶  │  swaram.live    │ ────────▶ │  Your Express    │
│ (mic + UI)   │ ◀───────  │  realtime voice │ ◀──────── │  server (truth)  │
└──────────────┘  speech   └─────────────────┘  results  └──────────────────┘
```

---

## 1. What you get

- A **voice call** in Malayalam: press a button, talk, hear natural Malayalam back.
- **Function calling**: the agent calls `save_request`, `schedule_request`,
  `update_ticket` and `cancel_ticket` against your server.
- A **live ticket card**: each field (appliance, issue, warranty, date, time band,
  area, address, name, phone) fills in as the agent captures it, with a progress bar.
- **Modify or cancel an existing ticket** — gated by a **name + phone identity check**
  on the ticket number; refuses without revealing stored details (see §6.6).
- **No past-time bookings** — today's already-passed time bands aren't offered or
  accepted (see §4.1).
- A **recent tickets** queue under the card.
- **Both transcripts** stream into the conversation (what you said + what the agent said).
- A tiny JSON file as the ticket "database" (no external DB needed).

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

Open **http://localhost:5173**, press **Start call**, and talk to Nila.

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
specific to support** — reuse it unchanged for any voice agent.

### The function-calling flow — the PROGRESSIVE TICKET pattern

Unlike a one-shot form, this agent captures **one field at a time** and saves each
answer as it goes. The server keeps a single **draft ticket per session** and
**merges** every partial update into it.

```
You: "My fridge isn't cooling"
  └▶ swaram emits:  save_request { appliance: "Refrigerator", issue: "not cooling" }
       └▶ client calls /api/support/request; server MERGES those fields into the
          session's draft ticket and returns the whole ticket
            └▶ the ticket card on the left updates; the agent asks the next question
... (request type, warranty, area, address, preferred date + time band, name, phone) ...
each answer → another save_request with only the new field(s); earlier fields persist
  └▶ agent reads everything back, you say yes
       └▶ swaram emits:  schedule_request { ...final fields }
            └▶ server validates required fields, assigns a ref (SR0001…), marks it
               Scheduled, returns it — OR returns { ok:false, error } listing what's missing
                 └▶ agent confirms with the ticket number, the recent-tickets queue refreshes
```

Two things make this reliable:

- **`save_request` is additive.** The client sends the draft's `id` with every call,
  so the model only has to emit the *new* field(s); the server preserves the rest.
  This is why the agent can ask naturally, in any order, without re-stating
  everything each turn. It drives the live ticket card.
- **`schedule_request` is the only thing that finalizes.** It re-validates the
  required set server-side, and only then assigns the human-friendly ref `SR0001`,
  `SR0002`, … and flips the status to `Scheduled`.

There is **no availability check and no double-booking logic** here (that is the
clinic demo's job). "Preferred timing" is a **soft request**: a `preferred_date`
chosen from a small enum of working days, plus a `preferred_time` chosen from a
coarse time-of-day **band** enum (`Morning`, `Afternoon`, `Evening`). Nothing is
reserved — a human dispatcher reads the ticket and arranges the visit.

### 4.1 No past-time bookings
Even though timing is soft, the app won't let a caller pick a band that's already
over **today**. Each band has an end hour (Morning → 12:00, Afternoon → 16:00,
Evening → 19:00); on today, a band is "past" once that hour is reached. So:
- `getConfig()` exposes **`timeBandsToday`** (the bands still valid for today, maybe
  empty) and **drops today from the offered `days`** once all its bands have passed —
  the agent's date/band enums + instructions therefore never present a past option.
- `scheduleRequest` and `updateTicket` **reject** a `preferredDate === today` with a
  passed band (*"That time band has already passed for today…"*) as the hard guard.

These three slot times (`BAND_END_HOUR` in `support.ts`) are what you'd edit if your
service day were different.

## 5. Project layout

```
appliance-support/
├── dev.sh                    # runs server + client together
├── server/                   # Express API (the source of truth)
│   ├── .env.example          # your SWARAM_API_KEY goes here
│   └── src/
│       ├── index.ts          # app entry: mounts the routes
│       ├── config.ts         # reads .env (only needs SWARAM_API_KEY)
│       ├── support.ts        # ★ DOMAIN: enums, working days, ticket merge/validate/storage
│       ├── identity.ts       #   reusable: phoneMatches (strict) + nameMatches (lenient)
│       └── routes/
│           ├── support.ts    # ★ support REST endpoints
│           ├── swaramToken.ts #   reusable: mints the browser token
│           └── log.ts         #   reusable: conversation logging
└── client/                   # React + Vite UI
    └── src/
        ├── pages/Support.tsx # ★ the page: persona, tools, ticket card, tool wiring
        ├── components/
        │   ├── TicketCard.tsx      # ★ the live ticket + recent queue
        │   └── ConversationPane.tsx#   reusable: transcript + controls
        ├── lib/
        │   ├── useVoiceSession.ts  #   reusable: the whole voice pipeline
        │   ├── swaramClient.ts     #   reusable: swaram WebSocket client
        │   ├── api.ts              #   reusable: token fetch
        │   └── supportApi.ts       # ★ support fetch helpers + types
        ├── audio/                  #   reusable: mic capture + playback
        └── index.css               #   theme (dark, minimal)
```

★ = support-specific (the parts you change to make a different app). Everything else
is the reusable voice kit.

---

## 6. How to customize

Almost everything you'll want to change is in **two files**:
`server/src/support.ts` (the data + rules) and `client/src/pages/Support.tsx`
(the persona + tools).

### 6.1 Change the appliances / request types / warranty options / service areas / time bands

These are the **enum arrays at the top of `server/src/support.ts`**. They are the
single source of truth: `getConfig()` exposes them at `/api/support/config`, the
page turns them into tool `enum`s, and the server normalizes incoming values to them.

```ts
export const APPLIANCES = ["TV", "Refrigerator", "AC", "Washing Machine"];
export const REQUEST_TYPES = ["Repair", "Pickup", "Service"];
export const WARRANTY_OPTIONS = ["Yes", "No", "Not sure"];
export const TIME_BANDS = ["Morning (9am–12pm)", "Afternoon (12pm–4pm)", "Evening (4pm–7pm)"];
export const AREAS = [
  "Kakkanad", "Edapally", "Kaloor", "Vyttila", "Palarivattom",
  "Thripunithura", "Aluva", "Fort Kochi", "Ernakulam",
];
```

Add a `"Microwave"` to `APPLIANCES`, drop in another locality in `AREAS`, or rename a
time band — the tool enums, the persona's spoken lists, and the ticket card all pick
it up automatically. (If you add an appliance, add an icon for it in the `ICONS` map
in `client/src/components/TicketCard.tsx`; it falls back to 🛠️.) Optionally extend the
`SYNONYMS` map in `support.ts` so spoken variants ("fridge", "a/c") snap to the
canonical value.

### 6.2 Change the booking window or working days

In `server/src/support.ts`:
- `WINDOW_DAYS` — how many calendar days ahead are offerable as `preferred_date`
  (default `7`).
- `workingDays()` skips Sundays via `if (d.getDay() === 0) continue;`. Change `0`
  (Sunday) to skip a different day, or remove the line to allow all days.

```ts
const WINDOW_DAYS = 7; // calendar days from today (Sundays skipped)

export function workingDays(): Day[] {
  const days: Day[] = [];
  const today = new Date();
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    if (d.getDay() === 0) continue; // skip Sunday
    days.push({ date: fmt(d), label: /* … */ });
  }
  return days;
}
```

### 6.3 Change the agent's persona, language, or rules

Edit `buildInstructions(cfg)` in `client/src/pages/Support.tsx`. This string is the
agent's system prompt; it already contains today's date, the appliance list, the
service areas, the bookable dates, the time bands, and the step-by-step order in
which to gather fields. Rewrite it to change tone, the order of questions, or the
business rules. Keep the **mandatory tool-use rules** below.

### 6.4 Change the voice

The voice picker offers `mal-female` / `mal-male` (the only two swaram voices). The
default is set by `useState<Voice>("mal-female")` in `Support.tsx`. The agent's **name
follows the chosen voice** — **"Nila"** (female) / **"Nikhil"** (male) — passed into
`buildInstructions`, so the spoken self-intro matches the voice.

### 6.5 Add or change a tool (function the agent can call)

This is the most important customization. Follow these steps and **conventions** —
they are what make function calling reliable.

`save_request`, `schedule_request`, `update_ticket` and `cancel_ticket` ship
built-in. The `reopen_ticket` below is a worked example of adding a new one (it
re-uses the same identity-check pattern as `update_ticket`/`cancel_ticket`).

**Step 1 — declare the tool** in `buildTools(cfg)` in `Support.tsx`. Reuse the shared
`requestFields` (already enum-constrained) where you can:
```ts
{
  type: "function",
  name: "reopen_ticket",
  description: "Reopen a cancelled ticket, after confirming identity with name + phone.",
  parameters: {
    type: "object",
    properties: {
      ref:           { type: "string", description: "The ticket number, e.g. SR0007" },
      customer_name: { type: "string", description: "Full name used when booking (identity check)" },
      phone:         { type: "string", description: "Phone used when booking (identity check)" },
    },
    required: ["ref", "customer_name", "phone"],
  },
}
```

**Step 2 — handle it** in `onFunctionCall` in `Support.tsx`:
```ts
} else if (name === "reopen_ticket") {
  const res = await reopenTicket(args);       // add this in supportApi.ts
  if (res.ok) setRecent(await getTickets());  // refresh the queue
  reply(stripPhone(res));                     // never hand the stored phone to the model
}
```

**Step 3 — implement the endpoint** in `server/src/routes/support.ts` and the rule in
`server/src/support.ts`. The **server is the source of truth** — it must re-validate
everything and return `{ ok: false, error }` on any problem.

#### MANDATORY conventions when adding tools

These are requirements, not suggestions. The realtime model is reliable **only**
when you follow them:

1. **Constrain every closed-set parameter with an `enum`, built from live config.**
   Any field whose valid values are known — appliance, request type, warranty, area,
   preferred date (the working-days list), preferred time (the band list) — must be
   an `enum` sourced from `/api/support/config`, exactly as `buildTools(cfg)` does
   via `requestFields`. This forces the model to emit a *structured* call and snaps
   fuzzy or garbled speech to a canonical value. Use plain `string` **only** for
   genuinely open text (the issue description, address, name) and for dictated
   identifiers like phone numbers (which you confirm by read-back).

2. **Validate again on the server.** Enums guide the model; they are not a guarantee.
   `scheduleRequest` re-checks the required fields are present and that the phone has
   enough digits before assigning a ref. Keep validating server-side and return a
   clear `{ ok: false, error }` so the agent can recover.

3. **Confirm success only after the tool returns `ok: true`.** The persona must never
   tell the user "logged / scheduled / done" before `schedule_request` has actually
   returned success with a ref. The instructions enforce this; keep that rule when
   you edit them.

4. **Call tools silently; never narrate.** Instruct the agent to call functions
   without speaking the function name or arguments aloud, and to say one short
   sentence only **after** the result. (This also avoids the agent repeating itself
   around a tool call.)

5. **Keep the tool set small and each tool single-purpose,** with a clear description
   that states *when* to use it. Two tools cover the whole flow here — prefer adding
   fields to `save_request` over inventing new tools.

> The persona in `buildInstructions` already encodes rules 3 and 4 — reuse those
> lines verbatim in any new agent you build.

---

## 7. Tools reference

| Tool | Args | Returns |
|---|---|---|
| `save_request` | any of: `appliance`, `request_type`, `issue`, `warranty`, `area`, `address`, `preferred_date`, `preferred_time`, `name`, `phone` (send only the new ones) | the merged draft ticket |
| `schedule_request` | the same fields; requires `appliance`, `request_type`, `name`, `phone`, `area`, `preferred_date`, `preferred_time` | the finalized ticket with a `ref`, or `{ ok:false, error }` listing missing fields |
| `update_ticket` | `ref`, `customer_name`, `phone` + any service field(s) to change | the updated ticket, or a generic refusal (§7.1) |
| `cancel_ticket` | `ref`, `customer_name`, `phone` | cancels the ticket, or a generic refusal (§7.1) |

REST endpoints (the browser tool handler maps tool calls to these):

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/api/support/config` | appliances, request types, warranty options, areas, time bands (+ `timeBandsToday`), working days, today |
| `POST` | `/api/support/request` | create or merge the draft ticket (progressive capture) |
| `POST` | `/api/support/schedule` | validate required fields + finalize (assigns a ref) |
| `POST` | `/api/support/update` | modify an existing ticket after the identity check (§7.1) |
| `POST` | `/api/support/cancel` | cancel an existing ticket after the identity check (§7.1) |
| `GET`  | `/api/support/ticket/:id` | fetch a single ticket |
| `GET`  | `/api/support/tickets` | recently scheduled tickets (for the queue) |
| `POST` | `/api/swaram-token` | mint the short-lived browser token |
| `POST` | `/api/log` · `GET /api/logs?session=` | conversation logging |

### 7.1 Modify / cancel an existing ticket — identity check & privacy

A caller can **change** (`update_ticket`) or **cancel** (`cancel_ticket`) a ticket
they booked. Both are gated so a caller can't touch someone else's ticket or fish
for contact details:

- **Identity check (server, `support.ts` via the shared `identity.ts`).** Locate the
  ticket by its **ref** (`SR0007` — normalized, so `sr0007`/digits also match), then
  the supplied `customer_name` **and** `phone` must both match — **strict on phone,
  lenient on name**:
  - **Phone — strict:** ≥7 digits and the **last 10** must equal the stored number's
    (the strong factor).
  - **Name — lenient:** after Unicode-NFC + lowercase + whitespace normalization,
    matches if **equal**, **one contains the other**, or within a small **edit
    distance** (~1 per 3 chars). *Why:* Malayalam speech-to-text spells the same spoken
    name differently across calls (`ധ`↔`ദ`, dropped chillu `ർ`, conjunct variants), so
    an exact match would lock real owners out. (No transliteration to English.)

  `cancel_ticket` marks the ticket `Cancelled` (kept for audit, dropped from the queue).
- **One generic refusal.** "No such ticket" and "details don't match" return the
  **same** message — so a caller can't probe which refs exist or whose they are.
- **Never reads out numbers.** Nila asks for name + phone, verifies **silently**,
  and **does not read the phone back**; she only says whether it matched. The tool
  result handed **to the model is phone-stripped** (`stripPhone` in `Support.tsx`),
  so the model never receives a stored number even though the operator card updates
  from the full server response. An **absolute privacy rule** in the persona forbids
  disclosing anyone's name/phone/ticket to anyone (relationship claims grant no access).

If you add tools that touch existing tickets, keep both layers: **don't hand the
model other people's PII, and gate the action behind a server-side identity check.**

## 8. Data & persistence

Tickets are stored in `server/data/support-tickets.json` (created on first run,
starts **empty** — no seed data). It's git-ignored. Delete the file to reset. Ticket
refs continue past whatever is already in the file. There is no database and no auth —
this is a demo, not production.

The full call (every `user.said`, `agent.said`, `tool.call`, `tool.result`) is
appended to `server/src/data/conversations.jsonl` for debugging. Read it back with
`GET /api/logs?session=<id>`. **Both files contain whatever the caller said —
including names, addresses and phone numbers (PII) — keep them private.**

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
2. Replace the **domain file** (`server/src/support.ts`) with your own enums + rules,
   and the **routes** with your endpoints.
3. Replace the **card component** and **`*Api.ts`** with your UI + fetch helpers.
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
- **`schedule_request` keeps saying fields are missing** → it requires appliance,
  request type, name, phone (≥7 digits), area, preferred date and preferred time. The
  error message lists exactly what's still needed; the agent asks for those and
  retries.
- **Port already in use** → change `PORT` in `server/.env` and the proxy target in
  `client/vite.config.ts` (or the `CLIENT_PORT` / `API_PORT` env vars it reads).

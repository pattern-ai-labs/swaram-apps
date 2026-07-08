# Subash Care — Malayalam voice product registration, by phone & browser

A complete, **standalone** app: a Malayalam voice assistant (**"Anjana" / "Anand"**)
that walks a customer through **product registration** — greeting, service selection,
then collecting and **reading back** the customer and product details one at a time, and
finally issuing a **registration ID** (`SC-#####`). Customers reach it **two ways**:

- **By phone** — they **call a phone number** (via **Plivo**) and talk to the agent. No app, no browser.
- **In the browser** — press a button and talk, with a live registration card.

Both channels write to **one shared registration store**, and the browser dashboard's
**recent-registrations queue** shows every completed registration — including the ones
captured **over the phone** (refresh to see them). Built on
**[swaram.live](https://swaram.live)** real-time voice **+ function calling**.

> **Not affiliated with Plivo.** This project is **not affiliated with, endorsed by, or
> sponsored by Plivo Inc.** "Plivo" and related marks belong to their owners. Plivo is
> used here only as a third-party telephony provider; you bring your own Plivo account,
> and your use of Plivo is governed by Plivo's own terms and pricing.

> **No keys in this repo.** Your `SWARAM_API_KEY` lives only in `server/.env`
> (git-ignored), and your **Plivo credentials are not stored in the app at all** — they
> are used only in the Plivo console/API to point your number at this server (see §5).

```
   ┌──────────────┐  call   ┌──────────┐   media WS    ┌─────────────────────────┐
   │  Phone (PSTN)│ ──────▶ │  Plivo   │ ────────────▶ │  This server            │   tools    ┌───────────────┐
   └──────────────┘  voice  │  number  │ ◀──────────── │  • Plivo⇄swaram bridge  │ ─────────▶ │  swaram.live  │
                            └──────────┘   playAudio    │  • REST API + store     │ ◀───────── │ realtime voice│
   ┌──────────────┐  talk                               │  • serves the dashboard │  speech    └───────────────┘
   │   Browser    │ ───────────────────────────────────▶│                         │
   │ (mic + UI)   │ ◀───────────────────────────────────│   one shared store  ────┼──▶ recent-registrations queue
   └──────────────┘  speech                             └─────────────────────────┘
```

---

## 1. What you get

- **Phone registration** — a caller dials your Plivo number and completes the whole
  registration in Malayalam over the phone.
- **Browser registration** — the same agent, in the browser (mic + live card), for
  testing and walk-ins.
- **One shared store** — phone and browser registrations land in the same place; the
  **recent-registrations queue** in the dashboard lists them all (name + `SC-#####` +
  status). **Refresh the page to see phone bookings** appear.
- **The scripted registration flow**: greeting → service selection (only *Product
  Registration* is handled) → customer details → product details → summary →
  registration ID.
- **Function calling**: the agent calls `select_service`, `save_registration` and
  `complete_registration` against your server (same logic for phone and browser).
- **Server-minted registration ID** (`SC-#####`) — the agent never invents it.
- **Validated phone & pincode, no fabricated digits**; **dates normalised to
  `DD/MM/YYYY`**; **one spoken turn per field** (details in §7).
- **CSV export** of all completed registrations (**Save registrations (CSV)** button /
  `GET /api/subash/export.csv`; UTF-8 + BOM so Malayalam opens correctly in Excel).
- A tiny JSON file as the "database" — no external DB.

## 2. Prerequisites

- **Node.js 18+**.
- A **swaram.live API key** (looks like `swaram_…`) — the only secret this app needs.
- **For the phone channel:**
  - A **Plivo account** with a **phone number** (see §5). In India this requires KYC (§5.2).
  - A **public HTTPS/WSS URL** for this server (a tunnel like Cloudflare/ngrok, or a
    hosted server) so Plivo can reach it.
- A browser with mic access (for the browser channel / dashboard).

You can run and test the **browser** channel with **no Plivo at all** — Plivo is only
needed for actual phone calls.

## 3. Quick start (browser only — no phone yet)

```bash
# 1. configure the one secret
cd server
cp .env.example .env          # edit .env and paste your SWARAM_API_KEY
cd ..

# 2. install + run (dev mode: Vite UI + API with hot-reload)
(cd server && npm install)
(cd client && npm install)
./dev.sh
```

Open **http://localhost:5173**, press **Start call**, and talk to Anjana. Completed
registrations appear in the recent queue on the left.

> Dev mode runs the UI on `:5173` (Vite) and the API + phone bridge on `:8090`. For the
> **phone** channel you run the single-server mode instead — see §4 and §5.

## 4. Single-server mode (what the phone uses)

For phone calls, run **one** server that hosts the dashboard **and** the phone bridge on
a single port, then point your public URL at it:

```bash
./start.sh          # builds the UI, then runs the one server on :8090
```

Now `http://localhost:8090` serves the dashboard, `/api/*` the API, and
`/api/plivo/stream` the phone media WebSocket — all on one port. (You can also do it by
hand: `cd client && npm run build`, then `cd server && npm start`.)

## 5. Set up the phone number (Plivo)

> All of this is done in **your own Plivo account** — the app never stores your Plivo
> credentials. You only need them here, in Plivo's console/API, to point your number at
> this server.

### 5.1 Create a Plivo account
Sign up at **<https://www.plivo.com/>** and add prepaid credit. Your **Auth ID** and
**Auth Token** are on the console dashboard (you'll use them only if you wire the number
via the API in §5.4; the console clicks don't need them).

### 5.2 India KYC requirements (read Plivo's own docs)
India is regulated: renting an Indian number requires an **approved compliance
(KYC) submission** before the number activates, and there are hard limits. The essentials
(verify the current details on Plivo's site — links below):

- **India-registered business only** — foreign entities can't use Indian domestic numbers/routes.
- **Documents:** typically **Certificate of Incorporation (or Udyam registration) + GST
  certificate**, plus **DoT** compliance. Submitted as a **Compliance Application** tied
  to the number.
- **Fixed-line DIDs only** (e.g. Mumbai `022`, Bengaluru `080`) — **no mobile `+91`
  numbers**.
- **Review** typically takes a few business days.

Read the current, authoritative requirements directly on Plivo:
- Number regulatory compliance → **<https://www.plivo.com/docs/numbers/regulatory-compliance>**
- What is KYC → **<https://support.plivo.com/hc/en-us/articles/7682849994393-What-is-KYC>**
- Voice calling in India → **<https://support.plivo.com/hc/en-us/sections/36749586805913-Voice-calling-in-India>**
- Buying numbers → **<https://www.plivo.com/docs/numbers>**

> Outside India, requirements differ (US/Canada numbers generally need no document
> bundle). Check the **Regulatory Information** popup shown when you search/buy a number.

### 5.3 Buy a number (Plivo console)
In the Plivo console: **Phone Numbers → Buy Numbers →** pick your country/type (in India,
a local fixed number), complete any compliance prompt, and **buy** it. It appears under
**Phone Numbers → Your Numbers**.

### 5.4 Create an Application and point it at this server
Plivo routes an incoming call by the **Application** attached to the number. Its
**Answer URL** must be this server's `/api/plivo/answer`.

**Option A — Console (manual):**
1. **Voice → Applications → Add New Application**.
2. **Application Name:** e.g. `Subash_Bridge` (letters/numbers/`-`/`_` only).
3. **Answer URL:** `https://YOUR_PUBLIC_HOST/api/plivo/answer` — **Method: POST**.
4. (Optional) **Hangup URL:** `https://YOUR_PUBLIC_HOST/api/plivo/status` — POST.
5. Save. Then **Phone Numbers → Your Numbers → (your number) → Application:** select this
   application and save.

**Option B — REST API (equivalent):**
```bash
# create the application
curl -u "$PLIVO_AUTH_ID:$PLIVO_AUTH_TOKEN" -X POST \
  "https://api.plivo.com/v1/Account/$PLIVO_AUTH_ID/Application/" \
  -H "Content-Type: application/json" \
  -d '{"app_name":"Subash_Bridge","answer_url":"https://YOUR_PUBLIC_HOST/api/plivo/answer","answer_method":"POST","hangup_url":"https://YOUR_PUBLIC_HOST/api/plivo/status"}'
# assign the number to it (app_id comes from the response above)
curl -u "$PLIVO_AUTH_ID:$PLIVO_AUTH_TOKEN" -X POST \
  "https://api.plivo.com/v1/Account/$PLIVO_AUTH_ID/Number/YOUR_NUMBER/" \
  -H "Content-Type: application/json" -d '{"app_id":"<APP_ID>"}'
```

### 5.5 Expose this server publicly
Plivo must reach `YOUR_PUBLIC_HOST` over HTTPS/WSS. The quickest way is a tunnel to the
**single-server port** (`:8090`):
```bash
cloudflared tunnel --url http://localhost:8090
# or:  ngrok http 8090
```
Take the hostname it prints, put it in **`server/.env`** as `PLIVO_PUBLIC_HOST`, and use
it in the Answer URL above. (Cloudflare/ngrok pass WebSockets through — no extra config.)
**Anyone with the number/URL can spend your swaram + Plivo credits — take the tunnel down
when you're done testing.**

### 5.6 Call it
Dial your number. You should hear Anjana greet you in Malayalam and run the registration.
Open the dashboard (`http://localhost:8090` or your public host) and **refresh** — the
completed call shows up in the recent-registrations queue. The server also logs a live
trace:
```
[plivo] answer  From=… To=… -> wss://…/api/plivo/stream
[plivo] stream start: <id> format: {"encoding":"audio/x-mulaw","sampleRate":8000}
[plivo] caller: <what the caller said>
[plivo] agent : <what Anjana said>
[plivo] tool save_registration -> {...}          # ... complete_registration -> SC-#####
```

## 6. Configuration — example `.env`

`server/.env` (copy from `server/.env.example`):
```
SWARAM_API_KEY=swaram_xxxxxxxxxxxxxxxxxxxxxxxx   # the only real secret

# Phone bridge: the PUBLIC host Plivo reaches you on (tunnel/host). Used to build the
# <Stream> wss:// URL. If omitted, the incoming request's Host header is used.
PLIVO_PUBLIC_HOST=your-tunnel-or-host.example.com

# Optional
# PORT=8090
# SWARAM_BASE_URL=https://api.swaram.live
# SWARAM_MODEL=mal-realtime-simple
# PLIVO_VOICE=mal-female        # agent "Anjana"  (mal-male -> "Anand")
# CORS_ORIGINS=http://localhost:5173
```
Your **Plivo Auth ID / Token are NOT part of `.env`** — they're used only in Plivo's
console/API (§5.4), never by this running app.

## 7. How it works

### The phone bridge (`server/src/plivo*.ts`)
- Plivo answers each call with XML (`routes/plivo.ts`) that opens a **bidirectional media
  stream** to `wss://<host>/api/plivo/stream`.
- For each call, `plivoBridge.ts` opens a **second** WebSocket to swaram (minting a
  short-lived token **server-side** with your `SWARAM_API_KEY`), then pumps audio both
  ways, transcoding **μ-law 8 kHz ⇄ PCM16 24 kHz** (`plivoAudio.ts`, a clean 1:3 resample).
- **Barge-in:** when swaram detects the caller speaking it cancels its own reply, and the
  bridge sends Plivo `clearAudio` to flush audio already queued to the caller.
- **The agent** (`plivoAgent.ts`) is the Subash persona + the three tools, calling the
  **same domain** (`subash.ts`) as the browser — so phone and browser behave identically.

### The browser pipeline (`client/src/lib` + `client/src/audio`)
The browser mints a short-lived token (`/api/swaram-token`), opens the swaram WebSocket,
streams mic audio at 24 kHz, plays replies, and uses **half-duplex + Interrupt/Space**.
This is the reusable voice kit — unchanged from the other swaram demos.

### Reliability (the same rules on both channels)
- **`select_service`** gates to *Product Registration*; **`save_registration`** is an
  additive, one-field-at-a-time merge; **`complete_registration`** validates the **core**
  fields (name, valid mobile, product name, model number) and only then mints `SC-#####`.
- **Phone & pincode:** the **server counts digits**; the agent gets an `ok`-only verdict
  (never the count), and the **mobile is read back and confirmed by the caller _before_
  it's saved** — so a mis-heard or auto-padded number is caught up front.
- **Dates** → `DD/MM/YYYY`, validated (real date, never future).
- **One spoken turn per field** (the CAPTURE LOOP) avoids the realtime model saying each
  line twice around a tool call.

## 8. Project layout

```
subash-plivo-phone/
├── dev.sh                      # DEV: Vite UI (5173) + API/bridge (8090), hot-reload
├── start.sh                    # PHONE/PROD: build UI, run ONE server (8090) = UI + bridge
├── server/                     # Express API + the phone bridge (the source of truth)
│   ├── .env.example            # SWARAM_API_KEY (+ PLIVO_PUBLIC_HOST for phone)
│   └── src/
│       ├── index.ts            # mounts routes, attaches the bridge, serves client/dist
│       ├── config.ts           # reads .env
│       ├── subash.ts         # ★ DOMAIN: services, districts, ID mint, validation, storage
│       ├── plivoAudio.ts       #   μ-law↔PCM16 + 8k↔24k resampling
│       ├── plivoBridge.ts      #   Plivo⇄swaram media relay (WebSocket)
│       ├── plivoAgent.ts       # ★ the Subash phone agent (persona + tools + tool handling)
│       └── routes/
│           ├── plivo.ts        #   answer XML + stream-status callbacks
│           ├── subash.ts     # ★ registration REST endpoints (+ CSV export)
│           ├── swaramToken.ts  #   reusable: mints the browser token
│           └── log.ts          #   reusable: conversation logging
└── client/                     # React + Vite dashboard (browser channel + recent queue)
    └── src/
        ├── pages/Subash.tsx  # ★ persona, tools, live card, recent queue, CSV export
        ├── components/RegistrationCard.tsx  # ★ the live card + recent queue
        ├── components/ConversationPane.tsx  #   reusable: transcript + controls
        ├── lib/ (useVoiceSession, swaramClient, api, subashApi)  # reusable voice kit + fetch
        ├── audio/              #   reusable: mic capture + playback
        └── index.css           #   theme
```
★ = registration-specific (what you'd change for a different flow). Everything else is
reusable voice/telephony plumbing.

## 9. How to customize

- **Services / districts:** the `SERVICES` and `DISTRICTS` arrays at the top of
  `server/src/subash.ts` (exposed at `/api/subash/config`, turned into tool `enum`s).
- **Required-to-finalize fields:** the `missing` checks in `completeRegistration` (same file).
- **Persona / script / language:** `buildInstructions` in `client/src/pages/Subash.tsx`
  (browser) and `server/src/plivoAgent.ts` (phone) — **keep these two in sync**.
- **Voice:** `mal-female` → "Anjana", `mal-male` → "Anand" (`PLIVO_VOICE` for the phone;
  the picker for the browser).
- **A different phone agent entirely:** the bridge is agent-agnostic — `plivoAgent.ts`
  exports a `PhoneAgent` = `{ instructions, tools, handleFunction }`. Write another and
  swap the `AGENT` constant in `plivoBridge.ts` (or choose per-number from the answer
  webhook's `To`/`From`).

When adding tools, follow the swaram tool conventions: **enum-constrain closed sets**,
**validate on the server**, **confirm only after `ok:true`**, **call tools silently**, and
for any fixed-length number **count on the server + return an `ok`-only verdict** (never a
target the model can pad to).

## 10. Endpoints & tools reference

| Tool | Args | Returns |
|---|---|---|
| `select_service` | `service` (enum) | `{ available }` — true only for *Product Registration* |
| `save_registration` | any customer/product field(s) | the merged draft + `phoneCheck`/`pincodeCheck`/`dateCheck` verdicts |
| `complete_registration` | the same fields | the finalized record with `ref` (SC-#####), or `{ ok:false, error }` |

| Method | Path | Purpose |
|---|---|---|
| `POST/GET` | `/api/plivo/answer` | returns the `<Stream>` XML for an inbound call |
| `WS` | `/api/plivo/stream` | the phone media WebSocket (handled by the bridge) |
| `POST` | `/api/plivo/status` | Plivo stream lifecycle callbacks (logged) |
| `GET`  | `/api/plivo/health` | bridge reachability probe |
| `GET`  | `/api/subash/config` | services + Kerala districts + today |
| `POST` | `/api/subash/registration` · `/complete` | progressive save · finalize (mints ID) |
| `GET`  | `/api/subash/registrations` | recently completed registrations (the queue) |
| `GET`  | `/api/subash/export.csv` | download all completed registrations as CSV |
| `POST` | `/api/swaram-token` | mint the short-lived browser token |

## 11. Data & privacy

Completed registrations are stored in `server/data/subash-registrations.json` (created
on first run, starts empty, git-ignored). This file — and the CSV export and the
conversation log — contain **customer PII** (names, mobile numbers, addresses). The
on-screen queue shows the **name only** (never the phone), and the phone is **stripped**
from tool results handed back to the model. **Keep the data files, exports and logs
private.** There is no auth — run it on a trusted host.

## 12. Cost

You pay swaram for the voice minutes and **Plivo** for the call + number (e.g. India
inbound is roughly a rupee-ish per minute plus ~₹250/mo number rental; confirm current
rates on Plivo). The `<Stream>` itself isn't separately metered beyond the call minutes.

## 13. Troubleshooting

- **Token 503 / "Could not start voice session"** → `SWARAM_API_KEY` missing/wrong in
  `server/.env`.
- **Call connects but silent / no bridge** → check the server log for `[plivo] stream
  start`; ensure your **Answer URL** points at `https://YOUR_PUBLIC_HOST/api/plivo/answer`
  and the tunnel points at the **single-server port** (`:8090`), and that
  `PLIVO_PUBLIC_HOST` matches.
- **Dashboard doesn't show a phone booking** → **refresh** (the queue loads on page load;
  it doesn't auto-poll). Only *completed* registrations appear.
- **UI not served in single-server mode** → run `npm run build` in `client/` (or
  `./start.sh`); the server serves `client/dist` and logs "serving built UI from client/dist".
- **Mobile/pincode won't save** → they only persist at the exact length (10 / 6 digits);
  the agent asks again and never pads to length.
- **India number won't activate** → your KYC/compliance submission must be approved first
  (§5.2); only India-registered businesses can hold Indian fixed-line numbers.

## 14. Disclaimers

- **Not affiliated with Plivo** (see the top of this file). Plivo is a third-party
  service you contract with directly.
- **Telephony & data compliance are your responsibility** — KYC/DoT/TRAI (India) and the
  equivalent elsewhere, plus lawful handling of the PII you collect. This code is provided
  as-is, without warranty.

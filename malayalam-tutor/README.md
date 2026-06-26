# Malayalam Tutor — learn any document by voice

A complete, **standalone** example app: upload a lesson (PDF or text) and **learn it
by talking to a Malayalam voice tutor** ("Guru"). The document is turned into a
study brief by **Claude on Amazon Bedrock**, then you have a real-time spoken
conversation with a tutor that teaches *only* from that material and can switch
between explaining and quizzing. Every processed lesson is **saved to a library**
you can re-take later.

This is the one demo that needs **two** keys — a swaram.live key (for voice) and an
Amazon Bedrock key (to read the document). The others need only swaram.

```
            upload                Bedrock (background)            voice
┌─────────┐  PDF/text  ┌────────────────┐  study brief  ┌────────────────┐
│ Browser │ ─────────▶ │ Express server │ ────────────▶ │ swaram.live    │
│ mic+UI  │ ◀───────── │  (Bedrock +    │ ◀──poll────── │ realtime voice │
└─────────┘  lesson    │   token mint)  │    ready      └────────────────┘
                       └────────────────┘
```

---

## 1. What you get

- **Upload a `.pdf` or `.txt`** (or paste text). Bedrock extracts a faithful study
  brief: title, a Malayalam summary, key points, and the full cleaned text.
- A **voice tutor** in Malayalam that teaches **only** from that lesson, and will
  **explain** or **quiz** on request.
- A **saved-lesson library**: every processed lesson is kept; re-take it later (with
  the original PDF view) without re-uploading.
- **Background processing**: large documents are processed off the request thread,
  so big PDFs don't time out behind a proxy/tunnel.

## 2. Prerequisites

- **Node.js 18+**
- A **swaram.live API key** (`swaram_…`) — for the realtime voice call.
- An **Amazon Bedrock API key** (a bearer token, `ABSK…`) with access to the Claude
  model — for turning the document into a study brief. Create one in the AWS console
  under **Bedrock → API keys**, and make sure the model
  (`us.anthropic.claude-sonnet-4-6`) is enabled in your region.
- A browser with microphone access.

## 3. Quick start

```bash
cd server
cp .env.example .env     # then edit .env: add SWARAM_API_KEY and AWS_BEARER_TOKEN_BEDROCK
cd ..

(cd server && npm install)
(cd client && npm install)

./dev.sh
```

Open **http://localhost:5173**, upload a short PDF or paste some text, wait for it to
process, then press **Start learning** and talk to Guru.

> Server on `:8090`, app on `:5173`, Vite proxies `/api/*`. Ports are configurable —
> see [§9](#9-running-alongside-other-apps).

## 4. How it works

### Document → study brief (background, on the server)
1. You upload a file (or paste text). `POST /api/ingest` **does not block** — it
   returns a **`jobId`** immediately and processes the document **in the background**.
2. The server sends the document to **Bedrock** (`server/src/bedrock.ts`): a PDF goes
   as a document block, and Claude returns `{ title, summary (Malayalam), keyPoints,
   cleanedText }`. `cleanedText` is the **full, faithful** text — any language, no
   shortening (it even handles scanned PDFs, because the model reads the document
   directly rather than a text-only parser).
3. The browser **polls** `GET /api/ingest/status/:jobId` every few seconds; it shows a
   spinner with an elapsed timer until the job is `done`, then loads the brief.
4. On completion the lesson is **auto-saved** to the library, so even if you close the
   tab mid-processing, the finished lesson appears under **Saved lessons**.

> **Why background + polling?** A dense document can take Bedrock a minute or more to
> read. If that happened inside a single HTTP request it would exceed a reverse-proxy
> / Cloudflare ~100-second limit and fail with a 524. Returning a job id and polling
> keeps every request short, so any size document works — locally or behind a tunnel.

### The voice tutor (reusable voice pipeline)
- **Token minting:** the browser never sees your secret key — it calls
  `POST /api/swaram-token`; the server exchanges `SWARAM_API_KEY` for a short-lived
  `swaram_ek_…` token. (`server/src/routes/swaramToken.ts`)
- The browser opens a WebSocket to swaram with that token and sends the tutor
  **persona + the study brief** as the session instructions.
- Mic is captured, resampled to **24 kHz PCM16** in an AudioWorklet, streamed as
  base64; swaram's audio is played back in order.
- **Half-duplex + interrupt:** while the tutor speaks the mic is held so our stream
  can't cancel its reply; cut in with the **Interrupt** button / **Space** key.
- **Native transcripts:** both sides' transcripts come from swaram directly.

The tutor's instructions are **the persona plus the study brief** — so a saved lesson
re-takes with no second Bedrock call.

## 5. Project layout

```
malayalam-tutor/
├── dev.sh
├── server/
│   ├── .env.example          # SWARAM_API_KEY + AWS_BEARER_TOKEN_BEDROCK
│   └── src/
│       ├── index.ts          # mounts the routes
│       ├── config.ts         # reads .env (swaram + Bedrock)
│       ├── bedrock.ts        # ★ document → study brief (Bedrock Converse)
│       ├── lessons.ts        # ★ saved-lesson store (JSON + PDF files)
│       └── routes/
│           ├── ingest.ts     # ★ background ingest job + status polling
│           ├── lessons.ts    # ★ list / get / pdf / delete saved lessons
│           ├── swaramToken.ts#   reusable: mints the browser token
│           └── log.ts        #   reusable: conversation logging
└── client/
    └── src/
        ├── pages/Tutor.tsx   # ★ the whole flow: upload → poll → learn (voice)
        ├── components/
        │   ├── UploadDropzone.tsx # ★ file/text upload
        │   ├── LessonPane.tsx     # ★ left pane: PDF/text + AI summary
        │   ├── PdfViewer.tsx      # ★ react-pdf viewer
        │   └── ConversationPane.tsx #  reusable: transcript + controls
        ├── lib/
        │   ├── api.ts            # ★ ingest + poll status + token
        │   ├── lessonsApi.ts     # ★ saved-lesson fetch helpers
        │   └── swaramClient.ts   #   reusable: swaram WebSocket client
        ├── audio/                #   reusable: mic capture + playback
        └── index.css             #   theme
```

★ = tutor-specific. Everything else is the reusable voice kit (identical across the
swaram demos).

## 6. How to customize

### 6.1 Change the tutor's persona, language, or behavior
Edit `buildInstructions(brief)` in `client/src/pages/Tutor.tsx`. It composes the
persona ("Guru", teach only from the material, explain or quiz, short natural
Malayalam) with the brief (title + summary + key points + full text). Rewrite the
persona lines to change tone or rules; the brief is appended automatically.

### 6.2 Change the voice
The picker offers `mal-female` / `mal-male` (the only two swaram voices); the default is
`useState<Voice>("mal-female")` in `Tutor.tsx`. The tutor's **name follows the chosen
voice** — **"Gita"** (female) / **"Govind"** (male) — passed into `buildInstructions`,
so the spoken self-intro matches the voice.

### 6.3 Change how the document is understood (the Bedrock step)
Everything about extraction is in `server/src/bedrock.ts`:
- **The prompt** that asks for `title` / `summary` / `keyPoints` / `cleanedText` —
  edit it to change what's extracted or the summary language.
- **`inferenceConfig: { maxTokens: 64000, temperature: 0 }`** — raise/lower the output
  budget. (Large PDFs echo a lot of text into `cleanedText`, so keep this generous.)
- **The model**: change `BEDROCK_MODEL_ID` in `.env` (and ensure it's enabled in your
  AWS region).

### 6.4 Tune the background-job behavior
`server/src/routes/ingest.ts` holds the job map, the status endpoint, and a 1-hour
sweep of finished jobs. The client poll interval (default 3s) and the processing
copy are in `onSubmit` in `Tutor.tsx`.

### 6.5 Accepted file types / size
`server/src/routes/ingest.ts` uses `multer` with a 10 MB limit and treats `.pdf` as a
Bedrock document block, anything else as UTF-8 text. Adjust the limit or the
type handling there.

## 7. API

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/ingest` | start processing; returns `{ jobId }` immediately |
| `GET`  | `/api/ingest/status/:jobId` | `processing` / `done` (+ lesson) / `error` |
| `GET`  | `/api/lessons` | list saved lessons (metadata) |
| `GET`  | `/api/lessons/:id` | full lesson (to re-take) |
| `GET`  | `/api/lessons/:id/pdf` | original PDF bytes |
| `DELETE` | `/api/lessons/:id` | delete a lesson (+ its PDF) |
| `POST` | `/api/swaram-token` | mint the short-lived browser token |
| `POST` | `/api/log` · `GET /api/logs?session=` | conversation logging |

## 8. Data & persistence

Lessons are stored in `server/data/lessons.json`, original PDFs in
`server/data/lessons/<id>.pdf` (both git-ignored, created on first run). Delete them
to reset. Conversation events are appended to `server/data/conversations.jsonl` — it
contains whatever was said; keep it private. There is no database and no auth (demo,
not production).

## 9. Running alongside other apps

Ports are env-configurable so this can run next to the other swaram demos:
- Server: `PORT` in `server/.env`.
- Client: `CLIENT_PORT` (Vite) and `API_PORT` (the server it proxies to) — e.g.
  `CLIENT_PORT=5174 API_PORT=8091 npm run dev` in `client/`. Defaults are 5173 / 8090.

## 10. Exposing it publicly

For mic access on phones, serve over HTTPS — e.g. `cloudflared tunnel --url
http://localhost:5173`, then add the tunnel hostname to `allowedHosts` in
`client/vite.config.ts`. Thanks to the **background ingest** (§4), even large PDFs
process fine through a tunnel. **Anyone with the URL can spend your swaram + Bedrock
credits — take the tunnel down when done.**

## 11. Building your own app from this template

- The **voice pipeline** (`swaramClient.ts`, `audio/`, `ConversationPane.tsx`,
  `routes/swaramToken.ts`, `routes/log.ts`, `config.ts`) is reusable unchanged for any
  voice agent.
- The **Bedrock ingest** (`bedrock.ts` + the background-job `ingest.ts`) is a reusable
  recipe for "upload a document → understand it → use it" — swap the prompt for your
  use case.
- If your agent needs **function calling** (booking, lookups, form-filling), see the
  other apps in this repo (clinic, car-service, test-drive, appliance-support) and
  the **"MANDATORY conventions when adding tools"** section in their READMEs — keep
  tool params enum-constrained, validate on the server, and confirm only after the
  tool returns success.

## 12. Troubleshooting

- **"Bedrock access denied" / ingest error** → your `AWS_BEARER_TOKEN_BEDROCK` is
  missing/invalid, or the model isn't enabled in `AWS_REGION`. The server logs a
  warning on start if the token is unset.
- **Token 503 / "Could not start the voice session"** → `SWARAM_API_KEY` missing.
- **Upload seems stuck** → big documents take a minute or two; the spinner shows an
  elapsed timer. It keeps processing even if you navigate away, and the finished
  lesson appears under **Saved lessons**.
- **No sound / mic** → allow mic permission; use headphones to avoid echo.
- **Port already in use** → set `PORT` / `CLIENT_PORT` / `API_PORT` (see §9).

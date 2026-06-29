# swaram-apps

**Voice applications built using [swaram.live](https://swaram.live)** — the real-time
**Malayalam** voice API.

Each folder is a complete, **self-contained full-stack app** (a React client + an
Express server) that you can run with just a swaram API key, then fork as a template
for your own Malayalam voice agent.

| App | What it does | Needs |
|---|---|---|
| **[clinic-appointments](./clinic-appointments)** | Voice receptionist books & cancels doctor appointments (function calling + a live schedule board, name+phone identity check on cancel, editable per-doctor hours) | swaram key |
| **[car-service](./car-service)** | Voice advisor books car-service slots (model, centre, work notes; editable centres/hours/models) | swaram key |
| **[test-drive](./test-drive)** | Sales advisor qualifies a lead field-by-field and books a test drive (live lead card + a booked-drives board; editable dealerships/hours/models/enrich) | swaram key |
| **[appliance-support](./appliance-support)** | Care agent logs / edits / cancels a TV·fridge·AC·washing-machine repair ticket | swaram key |
| **[malayalam-tutor](./malayalam-tutor)** | Upload a document, then learn it by talking to a voice tutor | swaram key **+ AWS Bedrock key** |

Every app has its **own detailed README** with setup, how it works, and how to
customize it (add doctors / slots / centres / tools, change the persona, …).

## What is swaram?

[swaram.live](https://swaram.live) is a real-time **Malayalam voice** API — speak to
it and hear natural Malayalam speech back (an OpenAI-Realtime-compatible, speech-to-
speech model). In these apps the browser talks to swaram **directly** over a
WebSocket, using a **short-lived token** minted by each app's server, so your secret
API key never reaches the client.

## API documentation

These apps are built on the **swaram real-time voice API**. For the full reference —
the WebSocket event protocol, models, voices, function calling, and audio format — see
the official docs:

- **[github.com/pattern-ai-labs/swaram](https://github.com/pattern-ai-labs/swaram)** — developer documentation
- **[swaram.live/docs](https://swaram.live/docs)** — hosted docs

## Run any app

```bash
cd clinic-appointments               # or any app folder
cp server/.env.example server/.env   # then add your SWARAM_API_KEY
(cd server && npm install)
(cd client && npm install)
./dev.sh                             # API → :8090, app → :5173
```

Open **http://localhost:5173** and press **Start call**. (The tutor also needs an
Amazon Bedrock key — see its README.) Ports are env-configurable (`CLIENT_PORT` /
`API_PORT`) so you can run several apps at once.

## What's shared

Every app carries its **own copy** of the same reusable **voice kit**, so each folder
is independent:

- **Client** — `lib/swaramClient.ts` (swaram WebSocket), `lib/useVoiceSession.ts` (the
  mic → swaram → playback pipeline, half-duplex with explicit interrupt, native
  transcripts), `audio/` (24 kHz PCM16 capture + ordered playback),
  `components/ConversationPane.tsx`.
- **Server** — `routes/swaramToken.ts` (mints the short-lived browser token),
  `routes/log.ts` (conversation logging), `config.ts`.

The per-app code is small: a domain file + a route on the server, and a page + a
board/card + an API helper on the client. **To build a new agent: swap the domain,
keep the pipeline.**

## Function calling — the rule that matters

Four of these apps use swaram **function calling** (the tutor uses Amazon Bedrock to
read documents instead). When you add or change a tool, **constrain every closed-set
parameter with a JSON-Schema `enum` built from live config** (doctors, dates, slots,
centres, models, …), **validate again on the server**, and have the agent **confirm
success only after the tool returns `ok: true`**. Each app's README documents the full
conventions — this is what makes the voice agent reliable.

## Tech

React + Vite + TypeScript (client) · Node + Express + TypeScript (server) · swaram.live
realtime voice · Amazon Bedrock (tutor only).

## Releases

Current: **v1.0.6**. See **[CHANGELOG.md](./CHANGELOG.md)** for what's
in each version, and the [Releases](https://github.com/pattern-ai-labs/swaram-apps/releases)
page for tagged downloads.

## License

[MIT](./LICENSE) © Pattern AI Labs. These are example/starter apps — build freely on them.

# Changelog

All notable changes to **swaram-apps** are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and this project adheres to
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed
- **test-drive** — the sales advisor now **persists late lead changes** via `save_lead`.
  Whenever the customer changes or corrects any detail (budget, model, fuel, timeline,
  name, …) — **even after the test drive is booked** — the agent re-saves it, and never
  claims a detail is updated until the tool returns `ok: true` (no phantom "I've changed
  it" without a real tool call).

## [1.0.0] — 2026-06-26

**Initial release** — five self-contained, runnable Malayalam voice apps built on
[swaram.live](https://swaram.live). Each is its own full-stack project (React + Vite
client, Node + Express server) that runs with just a swaram API key (the tutor also
uses Amazon Bedrock).

### Apps
- **clinic-appointments** — voice receptionist books **and cancels** doctor
  appointments over a live schedule board.
- **car-service** — voice advisor books Maruti service slots (model, centre, work notes).
- **test-drive** — sales advisor qualifies a lead field-by-field and books a test drive,
  with a live lead card.
- **appliance-support** — care agent **logs / edits / cancels** TV · fridge · AC ·
  washing-machine repair tickets.
- **malayalam-tutor** — upload a document, then learn it by talking to a voice tutor
  (Amazon Bedrock turns the document into a study brief).

### Highlights
- **Real-time Malayalam voice** via swaram.live; the browser connects directly using a
  **short-lived token** minted server-side, so your secret key never reaches the client.
- **Reliable function calling** — every closed-set tool parameter is `enum`-constrained
  from live config, validated again on the server, and success is confirmed only after
  the tool returns `ok: true`.
- **Male or female voice**, with the agent's **persona name matching the chosen voice**.
- **Privacy by design** — list tools return **occupancy only** (no names or phone
  numbers), and cancel/modify is gated by an identity check that is **strict on phone,
  lenient on name** (so Malayalam speech-to-text spelling variance doesn't lock out the
  real owner), plus an absolute no-disclosure rule in every persona.
- **Mobile-friendly** — the conversation switches to page-scroll on phones so chat
  bubbles never overlap; **Space** interrupts the agent while it's speaking.
- Each app carries its own copy of the reusable **voice kit** — to build a new agent,
  swap the domain and keep the pipeline.

[1.0.0]: https://github.com/pattern-ai-labs/swaram-apps/releases/tag/v1.0.0

# Changelog

All notable changes to **swaram-apps** are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and this project adheres to
[Semantic Versioning](https://semver.org/).

## [1.1.0] — 2026-07-08

### Added
- **subash-plivo-phone** — a new app: **product registration by phone _and_ browser**. It
  adds a **Plivo ⇄ swaram telephony bridge**, so customers can **call a phone number** and
  talk to the Malayalam voice agent — μ-law 8 kHz ⇄ PCM16 24 kHz transcoding, barge-in
  (flush on interrupt), and function calling — alongside the existing browser channel. Both
  channels share one registration store, and a **single server** hosts the dashboard **and**
  the bridge on one port. Ships an in-depth README covering Plivo account setup, buying and
  wiring a number, and India KYC (with links to Plivo's own docs). *Not affiliated with Plivo.*

## [1.0.6] — 2026-06-27

### Changed
- **malayalam-tutor** — raised the document **upload limit from 10 MB to 25 MB**. Real
  lesson PDFs (textbook chapters) routinely exceed 10 MB and were being rejected at
  upload. Note the real processing limit is the document's **page/token count, not its
  megabytes** — a PDF is sent to Bedrock as a document block.

## [1.0.5] — 2026-06-26

### Fixed
- **All apps** — the agent's chat bubble could render **full-height** (stretched down the
  whole conversation pane) instead of hugging its text. Cause: the bubble's role class
  `tutor` collided with the app-shell `.tutor { height: 100% }` rule. Bubble role classes
  are now namespaced (`msg-tutor` / `msg-learner`).
- **All apps** — reworked the **mobile conversation layout**: the pane is now a CSS grid
  (header / scrolling log / pinned footer), panes stack and use `dvh` units (which track
  the mobile address bar, unlike `vh`), each scrolls internally, and the mic/Interrupt
  footer stays pinned — fixing the empty-box and bubble/footer overlap some phones showed
  after a few messages. Added safe-area padding for notch phones.

### Changed
- **All apps** — the speaking indicator now reads "agent speaking…" (was "tutor
  speaking…"), and the transcript only auto-scrolls when you're already near the bottom.

## [1.0.4] — 2026-06-26

### Added
- **car-service** and **test-drive** — **editable config without code** (matching the
  clinic in v1.0.2). The service centres / dealerships, working hours + days + booking
  window, the car model line-up, and — for test-drive — the enrichment value sets
  (budget / fuel / transmission / timeline) now live in an operator-editable
  `server/data/<demo>-config.json`, seeded from defaults on first run (edit + restart to
  apply). Each app ships a committed `*-config.example.json`, and the README documents
  it. The board, day strip, slots, on-screen labels, tool enums, lead-card pills, and the
  agent's spoken brand/hours/days all adapt to the config. (Tip: add a finer band like
  `"Under ₹5 lakh"` to test-drive's `enrich.budget`.)

## [1.0.3] — 2026-06-26

### Changed
- **car-service** and **test-drive** — the on-screen booking boards no longer reveal the
  customer's **phone number** on hover (matching the clinic board). The tooltip now shows
  the model and name only (car-service also keeps the work note); the voice agent's view
  was already occupancy-only.

## [1.0.2] — 2026-06-26

### Added
- **clinic-appointments** — **per-doctor availability, editable without code.** Each
  doctor now has their **own working days and hours**, read from an operator-editable
  `server/data/clinic-config.json` (seeded from defaults on first run; edit + restart to
  change). A committed `server/clinic-config.example.json` shows the shape, and the
  README documents it. The schedule board renders each doctor's own slots and marks
  "Closed this day" on their off-days; availability and booking validate against *that*
  doctor's days and hours; the agent prompt lists each doctor's schedule and always
  checks availability for the chosen doctor and day.

### Changed
- **clinic-appointments** — the schedule board's hover tooltip now shows the patient's
  **name only** (the phone number is no longer revealed on hover).

## [1.0.1] — 2026-06-26

### Added
- **test-drive** — a **booked-test-drives board** on the idle left pane: a day strip plus
  a dealership × time-slot grid (booked slots show `model · first name`, full details on
  hover), mirroring the car-service centre board. The pane swaps to the live lead card
  during a call, and the board refreshes after each booking. It is **screen-only** — there
  is no `list_bookings` voice tool, so no customer details reach the agent.

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

[1.0.6]: https://github.com/pattern-ai-labs/swaram-apps/releases/tag/v1.0.6
[1.0.5]: https://github.com/pattern-ai-labs/swaram-apps/releases/tag/v1.0.5
[1.0.4]: https://github.com/pattern-ai-labs/swaram-apps/releases/tag/v1.0.4
[1.0.3]: https://github.com/pattern-ai-labs/swaram-apps/releases/tag/v1.0.3
[1.0.2]: https://github.com/pattern-ai-labs/swaram-apps/releases/tag/v1.0.2
[1.0.1]: https://github.com/pattern-ai-labs/swaram-apps/releases/tag/v1.0.1
[1.0.0]: https://github.com/pattern-ai-labs/swaram-apps/releases/tag/v1.0.0

# Verification

What the automated checks cover, how to run them, and what has not been verified. Hive is an alpha: this lists coverage and its limits, and does not claim that every planned capability is complete.

## Automated checks

- **`pnpm test`** runs 553 tests across the API, task engine, OpenCode integration, tools, integrations, conversation queue, browser address handling, domain, and date handling.
- **`pnpm test:browser`** runs the real Chromium lifecycle test: public page navigation and read, failed profile cleanup, reopening the same session, text truncation, and localStorage and profile persistence after a restart.
- **The platform exports** build the web, iOS Hermes and Android Hermes bundles. They do not produce signed native binaries.
- **CI** (`.github/workflows/ci.yml`) runs lint, types, the tests, the server build, the three exports, the Chromium lifecycle test and a browser-container suite, on Node 22.

## The agent under test

Hive's agent is OpenCode. Chat and tasks are tested through Hive's own AG-UI shim, event bus and tool bridge, with two stand-ins for `opencode serve`:

- an in-process stand-in (`tests/helpers/opencode.ts`, used through `tests/helpers/shim.ts`) that plays the agent's side of a conversation, and
- a fake OpenCode HTTP server (`tests/helpers/fake-opencode.ts`) that speaks the protocol Hive's SDK client uses: health and version, sessions, prompts, the global event stream and tool registration. Its agent calls Hive's tools over HTTP, as OpenCode does.

A real `opencode serve` was also run without a model, to check the protocol these imitate: health and version, sessions, the event stream, tool registration, and the shape of errors and tool events. No check has run a model, so nothing here shows how a real model uses Hive's tools.

## Coverage

| Area | Evidence | Boundary |
| --- | --- | --- |
| Chat and the agent | The mention gate (a standalone `@hive` in the latest message summons the agent, and so does a pick on a choice card), the transcript and files the agent is given, streamed text and tool calls as AG-UI events (including a tool call as OpenCode 1.18.33 sends it), tool results as the client sees them, permission requests shown in the thread, stopping a reply, session reuse and rebinding, a provider or session failure reaching the chat with its reason, and a boot that stops when `opencode serve` is unreachable or a different major version. Permission rules and modes are stored per channel and thread. | No model has run: permission prompts, file tools and choice cards with real inference are unverified. |
| Hive's tools | The tool bridge offers only the current run's tools and fails closed. Mail search and reading, browser reads and task creation run through it and come back as tool events; a page that cannot be opened and disconnected mail are reported as they are; a stopped reply cannot open pages. | Tools are called by tests, not by a model. |
| Durable work | Real PGlite restart, two-worker lease races, expired-lease recovery, cancellation, pause/resume, missing inputs, approval fairness, and saved outcomes are tested. | The server host must remain running. PGlite cannot be shared across processes; use PostgreSQL for a separate worker. |
| Tasks, review and brief | Tasks run as OpenCode sessions: the first prompt carries the task, the team's notes and the staged files; a completion or blocked marker, a run that ends without one (handed in as unconfirmed), a question that waits for an answer, and a session failure recorded with its reason are tested. So are the review gate (agent runs end In Review; neither the agent's tools nor a `PATCH` can mark a task done; only accepting can), notes (stored in the same statement that sends a task back, authorship, limits, concurrent adds), files (type checked by content, size and count limits, signed downloads, PDFs also kept in Files, cleanup on delete), the brief an agent is given, and live notes against a stand-in OpenCode session (same session, model and tools; an idle report right after an update is confirmed; a follow-up when notes arrive as the agent finishes; a failed send leaves the note unread). | Live notes have not run against a real `opencode serve`: how OpenCode queues a message sent to a busy session is taken from its API, not observed. File upload from native iOS and Android is untested. |
| Channel files | Path safety (traversal, absolute, encoded and control-character paths; hidden and internal folders in any case; symlinks to files, folders, other channels and Hive's own folders refused for reading, listing, writing and uploading, each guard checked by breaking it and watching a test fail), the listing and recent views, uploads (name cleaning, collisions, limits, archived channels), link scopes (a file's link opens only that file, a web page's its folder, nothing across channels or after expiry or tampering), response headers for each kind of file, `Range` and `?head`, the null-origin rule for sandboxed pages, both agent tools directly and through the OpenCode tool bridge, and upload requests (folder precedence, one-file requests, the file limit, private orchestrator). | Not run on iOS or Android: the native web view, PDF view, system-player hand-off and multipart upload are typechecked only. Video is tested for headers and ranges with a stand-in body, not played; audio controls are not played. The agent tools are called by tests, not by a model. |
| Choice cards | `present_choices` is offered, and explained to the agent, only when `JEV_MODE` is on. Panels (clarification and sourced comparison) are validated and ranked; a panel reaches the chat whole; a pick summons the agent without a mention and arrives as words, and one that does not check out is an error; anything said afterwards, or a failed or cancelled turn, retires earlier cards; a team thread's cards belong to the team and an orchestrator chat's to its owner; panels survive a restart and reject owner, thread, option, version and replay conflicts. In live mode a comparison needs pages the agent read in the same run, and the live adapter and TypeSafe client are tested without calling TypeSafe (request shape, pinned model, one retry on a server error, none on an authentication failure, cancellation, malformed answers). | No test has called TypeSafe with a real key, and no model has chosen to use the cards. |
| Shared workspace | Threads and the agent's replies, tasks, boards, projects, reviews and receipts, drafts, files, browser sessions, memory and the agent's personality are one record for everyone who signs in, and anyone can approve a review. Each person's orchestrator chat and its threads are private. Team channels live under the `shared` owner on disk and orchestrators under their person. A test fails when a kind of record is added without being placed. | There are no roles: any member can do anything (see the [roadmap](../ROADMAP.md)). |
| Sign-in and Google | Sessions are validated and logout revokes only the current token; OAuth callbacks need a known, single-use state and are invalidated by a newer connect or a disconnect; the workspace has one Google connection (more access is fine, another account is not); a token refresh is shared by everyone who needs it; credentials are encrypted with a fresh nonce per secret; signed link tokens name who and what they are good for and cannot be altered or moved. Real adapter code with controlled HTTP fixtures covers complete MIME/threads/attachments, CRLF sends, calendar discovery, event CRUD, ETags, time zones, DST gaps, and unsupported recurrence. | No live Google credentials are used. A real-account acceptance run remains required. Hive keeps no member list: whoever the Google OAuth client lets through is a member. |
| Document job | Background import → field input → new PDF → action review → sample sent receipt is tested without a client. | Supported AcroForms only. OCR/scanned forms and some field types are not supported. |
| Reviews | Ownership/hash/version binding, expiry, account changes, disconnects, concurrent decisions, uncertain writes, and cancellation are tested. | An already dispatched provider request may finish after cancellation. |
| Browser | Ownership, authorization, URL/DNS/egress checks, failed downloads, and recovery have automated coverage, and the real Chromium lifecycle test covers navigation, profile cleanup and reopening, truncation, and persistence after a restart. | A separate Chromium worker; no automatic booking or payment, and no isolation from hostile tenants. |
| Ideas | Evidence/accept/edit/dismiss and acceptance races are tested. Completed document suggestions are retired and sent replies excluded, while unfinished incoming requests are kept. | Rules-based suggestions; broader model-derived personalization remains future work. |
| Goals / Tracking | Milestone validation, goal/task pausing, sample observation baseline/change/deduplication, failure backoff, and automatic pause are tested. | Device push and adaptive long-term planning are not implemented. |
| Finance | CSV parsing, exact cents, invalid/ambiguous input, and persisted artifacts are tested. | Imported CSV only; no bank connection. |
| Agent personality and memory | Edit, persist, and forget paths are tested through the authenticated API. | One record for the whole team; any member can change it. |
| Rich Threads | Tests through the real CopilotKit runtime cover authenticated owner scoping, main-thread provisioning/recovery, pagination, rename, archive, rich tool history, provider failures, and server-only key handling; the app also starts and keeps threads on disk without a key. A real CopilotKit Core failure verifies that queued messages pause when the SDK emits an error but resolves its promise. | Intelligence boundary is mocked in tests. Live WebSocket persistence/replay and cross-device acceptance need a project key. |
| OpenBot | Disabled adapter has protocol and identity contract tests against a pinned public revision, including computer gateway, takeover, refusal, and uncertain outcomes. | No live identity, routine, or computer backend bridge yet. |
| Native / web UI | The UI's logic is covered by node tests (the follow-up queue, browser address handling, dates and times, file formatting, thread ids and replies, choice-card actions, assistant Markdown, tool results, the agent's steps in a thread, the thread panel's width, the theme with the contrast of text on glass, the backdrop's dither against an exact gradient, and fonts), and the web, iOS and Android bundles export. | The UI is not driven by an automated browser test, and no native binary is built or run. A sheet's blur is a web feature; native draws slightly more opaque fills. The web backdrop's smoothness is measured on Chromium screenshots (the contour of the image against the exact gradient's) and has not been seen in Safari or on a wide-gamut display. The iOS look a build can opt in to (the haze gradient and Liquid Glass bars) exports in the iOS bundle and its gradient string parses with React Native's own parser, but it has not been seen on a device or in a simulator. Android is not installed on a device or emulator. |

## Not covered

Real inference, live Google accounts, a real TypeSafe call, Intelligence persistence and replay, health, bank, social, and WhatsApp connectors, a managed generated-tool registry, voice and media generation, automatic purchases and reservations, mobile push, roles and invites, and full desktop VM isolation. See the [roadmap](../ROADMAP.md).

## Reproduce

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm --dir apps/worker typecheck
pnpm test
pnpm build:server
pnpm --dir apps/mobile exec expo export --platform all --output-dir dist/release
pnpm --dir apps/worker exec playwright install chromium
pnpm test:browser
# Separate browser-container suite; needs a responsive Docker daemon:
pnpm --dir apps/worker test:docker
```

The [demo guide](DEMO.md) describes the native walkthrough. The CI workflow defines these validation categories for a fresh Linux environment. No check sends real mail, makes a purchase, or connects a private Google account.

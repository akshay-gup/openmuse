# Changelog

## Unreleased

- The web interface now follows the web app's design: Poppins (self-hosted, web only), the navy and teal brand colours with a darker teal for links so they stay readable, amber dashed "create" tiles, 20 and 25px card corners, and a teal-to-green gradient border on selected cards. The finance summary card is navy and blue instead of purple. iOS and Android keep the system font for now.
- Everything except the orchestrator chat is shared by everyone who signs in: a teammate now sees a thread's messages and the agent's replies, the whole team's tasks, boards and reviews, and the files, drafts, browser sessions, memory, personality, ideas and notifications. The workspace has one Google connection: another account can only be connected after the connected one is disconnected, and anyone can approve a review that runs on it. Breaking: records earlier builds kept per person (tasks, threads, files, Google connections) are not migrated; start from an empty data directory.

## 0.1.0-alpha — 2026-09-15

Initial public Hive alpha.

- Native/web interface using CopilotKit React Native and AG-UI.
- Persistent browser computer, inline PDFs, structured artifacts, and optional Rich Threads integration.
- Durable delegated tasks, reviews/receipts, Ideas, Goals, Tracking, and editable memory.
- Google adapters, supported PDF workflows, and CSV spending summaries.
- Disabled, contract-tested OpenBot adapter for future backend integration.
- Native walkthrough recording, contributor docs, and CI for tests, builds, and real Chromium.
- Fixed Ideas suggesting sent replies or already completed matching work; restored task delegation in the persistent menu.

See [verification](docs/VERIFICATION.md) for actual coverage and [roadmap](ROADMAP.md) for incomplete integrations.

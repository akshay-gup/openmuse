# Changelog

## Unreleased

- Agent work now waits for you. When the agent says it has finished, the task moves to **In Review** and you mark it done or send it back with changes; it never closes a task itself (its `update_task` tool can no longer set a task to done, and a run that stops without saying it is finished is handed in for review too). Documents, watches and spending summaries still finish themselves. New status `in_review`, shown as "In review" and counted under "Needs you".
- Tasks have notes and files. Add notes (kept in order, with who wrote each) and files (PDF, images, text, Markdown, CSV, JSON; up to 10 MB each) to any task or issue; every agent run reads all of them, and a note added while an OpenCode run is working is sent into that session. Answering a question is now a note too, so answers add up rather than overwrite each other. Issues have an editable description, and handing an issue to the agent is a step where you add notes and files and choose whether it gets the channel discussion.
- Breaking for API users: agent runs now end in `in_review` rather than `succeeded` (and a run that stops without a marker is `in_review` with `state.unconfirmed`, not `waiting_input`); `POST /api/agent/tasks/:id/accept`, `…/notes` and `…/attachments` are new; a task's `prompt` is no longer rewritten when it is assigned to the agent (the channel discussion is kept in `input.discussion`); an answer is a note, and `state.answer` is no longer written.
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

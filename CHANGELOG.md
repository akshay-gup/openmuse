# Changelog

## Unreleased

- You can now see what the agent makes. Every channel (and the orchestrator chat) has a **Files** button: a *Recent* list of the latest changes in its workspace and a folder browser, with previews for images, PDFs, video and audio, Markdown, spreadsheets, JSON, code and web pages (which run in a sandbox, with the styles and scripts beside them), plus Open, Download, Copy path and Upload. Hive's own folders, hidden files and `node_modules` are not shown, and links in a workspace are never followed.
- The agent can share any file in the chat with the new `send_file` tool, which appears as a card that fits the file (an image in place, audio and video with controls, an excerpt of text, a web page you can preview live), and ask a person for files with `request_upload`: an Upload button and modal, files saved where the agent asked and a message back to the agent that names each one. A task that is waiting on an answer now has an **Attach a file** button, and `ask_user` says the person can attach files. In sample mode, ask the agent to make a report or to upload something to see both.
- New API: `GET /api/agent/channels/:id/files` (a folder, or `?recent=1`), `…/files/info?path=`, `POST …/files` (multipart `file`, optional `dir` or `request`), `GET …/uploads/:requestId`, and `GET …/view/<token>/<path>` for a file's bytes (no sign-in; the token in the path is the credential, expires in 15 minutes, and covers the file, or for a web page its folder). File links answer requests from any origin, and nothing else does. New shared record kind `upload-requests`; new `Auth.signToken`/`verifyToken`.
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

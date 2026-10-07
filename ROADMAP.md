# Hive roadmap (`collab` branch)

Direction: a self-contained, agent-native team chat. One box, one process serving
API + web UI, OpenCode as the agent backend, threads as durable agent sessions, and
one workspace shared by the team, so what the agent is given once is there for everyone.

## Shipped

- **Self-contained VM deployment** — the Hono API serves the Expo web export
  same-origin (SPA fallback, `WEB_DIR` override); channel/thread storage moved
  from the Docker computer to local disk (`DATA_DIR/channels/<id>/threads/<id>.json`,
  a layout that doubles as future OpenCode working directories); Docker computer,
  terminal, and computer routes/docs/tests fully removed. See `docs/vm-deploy.md`.
  `render.yaml` left as-is.
- **OpenCode agent** — one `opencode serve`
  process (a systemd unit on the VM; the API connects, healthchecks, and
  version-asserts, never spawns it); per-channel scoping via directory header;
  a single global SSE stream with per-thread filtering and serialized queues;
  busy/idle derived from status events only; an in-process AG-UI shim
  (`POST /api/agent/opencode/run`) so the mobile/web client is untouched;
  thread→session bindings persisted before the first prompt; single `MODEL` env.
  It is the only agent: the in-process model agent, the scripted sample agent
  and the external AG-UI agent are removed, and boot fails without OpenCode.
- **Permissions** — default `ask`; `permission.asked` tracked per thread and
  surfaced as approve/deny in the thread UI; per-channel/per-thread rules stored
  under `DATA_DIR` and applied as session permission overrides (directory-level
  allows stay in server config); pending requests rejected on teardown.
- **Shared workspace** — everything belongs to the team except each person's
  orchestrator chat: channels, threads and their messages, tasks and the work the
  orchestrator creates, reviews, files, drafts, browser sessions, the agent's memory
  and settings, and the one Google connection. `SHARED_KINDS` in
  `apps/server/src/db.ts` lists the record kinds, and a test fails if a kind is added
  without placing it. Everyone who signs in has the same access (see Roles below).
- **Choice cards** — `present_choices` (Jev, off unless `JEV_MODE` is set) is one of the
  Hive tools OpenCode is offered. Cards are kept with the conversation they were asked
  in: a team thread's belong to the team, an orchestrator chat's to its owner.
- **Task worker on OpenCode** — delegated tasks run as OpenCode sessions in
  auto-mode (default-ask would stall unattended runs); `TASK_COMPLETE:` /
  `TASK_BLOCKED:` markers parsed from final text; background permission requests
  surface in the originating thread.
- **Review before done** — agent work (the `TASK_COMPLETE:` marker or the
  `finish_task` tool) goes to an `in_review` state; only a person
  marks it done (`POST /tasks/:id/accept`) or sends it back with a note. The
  agent's `update_task` cannot set `succeeded`.
- **Task notes and files** — append-only notes and attached files (PDF, images,
  text) on every task, read by every run; notes added to a running OpenCode task
  are sent into its session by a watcher that polls the task row, so it works
  across the API/worker process split.
- **Channel files** — a Files browser per channel over its workspace (recent
  changes and folders, previews by kind, upload), served by 15-minute links that
  keep their scope in the path (a web page's covers its folder) with a sandbox
  policy and `Range` support; paths never leave the workspace (links are not
  followed). The agent's `send_file` shares a file as a card and `request_upload`
  asks for files with an upload button and modal (the call returns at once; the
  upload is recorded against the request and a message back names each file).
- **Channel/thread engine** — channels as worker scopes, threads as sessions,
  user-driven rename (display metadata only; ID-based paths stable), new channels
  start with zero threads.

## Next

- [ ] Channel files: delete and rename from the browser; drag and drop into the
      upload modal; Markdown that links to images beside it (the previewer does
      not resolve relative links yet); a player for video and audio on iOS and
      Android (they open in the system player); checking `send_file` and
      `request_upload` against a real `opencode serve` agent.

- [ ] Verifying live notes against a real `opencode serve` — the stand-in
      session in the tests checks our side of the conversation, not OpenCode's
      queueing.

- [ ] Live VM verification: end-to-end task loop with real inference (needs
      provider keys on the VM); `opencode serve` systemd unit definition.
- [ ] Shared-computer arbitration between channel workers on the one box
      (today workers share the filesystem with no scoping).
- [ ] Orchestrator queue and new-tab routing for delegated tasks; delegated
      status (queued/working/done) visible in the originating channel.
- [ ] **Roles.** There are none yet, so everyone who can sign in can do everything: connect or
      disconnect the workspace's Google account, approve or decline what is sent from it, mark
      tasks done, change the agent's name, tone and memories, set permission rules, and archive
      channels. Hive keeps no member list either: whoever your Google OAuth client lets through
      is a member, and nobody can be removed from inside Hive.
      - [ ] An owner (or admin) and members, and which actions are owner-only.
      - [ ] Invites: owner-only or any member? Today Google's consent screen is the only gate.
      - [ ] Removing a member, and ending their sessions.
- [ ] Browser access (deferred).
- [ ] Native mobile against the same API.

## Non-goals for now

- Personal OAuth integrations (e.g. Gmail) for workers.
- Horizontal service splitting — the single box serves a small collaborator group.

Each item needs its own capability boundaries, failure behavior, and end-to-end
evidence before it becomes a supported feature. No dates are promised.

# OpenMuse roadmap (`collab` branch)

Direction: a self-contained, agent-native team chat. One box, one process serving
API + web UI, OpenCode as the agent backend, threads as durable agent sessions.

## Shipped

- **Self-contained VM deployment** — the Hono API serves the Expo web export
  same-origin (SPA fallback, `WEB_DIR` override); channel/thread storage moved
  from the Docker computer to local disk (`DATA_DIR/channels/<id>/threads/<id>.json`,
  a layout that doubles as future OpenCode working directories); Docker computer,
  terminal, and computer routes/docs/tests fully removed. See `docs/vm-deploy.md`.
  `render.yaml` left as-is.
- **OpenCode agent backend** (`AGENT_BACKEND=opencode`) — one `opencode serve`
  process (a systemd unit on the VM; the API connects, healthchecks, and
  version-asserts, never spawns it); per-channel scoping via directory header;
  a single global SSE stream with per-thread filtering and serialized queues;
  busy/idle derived from status events only; an in-process AG-UI shim
  (`POST /api/agent/opencode/run`) so the mobile/web client is untouched;
  thread→session bindings persisted before the first prompt; single `MODEL` env.
- **Permissions** — default `ask`; `permission.asked` tracked per thread and
  surfaced as approve/deny in the thread UI; per-channel/per-thread rules stored
  under `DATA_DIR` and applied as session permission overrides (directory-level
  allows stay in server config); pending requests rejected on teardown.
- **Task worker on OpenCode** — delegated tasks run as OpenCode sessions in
  auto-mode (default-ask would stall unattended runs); `TASK_COMPLETE:` /
  `TASK_BLOCKED:` markers parsed from final text; background permission requests
  surface in the originating thread.
- **Channel/thread engine** — channels as worker scopes, threads as sessions,
  user-driven rename (display metadata only; ID-based paths stable), new channels
  start with zero threads.

## Next

- [ ] Live VM verification: end-to-end task loop with real inference (needs
      provider keys on the VM); `opencode serve` systemd unit definition.
- [ ] Shared-computer arbitration between channel workers on the one box
      (today workers share the filesystem with no scoping).
- [ ] Orchestrator queue and new-tab routing for delegated tasks; delegated
      status (queued/working/done) visible in the originating channel.
- [ ] Multi-tenant membership semantics — awaiting decisions:
      - [ ] Invites: owner-only or any member?
      - [ ] Visibility: all channels visible or private-by-default with explicit sharing?
      - [ ] Orchestrator scope: global across members or per-owner/member?
      - [ ] Owner/admin roles and member permissions.
      - [ ] Privacy of the orchestrator/global queue.
- [ ] Browser access (deferred).
- [ ] Native mobile against the same API.

## Non-goals for now

- Personal OAuth integrations (e.g. Gmail) for workers.
- Horizontal service splitting — the single box serves a small collaborator group.

Each item needs its own capability boundaries, failure behavior, and end-to-end
evidence before it becomes a supported feature. No dates are promised.

# VM deploy

One box, one process. The API serves the web UI itself (same origin), runs
the task worker in-process, and keeps the database plus channel storage on
local disk. Open the VM's URL in a browser; mobile clients point at the same
URL later.

## Build

```sh
pnpm install
pnpm build:server   # -> dist/
pnpm build:web      # -> apps/mobile/dist/web (served by the API)
```

## Run

```sh
pnpm start
```

Environment:

| Variable | Required | Notes |
|---|---|---|
| `WORKSPACE_MODE` | yes | `live` (sample mode only binds loopback) |
| `HOST` | no | `127.0.0.1` default; keep loopback behind a reverse proxy |
| `PORT` | no | `8787` default |
| `DATA_DIR` | no | `.openmuse` default; database, files, and `channels/<id>/threads/*.json` live here |
| `WEB_DIR` | no | overrides the served web UI dir (default `apps/mobile/dist/web`); unset/absent = headless API |
| `OPENMUSE_ACCESS_KEY` | yes | 24+ random characters; this is the sign-in key |
| `TOKEN_ENCRYPTION_KEY` | yes | 32 random bytes, base64-encoded |
| `CPK_INTELLIGENCE_API_KEY` | yes | `npx copilotkit@latest login`, then `npx copilotkit@latest project select` |
| `MODEL` | yes | e.g. `openai/gpt-5`; plus the matching provider key (`OPENAI_API_KEY`, …) |
| `AGENT_BACKEND` | no | `opencode` routes chat through the OpenCode agent layer below |
| `OPENCODE_SERVER_URL` | no | `http://127.0.0.1:4096` default; the systemd-managed `opencode serve` (never spawned by the API) |
| `OPENCODE_SERVER_PASSWORD` | no | Basic-auth password for `opencode serve`, if it requires one |
| `PUBLIC_API_URL` | yes | the public https URL; used for OAuth callbacks and CORS |

## OpenCode agent layer (`AGENT_BACKEND=opencode`)

Run `opencode serve` as a systemd unit on the VM (it owns its own auth and
model configuration). On boot the API health-checks it and asserts the major
version matches the bundled `@opencode-ai/sdk`, failing loud if unreachable —
it never spawns the server itself. Each channel thread gets one OpenCode
session (bound via `opencodeSessionId` in its thread file, created before the
first prompt); one global SSE stream fans events out per thread, and the
in-process AG-UI shim at `/api/agent/opencode/run` translates between
CopilotKit and OpenCode. Permission rules default to ask; per-channel/thread
overrides land in a later phase.

Generate the secrets:

```sh
node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))"  # access key
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"     # encryption key
```

## HTTPS (Caddy)

```caddy
muse.example.com {
	reverse_proxy 127.0.0.1:8787
}
```

Caddy fetches the certificate automatically. Keep `HOST=127.0.0.1` so the API
is only reachable through the proxy.

## Notes

- Channel workspace directories are created on first use under
  `DATA_DIR/channels/<channelId>/`. They are plain directories on the box and
  are meant to become agent working directories later.
- The browser worker (`apps/worker`) is a separate optional process; the app
  runs without it, minus page reads, screenshots, and takeover.
- `render.yaml` remains for the split Render blueprint; it is not used here.

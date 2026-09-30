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
| `PUBLIC_API_URL` | yes | the public https URL; used for OAuth callbacks and CORS |

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

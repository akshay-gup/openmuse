# Security policy

## Reporting a vulnerability

Use the repository's **Security → Report a vulnerability** form for private reports. Include the affected commit, reproduction steps using fictional data, and the observed impact. Do not open a public issue containing credentials or a working exploit against someone else's deployment. This alpha has no guaranteed response time.

## Deployment boundary

Hive currently supports one team per deployment. Everyone who can sign in with Google shares the workspace, including its single Google connection: they can read the connected mailbox, calendar and Drive, approve what Hive prepares for them, and disconnect it. Restrict who can sign in (for example the test users on your Google OAuth consent screen) to people you trust with that access. It is not multi-tenant account authentication. Sample mode binds to loopback and contains fictional data. Use HTTPS and restricted network access for a remote live deployment.

The API holds provider credentials. Google tokens are encrypted at rest; short-lived signed URLs grant file and browser-console access. Protect `.env`, `.hive`, database backups, and browser profiles as private data. A signed URL is a credential until it expires.

Files in a channel's workspace are made by the agent and added by people, so they are untrusted. They are served by links that expire in 15 minutes and are only ever shown, never run as part of Hive: every response carries `X-Content-Type-Options: nosniff` and a `sandbox` policy (PDFs excepted, because a sandboxed page cannot open the browser's reader), and a web page is shown in a frame without `allow-same-origin`, so its scripts have no access to Hive's origin, storage or sign-in. A page may load its own fonts and modules, so file links answer any origin; the token in the path is the credential. Paths are resolved to where they really are and must stay inside the channel's workspace: links in the workspace are never followed, and Hive's thread bindings, staged task files and hidden files are not reachable.

The browser worker must remain private and require its own random token. It runs persistent Chromium with application-enforced public-network checks. Playwright disables Chromium's internal sandbox by default; this is not a full desktop VM or a security boundary for hostile tenants. The browser Docker image reduces host access but does not establish kernel-enforced network isolation. See [worker boundaries](apps/worker/README.md).

## External actions

A proposal is bound to the account, reviewed content, and applicable provider version. The server requires a recorded approval before dispatching a send or calendar change. An uncertain network outcome is retained for reconciliation. Cancellation stops later task steps; a provider request already in flight may still finish.

A CopilotKit Intelligence project key is optional and stays on the server. CI uses synthetic keys and mocked Intelligence boundaries. No provider keys, personal data, or third-party logins are needed for CI. CopilotKit Intelligence and any configured model/provider operate under their own terms and data policies. Optional live Jev (`JEV_MODE=live`) sends the user's latest message, agent-written context, and candidate choices to TypeSafe; see [what live mode sends](docs/demos/jev-generative-ui.md#what-live-mode-sends-to-typesafe).

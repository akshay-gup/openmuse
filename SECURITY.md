# Security policy

## Reporting a vulnerability

Use the repository's **Security → Report a vulnerability** form for private reports. Include the affected commit, reproduction steps using fictional data, and the observed impact. Do not open a public issue containing credentials or a working exploit against someone else's deployment. This alpha has no guaranteed response time.

## Deployment boundary

Hive currently supports one team per deployment. Everyone who can sign in with Google shares the workspace, including its single Google connection: they can read the connected mailbox, calendar and Drive, approve what Hive prepares for them, and disconnect it. Restrict who can sign in (for example the test users on your Google OAuth consent screen) to people you trust with that access. It is not multi-tenant account authentication. Sample mode binds to loopback and contains fictional data. Use HTTPS and restricted network access for a remote live deployment.

The API holds provider credentials. Google tokens are encrypted at rest; short-lived signed URLs grant file and browser-console access. Protect `.env`, `.hive`, database backups, and browser profiles as private data. A signed URL is a credential until it expires.

Files in a channel's workspace are made by the agent and added by people, so they are untrusted. They are served by links that expire in 15 minutes and are only ever shown, never run as part of Hive: every response carries `X-Content-Type-Options: nosniff` and a `sandbox` policy (PDFs excepted, because a sandboxed page cannot open the browser's reader), and a web page is shown in a frame without `allow-same-origin`, so its scripts have no access to Hive's origin, storage or sign-in. A page may load its own fonts and modules, so file links answer any origin; the token in the path is the credential. Paths are resolved to where they really are and must stay inside the channel's workspace: links in the workspace are never followed, and Hive's thread bindings, staged task files and hidden files are not reachable.

The browser worker must remain private and require its own random token. It runs persistent Chromium with application-enforced public-network checks. Playwright disables Chromium's internal sandbox by default; this is not a full desktop VM or a security boundary for hostile tenants. The browser Docker image reduces host access but does not establish kernel-enforced network isolation. See [worker boundaries](apps/worker/README.md).

## Agent boundary

Hive's agent is OpenCode, run as `opencode serve`. Its tools read and write files, run shell commands, fetch web pages and call Hive's own tools. Treat it as a person with a shell on the host, not as a sandboxed program.

**Where it runs.** OpenCode runs as the service user and inherits that user's file access and the environment of the `opencode serve` process. A channel's workspace folder is the session's working directory, not a sandbox: a command run through OpenCode can read what the service user can read, and sees every variable in its environment. With the provided units that includes the data directory (the database, which holds the encrypted Google credentials, and the signing key) and all of `/etc/hive/hive.env`, among it `TOKEN_ENCRYPTION_KEY`, which decrypts those credentials. Commands and OpenCode's own web fetch are not subject to the public-network checks of the browser worker, which apply to its navigation.

**What decides what it may do.** In chat, every tool asks first. The request appears in the thread, and a member approves it once or always, or rejects it. There are no roles, so any member can answer a request, switch a channel or thread to auto mode (tools run without asking, except those explicitly denied), or add permission rules. Delegated tasks run unattended with an allow-all ruleset, since no one is there to answer; a request that still asks is recorded as a task event and does not block the task.

**What does not hold against it.** Website, email and PDF text is untrusted input, and an agent that reads it can be told to misuse its access. The recorded approval Hive requires before a send or calendar change governs Hive's own tools; it is not a barrier against a command the agent runs itself with the service user's access. Keep chats in ask mode, read what a request asks for before approving it, and be careful with tasks that read pages or mail you do not trust.

**Its server and its tools.** `opencode serve` listens on loopback unless told otherwise, and Hive connects to it and never starts it. A client that can reach it, and has its password if one is set, can run commands as the service user without going through a model. Keep it on loopback and set `OPENCODE_SERVER_PASSWORD` (the setup script generates one). OpenCode reaches Hive's tools through an MCP bridge on the API's port, with a credential made for one run and revoked when the run ends: the model cannot choose an owner or use another run's tools.

**Narrowing it.** The provided units run OpenCode as the same user as the API, with the same environment file. To narrow that, run it as its own user that can write only the channel workspaces, give it the provider key and its password rather than the shared environment file, and add systemd's sandboxing (for example `ProtectSystem=strict` with `ReadWritePaths`, and `PrivateTmp`) and outbound network limits.

Prompts, the conversation and any file or page the agent reads are sent to the model provider named in `MODEL`, under its own terms.

## External actions

A proposal is bound to the account, reviewed content, and applicable provider version. The server requires a recorded approval before dispatching a send or calendar change; this gate covers Hive's own tools, as the [agent boundary](#agent-boundary) explains. An uncertain network outcome is retained for reconciliation. Cancellation stops later task steps; a provider request already in flight may still finish.

A CopilotKit Intelligence project key is optional and stays on the server. CI uses synthetic keys and mocked Intelligence boundaries. No provider keys, personal data, or third-party logins are needed for CI. CopilotKit Intelligence and any configured model/provider operate under their own terms and data policies. Optional live Jev (`JEV_MODE=live`) sends the user's latest message, agent-written context, and candidate choices to TypeSafe; see [what live mode sends](docs/demos/jev-generative-ui.md#what-live-mode-sends-to-typesafe).

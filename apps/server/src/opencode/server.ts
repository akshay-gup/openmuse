/**
 * Connection to the OpenCode server.
 *
 * `opencode serve` runs as a systemd unit on the host; this process NEVER
 * spawns it. Boot healthchecks the server and asserts a compatible version
 * (`opencode.start()` in app.ts), failing loud when it is unreachable.
 */
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client";

export interface OpencodeConnection {
  /** Base URL of `opencode serve`, e.g. http://127.0.0.1:4096. */
  url: string;
  /** OPENCODE_SERVER_PASSWORD; enables Basic auth when set. */
  password?: string;
}

/** Default when OPENCODE_SERVER_URL is unset (matches `opencode serve --port 4096`). */
export const DEFAULT_OPENCODE_SERVER_URL = "http://127.0.0.1:4096";

/** Build the connection from app config, applying the default server URL. */
export function connectionFromConfig(config: {
  opencodeServerUrl?: string;
  opencodeServerPassword?: string;
}): OpencodeConnection {
  return {
    url: config.opencodeServerUrl?.trim().replace(/\/+$/, "") || DEFAULT_OPENCODE_SERVER_URL,
    password: config.opencodeServerPassword?.trim() || undefined,
  };
}

/**
 * Basic auth headers for the server. Shape lifted from Kimaki's
 * getOpencodeServerAuthHeaders (MIT).
 */
export function opencodeAuthHeaders(conn: OpencodeConnection): Record<string, string> {
  if (!conn.password) return {};
  const username = process.env.OPENCODE_SERVER_USERNAME?.trim() || "opencode";
  const encoded = Buffer.from(`${username}:${conn.password}`).toString("base64");
  return { Authorization: `Basic ${encoded}` };
}

/** Major version of the pinned @opencode-ai/sdk; the server must match it. */
export const OPENCODE_SDK_MAJOR = "1";

/** Fail loud when the server's major version differs from the SDK's. */
export function assertCompatibleServerVersion(version: string): void {
  const major = version.trim().split(".")[0];
  if (!major || major !== OPENCODE_SDK_MAJOR) {
    throw new Error(
      `Incompatible OpenCode server version "${version}": this build pins ` +
        `@opencode-ai/sdk ${OPENCODE_SDK_MAJOR}.x and the wire protocol is only ` +
        `guaranteed within a major. Upgrade the server binary to match.`,
    );
  }
}

/**
 * Healthcheck + version assert against a running `opencode serve`.
 * Throws when unreachable, unhealthy, or version-incompatible: boot must fail
 * loud rather than serve a dead agent.
 */
export async function ensureOpencodeServerReachable(
  conn: OpencodeConnection,
  opts?: { timeoutMs?: number },
): Promise<{ version: string }> {
  const timeoutMs = opts?.timeoutMs ?? 5000;
  const client = createOpencodeClient({
    baseUrl: conn.url,
    headers: opencodeAuthHeaders(conn),
  });
  let version: string | undefined;
  try {
    const health = await client.global.health({ signal: AbortSignal.timeout(timeoutMs) });
    if (health.error) throw new Error(JSON.stringify(health.error).slice(0, 300));
    version = health.data?.version;
  } catch (cause) {
    throw new Error(
      `OpenCode server unreachable at ${conn.url}: ` +
        `${cause instanceof Error ? cause.message : String(cause)}. ` +
        `Start \`opencode serve\` (systemd unit) and set OPENCODE_SERVER_URL if it listens elsewhere.`,
      { cause },
    );
  }
  if (!version) throw new Error(`OpenCode server at ${conn.url} reported no version`);
  assertCompatibleServerVersion(version);
  return { version };
}

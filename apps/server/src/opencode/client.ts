/**
 * Per-directory OpenCode SDK clients.
 *
 * One client per channel workspace directory; the SDK sends the
 * `x-opencode-directory` header so the single shared `opencode serve`
 * instance scopes every request to that channel's workspace.
 */
import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk/v2/client";
import { type OpencodeConnection, opencodeAuthHeaders } from "./server.ts";

export type { OpencodeClient };

export class OpencodeClientPool {
  private readonly clients = new Map<string, OpencodeClient>();

  constructor(private readonly conn: OpencodeConnection) {}

  /** Client scoped to a channel workspace directory (created lazily, cached). */
  forDirectory(directory: string): OpencodeClient {
    const key = directory.replace(/\/+$/, "") || "/";
    let client = this.clients.get(key);
    if (!client) {
      client = createOpencodeClient({
        baseUrl: this.conn.url,
        headers: opencodeAuthHeaders(this.conn),
        directory: key,
      });
      this.clients.set(key, client);
    }
    return client;
  }
}

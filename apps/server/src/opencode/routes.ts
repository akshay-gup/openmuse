/**
 * OpenCode permission HTTP API (mounted under /api/agent/opencode).
 *
 * - GET  /threads/:threadId/permissions/pending — pending requests for a thread
 * - POST /permissions/:requestId/reply — { reply: "once" | "always" | "reject" }
 * - GET  /channels/:channelId/permissions — channel rule strings
 * - PUT  /channels/:channelId/permissions — { rules: string[] }
 * - GET  /threads/:threadId/permissions/rules — { rules, channelRules }
 * - PUT  /threads/:threadId/permissions/rules — { rules: string[] } (thread override)
 *
 * Rule strings are opencode-style (`tool:pattern:action`); invalid lines 422.
 */
import { Hono } from "hono";
import { z } from "zod";
import type { OpencodeShimDeps } from "./agui.ts";
import type { PermissionReply } from "./approvals.ts";
import { invalidRuleLines } from "./permissions.ts";

const replySchema = z.object({ reply: z.enum(["once", "always", "reject"]) });
const rulesSchema = z.object({ rules: z.array(z.string().max(500)).max(200) });

function serialize(request: {
  requestId: string;
  permission: string;
  patterns: string[];
  tool?: { messageID: string; callID: string };
  askedAt: number;
  channelId: string;
}) {
  return {
    requestId: request.requestId,
    permission: request.permission,
    patterns: request.patterns,
    tool: request.tool,
    askedAt: request.askedAt,
    channelId: request.channelId,
  };
}

export function opencodePermissionRoutes(deps: OpencodeShimDeps) {
  const app = new Hono<{ Variables: { owner: string } }>();

  app.get("/threads/:threadId/permissions/pending", async (c) => {
    const owner = c.get("owner");
    const threadId = c.req.param("threadId");
    const binding = await deps.service.channelOfThread(owner, threadId);
    if (!binding) return c.json({ error: "Thread is not bound to a channel" }, 404);
    return c.json(deps.tracker.pendingForThread(threadId).map(serialize));
  });

  app.post("/permissions/:requestId/reply", async (c) => {
    const parsed = replySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "reply must be once, always or reject" }, 400);
    const requestId = c.req.param("requestId");
    const pending = deps.tracker.get(requestId);
    if (!pending) return c.json({ error: "Permission request is not pending" }, 404);
    try {
      const answered = await deps.tracker.reply(deps, requestId, parsed.data.reply as PermissionReply);
      return c.json({ ok: true, ...serialize(answered) });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Reply failed" },
        502,
      );
    }
  });

  app.get("/channels/:channelId/permissions", async (c) => {
    const owner = c.get("owner");
    const channelId = c.req.param("channelId");
    const channels = await deps.service.listChannels(owner);
    if (!channels.some((channel) => channel.id === channelId))
      return c.json({ error: "Channel not found" }, 404);
    return c.json({ channelId, rules: await deps.rules.channelRules(channelId) });
  });

  app.put("/channels/:channelId/permissions", async (c) => {
    const owner = c.get("owner");
    const channelId = c.req.param("channelId");
    const channels = await deps.service.listChannels(owner);
    if (!channels.some((channel) => channel.id === channelId))
      return c.json({ error: "Channel not found" }, 404);
    const parsed = rulesSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Body must be { rules: string[] }" }, 400);
    const bad = invalidRuleLines(parsed.data.rules);
    if (bad.length > 0)
      return c.json({ error: `Invalid permission rules: ${bad.join("; ")}` }, 422);
    const rules = await deps.rules.setChannelRules(channelId, parsed.data.rules);
    return c.json({ channelId, rules });
  });

  app.get("/threads/:threadId/permissions/rules", async (c) => {
    const owner = c.get("owner");
    const threadId = c.req.param("threadId");
    const binding = await deps.service.channelOfThread(owner, threadId);
    if (!binding) return c.json({ error: "Thread is not bound to a channel" }, 404);
    const [rules, channelRules] = await Promise.all([
      deps.rules.threadRules(binding.channelId, threadId),
      deps.rules.channelRules(binding.channelId),
    ]);
    return c.json({ threadId, channelId: binding.channelId, rules, channelRules });
  });

  app.put("/threads/:threadId/permissions/rules", async (c) => {
    const owner = c.get("owner");
    const threadId = c.req.param("threadId");
    const binding = await deps.service.channelOfThread(owner, threadId);
    if (!binding) return c.json({ error: "Thread is not bound to a channel" }, 404);
    const parsed = rulesSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Body must be { rules: string[] }" }, 400);
    const bad = invalidRuleLines(parsed.data.rules);
    if (bad.length > 0)
      return c.json({ error: `Invalid permission rules: ${bad.join("; ")}` }, 422);
    const rules = await deps.rules.setThreadRules(binding.channelId, threadId, parsed.data.rules);
    return c.json({ threadId, channelId: binding.channelId, rules });
  });

  return app;
}

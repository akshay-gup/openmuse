/**
 * Permission rulesets for OpenCode sessions.
 *
 * OpenCode evaluates rulesets last-wins (findLast over merged agent +
 * session rules), so session rules always beat the agent's native defaults.
 * The native default is permissive (`"*": "allow"`); Akshay's call is
 * default-ask, user-configurable per channel/thread (opencode-style rules).
 */
import type { PermissionRuleset } from "@opencode-ai/sdk/v2/client";

export type { PermissionRuleset };

/**
 * Parse opencode-style rule strings into a PermissionRuleset.
 * Accepted formats: "tool:action" or "tool:pattern:action".
 * Lifted from Kimaki's parsePermissionRules (MIT).
 */
export function parsePermissionRules(raw: unknown): PermissionRuleset {
  if (!Array.isArray(raw)) return [];
  const validActions = new Set(["allow", "deny", "ask"]);
  return raw.flatMap((entry) => {
    if (typeof entry !== "string") return [];
    const parts = entry.split(":").map((s) => s.trim());
    if (parts.length === 2) {
      const [permission, rawAction] = parts as [string | undefined, string | undefined];
      const action = rawAction?.toLowerCase() ?? "";
      if (!permission || !validActions.has(action)) return [];
      return [{ permission, pattern: "*", action: action as "allow" | "deny" | "ask" }];
    }
    if (parts.length >= 3) {
      // Last segment is the action, first is the permission, everything in
      // between is the pattern (may contain colons, e.g. URL patterns).
      const permission = parts[0];
      const rawAction = parts[parts.length - 1];
      const action = rawAction?.toLowerCase() ?? "";
      const pattern = parts.slice(1, -1).join(":");
      if (!permission || !pattern || !validActions.has(action)) return [];
      return [{ permission, pattern, action: action as "allow" | "deny" | "ask" }];
    }
    return [];
  });
}

/**
 * The default-ask base: every tool asks unless a later rule says otherwise.
 * The native `deny` rules for non-interactive tools (question/plan_*) are
 * preserved — without them the wildcard ask would resurrect them as
 * ask-then-TTL-reject instead of an immediate deny.
 */
export function defaultSessionRuleset(): PermissionRuleset {
  return [
    { permission: "*", pattern: "*", action: "ask" },
    { permission: "question", pattern: "*", action: "deny" },
    { permission: "plan_enter", pattern: "*", action: "deny" },
    { permission: "plan_exit", pattern: "*", action: "deny" },
  ];
}

/**
 * Full session ruleset: default-ask base first, user rules last so they win
 * via findLast. Directory ALLOWs never go here — they belong in the server
 * config so a project opencode.json can still deny/ask specific folders.
 */
export function buildSessionRuleset(userRules: PermissionRuleset): PermissionRuleset {
  return [...defaultSessionRuleset(), ...userRules];
}

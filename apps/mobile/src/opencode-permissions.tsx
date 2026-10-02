import { ShieldCheck } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import type { Channel } from "../../../packages/domain/src/agent";
import { Button, Card, colors, ErrorNotice, SectionHeading, s } from "./ui";
import { useWorkspace } from "./workspace";

interface PendingRequest {
  requestId: string;
  permission: string;
  patterns: string[];
  tool?: { messageID: string; callID: string };
  askedAt: number;
  channelId: string;
}

function requestSummary(request: PendingRequest): string {
  const patterns = request.patterns.filter(Boolean).join(", ");
  return patterns ? `${request.permission} · ${patterns}` : request.permission;
}

/**
 * Pending permission approvals for a thread. Polls the opencode permission
 * API (which only exists when AGENT_BACKEND=opencode; a 404 hides the
 * component entirely). Rendered under the channel thread banner in chat.
 */
export function PendingApprovals({ threadId }: { threadId: string }) {
  const { api } = useWorkspace();
  const [pending, setPending] = useState<PendingRequest[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const list = await api.request<PendingRequest[]>(
        `/api/agent/opencode/threads/${threadId}/permissions/pending`,
      );
      setPending(list);
      setError("");
    } catch (e) {
      // Backend isn't opencode (route not mounted) — hide, don't error.
      setPending(null);
      if (e instanceof Error && !/404/.test(e.message)) setError(e.message);
    }
  }, [api, threadId]);

  useEffect(() => {
    setPending(null);
    void load();
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
  }, [load]);

  async function reply(requestId: string, reply: "once" | "always" | "reject") {
    setBusy(requestId);
    setError("");
    try {
      await api.request(`/api/agent/opencode/permissions/${requestId}/reply`, { reply });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (!pending?.length) return null;
  return (
    <View style={{ gap: 8 }}>
      <ErrorNotice error={error} />
      {pending.map((request) => (
        <View
          key={request.requestId}
          style={{
            gap: 8,
            paddingHorizontal: 12,
            paddingVertical: 10,
            backgroundColor: "#FFF8E7",
            borderRadius: 14,
            borderWidth: 1,
            borderColor: "#F0DFAE",
          }}
        >
          <View style={[s.row, { gap: 8, alignItems: "center" }]}>
            <ShieldCheck size={16} color={colors.text} />
            <Text style={[s.text, { flex: 1, fontSize: 14, fontWeight: "600" }]} numberOfLines={2}>
              {requestSummary(request)}
            </Text>
          </View>
          <Text style={s.small}>
            The agent is waiting for approval (
            {Math.max(0, Math.round((Date.now() - request.askedAt) / 1000))}s)
          </Text>
          <View style={[s.row, { gap: 8 }]}>
            <Button
              small
              primary
              disabled={busy === request.requestId}
              onPress={() => void reply(request.requestId, "once")}
            >
              Approve once
            </Button>
            <Button
              small
              disabled={busy === request.requestId}
              onPress={() => void reply(request.requestId, "always")}
            >
              Always
            </Button>
            <Button
              small
              danger
              disabled={busy === request.requestId}
              onPress={() => void reply(request.requestId, "reject")}
            >
              Deny
            </Button>
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Multiline opencode-style permission rule editor. `loadUrl` returns
 * `{ rules: string[], channelRules?: string[] }`; `saveUrl` accepts
 * `{ rules: string[] }`.
 */
type RuleAction = "allow" | "ask" | "deny";
const ACTIONS: { id: RuleAction; label: string }[] = [
  { id: "allow", label: "Allow" },
  { id: "ask", label: "Ask" },
  { id: "deny", label: "Deny" },
];
/** Tools the agent can ask about, as named in OpenCode's TUI. */
const PERMISSION_TOOLS: { id: string; label: string }[] = [
  { id: "*", label: "Everything else" },
  { id: "bash", label: "Run commands" },
  { id: "edit", label: "Edit files" },
  { id: "write", label: "Create files" },
  { id: "read", label: "Read files" },
  { id: "glob", label: "Find files" },
  { id: "grep", label: "Search files" },
  { id: "list", label: "List directories" },
  { id: "webfetch", label: "Fetch URLs" },
  { id: "websearch", label: "Search the web" },
  { id: "todowrite", label: "Manage to-dos" },
];

/** Parse "tool:action" or "tool:pattern:action" strings into tool → action. */
function parseRules(rules: string[]): Record<string, RuleAction> {
  const out: Record<string, RuleAction> = {};
  for (const entry of rules) {
    const parts = entry.split(":").map((s) => s.trim());
    if (parts.length < 2) continue;
    const tool = parts[0];
    const action = parts[parts.length - 1].toLowerCase();
    if (!tool || (action !== "allow" && action !== "ask" && action !== "deny")) continue;
    out[tool] = action;
  }
  return out;
}

/**
 * TUI-style permission selector: per-tool Allow / Ask / Deny, no patterns.
 * `loadUrl` returns `{ rules: string[], channelRules?: string[] }`;
 * `saveUrl` accepts `{ rules: string[] }` ("tool:action" strings).
 */
export function PermissionRulesEditor({
  loadUrl,
  saveUrl,
  title,
}: {
  loadUrl: string;
  saveUrl: string;
  title: string;
}) {
  const { api } = useWorkspace();
  const [choices, setChoices] = useState<Record<string, RuleAction> | null>(null);
  const [channelRules, setChannelRules] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await api.request<{ rules: string[]; channelRules?: string[] }>(loadUrl);
      setChoices(parseRules(data.rules));
      setChannelRules(data.channelRules ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [api, loadUrl]);

  useEffect(() => {
    setChoices(null);
    void load();
  }, [load]);

  async function save() {
    if (!choices) return;
    setSaving(true);
    setError("");
    try {
      const rules = PERMISSION_TOOLS.map((tool) => `${tool.id}:${choices[tool.id] ?? "ask"}`);
      const data = await api.request<{ rules: string[] }>(saveUrl, { rules }, "PUT");
      setChoices(parseRules(data.rules));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (choices === null)
    return error ? <ErrorNotice error={error} /> : <ActivityIndicator color={colors.blueDark} />;
  return (
    <View style={{ gap: 10 }}>
      <Text style={s.small}>{title}</Text>
      {!!channelRules?.length && (
        <Text style={[s.small, { color: colors.muted }]}>
          Channel rules (inherited): {channelRules.join(" · ")}
        </Text>
      )}
      {PERMISSION_TOOLS.map((tool) => {
        const active = choices[tool.id] ?? "ask";
        return (
          <View key={tool.id} style={[s.row, { gap: 8, alignItems: "center" }]}>
            <Text style={[s.text, { flex: 1, fontSize: 14 }]} numberOfLines={1}>
              {tool.label}
            </Text>
            <View style={[s.row, { gap: 6 }]}>
              {ACTIONS.map((action) => (
                <Button
                  key={action.id}
                  small
                  primary={active === action.id}
                  onPress={() => setChoices({ ...choices, [tool.id]: action.id })}
                >
                  {action.label}
                </Button>
              ))}
            </View>
          </View>
        );
      })}
      <ErrorNotice error={error} />
      <View style={[s.row, { gap: 8 }]}>
        <Button small primary busy={saving} onPress={() => void save()}>
          Save rules
        </Button>
      </View>
    </View>
  );
}

/** Channel-level permission rules, shown in the expanded channel view. */
export function ChannelPermissionRules({ channelId }: { channelId: string }) {
  return (
    <PermissionRulesEditor
      title="Permission rules for this channel (default: ask everything)"
      loadUrl={`/api/agent/opencode/channels/${channelId}/permissions`}
      saveUrl={`/api/agent/opencode/channels/${channelId}/permissions`}
    />
  );
}

/** Per-thread rule overrides, shown in the thread banner. */
export function ThreadPermissionRules({ threadId }: { threadId: string }) {
  return (
    <PermissionRulesEditor
      title="Thread overrides (win over channel rules)"
      loadUrl={`/api/agent/opencode/threads/${threadId}/permissions/rules`}
      saveUrl={`/api/agent/opencode/threads/${threadId}/permissions/rules`}
    />
  );
}

/**
 * Permissions section for agent settings: every channel with an expandable
 * rule editor. Thread overrides (set inside a thread) win over these.
 */
export function PermissionsSettings() {
  const { api } = useWorkspace();
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setChannels(await api.request<Channel[]>("/api/agent/channels"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card style={{ gap: 12 }}>
      <SectionHeading title="Permissions" />
      <Text style={s.muted}>
        What the agent may do on its own in each channel. Default is ask everything; thread
        overrides win over channel rules.
      </Text>
      <ErrorNotice error={error} />
      {channels === null ? (
        <ActivityIndicator color={colors.blueDark} />
      ) : !channels.length ? (
        <Text style={s.muted}>No channels yet.</Text>
      ) : (
        channels.map((channel) => (
          <View
            key={channel.id}
            style={{
              gap: 8,
              paddingBottom: 12,
              borderBottomWidth: 1,
              borderBottomColor: colors.line,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Permission rules for ${channel.name}`}
              onPress={() => setExpanded(expanded === channel.id ? null : channel.id)}
              style={[s.row, { gap: 8, alignItems: "center" }]}
            >
              <ShieldCheck size={16} color={colors.muted} />
              <Text style={[s.text, { flex: 1, fontWeight: "600" }]} numberOfLines={1}>
                {channel.name}
              </Text>
              <Text style={s.small}>{expanded === channel.id ? "Hide" : "Edit"}</Text>
            </Pressable>
            {expanded === channel.id && <ChannelPermissionRules channelId={channel.id} />}
          </View>
        ))
      )}
    </Card>
  );
}

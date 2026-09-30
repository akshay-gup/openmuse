import { ShieldCheck } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Button, colors, ErrorNotice, Field, s } from "./ui";
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

const RULES_HINT =
  "One rule per line: tool:pattern:action — e.g. bash:git status:allow · edit:deny · *:ask";

/**
 * Multiline opencode-style permission rule editor. `loadUrl` returns
 * `{ rules: string[], channelRules?: string[] }`; `saveUrl` accepts
 * `{ rules: string[] }`.
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
  const [text, setText] = useState<string | null>(null);
  const [channelRules, setChannelRules] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await api.request<{ rules: string[]; channelRules?: string[] }>(loadUrl);
      setText(data.rules.join("\n"));
      setChannelRules(data.channelRules ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [api, loadUrl]);

  useEffect(() => {
    setText(null);
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    setError("");
    try {
      const rules = (text ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const data = await api.request<{ rules: string[] }>(saveUrl, { rules }, "PUT");
      setText(data.rules.join("\n"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (text === null)
    return error ? <ErrorNotice error={error} /> : <ActivityIndicator color={colors.blueDark} />;
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.small}>{title}</Text>
      {!!channelRules?.length && (
        <Text style={[s.small, { color: colors.muted }]}>
          Channel rules (inherited): {channelRules.join(" · ")}
        </Text>
      )}
      <Field
        label="Permission rules"
        value={text}
        onChangeText={setText}
        multiline
        placeholder={RULES_HINT}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Text style={[s.small, { color: colors.muted }]}>{RULES_HINT}</Text>
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

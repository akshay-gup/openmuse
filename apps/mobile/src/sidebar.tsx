import { Bot, Hash, Monitor, Plus, RefreshCw } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { type Channel, ORCHESTRATOR_CHANNEL_ID } from "../../../packages/domain/src/agent";
import { useAgentWorkspace } from "./agent-workspace";
import { useMuseThread } from "./threads";
import { Button, colors, ErrorNotice, Field, s } from "./ui";
import { useWorkspace } from "./workspace";

function SidebarRow({
  icon: Icon,
  label,
  active,
  onPress,
}: {
  icon: typeof Bot;
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        flexDirection: "row",
        gap: 10,
        alignItems: "center",
        paddingVertical: 8,
        paddingHorizontal: 8,
        borderRadius: 8,
        backgroundColor: active ? "#E8EDF0" : "transparent",
      }}
    >
      <Icon size={16} color={active ? colors.text : colors.muted} />
      <Text style={[s.text, { fontWeight: active ? "600" : "400" }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Persistent Slack-style conversation sidebar, rendered on desktop widths.
 * The orchestrator is a single Slackbot-like tab (no threads); channels open
 * directly as chat surfaces — no thread needed. Threads auto-create from
 * replies and @hive mentions. The menu sheet remains the navigation on
 * narrow screens.
 */
export function Sidebar() {
  const { api, open } = useWorkspace();
  const { enabled, selection, select, mainId } = useMuseThread();
  const { data } = useAgentWorkspace();
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      setChannels(await api.request<Channel[]>("/api/agent/channels"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);

  const isMainActive = enabled ? selection.id === mainId : selection.id === "local";
  const mainSelection = enabled ? { id: mainId, existing: true } : { id: "local", existing: false };
  const delegateThreadId =
    enabled && !selection.id.startsWith("channel:") ? selection.id : undefined;

  // Highlight the channel of the selected chat: either the channel chat
  // itself or the channel a forked thread belongs to.
  useEffect(() => {
    let active = true;
    if (isMainActive) {
      setActiveChannelId(null);
      return;
    }
    if (selection.id.startsWith("channel:")) {
      setActiveChannelId(selection.id.slice("channel:".length));
      return;
    }
    void api
      .request<{ channelId: string }>(`/api/agent/threads/${selection.id}/channel`)
      .then((binding) => {
        if (active) setActiveChannelId(binding.channelId);
      })
      .catch(() => {
        if (active) setActiveChannelId(null);
      });
    return () => {
      active = false;
    };
  }, [api, isMainActive, selection.id]);

  async function createChannel() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError("");
    try {
      const created = await api.request<Channel>("/api/agent/channels", { name: trimmed });
      setName("");
      setCreating(false);
      await load();
      // A new channel is usable immediately: open it as a chat.
      select({ id: `channel:${created.id}`, existing: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const userChannels = (channels ?? [])
    .filter((channel) => channel.id !== ORCHESTRATOR_CHANNEL_ID)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <View
      style={{
        width: 280,
        borderRightWidth: 1,
        borderRightColor: colors.line,
        backgroundColor: "#FAFBFC",
      }}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 18, gap: 2 }}
      >
        <Text
          style={[s.small, { fontWeight: "700", paddingHorizontal: 8, marginBottom: 6 }]}
          numberOfLines={1}
        >
          {data?.identity.name || "Hive"}
        </Text>
        <SidebarRow
          icon={Bot}
          label="Orchestrator"
          active={isMainActive}
          onPress={() => select(mainSelection)}
        />
        <View
          style={[
            s.row,
            { alignItems: "center", marginTop: 14, marginBottom: 2, paddingHorizontal: 8 },
          ]}
        >
          <Text style={[s.small, { flex: 1, fontWeight: "700" }]}>Channels</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh channels"
            disabled={loading}
            onPress={() => void load()}
            style={{ padding: 4 }}
          >
            <RefreshCw size={14} color={colors.muted} />
          </Pressable>
        </View>
        <ErrorNotice error={error} />
        {loading && !channels ? (
          <ActivityIndicator color={colors.blueDark} style={{ marginTop: 8 }} />
        ) : (
          userChannels.map((channel) => {
            const isActive = !isMainActive && activeChannelId === channel.id;
            return (
              <Pressable
                key={channel.id}
                accessibilityRole="button"
                accessibilityLabel={`Open channel: ${channel.name}`}
                onPress={() => select({ id: `channel:${channel.id}`, existing: true })}
                style={{
                  flexDirection: "row",
                  gap: 8,
                  alignItems: "center",
                  paddingVertical: 8,
                  paddingHorizontal: 8,
                  borderRadius: 8,
                  backgroundColor: isActive ? "#E8EDF0" : "transparent",
                }}
              >
                <Hash size={15} color={isActive ? colors.text : colors.muted} />
                <Text
                  style={[s.text, { flex: 1, fontWeight: isActive ? "600" : "400" }]}
                  numberOfLines={1}
                >
                  {channel.name}
                </Text>
              </Pressable>
            );
          })
        )}
        {creating ? (
          <View style={{ gap: 8, paddingHorizontal: 8, marginTop: 6 }}>
            <Field label="Channel name" value={name} onChangeText={setName} />
            <View style={[s.row, { gap: 8 }]}>
              <Button
                primary
                small
                disabled={busy || !name.trim()}
                onPress={() => void createChannel()}
              >
                Create
              </Button>
              <Button small disabled={busy} onPress={() => setCreating(false)}>
                Cancel
              </Button>
            </View>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="New channel"
            disabled={busy}
            onPress={() => setCreating(true)}
            style={[
              s.row,
              { gap: 8, alignItems: "center", paddingVertical: 8, paddingHorizontal: 8 },
            ]}
          >
            <Plus size={15} color={colors.muted} />
            <Text style={s.small}>New channel</Text>
          </Pressable>
        )}
        <View style={[s.divider, { marginVertical: 10 }]} />
        <SidebarRow
          icon={Plus}
          label="Delegate task"
          onPress={() => open({ type: "delegate", threadId: delegateThreadId })}
        />
        <SidebarRow
          icon={Monitor}
          label="Agent computer"
          onPress={() => open({ type: "computer" })}
        />
      </ScrollView>
    </View>
  );
}

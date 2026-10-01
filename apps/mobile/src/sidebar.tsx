import {
  ChevronDown,
  ChevronRight,
  Hash,
  MessageCircle,
  Monitor,
  Plus,
  RefreshCw,
} from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { type Channel, ORCHESTRATOR_CHANNEL_ID } from "../../../packages/domain/src/agent";
import { useAgentWorkspace } from "./agent-workspace";
import { ChannelThreads } from "./channels";
import { useMuseThread } from "./threads";
import { Button, colors, ErrorNotice, Field, s } from "./ui";
import { useWorkspace } from "./workspace";

function SidebarRow({
  icon: Icon,
  label,
  active,
  onPress,
}: {
  icon: typeof MessageCircle;
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
 * Main chat plus expandable channels with their threads; selecting a thread
 * navigates to chat (the ThreadsProvider's select already does). The menu
 * sheet remains the navigation on narrow screens.
 */
export function Sidebar() {
  const { api, open } = useWorkspace();
  const { enabled, selection, select, mainId } = useMuseThread();
  const { data } = useAgentWorkspace();
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(ORCHESTRATOR_CHANNEL_ID);
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

  // Keep the selected thread's channel expanded and highlighted.
  useEffect(() => {
    let active = true;
    const tid = selection.id;
    if (isMainActive) {
      setActiveChannelId(null);
      return;
    }
    void api
      .request<{ channelId: string }>(`/api/agent/threads/${tid}/channel`)
      .then((binding) => {
        if (!active) return;
        setActiveChannelId(binding.channelId);
        setExpanded(binding.channelId);
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
      setExpanded(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const sorted = [...(channels ?? [])].sort((a, b) => {
    if (a.id === ORCHESTRATOR_CHANNEL_ID) return -1;
    if (b.id === ORCHESTRATOR_CHANNEL_ID) return 1;
    return a.name.localeCompare(b.name);
  });

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
          icon={MessageCircle}
          label="Main chat"
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
          sorted.map((channel) => {
            const isOpen = expanded === channel.id;
            const isActive = !isMainActive && activeChannelId === channel.id;
            return (
              <View key={channel.id}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${isOpen ? "Collapse" : "Expand"} channel: ${channel.name}`}
                  onPress={() => setExpanded(isOpen ? null : channel.id)}
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
                  {isOpen ? (
                    <ChevronDown size={14} color={colors.muted} />
                  ) : (
                    <ChevronRight size={14} color={colors.muted} />
                  )}
                  <Hash size={15} color={colors.muted} />
                  <Text
                    style={[s.text, { flex: 1, fontWeight: isActive ? "600" : "400" }]}
                    numberOfLines={1}
                  >
                    {channel.name}
                  </Text>
                </Pressable>
                {isOpen && (
                  <View style={{ paddingLeft: 14, paddingBottom: 4 }}>
                    <ChannelThreads
                      channel={channel}
                      onClose={() => {}}
                      activeThreadId={isMainActive ? undefined : selection.id}
                    />
                  </View>
                )}
              </View>
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
          onPress={() => open({ type: "delegate", threadId: enabled ? selection.id : undefined })}
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

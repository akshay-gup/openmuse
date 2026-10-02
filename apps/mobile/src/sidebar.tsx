import {
  Bot,
  CalendarDays,
  FileText,
  Hash,
  Lightbulb,
  Monitor,
  PanelsTopLeft,
  Plus,
  RefreshCw,
  Shapes,
  SquareCheck,
  X,
} from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import type { Section } from "../../../packages/domain/src";
import { type Channel, ORCHESTRATOR_CHANNEL_ID } from "../../../packages/domain/src/agent";
import { useAgentWorkspace } from "./agent-workspace";
import { useMuseThread } from "./threads";
import { Button, colors, ErrorNotice, Field, IconButton, Mascot, s } from "./ui";
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
export function Sidebar({
  compact = false,
  onNavigate,
}: {
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const { api, open, section, navigate, workspace } = useWorkspace();
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
      onNavigate?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function go(destination: Section) {
    navigate(destination);
    onNavigate?.();
  }
  function conversation(next: { id: string; existing: boolean }) {
    select(next);
    onNavigate?.();
  }
  const workspaceLinks: { id: Section; label: string; icon: typeof Bot }[] = [
    { id: "activity", label: "Activity", icon: PanelsTopLeft },
    { id: "ideas", label: "Ideas", icon: Lightbulb },
    { id: "goals", label: "Goals", icon: SquareCheck },
    { id: "apps", label: "Apps", icon: Shapes },
    { id: "calendar", label: "Calendar", icon: CalendarDays },
    { id: "files", label: "Files", icon: FileText },
  ];
  const userChannels = (channels ?? [])
    .filter((channel) => channel.id !== ORCHESTRATOR_CHANNEL_ID && channel.status !== "archived")
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <View
      style={{
        width: compact ? "100%" : 260,
        flex: compact ? 1 : undefined,
        borderRightWidth: 1,
        borderRightColor: colors.line,
        backgroundColor: "#FAFBFC",
      }}
    >
      <View
        style={[
          s.row,
          {
            paddingHorizontal: 18,
            height: 76,
            gap: 10,
            borderBottomWidth: 1,
            borderBottomColor: colors.line,
          },
        ]}
      >
        <Mascot size={34} variant={data?.identity.avatar} />
        <View style={{ flex: 1 }}>
          <Text style={s.heading}>{data?.identity.name || "Hive"}</Text>
          <Text style={s.small}>Your workspace</Text>
        </View>
        {compact && <IconButton icon={X} label="Close navigation" onPress={() => onNavigate?.()} />}
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 18, gap: 2 }}
      >
        <Text style={[s.small, { fontWeight: "700", paddingHorizontal: 8, marginBottom: 8 }]}>
          Direct messages
        </Text>
        <SidebarRow
          icon={Bot}
          label={data?.identity.name || "Hive"}
          active={section === "chat" && isMainActive}
          onPress={() => conversation(mainSelection)}
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
            const isActive = section === "chat" && !isMainActive && activeChannelId === channel.id;
            return (
              <Pressable
                key={channel.id}
                accessibilityRole="button"
                accessibilityLabel={`Open channel: ${channel.name}`}
                onPress={() => conversation({ id: `channel:${channel.id}`, existing: true })}
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
        <View style={[s.divider, { marginVertical: 16 }]} />
        <Text style={[s.small, { fontWeight: "700", paddingHorizontal: 8, marginBottom: 8 }]}>
          Workspace
        </Text>
        {workspaceLinks.map((item) => (
          <SidebarRow
            key={item.id}
            icon={item.icon}
            label={item.label}
            active={section === item.id}
            onPress={() => go(item.id)}
          />
        ))}
        <View style={[s.divider, { marginVertical: 16 }]} />
        <SidebarRow
          icon={Plus}
          label="Delegate task"
          onPress={() => {
            onNavigate?.();
            open({ type: "delegate", threadId: delegateThreadId });
          }}
        />
        <SidebarRow
          icon={Monitor}
          label="Agent computer"
          onPress={() => {
            onNavigate?.();
            open({ type: "computer" });
          }}
        />
      </ScrollView>
      <View
        style={[s.row, { borderTopWidth: 1, borderTopColor: colors.line, padding: 18, gap: 10 }]}
      >
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 9,
            backgroundColor: colors.lavender,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={[s.text, { fontWeight: "600" }]}>
            {(workspace.profile.name || "You").slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.text, { fontSize: 13 }]} numberOfLines={1}>
            {workspace.profile.name || "You"}
          </Text>
          <Text style={s.small}>Signed in</Text>
        </View>
      </View>
    </View>
  );
}

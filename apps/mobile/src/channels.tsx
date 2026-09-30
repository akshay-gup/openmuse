import { Archive, Hash, Plus, RefreshCw } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import {
  type AgentTask,
  type Channel,
  ORCHESTRATOR_CHANNEL_ID,
  type TaskStatus,
} from "../../../packages/domain/src/agent";
import { Button, colors, ErrorNotice, Field, s } from "./ui";
import { useWorkspace } from "./workspace";

function taskState(status: TaskStatus): { label: string; color: string } {
  switch (status) {
    case "running":
      return { label: "working", color: colors.blueDark };
    case "failed":
      return { label: "failed", color: colors.danger };
    case "succeeded":
      return { label: "done", color: colors.muted };
    case "cancelled":
      return { label: "cancelled", color: colors.muted };
    default:
      return { label: "waiting", color: colors.muted };
  }
}

function ChannelTasks({ channel, onOpenTask }: { channel: Channel; onOpenTask: () => void }) {
  const { api, open } = useWorkspace();
  const [tasks, setTasks] = useState<AgentTask[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setTasks(null);
    setError("");
    void api
      .request<AgentTask[]>(`/api/agent/channels/${channel.id}/tasks`)
      .then((list) => {
        if (active) setTasks(list);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      active = false;
    };
  }, [api, channel.id]);
  if (error) return <ErrorNotice error={error} />;
  if (!tasks) return <ActivityIndicator color={colors.blueDark} />;
  if (!tasks.length) return <Text style={s.muted}>No tasks yet.</Text>;
  return (
    <View style={{ gap: 2 }}>
      {tasks.map((task) => {
        const state = taskState(task.status);
        const elsewhere =
          task.originChannelId === channel.id && task.channelId !== channel.id && task.channelId
            ? ` · in ${task.channelId === ORCHESTRATOR_CHANNEL_ID ? "orchestrator" : task.channelId}`
            : "";
        return (
          <Pressable
            key={task.id}
            accessibilityRole="button"
            accessibilityLabel={`Open task: ${task.title}`}
            onPress={() => {
              open({ type: "task", taskId: task.id });
              onOpenTask();
            }}
            style={[s.row, { gap: 8, paddingVertical: 6 }]}
          >
            <Text style={[s.text, { flex: 1 }]} numberOfLines={1}>
              {task.title}
            </Text>
            <Text style={[s.small, { color: state.color }]}>
              {state.label}
              {elsewhere}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ChannelsSection({ onClose }: { onClose: () => void }) {
  const { api } = useWorkspace();
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(ORCHESTRATOR_CHANNEL_ID);

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

  async function mutate(action: () => Promise<void>) {
    setError("");
    setBusy(true);
    try {
      await action();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const sorted = [...(channels ?? [])].sort((a, b) => {
    if (a.id === ORCHESTRATOR_CHANNEL_ID) return -1;
    if (b.id === ORCHESTRATOR_CHANNEL_ID) return 1;
    const rank = (c: Channel) => (c.status === "active" ? 0 : c.status === "idle" ? 1 : 2);
    return rank(a) - rank(b);
  });

  return (
    <View style={{ gap: 10 }}>
      <View style={s.between}>
        <Text style={s.heading}>Channels</Text>
        <Button small onPress={() => void load()} icon={RefreshCw} disabled={loading}>
          Refresh
        </Button>
      </View>
      <ErrorNotice error={error} />
      {loading && !channels ? (
        <ActivityIndicator color={colors.blueDark} />
      ) : (
        sorted.map((channel) => {
          const isOrchestrator = channel.id === ORCHESTRATOR_CHANNEL_ID;
          const isOpen = expanded === channel.id;
          return (
            <View
              key={channel.id}
              style={{
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: colors.line,
                gap: 8,
              }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${isOpen ? "Collapse" : "Expand"} channel: ${channel.name}`}
                onPress={() => setExpanded(isOpen ? null : channel.id)}
                style={[s.row, { gap: 10 }]}
              >
                <Hash size={18} color={colors.text} />
                <View style={{ flex: 1 }}>
                  <Text style={s.text}>{channel.name}</Text>
                  <Text style={s.small}>
                    {isOrchestrator
                      ? "Control plane · queue & workers"
                      : channel.status === "archived"
                        ? "archived"
                        : `worker ${channel.workerPid ? "running" : "idle"} · ${channel.status}`}
                  </Text>
                </View>
                {!isOrchestrator && channel.status !== "archived" && (
                  <Button
                    small
                    danger
                    icon={Archive}
                    disabled={busy}
                    onPress={() =>
                      void mutate(() =>
                        api.request(`/api/agent/channels/${channel.id}/archive`, {}),
                      )
                    }
                  >
                    Archive
                  </Button>
                )}
              </Pressable>
              {isOpen && <ChannelTasks channel={channel} onOpenTask={onClose} />}
            </View>
          );
        })
      )}
      {creating ? (
        <View style={{ gap: 8 }}>
          <Field label="Channel name" value={name} onChangeText={setName} />
          <View style={[s.row, { gap: 8 }]}>
            <Button
              primary
              disabled={busy || !name.trim()}
              onPress={() =>
                void mutate(async () => {
                  const created = await api.request<Channel>("/api/agent/channels", {
                    name: name.trim(),
                  });
                  setName("");
                  setCreating(false);
                  setExpanded(created.id);
                })
              }
            >
              Create channel
            </Button>
            <Button disabled={busy} onPress={() => setCreating(false)}>
              Cancel
            </Button>
          </View>
        </View>
      ) : (
        <Button primary icon={Plus} disabled={busy} onPress={() => setCreating(true)}>
          New channel
        </Button>
      )}
    </View>
  );
}

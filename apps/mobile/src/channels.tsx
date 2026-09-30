import { useThreads } from "@copilotkit/react-native/headless";
import {
  Archive,
  Check,
  Hash,
  MessagesSquare,
  Pencil,
  Plus,
  RefreshCw,
  X,
} from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import {
  type AgentTask,
  type Channel,
  type ChannelThread,
  ORCHESTRATOR_CHANNEL_ID,
  type TaskStatus,
} from "../../../packages/domain/src/agent";
import { ChannelPermissionRules } from "./opencode-permissions";
import { useMuseThread } from "./threads";
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

function ThreadRow({
  binding,
  archived,
  onOpen,
  onRenamed,
}: {
  binding: ChannelThread;
  archived?: boolean;
  onOpen: () => void;
  onRenamed: (binding: ChannelThread) => void;
}) {
  const { api } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(binding.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    const name = draft.trim();
    if (!name || name === binding.name) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const renamed = await api.request<ChannelThread>(
        `/api/agent/threads/${binding.threadId}`,
        { name },
        "PATCH",
      );
      onRenamed(renamed);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <View style={{ gap: 4 }}>
        <View style={[s.row, { gap: 8, alignItems: "center" }]}>
          <TextInput
            autoFocus
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={() => void save()}
            maxLength={80}
            accessibilityLabel="Thread name"
            style={[s.input, { flex: 1, paddingVertical: 6 }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save thread name"
            disabled={saving}
            onPress={() => void save()}
            style={{ padding: 6 }}
          >
            <Check size={16} color={colors.blueDark} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel rename"
            onPress={() => {
              setDraft(binding.name);
              setEditing(false);
            }}
            style={{ padding: 6 }}
          >
            <X size={16} color={colors.muted} />
          </Pressable>
        </View>
        {!!error && <ErrorNotice error={error} />}
      </View>
    );
  }

  return (
    <View style={[s.row, { gap: 4, alignItems: "center" }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open thread: ${binding.name}`}
        onPress={onOpen}
        style={[s.row, { flex: 1, gap: 8, paddingVertical: 6, alignItems: "center" }]}
      >
        <MessagesSquare size={16} color={colors.muted} />
        <Text style={[s.text, { flex: 1 }]} numberOfLines={1}>
          {binding.name}
        </Text>
        {archived && <Text style={s.small}>archived</Text>}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Rename thread: ${binding.name}`}
        onPress={() => {
          setDraft(binding.name);
          setError("");
          setEditing(true);
        }}
        style={{ padding: 6 }}
      >
        <Pencil size={14} color={colors.muted} />
      </Pressable>
    </View>
  );
}

function ChannelThreads({ channel, onClose }: { channel: Channel; onClose: () => void }) {
  const { api, navigate } = useWorkspace();
  const { select } = useMuseThread();
  const [bindings, setBindings] = useState<ChannelThread[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const copilotThreads = useThreads({ agentId: "default", includeArchived: true, limit: 100 });

  const load = useCallback(async () => {
    setError("");
    try {
      setBindings(await api.request<ChannelThread[]>(`/api/agent/channels/${channel.id}/threads`));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [api, channel.id]);
  useEffect(() => {
    setBindings(null);
    void load();
  }, [load]);

  function openThread(binding: ChannelThread) {
    select({ id: binding.threadId, existing: true });
    navigate("chat");
    onClose();
  }

  async function newThread() {
    setError("");
    setBusy(true);
    try {
      const binding = await api.request<ChannelThread>(
        `/api/agent/channels/${channel.id}/threads`,
        {},
      );
      select({ id: binding.threadId, existing: false });
      navigate("chat");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const meta = new Map(copilotThreads.threads.map((t) => [t.id, t]));
  return (
    <View style={{ gap: 2 }}>
      <View style={s.between}>
        <Text style={s.small}>Threads</Text>
        <Button small icon={Plus} disabled={busy} onPress={() => void newThread()}>
          New thread
        </Button>
      </View>
      <ErrorNotice error={error} />
      {!bindings ? (
        <ActivityIndicator color={colors.blueDark} />
      ) : bindings.length === 0 ? (
        <Text style={s.muted}>No threads yet.</Text>
      ) : (
        bindings.map((binding) => {
          const thread = meta.get(binding.threadId);
          return (
            <ThreadRow
              key={binding.threadId}
              binding={binding}
              archived={thread?.archived}
              onOpen={() => openThread(binding)}
              onRenamed={(renamed) =>
                setBindings((list) =>
                  list ? list.map((b) => (b.threadId === renamed.threadId ? renamed : b)) : list,
                )
              }
            />
          );
        })
      )}
    </View>
  );
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
              {isOpen && (
                <View style={{ gap: 10 }}>
                  <ChannelThreads channel={channel} onClose={onClose} />
                  <ChannelPermissionRules channelId={channel.id} />
                  <View style={{ gap: 2 }}>
                    <Text style={s.small}>Tasks</Text>
                    <ChannelTasks channel={channel} onOpenTask={onClose} />
                  </View>
                </View>
              )}
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

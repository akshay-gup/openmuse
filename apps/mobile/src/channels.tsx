import { Archive, Hash, Plus, RefreshCw } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { type Channel, ORCHESTRATOR_CHANNEL_ID } from "../../../packages/domain/src/agent";
import { useMuseThread } from "./threads";
import { Button, colors, ErrorNotice, Field, s } from "./ui";
import { useWorkspace } from "./workspace";

/**
 * Channel list for the menu sheet. Channels open directly as chat surfaces —
 * no thread needed. Threads auto-create from replies and @hive mentions and
 * are reached from their parent message's reply count.
 */
export function ChannelsSection({ onClose }: { onClose: () => void }) {
  const { api } = useWorkspace();
  const { selection, select } = useMuseThread();
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
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

  function openChannel(channel: Channel) {
    select({ id: `channel:${channel.id}`, existing: true });
    onClose();
  }

  const userChannels = (channels ?? [])
    .filter((channel) => channel.id !== ORCHESTRATOR_CHANNEL_ID)
    .sort((a, b) => a.name.localeCompare(b.name));

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
      ) : userChannels.length === 0 ? (
        <Text style={s.muted}>No channels yet. Create one to start chatting.</Text>
      ) : (
        userChannels.map((channel) => {
          const isActive = selection.id === `channel:${channel.id}`;
          return (
            <View
              key={channel.id}
              style={{
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: colors.line,
              }}
            >
              <View style={[s.row, { gap: 10, alignItems: "center" }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open channel: ${channel.name}`}
                  onPress={() => openChannel(channel)}
                  style={[
                    s.row,
                    {
                      flex: 1,
                      gap: 10,
                      alignItems: "center",
                      paddingVertical: 6,
                      paddingHorizontal: 8,
                      borderRadius: 8,
                      backgroundColor: isActive ? "#E8EDF0" : "transparent",
                    },
                  ]}
                >
                  <Hash size={18} color={colors.text} />
                  <Text
                    style={[s.text, { flex: 1, fontWeight: isActive ? "600" : "400" }]}
                    numberOfLines={1}
                  >
                    {channel.name}
                  </Text>
                </Pressable>
                {channel.status !== "archived" && (
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
              </View>
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
                  openChannel(created);
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

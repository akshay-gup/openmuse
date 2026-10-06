import { useState } from "react";
import { Text, View } from "react-native";
import { type TaskPriority, taskPriorities } from "../../../packages/domain/src/agent";
import { useAgentWorkspace } from "./agent-workspace";
import { priorityColors } from "./task-board";
import { Button, ErrorNotice, Field, fontSize, Sheet, s } from "./ui";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

/** Create a manual issue (human task). New issues start in No project. */
export function TaskCreate({ onClose }: { onClose: () => void }) {
  const { refresh, mutate } = useAgentWorkspace();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [startAt, setStartAt] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [labels, setLabels] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Title is required.");
      return;
    }
    for (const [label, value] of [
      ["Start", startAt],
      ["Due", dueAt],
    ] as const) {
      if (value.trim() && !datePattern.test(value.trim())) {
        setError(`${label} date must be yyyy-mm-dd.`);
        return;
      }
    }
    setError("");
    setBusy(true);
    try {
      await mutate("/tasks", {
        title: trimmed,
        ...(description.trim() ? { prompt: description.trim() } : {}),
        kind: "manual",
        priority,
        startAt: startAt.trim() || null,
        dueAt: dueAt.trim() || null,
        labels: labels
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean),
      });
      await refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <Sheet title="New issue" subtitle="A human task on the board" onClose={onClose}>
      <View style={{ gap: 16 }}>
        <ErrorNotice error={error} />
        <Field
          label="Title"
          value={title}
          onChangeText={setTitle}
          placeholder="What needs doing?"
        />
        <Field
          label="Description"
          value={description}
          onChangeText={setDescription}
          multiline
          placeholder="Details, links, what done looks like. Optional."
          style={{ minHeight: 96 }}
        />
        <View style={{ gap: 6 }}>
          <Text style={s.label}>Priority</Text>
          <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
            {taskPriorities.map((item: TaskPriority) => (
              <Button
                key={item}
                small
                primary={priority === item}
                disabled={busy}
                onPress={() => setPriority(item)}
              >
                <View style={[s.row, { gap: 6 }]}>
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: priorityColors[item],
                    }}
                  />
                  <Text style={[s.text, { fontSize: fontSize.ui }]}>
                    {item[0].toUpperCase() + item.slice(1)}
                  </Text>
                </View>
              </Button>
            ))}
          </View>
        </View>
        <View style={[s.row, { gap: 10 }]}>
          <View style={{ flex: 1 }}>
            <Field
              label="Start (yyyy-mm-dd)"
              value={startAt}
              onChangeText={setStartAt}
              placeholder="—"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Due (yyyy-mm-dd)" value={dueAt} onChangeText={setDueAt} placeholder="—" />
          </View>
        </View>
        <Field
          label="Labels (comma-separated)"
          value={labels}
          onChangeText={setLabels}
          placeholder="—"
        />
        <Button primary busy={busy} onPress={() => void create()}>
          Create issue
        </Button>
      </View>
    </Sheet>
  );
}

import { useState } from "react";
import { Text, View } from "react-native";
import {
  type AgentTask,
  type TaskPriority,
  type TaskStatus,
  taskPriorities,
} from "../../../packages/domain/src/agent";
import { useAgentWorkspace } from "./agent-workspace";
import { priorityColors } from "./task-board";
import { Button, ErrorNotice, Field, Sheet, s } from "./ui";
import { useWorkspace } from "./workspace";

const manualTransitions: TaskStatus[] = ["queued", "running", "paused", "succeeded", "cancelled"];
const workerTransitions: TaskStatus[] = ["queued", "paused", "cancelled"];

function statusLabel(status: TaskStatus): string {
  return status
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

/** Full edit sheet for a task: fields, priority, dates, labels, status, delete. */
export function TaskDetail({
  task,
  tasks,
  onClose,
}: {
  task: AgentTask;
  tasks: AgentTask[];
  onClose: () => void;
}) {
  const { api } = useWorkspace();
  const { refresh } = useAgentWorkspace();
  const [title, setTitle] = useState(task.title);
  const [startAt, setStartAt] = useState(task.startAt ?? "");
  const [dueAt, setDueAt] = useState(task.dueAt ?? "");
  const [labels, setLabels] = useState(task.labels.join(", "));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);

  const manual = task.kind === "manual";
  const transitions = manual ? manualTransitions : workerTransitions;
  const blockers = task.blockedBy
    .map((id) => tasks.find((t) => t.id === id))
    .filter((t): t is AgentTask => !!t);

  async function patch(body: Record<string, unknown>) {
    setError("");
    setBusy(true);
    try {
      await api.request(`/api/agent/tasks/${task.id}`, body, "PATCH");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function saveFields() {
    if (!title.trim()) {
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
    void patch({
      title: title.trim(),
      startAt: startAt.trim() || null,
      dueAt: dueAt.trim() || null,
      labels: labels
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
    });
  }

  async function remove() {
    setError("");
    setBusy(true);
    try {
      await api.request(`/api/agent/tasks/${task.id}`, undefined, "DELETE");
      await refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <Sheet title={manual ? "Issue" : "Task"} subtitle={statusLabel(task.status)} onClose={onClose}>
      <View style={{ gap: 14 }}>
        <ErrorNotice error={error} />
        <Field label="Title" value={title} onChangeText={setTitle} />
        <View style={{ gap: 6 }}>
          <Text style={s.label}>Priority</Text>
          <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
            {taskPriorities.map((priority: TaskPriority) => {
              const active = task.priority === priority;
              return (
                <Button
                  key={priority}
                  small
                  primary={active}
                  disabled={busy}
                  onPress={() => void patch({ priority })}
                >
                  <View style={[s.row, { gap: 6 }]}>
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: priorityColors[priority],
                      }}
                    />
                    <Text style={[s.text, { fontSize: 14 }]}>
                      {priority[0].toUpperCase() + priority.slice(1)}
                    </Text>
                  </View>
                </Button>
              );
            })}
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
        <Button primary disabled={busy} onPress={saveFields}>
          Save changes
        </Button>
        <View style={{ gap: 6 }}>
          <Text style={s.label}>Move to</Text>
          <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
            {transitions.map((status) => (
              <Button
                key={status}
                small
                primary={task.status === status}
                disabled={busy}
                onPress={() => void patch({ status })}
              >
                {statusLabel(status)}
              </Button>
            ))}
          </View>
          {!manual && (
            <Text style={s.small}>
              Worker tasks can only be queued, paused, or cancelled by hand.
            </Text>
          )}
        </View>
        {!!blockers.length && (
          <View style={{ gap: 4 }}>
            <Text style={s.label}>Blocked by</Text>
            {blockers.map((blocker) => (
              <Text key={blocker.id} style={s.muted} numberOfLines={1}>
                · {blocker.title}
              </Text>
            ))}
          </View>
        )}
        <Button
          danger
          disabled={busy}
          onPress={() => {
            if (armed) void remove();
            else {
              setArmed(true);
              setTimeout(() => setArmed(false), 4000);
            }
          }}
        >
          {armed ? "Tap again to confirm delete" : "Delete"}
        </Button>
      </View>
    </Sheet>
  );
}

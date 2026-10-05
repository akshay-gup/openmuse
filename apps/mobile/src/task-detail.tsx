import { useState } from "react";
import { Text, View } from "react-native";
import {
  type AgentTask,
  type Project,
  type TaskPriority,
  type TaskStatus,
  taskPriorities,
} from "../../../packages/domain/src/agent";
import { useAgentWorkspace } from "./agent-workspace";
import DateOnlyField from "./DateOnlyField";
import { TaskAttention } from "./task-attention";
import { priorityColors } from "./task-board";
import { TaskRunView } from "./task-run";
import { Button, colors, ErrorNotice, Field, Segmented, Sheet, s } from "./ui";
import { useWorkspace } from "./workspace";

const manualTransitions: TaskStatus[] = ["queued", "running", "succeeded", "failed"];
const workerTransitions: TaskStatus[] = ["queued", "paused", "cancelled"];

function statusLabel(status: TaskStatus): string {
  switch (status) {
    case "queued":
      return "To Do";
    case "running":
      return "In Progress";
    case "succeeded":
      return "Done";
    case "failed":
      return "Failed";
    case "paused":
      return "Paused";
    case "cancelled":
      return "Cancelled";
    default:
      return status
        .split("_")
        .map((part) => part[0].toUpperCase() + part.slice(1))
        .join(" ");
  }
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

/** Full sheet for a task: what it needs from you, its run, quick changes, then editable details. */
export function TaskDetail({
  task,
  tasks,
  projects,
  onClose,
}: {
  task: AgentTask;
  tasks: AgentTask[];
  projects: Project[];
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
    <Sheet
      title={task.title}
      subtitle={`${manual ? "Issue" : "Agent task"} · ${statusLabel(task.status)}`}
      onClose={onClose}
    >
      <View style={{ gap: 20 }}>
        <ErrorNotice error={error} />
        {!manual && <TaskAttention task={task} onBeforeOpen={onClose} />}
        {(!manual || task.attempts > 0) && <TaskRunView task={task} />}

        <View style={{ gap: 6 }}>
          <Text style={s.label}>Status</Text>
          <Segmented
            label="Move to"
            value={task.status}
            disabled={busy}
            onChange={(status) => void patch({ status })}
            options={transitions.map((status) => ({ id: status, label: statusLabel(status) }))}
          />
          {!manual && (
            <Text style={s.small}>
              Worker tasks can only be queued, paused, or cancelled by hand.
            </Text>
          )}
        </View>

        <View style={{ gap: 6 }}>
          <Text style={s.label}>Priority</Text>
          <Segmented<TaskPriority>
            label="Priority"
            value={task.priority}
            disabled={busy}
            onChange={(priority) => void patch({ priority })}
            options={taskPriorities.map((priority) => ({
              id: priority,
              label: priority[0].toUpperCase() + priority.slice(1),
              dot: priorityColors[priority],
            }))}
          />
        </View>

        <View style={{ gap: 6 }}>
          <Text style={s.label}>Assignee</Text>
          <Segmented<"none" | "agent">
            label="Assignee"
            value={task.assignee === "agent" ? "agent" : "none"}
            disabled={busy}
            onChange={(assignee) => void patch({ assignee: assignee === "agent" ? "agent" : null })}
            options={[
              { id: "none", label: "Unassigned" },
              { id: "agent", label: "Agent" },
            ]}
          />
          {manual && !task.assignee && (
            <Text style={s.small}>Assign to the agent to have it run this issue.</Text>
          )}
          {task.assignee === "agent" && (
            <Text style={s.small}>
              The agent runs this ticket, grounded in the channel discussion.
            </Text>
          )}
        </View>

        <View style={{ gap: 6 }}>
          <Text style={s.label}>Project</Text>
          <Segmented<string>
            label="Project"
            value={task.projectId ?? "none"}
            disabled={busy}
            onChange={(projectId) =>
              void patch({ projectId: projectId === "none" ? null : projectId })
            }
            options={[
              { id: "none", label: "No project" },
              ...projects.map((project) => ({ id: project.id, label: project.name })),
            ]}
          />
        </View>

        <View style={{ height: 1, backgroundColor: colors.line }} />

        <View style={{ gap: 4 }}>
          <Text style={s.label}>Details</Text>
          <Text style={s.small}>Changes here are saved with the button below.</Text>
        </View>
        <View>
          <Field label="Title" value={title} onChangeText={setTitle} />
          <View style={[s.row, { gap: 10, alignItems: "flex-start" }]}>
            <View style={{ flex: 1 }}>
              <DateOnlyField label="Start date" value={startAt} onChange={setStartAt} />
            </View>
            <View style={{ flex: 1 }}>
              <DateOnlyField label="Due date" value={dueAt} onChange={setDueAt} />
            </View>
          </View>
          <Field
            label="Labels (comma-separated)"
            value={labels}
            onChangeText={setLabels}
            placeholder="errands, trip"
          />
          <Button primary disabled={busy} onPress={saveFields}>
            Save details
          </Button>
        </View>

        {!!blockers.length && (
          <View style={{ gap: 8 }}>
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
          {armed ? "Press again to confirm delete" : "Delete"}
        </Button>
      </View>
    </Sheet>
  );
}

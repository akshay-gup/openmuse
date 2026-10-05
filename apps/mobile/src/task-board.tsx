import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  type AgentTask,
  type TaskColumn,
  type TaskPriority,
  type TaskStatus,
  taskColumn,
} from "../../../packages/domain/src/agent";
import { Button, colors, fontSize, radius, s, shadow, type WebPressState } from "./ui";

const columns: { id: TaskColumn; title: string }[] = [
  { id: "todo", title: "To Do" },
  { id: "doing", title: "In Progress" },
  { id: "done", title: "Done" },
  { id: "failed", title: "Failed" },
];

export const priorityColors: Record<TaskPriority, string> = {
  low: colors.neutral,
  medium: colors.primary,
  high: colors.warning,
  urgent: colors.danger,
};

export const statusMeta: Record<TaskStatus, { label: string; dot: string }> = {
  queued: { label: "QUEUED", dot: colors.neutral },
  running: { label: "RUNNING", dot: colors.success },
  waiting_approval: { label: "NEEDS REVIEW", dot: colors.warning },
  waiting_input: { label: "NEEDS YOU", dot: colors.warning },
  scheduled: { label: "SCHEDULED", dot: colors.neutral },
  paused: { label: "PAUSED", dot: colors.neutral },
  succeeded: { label: "DONE", dot: colors.success },
  failed: { label: "FAILED", dot: colors.danger },
  cancelled: { label: "CANCELLED", dot: colors.neutral },
};

/** Manual issues read as a to-do list; agent tasks use the worker's own vocabulary. */
export function taskStatusLabel(task: Pick<AgentTask, "kind" | "status">): string {
  if (task.kind === "manual") {
    if (task.status === "queued") return "TO DO";
    if (task.status === "running") return "IN PROGRESS";
  }
  return statusMeta[task.status].label;
}

export function formatDue(dueAt: string | null | undefined): string | null {
  if (!dueAt) return null;
  const date = new Date(`${dueAt}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dueAt;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Past its due date and still open. Due dates are whole days, so a task due today is not overdue. */
export function isOverdue(task: Pick<AgentTask, "dueAt" | "status">): boolean {
  if (!task.dueAt || task.status === "succeeded" || task.status === "cancelled") return false;
  const end = new Date(`${task.dueAt}T23:59:59`);
  return !Number.isNaN(end.getTime()) && end.getTime() < Date.now();
}

export function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function excerpt(text: string | undefined | null, max = 140): string | null {
  const clean = (text ?? "").trim().replace(/\s+/g, " ");
  if (!clean) return null;
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** Rich worker card: status, current activity, plan progress, and quick actions. */
export function TaskBoardCard({
  task,
  onPress,
  onControl,
}: {
  task: AgentTask;
  onPress: () => void;
  onControl?: (taskId: string, action: "pause" | "resume" | "retry") => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const manual = task.kind === "manual";
  const due = formatDue(task.dueAt);
  const meta = statusMeta[task.status];
  const runningStep = task.plan.find((step) => step.status === "running");
  const doneSteps = task.plan.filter((step) => step.status === "succeeded").length;
  const updated = ago(task.updatedAt);
  const overdue = isOverdue(task);

  // What the card leads with under the title: the live step, a question or
  // error needing attention, or the task's own description.
  const activity =
    runningStep?.title ??
    (task.status === "waiting_input" ? task.question : null) ??
    (task.status === "failed" ? task.error : null) ??
    excerpt(task.status === "succeeded" ? task.result : task.prompt, 120);

  async function control(action: "pause" | "resume" | "retry") {
    if (!onControl || busy) return;
    setBusy(true);
    try {
      await onControl(task.id, action);
    } finally {
      setBusy(false);
    }
  }
  const pausable = ["running", "waiting_approval", "waiting_input", "scheduled"].includes(
    task.status,
  );

  return (
    <View
      style={{
        flexShrink: 0,
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: task.status === "failed" ? colors.dangerLine : colors.line,
        boxShadow: shadow.card,
        overflow: "hidden",
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${manual ? "issue" : "task"}: ${task.title}`}
        onPress={onPress}
        style={({ pressed, hovered }: WebPressState) => ({
          padding: 14,
          gap: 10,
          backgroundColor: pressed
            ? colors.surfaceMuted
            : hovered
              ? colors.surfaceMuted
              : colors.surface,
        })}
      >
        <View style={[s.row, { gap: 8 }]}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: meta.dot }} />
          <Text style={[s.small, { fontWeight: "800", letterSpacing: 0.5 }]}>
            {taskStatusLabel(task)}
          </Text>
          <View style={{ flex: 1 }} />
          {!!updated && <Text style={s.small}>{updated}</Text>}
        </View>
        <Text
          style={[s.text, { fontSize: fontSize.ui, lineHeight: 20, fontWeight: "600" }]}
          numberOfLines={3}
        >
          {task.title}
        </Text>
        {!!activity && (
          <Text style={s.muted} numberOfLines={3}>
            {activity}
          </Text>
        )}
        {!manual && task.plan.length > 0 && (
          <View style={{ gap: 4 }}>
            <View
              style={{
                height: 6,
                borderRadius: 3,
                backgroundColor: colors.line,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: meta.dot,
                  width: `${Math.round((doneSteps / task.plan.length) * 100)}%`,
                }}
              />
            </View>
            <Text style={s.small}>
              {doneSteps}/{task.plan.length} steps
              {task.attempts > 1 ? ` · attempt ${task.attempts}` : ""}
            </Text>
          </View>
        )}
        <View style={[s.row, { gap: 6, flexWrap: "wrap" }]}>
          <View
            style={{
              backgroundColor: manual ? colors.surfaceMuted : colors.primarySoft,
              borderRadius: radius.md,
              paddingHorizontal: 9,
              paddingVertical: 4,
            }}
          >
            <Text style={[s.small, { fontWeight: "700" }]}>{manual ? "Manual" : "Agent"}</Text>
          </View>
          {task.assignee === "agent" && (
            <View
              style={{
                backgroundColor: colors.warningBg,
                borderRadius: radius.md,
                paddingHorizontal: 9,
                paddingVertical: 4,
              }}
            >
              <Text style={[s.small, { fontWeight: "700" }]}>Assigned</Text>
            </View>
          )}
          {!!due && (
            <View
              style={{
                backgroundColor: overdue ? colors.dangerBg : colors.surfaceMuted,
                borderRadius: radius.md,
                paddingHorizontal: 9,
                paddingVertical: 4,
              }}
            >
              <Text style={[s.small, overdue && { color: colors.danger, fontWeight: "700" }]}>
                {overdue ? `Overdue · ${due}` : `Due ${due}`}
              </Text>
            </View>
          )}
          {!!task.blockedBy.length && (
            <Text style={s.small}>Blocked by {task.blockedBy.length}</Text>
          )}
        </View>
      </Pressable>
      {!manual &&
        onControl &&
        (pausable || task.status === "paused" || task.status === "failed") && (
          <View style={[s.row, { gap: 8, paddingHorizontal: 14, paddingBottom: 14 }]}>
            {pausable && (
              <Button small disabled={busy} onPress={() => void control("pause")}>
                Pause
              </Button>
            )}
            {task.status === "paused" && (
              <Button small disabled={busy} onPress={() => void control("resume")}>
                Resume
              </Button>
            )}
            {task.status === "failed" && (
              <Button small disabled={busy} onPress={() => void control("retry")}>
                Retry
              </Button>
            )}
          </View>
        )}
    </View>
  );
}

/** Columns grow with their cards; narrow containers scroll sideways inside the page. */
export function TaskBoard({
  tasks,
  onSelect,
  onControl,
}: {
  tasks: AgentTask[];
  onSelect: (task: AgentTask) => void;
  onControl?: (taskId: string, action: "pause" | "resume" | "retry") => Promise<void>;
}) {
  const [width, setWidth] = useState(0);
  const wide = width >= 4 * 260 + 3 * 12;
  const byColumn = (column: TaskColumn) => tasks.filter((t) => taskColumn(t.status) === column);
  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={{ minWidth: 0 }}>
      <ScrollView
        horizontal
        accessibilityLabel="Task board"
        style={{ flexGrow: 0, flexShrink: 0 }}
        showsHorizontalScrollIndicator={!wide}
        contentContainerStyle={{
          flexDirection: "row",
          alignItems: "stretch",
          gap: 12,
          flexGrow: 1,
        }}
      >
        {columns.map((column) => {
          const items = byColumn(column.id);
          return (
            <View
              key={column.id}
              style={{
                width: wide ? undefined : 260,
                minWidth: 260,
                flexShrink: 0,
                flex: wide ? 1 : undefined,
                gap: 10,
                backgroundColor: colors.surfaceMuted,
                borderRadius: radius.xl,
                padding: 12,
              }}
            >
              <View style={[s.row, { gap: 8, alignItems: "center", paddingHorizontal: 4 }]}>
                <Text style={[s.text, { fontWeight: "700", fontSize: fontSize.ui }]}>
                  {column.title}
                </Text>
                <View
                  style={{
                    backgroundColor: colors.surface,
                    borderRadius: radius.md,
                    paddingHorizontal: 9,
                    paddingVertical: 3,
                  }}
                >
                  <Text style={[s.small, { fontWeight: "700" }]}>{items.length}</Text>
                </View>
              </View>
              {items.map((task) => (
                <TaskBoardCard
                  key={task.id}
                  task={task}
                  onPress={() => onSelect(task)}
                  onControl={onControl}
                />
              ))}
              {!items.length && <Text style={[s.small, { padding: 8 }]}>Nothing here.</Text>}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

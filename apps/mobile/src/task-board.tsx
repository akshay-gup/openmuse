import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import {
  type AgentTask,
  type TaskColumn,
  type TaskPriority,
  taskColumn,
} from "../../../packages/domain/src/agent";
import { colors, s } from "./ui";

const columns: { id: TaskColumn; title: string }[] = [
  { id: "todo", title: "To Do" },
  { id: "doing", title: "In Progress" },
  { id: "done", title: "Done" },
  { id: "failed", title: "Failed" },
];

export const priorityColors: Record<TaskPriority, string> = {
  low: "#9AA3A8",
  medium: colors.blueDark,
  high: "#D97A2B",
  urgent: colors.danger,
};

function formatDue(dueAt: string | null | undefined): string | null {
  if (!dueAt) return null;
  const date = new Date(`${dueAt}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dueAt;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function TaskBoardCard({ task, onPress }: { task: AgentTask; onPress: () => void }) {
  const manual = task.kind === "manual";
  const due = formatDue(task.dueAt);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open issue: ${task.title}`}
      onPress={onPress}
      style={({ pressed }) => [
        {
          backgroundColor: "#FFFFFF",
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.line,
          padding: 14,
          gap: 10,
          opacity: pressed ? 0.92 : 1,
        },
      ]}
    >
      <View style={[s.row, { gap: 10 }]}>
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: priorityColors[task.priority] ?? priorityColors.medium,
          }}
        />
        <Text style={[s.text, { flex: 1, fontSize: 14, lineHeight: 20 }]} numberOfLines={3}>
          {task.title}
        </Text>
      </View>
      <View style={[s.row, { gap: 6, flexWrap: "wrap" }]}>
        <View
          style={{
            backgroundColor: manual ? colors.lavender : colors.sky,
            borderRadius: 10,
            paddingHorizontal: 9,
            paddingVertical: 4,
          }}
        >
          <Text style={[s.small, { fontWeight: "700" }]}>{manual ? "Manual" : "Agent"}</Text>
        </View>
        {!!due && (
          <View
            style={{
              backgroundColor: "#F4F4F6",
              borderRadius: 10,
              paddingHorizontal: 9,
              paddingVertical: 4,
            }}
          >
            <Text style={s.small}>Due {due}</Text>
          </View>
        )}
        {!!task.blockedBy.length && <Text style={s.small}>Blocked by {task.blockedBy.length}</Text>}
      </View>
    </Pressable>
  );
}

/** Kanban board: three columns fed by taskColumn(). Tap a card to open detail. */
export function TaskBoard({
  tasks,
  onSelect,
}: {
  tasks: AgentTask[];
  onSelect: (task: AgentTask) => void;
}) {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const byColumn = (column: TaskColumn) => tasks.filter((t) => taskColumn(t.status) === column);
  return (
    <ScrollView
      horizontal={!wide}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 12, flexGrow: 1 }}
    >
      {columns.map((column) => {
        const items = byColumn(column.id);
        return (
          <View
            key={column.id}
            style={{
              width: wide ? undefined : 300,
              flex: wide ? 1 : undefined,
              gap: 10,
              backgroundColor: "#F4F4F6",
              borderRadius: 18,
              padding: 12,
            }}
          >
            <View style={[s.row, { gap: 8, alignItems: "center", paddingHorizontal: 4 }]}>
              <Text style={[s.text, { fontWeight: "700", fontSize: 14 }]}>{column.title}</Text>
              <View
                style={{
                  backgroundColor: "#FFFFFF",
                  borderRadius: 10,
                  paddingHorizontal: 9,
                  paddingVertical: 3,
                }}
              >
                <Text style={[s.small, { fontWeight: "700" }]}>{items.length}</Text>
              </View>
            </View>
            {items.map((task) => (
              <TaskBoardCard key={task.id} task={task} onPress={() => onSelect(task)} />
            ))}
            {!items.length && <Text style={[s.small, { padding: 8 }]}>Nothing here.</Text>}
          </View>
        );
      })}
    </ScrollView>
  );
}

import { useState } from "react";
import { Text } from "react-native";
import type { Workspace } from "../../../packages/domain/src";
import type { AgentTask } from "../../../packages/domain/src/agent";
import { useAgentWorkspace } from "./agent-workspace";
import { isMine, requesterName } from "./reviews";
import { Button, Card, CheckRow, colors, ErrorNotice, Field, s } from "./ui";
import { useWorkspace } from "./workspace";

function errorText(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

/**
 * What a task needs from a person: review of a prepared action, or missing details.
 * Every task sheet shows this first, so a waiting task can be acted on wherever it was opened.
 */
export function TaskAttention({
  task,
  onBeforeOpen,
}: {
  task: AgentTask;
  /** Called before another sheet opens (for example the action review), so sheets never stack. */
  onBeforeOpen?: () => void;
}) {
  const { api, open, refresh: refreshWorkspace, workspace } = useWorkspace();
  const { mutate } = useAgentWorkspace();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [answer, setAnswer] = useState("");
  const [fieldJson, setFieldJson] = useState("");
  const [showFieldJson, setShowFieldJson] = useState(false);
  const [fields, setFields] = useState<Record<string, string | boolean>>({});
  if (task.status !== "waiting_approval" && task.status !== "waiting_input") return null;

  const missing = Array.isArray(task.state.missingFields) ? task.state.missingFields : [];
  const fieldNames = missing
    .map((field) =>
      typeof field === "string"
        ? field
        : typeof field === "object" && field && "name" in field
          ? String(field.name)
          : "",
    )
    .filter(Boolean);

  async function submitInput() {
    setBusy(true);
    setError("");
    try {
      let parsed: Record<string, string | boolean> = fields;
      if (fieldJson.trim()) {
        const raw: unknown = JSON.parse(fieldJson);
        if (
          !raw ||
          typeof raw !== "object" ||
          Array.isArray(raw) ||
          Object.values(raw).some(
            (value) => typeof value !== "string" && typeof value !== "boolean",
          )
        )
          throw new Error("Form fields must be a JSON object with text or true/false values.");
        parsed = raw as Record<string, string | boolean>;
      }
      await mutate(`/tasks/${task.id}/input`, {
        answer: answer.trim() || "Provided the requested fields.",
        fields: parsed,
      });
      setAnswer("");
      setFields({});
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function review() {
    setBusy(true);
    setError("");
    try {
      await refreshWorkspace();
      const snapshot = await api.request<Workspace>("/api/workspace");
      const action = snapshot.actions.find((item) => item.id === task.actionId);
      if (!action) throw new Error("This review is not available yet. Refresh and try again.");
      onBeforeOpen?.();
      open({ type: "review", action });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (task.status === "waiting_approval") {
    // Anyone can open the review; approving is for the person whose Google account it runs on.
    const mine = isMine(task, workspace.profile.id);
    return (
      <Card style={{ backgroundColor: colors.primarySoft, gap: 12 }}>
        <Text style={s.heading}>
          {mine ? "Ready for your review" : `Waiting on ${requesterName(task)}`}
        </Text>
        <Text style={s.muted}>
          {mine
            ? "Review the exact action and account before it proceeds."
            : "Only they can approve this, because it runs on their Google account."}
        </Text>
        <ErrorNotice error={error} />
        <Button primary={mine} busy={busy} onPress={() => void review()}>
          {mine ? "Review action" : "View review"}
        </Button>
      </Card>
    );
  }
  return (
    <Card style={{ backgroundColor: colors.primarySoft, gap: 12 }}>
      <Text style={s.heading}>{task.question || "A detail from you will help"}</Text>
      {fieldNames.map((name) =>
        missing.some(
          (f) => typeof f === "object" && f && f.name === name && f.type === "checkbox",
        ) ? (
          <CheckRow
            key={name}
            label={name.replace(/_/g, " ")}
            checked={Boolean(fields[name])}
            onPress={() => setFields((current) => ({ ...current, [name]: !current[name] }))}
          />
        ) : (
          <Field
            key={name}
            label={name.replace(/_/g, " ")}
            value={String(fields[name] ?? "")}
            onChangeText={(value) => setFields((current) => ({ ...current, [name]: value }))}
          />
        ),
      )}
      {!fieldNames.length && (
        <Field
          label="Your answer"
          value={answer}
          onChangeText={setAnswer}
          multiline
          placeholder="Add the missing details…"
        />
      )}
      {task.kind === "document" && !fieldNames.length && (
        <>
          <Button small onPress={() => setShowFieldJson(!showFieldJson)}>
            Form field values
          </Button>
          {showFieldJson && (
            <Field
              label="Fields (JSON: field name to value)"
              value={fieldJson}
              onChangeText={setFieldJson}
              multiline
              autoCapitalize="none"
              placeholder={'{"full_name":"Your name","consent":true}'}
            />
          )}
        </>
      )}
      <ErrorNotice error={error} />
      <Button
        primary
        busy={busy}
        disabled={!answer.trim() && !Object.keys(fields).length && !fieldJson.trim()}
        onPress={() => void submitInput()}
      >
        Continue task
      </Button>
    </Card>
  );
}

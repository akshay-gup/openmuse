import { ArrowUp } from "lucide-react-native";
import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { colors, ErrorNotice, s } from "./ui";

/** Opening a reply is local draft state. Only submitting it creates a thread. */
export function DraftReply({
  value,
  onChange,
  onSend,
}: {
  value: string;
  onChange: (text: string) => void;
  onSend: (text: string) => Promise<void>;
}) {
  const sending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    if (!value.trim() || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      await onSend(value.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  return (
    <View style={{ flex: 1, justifyContent: "flex-end", paddingTop: 16 }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ErrorNotice error={error} />
        <View
          style={[
            s.row,
            {
              padding: 8,
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: 18,
              backgroundColor: "#FFFFFF",
              gap: 8,
            },
          ]}
        >
          <TextInput
            accessibilityLabel="Reply in thread"
            placeholder="Write a reply…"
            value={value}
            onChangeText={onChange}
            multiline
            autoFocus
            editable={!busy}
            style={[s.text, { flex: 1, minHeight: 44, maxHeight: 140, padding: 10 }]}
            onKeyPress={
              Platform.OS === "web"
                ? (event) => {
                    if (
                      event.nativeEvent.key === "Enter" &&
                      !("shiftKey" in event.nativeEvent && event.nativeEvent.shiftKey)
                    ) {
                      event.preventDefault();
                      void submit();
                    }
                  }
                : undefined
            }
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={busy ? "Sending reply" : "Send reply"}
            disabled={busy || !value.trim()}
            onPress={() => void submit()}
            style={{
              width: 44,
              height: 44,
              borderRadius: 24,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: value.trim() ? colors.blue : colors.line,
              opacity: busy ? 0.5 : 1,
            }}
          >
            <ArrowUp size={24} color={colors.text} />
          </Pressable>
        </View>
        <Text style={[s.small, { paddingTop: 8, paddingHorizontal: 8 }]}>
          Mention @hive for an agent reply
        </Text>
      </KeyboardAvoidingView>
    </View>
  );
}

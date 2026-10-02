import { Copy, MessageSquare, Share2 } from "lucide-react-native";
import { useState } from "react";
import { Platform, Pressable, Share, Text, useWindowDimensions, View } from "react-native";
import { AssistantResponse } from "./assistant-response";
import { colors, s } from "./ui";

export function ChannelMessage({
  text,
  author,
  assistant,
  onReply,
  replyCount = 0,
  hasThread,
  replyDisabled,
  selected,
  grouped = false,
  timestamp,
  onNotify,
}: {
  text: string;
  author: string;
  assistant?: boolean;
  onReply?: () => void;
  replyCount?: number;
  hasThread?: boolean;
  replyDisabled?: boolean;
  selected?: boolean;
  onNotify: (message: string) => void;
  grouped?: boolean;
  timestamp?: number;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const { width } = useWindowDimensions();
  const actionsVisible = Platform.OS !== "web" || width < 900 || hovered || focused;
  async function copy() {
    try {
      if (Platform.OS === "web") {
        await navigator.clipboard.writeText(text);
        onNotify("Message copied");
      } else await Share.share({ message: text });
    } catch {
      onNotify("Could not copy message. Select the text to copy it.");
    }
  }
  return (
    <Pressable
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onLongPress={onReply}
      delayLongPress={350}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        paddingHorizontal: 10,
        paddingVertical: grouped ? 5 : 12,
        borderRadius: 8,
        backgroundColor: selected ? colors.sky : hovered ? "#F4F5F7" : "transparent",
      }}
    >
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            backgroundColor: assistant ? colors.blue : colors.lavender,
            opacity: grouped ? 0 : 1,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={[s.text, { fontWeight: "700" }]}>{author.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
          {!grouped && (
            <View style={[s.row, { gap: 8, paddingRight: 72 }]}>
              <Text style={[s.text, { fontWeight: "700" }]}>{author}</Text>
              {timestamp && (
                <Text style={s.small}>
                  {new Date(timestamp).toLocaleTimeString(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </Text>
              )}
            </View>
          )}
          <View
            style={[
              s.row,
              {
                gap: 4,
                position: "absolute",
                right: 0,
                top: grouped ? -4 : -6,
                opacity: actionsVisible ? 1 : 0,
                zIndex: 1,
                backgroundColor: "#FFFFFF",
                borderWidth: 1,
                borderColor: colors.line,
                borderRadius: 9,
                padding: 2,
              },
            ]}
          >
            {onReply && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Reply in thread"
                disabled={replyDisabled}
                onPress={onReply}
                style={({ pressed }) => ({
                  padding: 7,
                  borderRadius: 6,
                  opacity: replyDisabled ? 0.4 : 1,
                  backgroundColor: pressed ? colors.blue : "#FFFFFF",
                })}
              >
                <MessageSquare size={16} color={colors.muted} />
              </Pressable>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={Platform.OS === "web" ? "Copy message" : "Share message"}
              onPress={() => void copy()}
              style={({ pressed }) => ({
                padding: 7,
                borderRadius: 6,
                backgroundColor: pressed ? colors.blue : "#FFFFFF",
              })}
            >
              {Platform.OS === "web" ? (
                <Copy size={16} color={colors.muted} />
              ) : (
                <Share2 size={16} color={colors.muted} />
              )}
            </Pressable>
          </View>
          {assistant ? (
            <AssistantResponse content={text} />
          ) : (
            <Text selectable style={s.text}>
              {text}
            </Text>
          )}
          {onReply && hasThread && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                replyCount ? `Open thread, ${replyCount} replies` : "Reply in thread"
              }
              disabled={replyDisabled}
              onPress={onReply}
              style={{ alignSelf: "flex-start", paddingVertical: 6 }}
            >
              <Text style={{ color: colors.blueDark, fontSize: 13, fontWeight: "600" }}>
                {replyCount
                  ? `${replyCount} ${replyCount === 1 ? "reply" : "replies"}`
                  : hasThread
                    ? "Thread started · 0 replies"
                    : "Reply in thread"}
                {selected ? " · Viewing thread" : ""}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </Pressable>
  );
}

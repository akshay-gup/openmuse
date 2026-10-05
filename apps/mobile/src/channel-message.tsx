import { Copy, type LucideIcon, MessageSquare, Share2 } from "lucide-react-native";
import { useState } from "react";
import { Platform, Pressable, Share, Text, useWindowDimensions, View } from "react-native";
import { useAgentWorkspace } from "./agent-workspace";
import { AssistantResponse } from "./assistant-response";
import { colors, Mascot, s, type WebPressState } from "./ui";

const authorTints = [colors.lavender, colors.green, colors.orange, colors.sky, "#F6EAF4"];
/** A stable tint per person, so a busy channel is easier to scan than a wall of identical tiles. */
function authorTint(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return authorTints[hash % authorTints.length];
}

function clock(timestamp: number, withPeriod = true): string {
  const label = new Date(timestamp).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return withPeriod ? label : label.replace(/\s?[AP]M$/i, "");
}

function ActionPill({
  icon: Icon,
  label,
  onPress,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.row,
        {
          gap: 6,
          minHeight: 36,
          paddingHorizontal: 12,
          borderRadius: 999,
          backgroundColor: pressed ? colors.blue : "#F1F2F3",
          opacity: disabled ? 0.4 : 1,
        },
      ]}
    >
      <Icon size={15} color={colors.text} />
      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text }}>{label}</Text>
    </Pressable>
  );
}

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
  const [expanded, setExpanded] = useState(false);
  const { width } = useWindowDimensions();
  const { data } = useAgentWorkspace();
  // Pointer devices get a hover toolbar. Touch layouts tap a message to reveal its actions
  // inline, because a floating toolbar on every message covers the text it belongs to.
  const hoverUi = Platform.OS === "web" && width >= 900;
  const toolbarVisible = hovered || focused;
  const webCopy = Platform.OS === "web";
  async function copy() {
    try {
      if (webCopy) {
        await navigator.clipboard.writeText(text);
        onNotify("Message copied");
      } else await Share.share({ message: text });
    } catch {
      onNotify("Could not copy message. Select the text to copy it.");
    }
  }
  const showGutterTime = grouped && !!timestamp && hoverUi && toolbarVisible;
  return (
    <Pressable
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={hoverUi ? undefined : () => setExpanded((open) => !open)}
      onLongPress={onReply}
      delayLongPress={350}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      accessibilityActions={[
        ...(onReply ? [{ name: "reply", label: "Reply in thread" }] : []),
        { name: "copy", label: webCopy ? "Copy message" : "Share message" },
      ]}
      onAccessibilityAction={({ nativeEvent }) => {
        if (nativeEvent.actionName === "reply") onReply?.();
        else if (nativeEvent.actionName === "copy") void copy();
      }}
      style={{
        paddingHorizontal: 12,
        paddingVertical: grouped ? 4 : 12,
        borderRadius: 12,
        backgroundColor: selected ? colors.sky : hovered ? "#F4F5F7" : "transparent",
      }}
    >
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ width: 36, alignItems: "center" }}>
          {grouped ? (
            showGutterTime && (
              <Text style={[s.small, { fontSize: 10, lineHeight: 22 }]}>
                {clock(timestamp, false)}
              </Text>
            )
          ) : assistant ? (
            <Mascot size={36} variant={data?.identity.avatar} />
          ) : (
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                backgroundColor: authorTint(author),
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={[s.text, { fontWeight: "700" }]}>
                {author.slice(0, 1).toUpperCase()}
              </Text>
            </View>
          )}
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          {!grouped && (
            <View style={[s.row, { gap: 8 }]}>
              <Text style={[s.text, { fontWeight: "700" }]}>{author}</Text>
              {!!timestamp && <Text style={s.small}>{clock(timestamp)}</Text>}
            </View>
          )}
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
              style={{ alignSelf: "flex-start", paddingVertical: 8 }}
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
          {!hoverUi && expanded && (
            <View style={[s.row, { gap: 8, paddingTop: 4, flexWrap: "wrap" }]}>
              {onReply && (
                <ActionPill
                  icon={MessageSquare}
                  label="Reply"
                  disabled={replyDisabled}
                  onPress={() => {
                    setExpanded(false);
                    onReply();
                  }}
                />
              )}
              <ActionPill
                icon={webCopy ? Copy : Share2}
                label={webCopy ? "Copy" : "Share"}
                onPress={() => {
                  setExpanded(false);
                  void copy();
                }}
              />
            </View>
          )}
        </View>
      </View>
      {hoverUi && (
        <View
          pointerEvents={toolbarVisible ? "auto" : "none"}
          style={[
            s.row,
            {
              gap: 2,
              position: "absolute",
              right: 12,
              top: -16,
              opacity: toolbarVisible ? 1 : 0,
              zIndex: 1,
              backgroundColor: "#FFFFFF",
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: 10,
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
              style={({ pressed, hovered: over }: WebPressState) => ({
                padding: 7,
                borderRadius: 8,
                opacity: replyDisabled ? 0.4 : 1,
                backgroundColor: pressed ? colors.blue : over ? "#F1F2F3" : "#FFFFFF",
              })}
            >
              <MessageSquare size={16} color={colors.muted} />
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Copy message"
            onPress={() => void copy()}
            style={({ pressed, hovered: over }: WebPressState) => ({
              padding: 7,
              borderRadius: 8,
              backgroundColor: pressed ? colors.blue : over ? "#F1F2F3" : "#FFFFFF",
            })}
          >
            <Copy size={16} color={colors.muted} />
          </Pressable>
        </View>
      )}
    </Pressable>
  );
}

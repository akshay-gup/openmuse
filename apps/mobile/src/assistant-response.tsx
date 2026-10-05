import { useCallback, useState } from "react";
import { Linking, ScrollView, Text, type TextStyle, View, type ViewStyle } from "react-native";
import Markdown, { type MarkdownStyles, type RenderRules } from "react-native-markdown-renderer";
import { assistantMarkdown, isSafeAssistantUrl } from "./assistant-markdown";
import { colors, ErrorNotice, fontSize, monoFont, radius } from "./ui";

const textStyle = { color: colors.text, fontSize: fontSize.body, lineHeight: 22 };
const style: Partial<MarkdownStyles> = {
  text: textStyle,
  paragraph: { marginTop: 0, marginBottom: 6 },
  list: { marginBottom: 6 },
  headingContainer: { marginTop: 8, marginBottom: 2 },
  heading1: { fontSize: fontSize.title, lineHeight: 24, fontWeight: "700" },
  heading2: { fontSize: fontSize.heading, lineHeight: 23, fontWeight: "700" },
  heading3: { fontSize: fontSize.body, lineHeight: 22, fontWeight: "700" },
  link: { color: colors.primary, textDecorationLine: "underline" },
  codeInline: {
    backgroundColor: colors.surfaceHover,
    color: colors.text,
    fontFamily: monoFont,
    fontSize: fontSize.small,
  },
  codeBlock: {
    // The wrapper in renderCodeBlock draws the box; clear the renderer's own default box.
    backgroundColor: "transparent",
    borderWidth: 0,
    borderRadius: 0,
    padding: 0,
    color: colors.text,
    fontFamily: monoFont,
    fontSize: fontSize.small,
    lineHeight: 19,
  },
  table: {
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.sm,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  tableHeader: { backgroundColor: colors.surfaceMuted },
  tableHeaderCell: {
    flex: 1,
    minWidth: 72,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderWidth: 0,
    borderRightWidth: 1,
    borderColor: colors.line,
  },
  tableRow: { borderBottomWidth: 1, borderColor: colors.line, flexDirection: "row" },
  tableRowCell: {
    flex: 1,
    minWidth: 72,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderWidth: 0,
    borderRightWidth: 1,
    borderColor: colors.line,
  },
};
const renderCodeBlock: RenderRules["fence"] = (node, _children, _parent, styles) => (
  <View
    key={node.key}
    style={{
      backgroundColor: colors.surfaceMuted,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.line,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginVertical: 4,
    }}
  >
    <Text selectable style={styles.codeBlock as TextStyle}>
      {node.content.replace(/\n$/, "")}
    </Text>
  </View>
);
const rules: RenderRules = {
  textgroup: (node, children) => (
    <Text key={node.key} selectable style={textStyle}>
      {children}
    </Text>
  ),
  image: (node) => (
    <Text key={node.key} selectable style={{ color: colors.muted }}>
      {node.attributes.alt ? `[Image: ${node.attributes.alt}]` : "[Image]"}
    </Text>
  ),
  code_block: renderCodeBlock,
  fence: renderCodeBlock,
  // Wide tables scroll sideways inside the message instead of wrapping numbers mid-digit.
  table: (node, children, _parent, styles) => (
    <ScrollView
      key={node.key}
      horizontal
      style={{ marginVertical: 6 }}
      contentContainerStyle={{ flexGrow: 1 }}
    >
      <View style={[styles.table as ViewStyle, { flexGrow: 1 }]}>{children}</View>
    </ScrollView>
  ),
  th: (node, children, _parent, styles) => (
    <View key={node.key} style={styles.tableHeaderCell as ViewStyle}>
      <Text style={{ fontWeight: "700", fontSize: fontSize.ui, lineHeight: 20 }}>{children}</Text>
    </View>
  ),
  td: (node, children, _parent, styles) => (
    <View key={node.key} style={styles.tableRowCell as ViewStyle}>
      <Text style={{ fontSize: fontSize.ui, lineHeight: 20 }}>{children}</Text>
    </View>
  ),
};

export function AssistantResponse({ content }: { content: string }) {
  const [linkError, setLinkError] = useState("");
  const onLinkPress = useCallback((url: string) => {
    if (!isSafeAssistantUrl(url)) return false;
    setLinkError("");
    void Linking.openURL(url).catch((error) =>
      setLinkError(error instanceof Error ? error.message : String(error)),
    );
    return false;
  }, []);
  return (
    <>
      <Markdown
        markdownit={assistantMarkdown}
        style={style}
        rules={rules}
        onLinkPress={onLinkPress}
      >
        {content}
      </Markdown>
      <ErrorNotice error={linkError} />
    </>
  );
}

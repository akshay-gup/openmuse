import { useCallback, useState } from "react";
import { Linking, ScrollView, Text, type TextStyle, View, type ViewStyle } from "react-native";
import Markdown, { type MarkdownStyles, type RenderRules } from "react-native-markdown-renderer";
import { assistantMarkdown, isSafeAssistantUrl } from "./assistant-markdown";
import { colors, ErrorNotice } from "./ui";

const textStyle = { color: colors.text, fontSize: 16, lineHeight: 24 };
const style: Partial<MarkdownStyles> = {
  text: textStyle,
  paragraph: { marginTop: 0, marginBottom: 6 },
  list: { marginBottom: 6 },
  headingContainer: { marginTop: 8, marginBottom: 4 },
  heading1: { fontSize: 21, lineHeight: 27 },
  heading2: { fontSize: 19, lineHeight: 25 },
  heading3: { fontSize: 17, lineHeight: 23 },
  link: { color: colors.blueDark, textDecorationLine: "underline" },
  codeInline: { backgroundColor: "#E2E4E7", color: colors.text },
  codeBlock: { backgroundColor: "#E2E4E7", color: colors.text },
  table: {
    borderWidth: 1,
    borderColor: "#D2D6DA",
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  tableHeader: { backgroundColor: "#F3F4F6" },
  tableHeaderCell: {
    flex: 1,
    minWidth: 68,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderWidth: 0,
    borderRightWidth: 1,
    borderColor: "#E3E6E9",
  },
  tableRow: { borderBottomWidth: 1, borderColor: "#E3E6E9", flexDirection: "row" },
  tableRowCell: {
    flex: 1,
    minWidth: 68,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderWidth: 0,
    borderRightWidth: 1,
    borderColor: "#E3E6E9",
  },
};
const renderCodeBlock: RenderRules["fence"] = (node, _children, _parent, styles) => (
  <Text key={node.key} selectable style={styles.codeBlock as TextStyle}>
    {node.content.replace(/\n$/, "")}
  </Text>
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
      <Text style={{ fontWeight: "700", fontSize: 14, lineHeight: 20 }}>{children}</Text>
    </View>
  ),
  td: (node, children, _parent, styles) => (
    <View key={node.key} style={styles.tableRowCell as ViewStyle}>
      <Text style={{ fontSize: 14, lineHeight: 20 }}>{children}</Text>
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

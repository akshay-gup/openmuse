import { useState } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";
import { ErrorNotice, radius } from "./ui";
export default function BrowserConsole({ url }: { url: string }) {
  const [error, setError] = useState("");
  return (
    <View>
      <ErrorNotice error={error} />
      <WebView
        source={{ uri: url }}
        onError={(event) => setError(event.nativeEvent.description)}
        style={{ height: 520, borderRadius: radius.lg }}
      />
    </View>
  );
}

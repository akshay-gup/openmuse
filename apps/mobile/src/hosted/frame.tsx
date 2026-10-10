import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Backdrop, haze } from "../ui";

/** The page the hosted app's own screens (before a workspace is open) are drawn on: the haze, and a column. */
export function Frame({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: haze.base }}>
      <Backdrop />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: 24,
        }}
      >
        <View style={{ width: "100%", maxWidth: wide ? 560 : 420, gap: 22, alignItems: "center" }}>
          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

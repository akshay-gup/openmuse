import { CopilotKitProvider } from "@copilotkit/react-native/headless";
import { StatusBar } from "expo-status-bar";
import {
  Check,
  Lightbulb,
  type LucideIcon,
  MessageCircle,
  PanelsTopLeft,
  Shapes,
  SquareCheck,
  X,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import type { Section, Workspace } from "../../packages/domain/src";
import {
  AgentActivityScreen,
  AgentStatus,
  AppsScreen,
  GoalsScreen,
  IdeasScreen,
} from "./src/agent-ui";
import { AgentWorkspaceProvider } from "./src/agent-workspace";
import {
  API_URL,
  ApiError,
  createSession,
  exchangeLoginCode,
  googleLoginUrl,
  MuseApi,
  savedSession,
  saveSession,
} from "./src/api";
import { ChatScreen, WorkspaceTools } from "./src/chat";
import { ComputerDraftProvider } from "./src/computer-drafts";
import { Details } from "./src/details";
import { BrowserScreen, CalendarScreen, FilesScreen, MailScreen } from "./src/screens";
import { ShellHeader } from "./src/shell-header";
import { Sidebar } from "./src/sidebar";
import { ThreadsProvider, useMuseThread } from "./src/threads";
import { Button, Card, colors, ErrorNotice, fontSize, Mascot, radius, s, shadow } from "./src/ui";
import { type Detail, useWorkspace, WorkspaceContext } from "./src/workspace";

const nav: { id: Section; label: string; icon: LucideIcon }[] = [
  { id: "chat", label: "Chat", icon: MessageCircle },
  { id: "activity", label: "Activity", icon: PanelsTopLeft },
  { id: "ideas", label: "Ideas", icon: Lightbulb },
  { id: "goals", label: "Goals", icon: SquareCheck },
  { id: "apps", label: "Apps", icon: Shapes },
];
export default function App() {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const connect = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const saved = savedSession();
      if (saved) {
        try {
          await new MuseApi(saved).request("/api/auth/session");
          setToken(saved);
          return;
        } catch (e) {
          if (!(e instanceof ApiError) || e.status !== 401) throw e;
          saveSession("");
        }
      }
      const session = await createSession();
      saveSession(session.token);
      setToken(session.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);
  const finishGoogleSignIn = useCallback(async (code: string) => {
    setBusy(true);
    setError("");
    try {
      const session = await exchangeLoginCode(code);
      saveSession(session.token);
      setToken(session.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);
  const logout = useCallback(async () => {
    try {
      await new MuseApi(token).request("/api/auth/logout", {});
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 401) throw e;
    }
    saveSession("");
    setToken("");
    setError("");
    setBusy(false);
  }, [token]);
  const signInWithGoogle = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const onWeb = Platform.OS === "web" && typeof window !== "undefined";
      const { url } = await googleLoginUrl(onWeb ? window.location.origin : undefined);
      if (onWeb) {
        const popup = window.open(url, "hive-google-signin", "width=520,height=640");
        if (!popup) throw new Error("Allow popups to sign in with Google.");
        const timer = setInterval(() => {
          if (popup.closed) {
            clearInterval(timer);
            setBusy(false);
          }
        }, 500);
      } else {
        await Linking.openURL(url);
        setBusy(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    void connect();
  }, [connect]);
  // Web: the sign-in popup posts back { hiveAuthCode } (see server callback page).
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    let expectedOrigin = "";
    try {
      expectedOrigin = new URL(API_URL).origin;
    } catch {
      return;
    }
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== expectedOrigin) return;
      const code = (event.data as { hiveAuthCode?: unknown } | null)?.hiveAuthCode;
      if (typeof code === "string" && code) void finishGoogleSignIn(code);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [finishGoogleSignIn]);
  // Native: the server redirects to hive://auth?code=... after sign-in.
  useEffect(() => {
    if (Platform.OS === "web") return;
    const handle = (url: string | null) => {
      if (!url) return;
      const match = url.match(/^hive:\/\/auth\?code=([^&]+)/);
      if (match?.[1]) void finishGoogleSignIn(decodeURIComponent(match[1]));
    };
    const sub = Linking.addEventListener("url", ({ url }) => handle(url));
    Linking.getInitialURL()
      .then(handle)
      .catch(() => {});
    return () => sub.remove();
  }, [finishGoogleSignIn]);
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {token ? (
        <CopilotKitProvider
          runtimeUrl={`${API_URL}/api/copilotkit`}
          headers={{ Authorization: `Bearer ${token}` }}
        >
          <WorkspaceApp token={token} logout={logout} />
        </CopilotKitProvider>
      ) : (
        <SafeAreaView
          style={{
            flex: 1,
            backgroundColor: colors.canvas,
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
          }}
        >
          <View style={{ width: "100%", maxWidth: 420, gap: 22, alignItems: "center" }}>
            <Mascot size={72} />
            <Text
              style={{
                fontSize: fontSize.display,
                color: colors.text,
                letterSpacing: -1,
                fontWeight: "500",
              }}
            >
              Welcome to Hive.
            </Text>
            <Text style={[s.muted, { textAlign: "center" }]}>A little room for your day.</Text>
            {busy ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Card style={{ width: "100%" }}>
                <ErrorNotice error={error} />
                <Button primary onPress={() => void signInWithGoogle()}>
                  Sign in with Google
                </Button>
                <Text style={[s.small, { marginTop: 15 }]}>
                  Local workspaces open automatically. Make sure your Hive server is running at{" "}
                  {API_URL}.
                </Text>
              </Card>
            )}
          </View>
        </SafeAreaView>
      )}
    </SafeAreaProvider>
  );
}
function WorkspaceApp({ token, logout }: { token: string; logout: () => Promise<void> }) {
  const api = useMemo(() => new MuseApi(token), [token]);
  const [workspace, setWorkspace] = useState<Workspace>();
  const [section, setSection] = useState<Section>("chat");
  const [detail, setDetail] = useState<Detail>();
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [prompt, setPrompt] = useState<{ id: number; text: string }>();
  const refresh = useCallback(async () => {
    const snapshot = await api.request<Workspace>("/api/workspace");
    setWorkspace(snapshot);
    setError("");
  }, [api]);
  useEffect(() => {
    void refresh().catch((e) => setError(String(e)));
  }, [refresh]);
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh().catch((e) => setError(String(e)));
    });
    return () => listener.remove();
  }, [refresh]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5500);
    return () => clearTimeout(timer);
  }, [toast]);
  const navigate = useCallback(
    (next: Section) =>
      setSection(next === "today" ? "chat" : next === "connections" ? "apps" : next),
    [],
  );
  const open = useCallback((next: Detail) => setDetail(next), []);
  const close = useCallback(() => setDetail(undefined), []);
  const ask = useCallback((text: string) => {
    setPrompt({ id: Date.now(), text });
    setSection("chat");
  }, []);
  if (!workspace)
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: colors.canvas,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          gap: 18,
        }}
      >
        <Mascot size={56} />
        {error ? (
          <>
            <ErrorNotice error={error} />
            <Button onPress={() => void refresh().catch((e) => setError(String(e)))}>
              Try again
            </Button>
          </>
        ) : (
          <>
            <ActivityIndicator color={colors.primary} />
            <Text style={s.muted}>Opening your workspace…</Text>
          </>
        )}
      </SafeAreaView>
    );
  return (
    <WorkspaceContext.Provider
      value={{
        workspace,
        api,
        section,
        navigate,
        refresh,
        open,
        close,
        notify: setToast,
        ask,
        logout,
      }}
    >
      <AgentWorkspaceProvider>
        <ComputerDraftProvider key={token}>
          <ThreadsProvider>
            <WorkspaceShell
              detail={detail}
              toast={toast}
              clearToast={() => setToast("")}
              error={error}
              prompt={prompt}
            />
          </ThreadsProvider>
        </ComputerDraftProvider>
      </AgentWorkspaceProvider>
    </WorkspaceContext.Provider>
  );
}
function WorkspaceShell({
  detail,
  toast,
  clearToast,
  error,
  prompt,
}: {
  detail?: Detail;
  toast: string;
  clearToast: () => void;
  error: string;
  prompt?: { id: number; text: string };
}) {
  const { section, navigate } = useWorkspace();
  const {
    selection,
    visited,
    mainId,
    loading: threadsLoading,
    error: threadsError,
    retry: retryThreads,
    enabled: richThreads,
  } = useMuseThread();
  const [threadsOpen, setThreadsOpen] = useState(false);
  const { width } = useWindowDimensions();
  const desktop = width >= 900;
  const channelChat = section === "chat" && selection.id.startsWith("channel:");
  const Screen =
    section === "mail"
      ? MailScreen
      : section === "calendar"
        ? CalendarScreen
        : section === "browser"
          ? BrowserScreen
          : section === "files"
            ? FilesScreen
            : section === "activity"
              ? AgentActivityScreen
              : section === "ideas"
                ? IdeasScreen
                : section === "goals"
                  ? GoalsScreen
                  : AppsScreen;
  const utility = ["mail", "calendar", "browser", "files"].includes(section);
  return (
    <>
      <WorkspaceTools />
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "bottom"]}>
        <View style={{ flex: 1, flexDirection: desktop ? "row" : "column" }}>
          {desktop && <Sidebar />}
          <View style={{ flex: 1, minWidth: 0, alignItems: "center" }}>
            <View style={{ flex: 1, width: "100%", maxWidth: "100%" }}>
              <ShellHeader onMenu={() => setThreadsOpen(true)} />
              <View style={{ flex: 1, minHeight: 0 }}>
                {section !== "chat" && (
                  <ScrollView
                    key={section}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{
                      paddingHorizontal: desktop ? 32 : 22,
                      paddingTop: 20,
                      paddingBottom: 28,
                      width: "100%",
                      maxWidth: 1040,
                      alignSelf: "center",
                    }}
                    keyboardShouldPersistTaps="handled"
                  >
                    {utility && (
                      <Button
                        small
                        style={{ alignSelf: "flex-start", marginBottom: 18 }}
                        onPress={() => navigate("apps")}
                      >
                        Back to Apps
                      </Button>
                    )}
                    <ErrorNotice error={error} />
                    <Screen />
                  </ScrollView>
                )}
                <View
                  style={{
                    display: section === "chat" ? "flex" : "none",
                    flex: 1,
                    width: "100%",
                    maxWidth: channelChat ? undefined : 820,
                    alignSelf: "center",
                    paddingHorizontal: channelChat ? 0 : desktop ? 32 : 17,
                    paddingTop: channelChat ? 0 : 8,
                    paddingBottom: desktop ? 12 : 0,
                  }}
                >
                  {!channelChat && <AgentStatus />}
                  {richThreads ? (
                    <>
                      <ErrorNotice error={threadsError} />
                      {threadsError ? (
                        <Button onPress={retryThreads}>Retry main chat</Button>
                      ) : threadsLoading ? (
                        <ActivityIndicator color={colors.primary} />
                      ) : null}
                      {!threadsLoading && selection.id !== mainId && (
                        <Text style={[s.small, { textAlign: "center", marginBottom: 8 }]}>
                          Side chat
                        </Text>
                      )}
                      {visited.map((thread) => (
                        <View
                          key={thread.id}
                          style={{ display: selection.id === thread.id ? "flex" : "none", flex: 1 }}
                        >
                          <ChatScreen
                            thread={thread}
                            active={section === "chat" && selection.id === thread.id}
                            prompt={selection.id === thread.id ? prompt : undefined}
                          />
                        </View>
                      ))}
                    </>
                  ) : (
                    <>
                      {visited
                        .filter((thread) => thread.id !== "local")
                        .map((thread) => (
                          <View
                            key={thread.id}
                            style={{
                              display: selection.id === thread.id ? "flex" : "none",
                              flex: 1,
                            }}
                          >
                            <ChatScreen
                              thread={thread}
                              active={section === "chat" && selection.id === thread.id}
                              prompt={selection.id === thread.id ? prompt : undefined}
                            />
                          </View>
                        ))}
                      <View
                        style={{
                          display: selection.id === "local" ? "flex" : "none",
                          flex: 1,
                        }}
                      >
                        <ChatScreen
                          prompt={selection.id === "local" ? prompt : undefined}
                          active={section === "chat" && selection.id === "local"}
                        />
                      </View>
                    </>
                  )}
                </View>
              </View>
              <View
                style={{
                  display: desktop ? "none" : "flex",
                  paddingHorizontal: 22,
                  paddingTop: 6,
                  paddingBottom: desktop ? 22 : 7,
                  alignItems: "center",
                }}
              >
                <View
                  accessibilityRole="tablist"
                  style={{
                    flexDirection: "row",
                    width: "100%",
                    maxWidth: 370,
                    padding: 5,
                    backgroundColor: colors.surface,
                    borderRadius: radius.pill,
                    boxShadow: shadow.raised,
                    borderWidth: 1,
                    borderColor: colors.line,
                  }}
                >
                  {nav.map((item) => {
                    const active = section === item.id || (item.id === "apps" && utility);
                    return (
                      <Pressable
                        key={item.id}
                        accessibilityRole="tab"
                        accessibilityLabel={item.label}
                        accessibilityState={{ selected: active }}
                        onPress={() => navigate(item.id)}
                        style={{
                          flex: 1,
                          height: 54,
                          gap: 3,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: active ? colors.primarySoft : "transparent",
                          borderRadius: radius.pill,
                        }}
                      >
                        <item.icon
                          size={21}
                          strokeWidth={active ? 2 : 1.8}
                          color={active ? colors.primary : colors.muted}
                        />
                        <Text
                          numberOfLines={1}
                          style={{
                            fontSize: fontSize.micro,
                            lineHeight: 12,
                            fontWeight: active ? "700" : "500",
                            color: active ? colors.text : colors.muted,
                          }}
                        >
                          {item.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>
          </View>
        </View>
        {!!toast && (
          <View
            pointerEvents="box-none"
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
            style={{
              position: "absolute",
              bottom: desktop ? 28 : 94,
              left: 20,
              right: 20,
              alignItems: "center",
            }}
          >
            <View
              style={[
                s.row,
                {
                  gap: 10,
                  padding: 14,
                  backgroundColor: colors.inverse,
                  borderRadius: radius.lg,
                  maxWidth: 560,
                },
              ]}
            >
              <Check size={16} color={colors.onInverse} />
              <Text style={{ color: colors.onInverse, fontSize: fontSize.small, flexShrink: 1 }}>
                {toast}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Dismiss notification"
                hitSlop={12}
                onPress={clearToast}
              >
                <X size={16} color={colors.onInverse} />
              </Pressable>
            </View>
          </View>
        )}
        <Modal
          visible={threadsOpen && !desktop}
          transparent
          animationType="fade"
          onRequestClose={() => setThreadsOpen(false)}
        >
          <View style={{ flex: 1, flexDirection: "row", backgroundColor: colors.scrim }}>
            <SafeAreaView
              style={{ width: 310, maxWidth: "86%", backgroundColor: colors.surfaceMuted }}
            >
              <Sidebar compact onNavigate={() => setThreadsOpen(false)} />
            </SafeAreaView>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close workspace navigation"
              onPress={() => setThreadsOpen(false)}
              style={{ flex: 1 }}
            />
          </View>
        </Modal>
        {detail && (
          <Details
            key={
              detail.type === "task"
                ? detail.taskId
                : detail.type === "channelFiles"
                  ? `files:${detail.channelId}:${detail.path ?? ""}`
                  : detail.type === "channelFile"
                    ? `file:${detail.channelId}:${detail.path}`
                    : detail.type === "file"
                      ? detail.file.id
                      : detail.type === "browser"
                        ? detail.browser.id
                        : detail.type === "mail"
                          ? detail.mail.id
                          : detail.type === "review"
                            ? detail.action.id
                            : detail.type === "email"
                              ? JSON.stringify(detail.draft)
                              : detail.type === "event"
                                ? detail.event?.id || "event-new"
                                : detail.type
            }
            detail={detail}
          />
        )}
      </SafeAreaView>
    </>
  );
}

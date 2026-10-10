import { CopilotKitProvider } from "@copilotkit/react-native/headless";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Platform, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
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
import { CONTROL_URL } from "./src/hosted/config";
import { HostedApp } from "./src/hosted/HostedApp";
import { Backdrop, Button, Card, colors, ErrorNotice, fontSize, haze, Mascot, s } from "./src/ui";
import { WorkspaceApp } from "./src/workspace-app";

function SelfHostedApp() {
  const [token, setToken] = useState("");
  const api = useMemo(() => (token ? new MuseApi(token, API_URL) : null), [token]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const connect = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const saved = await savedSession();
      if (saved) {
        try {
          await new MuseApi(saved, API_URL).request("/api/auth/session");
          setToken(saved);
          return;
        } catch (e) {
          if (!(e instanceof ApiError) || e.status !== 401) throw e;
          await saveSession("");
        }
      }
      const session = await createSession();
      await saveSession(session.token);
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
      await saveSession(session.token);
      setToken(session.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);
  const logout = useCallback(async () => {
    try {
      await api?.request("/api/auth/logout", {});
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 401) throw e;
    }
    await saveSession("");
    setToken("");
    setError("");
    setBusy(false);
  }, [api]);
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
      <StatusBar style="light" />
      {api ? (
        <CopilotKitProvider
          runtimeUrl={`${api.baseUrl}/api/copilotkit`}
          headers={{ Authorization: `Bearer ${token}` }}
        >
          <WorkspaceApp api={api} identity={token} logout={logout} />
        </CopilotKitProvider>
      ) : (
        <SafeAreaView
          style={{
            flex: 1,
            backgroundColor: haze.base,
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
          }}
        >
          <Backdrop />
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

/**
 * A build with a control plane (EXPO_PUBLIC_CONTROL_URL) is the hosted app, where people sign in
 * once and have workspaces; any other opens one workspace server directly.
 */
export default function App() {
  return CONTROL_URL ? <HostedApp controlUrl={CONTROL_URL} /> : <SelfHostedApp />;
}

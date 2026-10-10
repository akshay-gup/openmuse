import { Platform } from "react-native";
import { storage } from "./storage";

/**
 * API base URL. On web the UI is served by the API itself, so same-origin is
 * the default and EXPO_PUBLIC_API_URL is only needed for split deployments.
 */
const sameOrigin =
  Platform.OS === "web" && typeof window !== "undefined" && window.location?.origin
    ? window.location.origin
    : undefined;

export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL ||
  sameOrigin ||
  (Platform.OS === "android" ? "http://10.0.2.2:8787" : "http://localhost:8787")
).replace(/\/$/, "");

export { ApiError, MuseApi } from "./api-client";

const sessionKey = `hive:session:${API_URL}`;
/** The session this device kept for a workspace server it signs in to directly. */
export async function savedSession(): Promise<string> {
  return (await storage.get(sessionKey)) ?? "";
}
export async function saveSession(token: string) {
  if (token) await storage.set(sessionKey, token);
  else await storage.remove(sessionKey);
}

export async function createSession(): Promise<{ token: string; mode: "sample" | "live" }> {
  const response = await fetch(`${API_URL}/api/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Could not open your workspace.");
  return payload;
}

/** Start Google sign-in: returns the OAuth URL to open in a browser. */
export async function googleLoginUrl(origin?: string): Promise<{ url: string }> {
  const query = origin ? `?origin=${encodeURIComponent(origin)}` : "";
  const response = await fetch(`${API_URL}/api/auth/google/url${query}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Google sign-in is not available.");
  return payload;
}

/** Exchange a single-use login code (deep link / popup) for the session. */
export async function exchangeLoginCode(
  code: string,
): Promise<{ token: string; mode: "sample" | "live" }> {
  const response = await fetch(`${API_URL}/api/auth/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Sign-in expired. Try again.");
  return payload;
}

import { Platform } from "react-native";

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

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const sessionKey = `hive:session:${API_URL}`;
export function savedSession(): string {
  return typeof window !== "undefined" ? (window.localStorage.getItem(sessionKey) ?? "") : "";
}
export function saveSession(token: string) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(sessionKey, token);
  else window.localStorage.removeItem(sessionKey);
}

export class MuseApi {
  constructor(readonly token: string) {}
  async request<T>(path: string, body?: unknown, method?: string): Promise<T> {
    const response = await fetch(`${API_URL}${path}`, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(body === undefined || body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok)
      throw new ApiError(
        typeof payload.error === "string" ? payload.error : `Request failed (${response.status})`,
        response.status,
      );
    return payload;
  }
  url(path: string) {
    return path.startsWith("http") ? path : `${API_URL}${path}`;
  }
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

import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export interface GoogleProfile {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
}
export interface GoogleCall {
  path: string;
  form?: Record<string, string>;
  authorization?: string;
}

/**
 * A stand-in for the two places a server talks to Google when someone signs in: the token
 * endpoint, which only honours a code it issued and the verifier that matches its challenge, and
 * the userinfo endpoint, which only answers to a token it handed out.
 */
export async function fakeGoogle() {
  const clientId = "client-id.apps.test";
  const clientSecret = "client-secret";
  const codes = new Map<
    string,
    { challenge: string; redirectUri: string; profile: GoogleProfile }
  >();
  const tokens = new Map<string, GoogleProfile>();
  const calls: GoogleCall[] = [];
  const failures = new Map<string, number>();
  let issued = 0;

  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const read = (req: IncomingMessage) =>
    new Promise<string>((resolve) => {
      let text = "";
      req.on("data", (chunk) => {
        text += chunk;
      });
      req.on("end", () => resolve(text));
    });

  const server = createServer(async (req, res) => {
    const path = new URL(req.url ?? "/", "http://google").pathname;
    const form = Object.fromEntries(new URLSearchParams(await read(req)));
    calls.push({
      path,
      form: Object.keys(form).length ? form : undefined,
      authorization: req.headers.authorization,
    });
    const failure = failures.get(path);
    if (failure) return send(res, failure, { error: "injected" });

    if (path === "/token") {
      const issuedFor = codes.get(form.code ?? "");
      if (form.client_id !== clientId || form.client_secret !== clientSecret)
        return send(res, 401, { error: "invalid_client" });
      if (form.grant_type !== "authorization_code" || !issuedFor)
        return send(res, 400, { error: "invalid_grant" });
      codes.delete(form.code ?? ""); // a code works once
      const verified =
        createHash("sha256")
          .update(form.code_verifier ?? "")
          .digest("base64url") === issuedFor.challenge;
      if (!verified || form.redirect_uri !== issuedFor.redirectUri)
        return send(res, 400, { error: "invalid_grant" });
      const accessToken = `access-${++issued}`;
      tokens.set(accessToken, issuedFor.profile);
      return send(res, 200, { access_token: accessToken, expires_in: 3599, token_type: "Bearer" });
    }
    if (path === "/userinfo") {
      const profile = tokens.get((req.headers.authorization ?? "").replace(/^Bearer /, ""));
      if (!profile) return send(res, 401, { error: "invalid_token" });
      return send(res, 200, profile);
    }
    return send(res, 404, { error: "no route" });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    clientId,
    clientSecret,
    authUrl: `${origin}/auth`,
    tokenUrl: `${origin}/token`,
    userinfoUrl: `${origin}/userinfo`,
    calls,
    /** What the sign-in URL sent the person to Google with, which a code is then issued for. */
    issue(
      authorizationUrl: string,
      profile: GoogleProfile = { sub: "g-1", email: "ada@example.com", email_verified: true },
    ) {
      const url = new URL(authorizationUrl);
      const code = `code-${++issued}`;
      codes.set(code, {
        challenge: url.searchParams.get("code_challenge") ?? "",
        redirectUri: url.searchParams.get("redirect_uri") ?? "",
        profile,
      });
      return { code, state: url.searchParams.get("state") ?? "" };
    },
    /** Answer every request to `path` with `status`. */
    fail(path: "/token" | "/userinfo", status: number) {
      failures.set(path, status);
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

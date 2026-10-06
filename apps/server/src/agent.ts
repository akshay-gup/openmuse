import "./config.ts";
import { HttpAgent } from "@ag-ui/client";
import {
  type AgentsFactory,
  type CopilotKitIntelligence,
  CopilotRuntime,
  createCopilotHonoHandler,
} from "@copilotkit/runtime/v2";
import type { Auth } from "./auth.ts";
import type { Config } from "./config.ts";

export function agentConfigured(config: Config) {
  if (config.agentBackend === "opencode") return true; // boot gates on server reachability
  return (
    config.agentBackend === "sample" ||
    (config.agentBackend === "agui"
      ? Boolean(config.agentUrl)
      : Boolean(
          config.model &&
            (process.env.OPENAI_API_KEY ||
              process.env.ANTHROPIC_API_KEY ||
              process.env.GOOGLE_API_KEY),
        ))
  );
}
export function makeRuntime(config: Config, auth: Auth, intelligence?: CopilotKitIntelligence) {
  // The agent is OpenCode, reached through the AG-UI shim in this process. The caller's auth is
  // forwarded so the shim route resolves the owner the same way this request did.
  const agents: AgentsFactory = async ({ request }) => {
    const authorization = request.headers.get("authorization") ?? undefined;
    return {
      default: new HttpAgent({
        url: `${config.publicUrl}/api/agent/opencode/run`,
        headers: authorization ? { authorization } : {},
      }),
    };
  };
  // Without an Intelligence key the runtime runs in SSE mode: no hosted thread
  // persistence, no identifyUser (auth is enforced by the Hono middleware and
  // the agents factory resolves the owner from the request headers).
  const runtime = intelligence
    ? new CopilotRuntime({
        agents,
        intelligence,
        identifyUser: async (request) => ({
          id: await auth.owner(request.headers.get("authorization") ?? undefined),
          name: "Hive user",
        }),
        generateThreadNames: false,
      })
    : new CopilotRuntime({ agents });
  return createCopilotHonoHandler({ runtime, basePath: "/api/copilotkit" });
}

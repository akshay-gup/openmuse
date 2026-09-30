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
import { ConversationAgent } from "./engine/conversation.ts";
import type { AgentService } from "./engine/service.ts";
import { createJevAdapter, type JevAdapter } from "./jev/adapter.ts";

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
export function makeRuntime(
  config: Config,
  service: AgentService,
  auth: Auth,
  intelligence: CopilotKitIntelligence,
) {
  // Built on first use, then shared so live mode reuses one TypeSafe client across requests.
  let jevAdapter: JevAdapter | undefined;
  const sharedJevAdapter = () => (jevAdapter ??= createJevAdapter(config));
  const agents: AgentsFactory = async ({ request }) => ({
    default: await (async () => {
      const authorization = request.headers.get("authorization") ?? undefined;
      if (config.agentBackend === "agui") {
        return new HttpAgent({
          url: config.agentUrl ?? "http://127.0.0.1:1/unconfigured",
          headers: config.agentToken ? { Authorization: `Bearer ${config.agentToken}` } : {},
        });
      }
      if (config.agentBackend === "opencode") {
        // In-process shim: forward the caller's auth so the shim route
        // resolves the owner the same way this request did.
        return new HttpAgent({
          url: `${config.publicUrl}/api/agent/opencode/run`,
          headers: authorization ? { authorization } : {},
        });
      }
      return new ConversationAgent(
        config,
        service,
        await auth.owner(authorization),
        sharedJevAdapter(),
      );
    })(),
  });
  const runtime = new CopilotRuntime({
    agents,
    intelligence,
    identifyUser: async (request) => ({
      id: await auth.owner(request.headers.get("authorization") ?? undefined),
      name: "OpenMuse user",
    }),
    generateThreadNames: false,
  });
  return createCopilotHonoHandler({ runtime, basePath: "/api/copilotkit" });
}

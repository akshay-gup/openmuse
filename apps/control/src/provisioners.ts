import { FlyProvisioner, flyConfigFromEnv } from "./fly.ts";
import { LocalProvisioner, localConfigFromEnv } from "./local.ts";
import type { Provisioner } from "./provisioner.ts";

/** The provisioner PROVISIONER names: `fly` for a deployment, `local` to try the flow on a laptop. */
export function provisionerFromEnv(
  env: Record<string, string | undefined> = process.env,
): Provisioner {
  switch (env.PROVISIONER?.trim()) {
    case "fly":
      return new FlyProvisioner(flyConfigFromEnv(env));
    case "local":
      return new LocalProvisioner(localConfigFromEnv(env));
    default:
      throw new Error("Set PROVISIONER to fly (a deployment) or local (a laptop)");
  }
}

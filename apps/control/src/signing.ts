import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  generateWorkspaceKeys,
  workspacePublicKeyOf,
} from "../../../packages/integrations/src/workspace-token.ts";

export interface SigningKeys {
  /** Stays here. */
  privateKey: string;
  /** Goes to every workspace, which checks tokens against it. */
  publicKey: string;
}

/**
 * The key workspace tokens are signed with: CONTROL_SIGNING_KEY when it is set (so every copy of
 * the control plane signs the same), otherwise one made on first start and kept in the data
 * directory. Replacing it would lock every workspace out, so it is never regenerated.
 */
export async function loadSigningKeys(
  dataDir: string,
  env: Record<string, string | undefined> = process.env,
): Promise<SigningKeys> {
  const given = env.CONTROL_SIGNING_KEY?.trim();
  if (given) return { privateKey: given, publicKey: workspacePublicKeyOf(given) };
  const path = join(dataDir, "signing-key");
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  try {
    const privateKey = (await readFile(path, "utf8")).trim();
    return { privateKey, publicKey: workspacePublicKeyOf(privateKey) };
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  const { privateKey, publicKey } = generateWorkspaceKeys();
  try {
    await writeFile(path, `${privateKey}\n`, { mode: 0o600, flag: "wx" });
  } catch (error) {
    // Another process made it first: use theirs, so both sign alike.
    if (error instanceof Error && "code" in error && error.code === "EEXIST")
      return loadSigningKeys(dataDir, env);
    throw error;
  }
  return { privateKey, publicKey };
}

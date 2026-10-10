/**
 * The control plane this build signs people in through. Set at build time
 * (EXPO_PUBLIC_CONTROL_URL): a build that has one is the hosted app, where a person signs in once,
 * has workspaces, and is taken into them; a build without one opens a single workspace server
 * directly, as a self-hosted deployment does.
 */
export const CONTROL_URL = (process.env.EXPO_PUBLIC_CONTROL_URL ?? "").trim().replace(/\/+$/, "");

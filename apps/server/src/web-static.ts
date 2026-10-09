import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import type { Context } from "hono";

/**
 * The Expo web export (`pnpm build:web`), served by the API itself so one process is the whole
 * app. `webDir` overrides the default `apps/mobile/dist/web` (resolved from the process working
 * directory). A missing directory means a headless API for native clients.
 */
export function webRootDir(webDir?: string): string | undefined {
  const dir = resolve(webDir ?? "apps/mobile/dist/web");
  return existsSync(join(dir, "index.html")) ? dir : undefined;
}

const webContentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
};

export async function serveWebFile(c: Context, root: string, pathname: string) {
  const send = async (file: string) => {
    const data = await readFile(file);
    c.header(
      "Content-Type",
      webContentTypes[extname(file).toLowerCase()] ?? "application/octet-stream",
    );
    return c.body(new Uint8Array(data));
  };
  const candidate = join(root, pathname);
  // Never escape the web root (path traversal).
  if (!relative(root, candidate) || relative(root, candidate).startsWith("..")) {
    try {
      return await send(join(root, "index.html"));
    } catch {
      return c.notFound();
    }
  }
  try {
    const info = await stat(candidate);
    try {
      return await send(info.isDirectory() ? join(candidate, "index.html") : candidate);
    } catch {
      return c.notFound();
    }
  } catch {
    // SPA fallback: client-side routes serve the app shell.
    try {
      return await send(join(root, "index.html"));
    } catch {
      return c.notFound();
    }
  }
}

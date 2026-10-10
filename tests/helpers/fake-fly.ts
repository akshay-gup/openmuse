import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

interface FakeMachine {
  id: string;
  state: string;
  region: string;
  config: {
    image?: string;
    env?: Record<string, string>;
    guest?: { cpu_kind: string; cpus: number; memory_mb: number };
    mounts?: { volume: string; path: string }[];
    services?: {
      internal_port: number;
      autostop?: string;
      autostart?: boolean;
      ports?: unknown[];
    }[];
    [key: string]: unknown;
  };
}
interface FakeVolume {
  id: string;
  name: string;
  /** `created` unless a test says Fly is removing it. */
  state: string;
  region: string;
  size_gb: number;
  encrypted: boolean;
  snapshot_retention: number;
}
interface FakeAddress {
  ip: string;
  region: string;
  service_name: string;
  shared: boolean;
  egress: boolean;
  network: null;
}
interface FakeApp {
  name: string;
  org: string;
  network: string;
  addresses: FakeAddress[];
  machines: Map<string, FakeMachine>;
  volumes: Map<string, FakeVolume>;
}
export interface FlyCall {
  method: string;
  path: string;
  body?: unknown;
}

/**
 * A stand-in for the parts of Fly the provisioner talks to: the Machines API (apps, addresses,
 * volumes and machines) and the workspace's public health check. It keeps them in memory,
 * refuses requests that are not what Fly's own client sends, and fails or lags when told to, so
 * the provisioner can be tested without an account.
 */
export async function fakeFly(options: { token?: string; startDelayMs?: number } = {}) {
  const token = options.token ?? "fly-test-token";
  const apps = new Map<string, FakeApp>();
  const calls: FlyCall[] = [];
  let ids = 0;
  const failures: {
    match: RegExp;
    status: number;
    times: number;
    headers?: Record<string, string>;
  }[] = [];
  /** Machines still starting: they report `starting` until this passes. */
  const startAt = new Map<string, number>();

  const send = (
    res: ServerResponse,
    status: number,
    body?: unknown,
    headers: Record<string, string> = {},
  ) => {
    res.writeHead(status, { "Content-Type": "application/json", ...headers });
    res.end(body === undefined ? "" : JSON.stringify(body));
  };
  const read = (req: IncomingMessage) =>
    new Promise<string>((resolve) => {
      let text = "";
      req.on("data", (chunk) => {
        text += chunk;
      });
      req.on("end", () => resolve(text));
    });
  const settle = (machine: FakeMachine) => {
    const at = startAt.get(machine.id);
    if (machine.state === "starting" && (at === undefined || Date.now() >= at))
      machine.state = "started";
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://fake");
    const path = url.pathname;
    const raw = await read(req);
    const body = raw ? JSON.parse(raw) : undefined;

    // The workspace's own health check, as the public address would answer it.
    const publicHealth = /^\/public\/([\w-]+)\/api\/health$/.exec(path);
    if (publicHealth) {
      const app = apps.get(publicHealth[1] ?? "");
      const machine = [...(app?.machines.values() ?? [])][0];
      if (machine) settle(machine);
      if (machine?.state !== "started") return send(res, 502, { error: "no machine is running" });
      return send(res, 200, {
        ok: true,
        managed: true,
        workspace: machine?.config.env?.WORKSPACE_ID,
      });
    }

    calls.push({ method: req.method ?? "GET", path: `${path}${url.search}`, body });
    if (req.headers.authorization !== `Bearer ${token}`)
      return send(res, 401, { error: "unauthorized" });
    const failure = failures.find((f) => f.times > 0 && f.match.test(`${req.method} ${path}`));
    if (failure) {
      failure.times--;
      return send(res, failure.status, { error: "injected" }, failure.headers);
    }

    const m =
      /^\/v1\/apps(?:\/([\w-]+))?(?:\/(machines|volumes|ip_assignments)(?:\/([\w.:-]+))?(?:\/(wait|start|stop))?)?$/.exec(
        path,
      );
    if (!m) return send(res, 404, { error: `no route ${path}` });
    const [, appName, collection, itemId, action] = m;
    const method = req.method ?? "GET";

    if (!appName) {
      if (method !== "POST") return send(res, 405, { error: "method" });
      const input = body as {
        app_name?: string;
        name?: string;
        org_slug?: string;
        network?: string;
      };
      // Fly's own client names the app `name`; its documentation says `app_name`. Either is taken.
      const name = input.app_name ?? input.name;
      if (!name || !input.org_slug)
        return send(res, 422, { error: "a name and org_slug are required" });
      if (apps.has(name)) return send(res, 422, { error: "Name has already been taken" });
      apps.set(name, {
        name,
        org: input.org_slug,
        network: input.network ?? "",
        addresses: [],
        machines: new Map(),
        volumes: new Map(),
      });
      return send(res, 201, { name });
    }
    const app = apps.get(appName);
    if (!app) return send(res, 404, { error: "app not found" });
    if (!collection) {
      if (method === "GET") return send(res, 200, { name: app.name });
      if (method === "DELETE") {
        apps.delete(appName);
        return send(res, 202);
      }
      return send(res, 405, { error: "method" });
    }

    if (collection === "ip_assignments") {
      if (!itemId && method === "GET") return send(res, 200, { ips: app.addresses });
      if (!itemId && method === "POST") {
        const type = (body as { type?: string }).type;
        if (type !== "v6" && type !== "shared_v4" && type !== "v4")
          return send(res, 422, { error: `cannot assign a ${type} address here` });
        const address: FakeAddress = {
          ip: type === "v6" ? `2a09:8280:1::${++ids}:0` : `66.241.124.${++ids}`,
          region: "",
          service_name: "",
          shared: type === "shared_v4",
          egress: false,
          network: null,
        };
        app.addresses.push(address);
        return send(res, 200, { ...address, created_at: new Date().toISOString() });
      }
    }

    if (collection === "volumes") {
      if (!itemId && method === "GET") return send(res, 200, [...app.volumes.values()]);
      if (!itemId && method === "POST") {
        const input = body as Partial<FakeVolume>;
        if (!input.name || !input.region || !input.size_gb)
          return send(res, 422, { error: "invalid volume" });
        const volume: FakeVolume = {
          id: `vol_${++ids}`,
          state: "created",
          name: input.name,
          region: input.region,
          size_gb: input.size_gb,
          encrypted: Boolean(input.encrypted),
          snapshot_retention: input.snapshot_retention ?? 5,
        };
        app.volumes.set(volume.id, volume);
        return send(res, 200, volume);
      }
      if (itemId && method === "DELETE") {
        if (!app.volumes.delete(itemId)) return send(res, 404, { error: "volume not found" });
        return send(res, 200, {});
      }
    }

    if (collection === "machines") {
      if (!itemId && method === "GET") {
        for (const machine of app.machines.values()) settle(machine);
        return send(res, 200, [...app.machines.values()]);
      }
      if (!itemId && method === "POST") {
        const input = body as { region?: string; config?: FakeMachine["config"] };
        const config = input.config;
        if (!config?.image) return send(res, 422, { error: "config.image is required" });
        for (const mount of config.mounts ?? [])
          if (!app.volumes.has(mount.volume))
            return send(res, 422, { error: `volume ${mount.volume} does not exist` });
        if (!config.services?.some((s) => s.internal_port === 8787))
          return send(res, 422, { error: "no service for port 8787" });
        const stop = config.stop_config as { signal?: string; timeout?: string } | undefined;
        if (stop) {
          const signals = [
            "SIGHUP",
            "SIGINT",
            "SIGQUIT",
            "SIGKILL",
            "SIGUSR1",
            "SIGUSR2",
            "SIGTERM",
          ];
          if (stop.signal && !signals.includes(stop.signal))
            return send(res, 422, { error: `stop_config.signal ${stop.signal} is not a signal` });
          if (stop.timeout !== undefined && !/^\d+(ms|s|m|h)$/.test(stop.timeout))
            return send(res, 422, { error: "stop_config.timeout is not a duration" });
        }
        const machine: FakeMachine = {
          id: `m${++ids}`,
          state: "starting",
          region: input.region ?? "iad",
          config,
        };
        app.machines.set(machine.id, machine);
        startAt.set(machine.id, Date.now() + (options.startDelayMs ?? 0));
        return send(res, 200, machine);
      }
      const machine = itemId ? app.machines.get(itemId) : undefined;
      if (itemId && !machine) return send(res, 404, { error: "machine not found" });
      if (machine && action === "wait" && method === "GET") {
        const want = url.searchParams.get("state");
        const limit = Math.min(Number(url.searchParams.get("timeout") ?? 60), 1) * 1000;
        const until = Date.now() + limit;
        for (;;) {
          settle(machine);
          if (machine.state === want) return send(res, 200, { ok: true });
          if (Date.now() >= until) return send(res, 408, { error: "timeout" });
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
      }
      if (machine && action === "start" && method === "POST") {
        machine.state = "starting";
        startAt.set(machine.id, Date.now() + (options.startDelayMs ?? 0));
        return send(res, 200, {});
      }
      if (machine && action === "stop" && method === "POST") {
        machine.state = "stopped";
        return send(res, 200, {});
      }
      if (machine && !action && method === "GET") return send(res, 200, machine);
      if (machine && !action && method === "DELETE") {
        app.machines.delete(machine.id);
        return send(res, 200, {});
      }
    }
    return send(res, 404, { error: `no route ${method} ${path}` });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    token,
    apiUrl: `${origin}/v1`,
    publicUrlTemplate: `${origin}/public/{app}`,
    apps,
    calls,
    /** Answer the next `times` requests that match `method path` with `status`. */
    failNext(match: RegExp, status: number, times = 1, headers?: Record<string, string>) {
      failures.push({ match, status, times, headers });
    },
    /** What the machine of an app is doing, for tests that stop it. */
    machineOf(app: string) {
      return [...(apps.get(app)?.machines.values() ?? [])][0];
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

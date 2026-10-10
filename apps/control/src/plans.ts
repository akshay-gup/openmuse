export type PlanId = "free" | "team";

export interface Plan {
  id: PlanId;
  label: string;
  /** The machine a workspace runs on. */
  guest: { cpuKind: "shared" | "performance"; cpus: number; memoryMb: number };
  /** Disk for the workspace's database, files and browser profiles, in GB. */
  volumeGb: number;
  /** Stop the machine when nobody is using it, and start it again on the next request. */
  stopsWhenIdle: boolean;
}

/**
 * What each plan gets. Nothing bills yet, so every workspace is `free`; the sizes are the place to
 * start from, and `team` is the same machine kept running.
 */
export const plans: Record<PlanId, Plan> = {
  free: {
    id: "free",
    label: "Free",
    guest: { cpuKind: "shared", cpus: 2, memoryMb: 4096 },
    volumeGb: 5,
    stopsWhenIdle: true,
  },
  team: {
    id: "team",
    label: "Team",
    guest: { cpuKind: "shared", cpus: 2, memoryMb: 4096 },
    volumeGb: 20,
    stopsWhenIdle: false,
  },
};

export const DEFAULT_PLAN: PlanId = "free";

import type { InviteSummary, Role } from "./control-api";

export const roleLabel: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

const DAY = 24 * 60 * 60 * 1000;

/** How long an invitation has left, in words. */
export function expiresIn(expiresAt: number, now = Date.now()): string {
  const left = expiresAt - now;
  if (left <= 0) return "expired";
  const days = Math.ceil(left / DAY);
  if (days <= 1) return "expires today";
  if (days === 2) return "expires tomorrow";
  return `expires in ${days} days`;
}

/** A pending invitation as a line in a list: what it is, and what is left of it. */
export function describeInvite(
  invite: InviteSummary,
  now = Date.now(),
): { title: string; detail: string } {
  const role = invite.role === "admin" ? "Admin · " : "";
  if (invite.email)
    return { title: invite.email, detail: `${role}${expiresIn(invite.expiresAt, now)}` };
  return {
    title: "Invite link",
    detail: `${role}${invite.uses} of ${invite.maxUses} used · ${expiresIn(invite.expiresAt, now)}`,
  };
}

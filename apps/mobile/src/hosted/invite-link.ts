const TOKEN = /^[A-Za-z0-9_-]{20,100}$/;

/**
 * The invitation in what someone pasted or tapped: the link a workspace's owner shared
 * (`https://<hive>/join/<token>`), the same as an app link (`hive://join/<token>`), or the token
 * alone. Anything else is not an invitation.
 */
export function inviteTokenFrom(text: string | null | undefined): string | null {
  const value = text?.trim();
  if (!value) return null;
  if (TOKEN.test(value)) return value;
  const found = /^(?:https?:\/\/[^/?#]+\/|hive:\/\/)join\/([^/?#]+)\/?(?:[?#].*)?$/i.exec(value);
  const token = found?.[1];
  return token && TOKEN.test(token) ? token : null;
}

/** The invitation in the address of the page the web app was opened at, if it was opened by a link. */
export function inviteTokenFromPath(pathname: string): string | null {
  const found = /^\/join\/([^/]+)\/?$/.exec(pathname);
  const token = found?.[1];
  return token && TOKEN.test(token) ? token : null;
}

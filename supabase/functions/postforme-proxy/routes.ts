/**
 * The Post for Me operations postforme-proxy forwards. Anything else is
 * refused. See index.ts for how each one is scoped to the caller.
 */
export type Operation = "list_accounts" | "auth_url" | "disconnect_account" | "create_post";

const DISCONNECT_RE = /^\/v1\/social-accounts\/([A-Za-z0-9_-]+)\/disconnect$/;

export function classify(method: string, path: string): { op: Operation; accountId?: string } | null {
  if (method === "GET" && path === "/v1/social-accounts") return { op: "list_accounts" };
  if (method === "POST" && path === "/v1/social-accounts/auth-url") return { op: "auth_url" };
  if (method === "POST" && path === "/v1/social-posts") return { op: "create_post" };
  const m = method === "POST" ? path.match(DISCONNECT_RE) : null;
  if (m) return { op: "disconnect_account", accountId: m[1] };
  return null;
}

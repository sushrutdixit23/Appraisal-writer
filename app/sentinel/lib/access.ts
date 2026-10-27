// Sentinel - who may see and change which company. One set of rules, used
// by every server route and by the company pickers in the pages.
//
//   owner                         -> read and write
//   public reference company      -> read only (the seeded peer set)
//   anyone else's company         -> nothing, and not even "it exists"
//
// The server routes talk to the database with the service-role key, which
// bypasses row-level security, so they cannot lean on RLS the way the
// browser pages do: they enforce these rules themselves, on every request,
// for the workspace being asked about AND for the peer set pulled in around
// it. (WorkspaceMember / WorkspaceRole exist as types but nothing creates or
// reads memberships yet; when they do, this is the one place to extend.)

import type { Workspace } from "./types";

export type AccessLevel = "none" | "read" | "write";

export function accessLevel(
  ws: Pick<Workspace, "owner_id" | "is_public_reference">,
  userId: string
): AccessLevel {
  if (ws.owner_id != null && ws.owner_id === userId) return "write";
  if (ws.is_public_reference) return "read";
  return "none";
}

export const canRead = (ws: Pick<Workspace, "owner_id" | "is_public_reference">, userId: string) =>
  accessLevel(ws, userId) !== "none";
export const canWrite = (ws: Pick<Workspace, "owner_id" | "is_public_reference">, userId: string) =>
  accessLevel(ws, userId) === "write";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** PostgREST `or` filter selecting exactly the workspaces this user may read. The id is checked
 * against the UUID shape first because it is interpolated into a filter string. */
export function readableWorkspaceFilter(userId: string): string {
  if (!isUuid(userId)) throw new Error("Refusing to build a workspace filter from a malformed user id.");
  return `is_public_reference.eq.true,owner_id.eq.${userId}`;
}

/** Own companies first, then the reference set, each A-Z, so every picker lists them in the same
 * order and the default selection does not depend on whatever order the database returned. */
export function sortWorkspaces<T extends Pick<Workspace, "owner_id" | "company_name">>(list: T[], userId: string): T[] {
  const rank = (w: T) => (w.owner_id === userId ? 0 : 1);
  return [...list].sort(
    (a, b) => rank(a) - rank(b) || a.company_name.localeCompare(b.company_name, "en", { sensitivity: "base" })
  );
}

/** Picker label that tells a reference company from one of your own. */
export function workspaceOptionLabel(w: Pick<Workspace, "company_name" | "is_public_reference" | "owner_id">, userId: string): string {
  return w.owner_id === userId ? w.company_name : `${w.company_name} (reference)`;
}

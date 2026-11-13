import type { Role } from "./constants";

/**
 * Single source of truth for role permissions.
 * The server enforces these on every request; the UI only uses them to hide
 * controls the current user could not use anyway.
 */
export const CAPABILITIES = [
  "leads.view_all", // see every lead, not only assigned ones
  "leads.assign", // assign or reassign leads
  "leads.create", // add a lead manually
  "leads.delete",
  "catalog.manage", // packages and departures
  "bookings.view_all",
  "reports.view", // analytics & reports
  "team.view", // team performance
  "team.manage", // create / edit / deactivate employees
  "activity.view_all",
  "integrations.manage",
  "settings.manage",
  "demo.tools",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

const MATRIX: Record<Role, readonly Capability[]> = {
  admin: CAPABILITIES,
  manager: [
    "leads.view_all",
    "leads.assign",
    "leads.create",
    "catalog.manage",
    "bookings.view_all",
    "reports.view",
    "team.view",
    "activity.view_all",
  ],
  // Agents work on what is assigned to them: their leads, follow-ups and bookings.
  agent: ["leads.create"],
};

export function can(role: Role | undefined | null, capability: Capability): boolean {
  if (!role) return false;
  return MATRIX[role].includes(capability);
}

export function capabilitiesOf(role: Role): readonly Capability[] {
  return MATRIX[role];
}

/** Record-level rule: may this user read/write a record assigned to `assignedTo`? */
export function canAccessAssigned(
  user: { id: string; role: Role },
  assignedTo: string | null | undefined,
  viewAll: Capability = "leads.view_all",
): boolean {
  return can(user.role, viewAll) || (!!assignedTo && assignedTo === user.id);
}

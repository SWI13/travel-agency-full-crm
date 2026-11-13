import { z } from "zod";
import { can, canAccessAssigned, type Capability } from "~/lib/permissions";
import type { Lead, SessionUser } from "~/lib/types";
import { db } from "../db.server";
import { forbidden, notFound } from "../errors";

export interface Ctx {
  user: SessionUser;
  request: Request;
}

export interface RpcDef<S extends z.ZodType = z.ZodType> {
  input: S;
  /** Capability required to call the procedure. Omitted = any signed-in employee. */
  cap?: Capability;
  run: (ctx: Ctx, input: z.infer<S>) => Promise<unknown>;
}

export const rpc = <S extends z.ZodType>(def: RpcDef<S>): RpcDef<S> => def;

// ── Shared field validators ─────────────────────────────────────────────────
export const zId = z.string().min(1).max(40);
export const zText = (max: number) => z.string().trim().max(max);
export const zNullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => (v ? v : null));
export const zDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();
export const zMoney = z.number().int().min(0).max(1_000_000_000);
export const zCount = z.number().int().min(0).max(500);
export const zIsoDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date");

/** Loads a lead the current user is allowed to work on, or fails with 404/403. */
export async function leadFor(user: SessionUser, id: string): Promise<Lead> {
  const lead = await db.get<Lead>("leads", id);
  if (!lead) throw notFound("Lead");
  if (!canAccessAssigned(user, lead.assignedTo)) throw forbidden("This lead is not assigned to you");
  return lead;
}

export function assertAssigned(user: SessionUser, assignedTo: string | null, cap: Capability = "bookings.view_all") {
  if (!can(user.role, cap) && assignedTo !== user.id) throw forbidden("This record is not assigned to you");
}

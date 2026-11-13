import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { SERVICE_TYPES } from "~/lib/constants";
import { maskPhone, normalizeDzPhone } from "~/lib/phone";
import type { Package } from "~/lib/types";
import { SYSTEM_ACTOR } from "~/server/activity.server";
import { db } from "~/server/db.server";
import { badRequest, jsonError } from "~/server/errors";
import { upsertLeadFromInquiry } from "~/server/leads.server";
import { assertSameOrigin, clientIp, getSettings, throttle } from "~/server/session.server";

const input = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(6).max(30),
  packageSlug: z.string().trim().max(80).optional().nullable(),
  serviceType: z.enum(SERVICE_TYPES).default("unknown"),
  adults: z.number().int().min(0).max(50).default(1),
  children: z.number().int().min(0).max(50).default(0),
  message: z.string().trim().max(1000).optional().nullable(),
  consent: z.literal(true),
  utmSource: z.string().trim().max(120).optional().nullable(),
  utmCampaign: z.string().trim().max(160).optional().nullable(),
  /** Honeypot: real visitors never fill this hidden field. */
  website: z.string().max(200).optional().nullable(),
});

/**
 * POST /api/public/lead — website contact form.
 * The only public write endpoint. It creates or updates a lead and returns
 * nothing about existing customers.
 */
export async function action({ request }: ActionFunctionArgs) {
  try {
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
    assertSameOrigin(request);
    const body = await request.json().catch(() => ({}));
    if (typeof body?.website === "string" && body.website.trim()) {
      return Response.json({ ok: true }); // bot: pretend success, store nothing
    }

    const parsed = input.safeParse(body);
    if (!parsed.success) {
      const field = String(parsed.error.issues[0]?.path[0] ?? "");
      throw badRequest("Invalid form", { field });
    }
    const data = parsed.data;
    const phone = normalizeDzPhone(data.phone);
    if (!phone) throw badRequest("Invalid phone number", { field: "phone" });

    throttle(`form-ip:${clientIp(request)}`, 6, 10 * 60_000);
    throttle(`form-phone:${phone}`, 1, 2 * 60_000);

    const settings = await getSettings();
    let pkg: Package | null = null;
    if (data.packageSlug) {
      [pkg = null] = await db.list<Package>("packages", { where: { slug: data.packageSlug, status: "active" }, limit: 1 });
    }

    await upsertLeadFromInquiry({
      phone,
      name: data.name,
      source: "website_form",
      message: data.message || null,
      packageId: pkg?.id ?? null,
      serviceType: pkg?.category ?? data.serviceType,
      adults: data.adults,
      children: data.children,
      utmSource: data.utmSource || null,
      utmCampaign: data.utmCampaign || null,
      actor: SYSTEM_ACTOR,
      settings,
    });
    console.info(`[site] Website form lead received (${maskPhone(phone)})`);
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

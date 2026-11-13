import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { DATA_DIR } from "./env.server";
import { badRequest } from "./errors";
import { KEY_PREFIX, redis, redisConfigured } from "./redis.server";

/**
 * Photos uploaded from the dashboard (package covers).
 *
 * Where they are kept, in order:
 *   1. Vercel Blob   — when BLOB_READ_WRITE_TOKEN is set (Vercel → Storage → Blob)
 *   2. Redis         — on Vercel without Blob (photos are compressed in the browser first)
 *   3. Local folder  — .data/uploads, for a normal server or development
 * Cases 2 and 3 are served by /media/:id with a one-year cache.
 */

export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Checks the file's first bytes, not only the declared type. */
function sniff(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

export const blobConfigured = () => Boolean((process.env.BLOB_READ_WRITE_TOKEN ?? "").trim());
export const mediaBackend = (): "blob" | "redis" | "disk" => (blobConfigured() ? "blob" : redisConfigured() ? "redis" : "disk");

const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const mediaKey = (id: string) => `${KEY_PREFIX}media:${id}`;
const ID_RE = /^[a-f0-9]{24}\.(jpg|png|webp)$/;

/** Stores an image and returns the URL to save on the record. */
export async function saveImage(bytes: Uint8Array, folder = "offers"): Promise<string> {
  if (!bytes.length) throw badRequest("Empty file", { field: "file" });
  if (bytes.length > MAX_UPLOAD_BYTES) throw badRequest("Image too large (max 3 MB)", { field: "file" });
  const type = sniff(bytes);
  if (!type) throw badRequest("Only JPEG, PNG or WebP images are accepted", { field: "file" });
  const name = `${randomBytes(12).toString("hex")}.${TYPES[type]}`;

  switch (mediaBackend()) {
    case "blob": {
      const { put } = await import("@vercel/blob");
      const blob = await put(`${folder}/${name}`, Buffer.from(bytes), {
        access: "public",
        contentType: type,
        cacheControlMaxAge: 31_536_000,
        addRandomSuffix: false,
      });
      return blob.url;
    }
    case "redis": {
      const client = await redis();
      await client.set(mediaKey(name), JSON.stringify({ type, data: Buffer.from(bytes).toString("base64") }));
      return `/media/${name}`;
    }
    default: {
      mkdirSync(UPLOAD_DIR, { recursive: true });
      writeFileSync(path.join(UPLOAD_DIR, name), bytes);
      return `/media/${name}`;
    }
  }
}

/** Reads an image stored in Redis or on disk. */
export async function readImage(id: string): Promise<{ type: string; bytes: Buffer } | null> {
  if (!ID_RE.test(id)) return null;
  const type = Object.entries(TYPES).find(([, ext]) => id.endsWith(`.${ext}`))?.[0] ?? "application/octet-stream";
  if (redisConfigured()) {
    const raw = await (await redis()).get(mediaKey(id));
    if (raw) {
      const parsed = JSON.parse(raw) as { type: string; data: string };
      return { type: parsed.type, bytes: Buffer.from(parsed.data, "base64") };
    }
  }
  const file = path.join(UPLOAD_DIR, id);
  return existsSync(file) ? { type, bytes: readFileSync(file) } : null;
}

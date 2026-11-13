import type { LoaderFunctionArgs } from "react-router";
import { readImage } from "~/server/media.server";

/** GET /media/:id — uploaded photos kept in Redis or on disk (Vercel Blob photos have their own URL). */
export async function loader({ params }: LoaderFunctionArgs) {
  const image = await readImage(params.id ?? "").catch(() => null);
  if (!image) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(image.bytes), {
    headers: {
      "Content-Type": image.type,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

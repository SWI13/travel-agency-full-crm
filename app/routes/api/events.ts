import type { LoaderFunctionArgs } from "react-router";
import { subscribe } from "~/server/events.server";
import { jsonError } from "~/server/errors";
import { getUser, requireUser } from "~/server/session.server";

/** GET /api/events — Server-Sent Events stream of the record changes this user may see. */
export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const user = await requireUser(request);
    const encoder = new TextEncoder();
    let cleanup = () => {};

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const close = () => {
          cleanup();
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        };
        const write = (chunk: string) => {
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            cleanup();
          }
        };

        write("retry: 3000\nevent: ready\ndata: {}\n\n");
        const unsubscribe = subscribe(user, (event) => write(`data: ${JSON.stringify(event)}\n\n`));
        const heartbeat = setInterval(() => write(": ping\n\n"), 25_000);
        // Stop streaming to people whose access was revoked or changed while connected.
        const recheck = setInterval(async () => {
          const current = await getUser(request).catch(() => null);
          if (!current || current.role !== user.role) close();
        }, 60_000);

        cleanup = () => {
          unsubscribe();
          clearInterval(heartbeat);
          clearInterval(recheck);
        };
        request.signal.addEventListener("abort", close);
      },
      cancel() {
        cleanup();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

/** Error with an HTTP status and a stable code the client can translate. */
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
    public details?: unknown,
  ) {
    super(message ?? code);
    this.name = "HttpError";
  }
}

export const unauthorized = () => new HttpError(401, "unauthorized", "Sign in required");
export const forbidden = (message = "You do not have permission to do this") =>
  new HttpError(403, "forbidden", message);
export const notFound = (what = "Record") => new HttpError(404, "not_found", `${what} not found`);
export const badRequest = (message: string, details?: unknown) =>
  new HttpError(400, "invalid_input", message, details);

export function jsonError(error: unknown): Response {
  if (error instanceof HttpError) {
    return Response.json(
      { ok: false, code: error.code, message: error.message, details: error.details ?? null },
      { status: error.status },
    );
  }
  // Never leak internals (stack traces, tokens, provider messages) to the browser.
  console.error("[server] Unhandled error:", error instanceof Error ? error.message : error);
  return Response.json(
    { ok: false, code: "server_error", message: "Something went wrong. Please try again." },
    { status: 500 },
  );
}

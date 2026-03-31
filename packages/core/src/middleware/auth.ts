import { createMiddleware } from "hono/factory";

/**
 * Token-based authentication middleware for web mode.
 *
 * When MINECO_AUTH_TOKEN is set (web mode), validates requests against the token.
 * When not set (desktop mode), passes through with zero overhead.
 *
 * Accepts token via:
 * - Authorization: Bearer <token> header
 * - ?token=<token> query parameter
 */
export function tokenAuth() {
  const token = process.env.MINECO_AUTH_TOKEN;

  return createMiddleware(async (c, next) => {
    if (!token) {
      return next();
    }

    const authHeader = c.req.header("Authorization");
    const queryToken = c.req.query("token");

    const providedToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : queryToken;

    if (providedToken !== token) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    return next();
  });
}

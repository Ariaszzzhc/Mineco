import { Hono } from "hono";
import type { PendingPermissionStore } from "../services/pending-permission-store.js";

export function createPermissionRoutes(store: PendingPermissionStore) {
  return new Hono().post("/:sessionId/permission", async (c) => {
    const body = await c.req.json<{
      requestId?: string;
      decision?: string;
    }>();

    if (!body.requestId || !body.decision) {
      return c.json({ error: "requestId and decision are required" }, 400);
    }

    if (body.decision !== "allow" && body.decision !== "deny") {
      return c.json({ error: "decision must be 'allow' or 'deny'" }, 400);
    }

    const resolved = store.resolve(
      body.requestId,
      body.decision as "allow" | "deny",
    );

    if (!resolved) {
      return c.json(
        { error: "Permission request not found or expired" },
        404,
      );
    }

    return c.json({ ok: true });
  });
}

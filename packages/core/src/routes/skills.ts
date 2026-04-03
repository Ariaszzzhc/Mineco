import { Hono } from "hono";
import { SkillScanner } from "@mineco/agent";

export function createSkillsRoutes() {
  const scanner = new SkillScanner();

  return new Hono().get("/", async (c) => {
    const workspacePath = c.req.query("workspacePath");
    if (!workspacePath) {
      return c.json({ error: "workspacePath is required" }, 400);
    }
    const manifests = await scanner.scan(workspacePath);
    return c.json(manifests);
  });
}

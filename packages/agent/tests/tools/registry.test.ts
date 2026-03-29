import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ToolRegistry } from "../../src/tools/registry.js";
import type { ToolDefinition } from "../../src/tools/types.js";

function makeTool(name: string): ToolDefinition {
  return {
    name,
    description: `${name} tool`,
    parameters: z.object({ input: z.string() }),
    execute: async (params) => {
      const p = params as { input: string };
      return { output: `ran ${name} with ${p.input}` };
    },
  };
}

describe("ToolRegistry", () => {
  describe("register / get", () => {
    it("stores and retrieves a tool by name", () => {
      const reg = new ToolRegistry();
      const tool = makeTool("echo");
      reg.register(tool);
      expect(reg.get("echo")).toBe(tool);
    });

    it("returns undefined for unregistered tool", () => {
      const reg = new ToolRegistry();
      expect(reg.get("missing")).toBeUndefined();
    });

    it("overwrites when registering same name", () => {
      const reg = new ToolRegistry();
      const v1 = makeTool("echo");
      const v2 = makeTool("echo");
      reg.register(v1);
      reg.register(v2);
      expect(reg.get("echo")).toBe(v2);
    });
  });

  describe("getAll", () => {
    it("returns all registered tools", () => {
      const reg = new ToolRegistry();
      reg.register(makeTool("a"));
      reg.register(makeTool("b"));
      expect(reg.getAll()).toHaveLength(2);
    });

    it("returns empty array when nothing registered", () => {
      const reg = new ToolRegistry();
      expect(reg.getAll()).toEqual([]);
    });
  });

  describe("execute", () => {
    it("executes tool and returns result", async () => {
      const reg = new ToolRegistry();
      reg.register(makeTool("echo"));
      const result = await reg.execute("echo", '{"input":"hello"}', {
        workingDir: "/tmp",
      });
      expect(result).toEqual({ output: "ran echo with hello" });
    });

    it("returns error when tool not found", async () => {
      const reg = new ToolRegistry();
      const result = await reg.execute("missing", "{}", {
        workingDir: "/tmp",
      });
      expect(result.isError).toBe(true);
      expect(result.output).toContain("not found");
    });

    it("returns error for invalid JSON", async () => {
      const reg = new ToolRegistry();
      reg.register(makeTool("echo"));
      const result = await reg.execute("echo", "not-json", {
        workingDir: "/tmp",
      });
      expect(result.isError).toBe(true);
      expect(result.output).toContain("Invalid JSON");
    });

    it("catches tool execution errors", async () => {
      const reg = new ToolRegistry();
      reg.register({
        name: "boom",
        description: "explodes",
        parameters: z.object({}),
        execute: async () => {
          throw new Error("kaboom");
        },
      });
      const result = await reg.execute("boom", "{}", {
        workingDir: "/tmp",
      });
      expect(result.isError).toBe(true);
      expect(result.output).toContain("kaboom");
    });

    it("handles non-Error throws", async () => {
      const reg = new ToolRegistry();
      reg.register({
        name: "strange",
        description: "throws string",
        parameters: z.object({}),
        execute: async () => {
          throw "mystery"; // eslint-disable-line no-throw-literal
        },
      });
      const result = await reg.execute("strange", "{}", {
        workingDir: "/tmp",
      });
      expect(result.isError).toBe(true);
      expect(result.output).toContain("Unknown error");
    });

    it("passes workingDir in context", async () => {
      const reg = new ToolRegistry();
      let receivedDir = "";
      reg.register({
        name: "spy",
        description: "spy",
        parameters: z.object({}),
        execute: async (_p, ctx) => {
          receivedDir = ctx.workingDir;
          return { output: "ok" };
        },
      });
      await reg.execute("spy", "{}", { workingDir: "/custom/dir" });
      expect(receivedDir).toBe("/custom/dir");
    });
  });

  describe("toApiTools", () => {
    it("converts tools to API format", () => {
      const reg = new ToolRegistry();
      reg.register(makeTool("a"));
      const tools = reg.toApiTools();
      expect(tools).toHaveLength(1);
      expect(tools[0]).toMatchObject({
        name: "a",
        description: "a tool",
        parameters: expect.any(Object),
      });
    });

    it("returns empty array when nothing registered", () => {
      const reg = new ToolRegistry();
      expect(reg.toApiTools()).toEqual([]);
    });
  });
});

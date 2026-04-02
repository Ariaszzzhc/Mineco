import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ToolRegistry } from "../../src/tools/registry.js";
import { StreamingToolExecutor } from "../../src/tools/streaming-executor.js";
import type { ToolDefinition } from "../../src/tools/types.js";

function delayTool(
  name: string,
  delayMs: number,
  isConcurrencySafe: boolean,
): ToolDefinition {
  return {
    name,
    description: `${name} tool`,
    parameters: z.object({ input: z.string() }),
    isConcurrencySafe: () => isConcurrencySafe,
    execute: async (params) => {
      const p = params as { input: string };
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return { output: `${name}:${p.input}` };
    },
  };
}

function errorTool(name: string, isConcurrencySafe: boolean): ToolDefinition {
  return {
    name,
    description: `${name} tool`,
    parameters: z.object({ input: z.string() }),
    isConcurrencySafe: () => isConcurrencySafe,
    execute: async () => {
      return { output: `${name} failed`, isError: true };
    },
  };
}

function makeRegistry(...tools: ToolDefinition[]): ToolRegistry {
  const reg = new ToolRegistry();
  for (const tool of tools) {
    reg.register(tool);
  }
  return reg;
}

describe("StreamingToolExecutor", () => {
  describe("parallel execution of safe tools", () => {
    it("executes two safe tools in parallel (faster than serial)", async () => {
      const registry = makeRegistry(
        delayTool("safe_a", 100, true),
        delayTool("safe_b", 100, true),
      );

      const executor = new StreamingToolExecutor(registry, {
        workingDir: "/tmp",
      });

      const start = Date.now();
      executor.addTool("1", "safe_a", '{"input":"a"}');
      executor.addTool("2", "safe_b", '{"input":"b"}');

      const results = [];
      for await (const result of executor.getRemainingResults()) {
        results.push(result);
      }

      const elapsed = Date.now() - start;

      // Should complete in ~100ms (parallel), not ~200ms (serial)
      expect(elapsed).toBeLessThan(180);
      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({
        toolCallId: "1",
        toolName: "safe_a",
        output: "safe_a:a",
      });
      expect(results[1]).toMatchObject({
        toolCallId: "2",
        toolName: "safe_b",
        output: "safe_b:b",
      });
    });
  });

  describe("safe + unsafe tools", () => {
    it("runs safe tools first in parallel, then unsafe tool", async () => {
      let unsafeStart = 0;
      const registry = makeRegistry(
        delayTool("safe_a", 50, true),
        delayTool("safe_b", 50, true),
        {
          name: "unsafe",
          description: "unsafe tool",
          parameters: z.object({ input: z.string() }),
          isConcurrencySafe: () => false,
          execute: async (params) => {
            unsafeStart = Date.now();
            const p = params as { input: string };
            return { output: `unsafe:${p.input}` };
          },
        },
      );

      const executor = new StreamingToolExecutor(registry, {
        workingDir: "/tmp",
      });

      const start = Date.now();
      executor.addTool("1", "safe_a", '{"input":"a"}');
      executor.addTool("2", "safe_b", '{"input":"b"}');
      executor.addTool("3", "unsafe", '{"input":"c"}');

      const results = [];
      for await (const result of executor.getRemainingResults()) {
        results.push(result);
      }

      // Unsafe tool should start after safe tools complete (~50ms)
      expect(unsafeStart - start).toBeGreaterThanOrEqual(40);
      expect(results).toHaveLength(3);
      expect(results.map((r) => r.toolCallId)).toEqual(["1", "2", "3"]);
    });
  });

  describe("result ordering", () => {
    it("returns results in original order even when completion order differs", async () => {
      const registry = makeRegistry(
        delayTool("slow", 80, true),
        delayTool("fast", 10, true),
      );

      const executor = new StreamingToolExecutor(registry, {
        workingDir: "/tmp",
      });

      executor.addTool("1", "slow", '{"input":"s"}');
      executor.addTool("2", "fast", '{"input":"f"}');

      const results = [];
      for await (const result of executor.getRemainingResults()) {
        results.push(result);
      }

      // slow completes after fast, but results should be in original order
      expect(results[0]?.toolCallId).toBe("1");
      expect(results[1]?.toolCallId).toBe("2");
    });
  });

  describe("bash error cancels siblings", () => {
    it("cancels parallel safe tools when bash errors", async () => {
      const registry = makeRegistry(
        errorTool("bash", false),
        delayTool("safe_a", 50, true),
      );

      const executor = new StreamingToolExecutor(registry, {
        workingDir: "/tmp",
      });

      executor.addTool("1", "bash", '{"input":"x"}');
      executor.addTool("2", "safe_a", '{"input":"a"}');

      const results = [];
      for await (const result of executor.getRemainingResults()) {
        results.push(result);
      }

      // Bash is not concurrency-safe so it runs alone, but safe_a is queued
      // After bash errors, safe_a should get cancelled
      expect(results).toHaveLength(2);
      expect(results[0]?.isError).toBe(true);
      expect(results[0]?.toolName).toBe("bash");
      expect(results[1]?.isError).toBe(true);
      expect(results[1]?.output).toContain("Cancelled");
    });
  });

  describe("non-bash error does not cancel siblings", () => {
    it("non-bash errors allow other safe tools to complete", async () => {
      const registry = makeRegistry(
        errorTool("safe_err", true),
        delayTool("safe_ok", 50, true),
      );

      const executor = new StreamingToolExecutor(registry, {
        workingDir: "/tmp",
      });

      executor.addTool("1", "safe_err", '{"input":"e"}');
      executor.addTool("2", "safe_ok", '{"input":"o"}');

      const results = [];
      for await (const result of executor.getRemainingResults()) {
        results.push(result);
      }

      expect(results).toHaveLength(2);
      expect(results[0]?.isError).toBe(true);
      expect(results[0]?.toolName).toBe("safe_err");
      expect(results[1]?.isError).toBe(false);
      expect(results[1]?.output).toBe("safe_ok:o");
    });
  });

  describe("empty tool calls", () => {
    it("yields nothing when no tools added", async () => {
      const registry = makeRegistry();
      const executor = new StreamingToolExecutor(registry, {
        workingDir: "/tmp",
      });

      const results = [];
      for await (const result of executor.getRemainingResults()) {
        results.push(result);
      }

      expect(results).toEqual([]);
    });
  });
});

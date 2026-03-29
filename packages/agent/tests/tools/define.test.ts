import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineTool } from "../../src/tools/define.js";

describe("defineTool", () => {
  const testTool = defineTool({
    name: "test",
    description: "A test tool",
    parameters: z.object({
      value: z.number().min(0),
    }),
    execute: async (params) => ({ output: `got ${params.value}` }),
  });

  it("passes through valid arguments", async () => {
    const result = await testTool.execute({ value: 42 }, { workingDir: "/tmp" });
    expect(result).toEqual({ output: "got 42" });
  });

  it("returns isError with field path on Zod validation failure", async () => {
    const result = await testTool.execute(
      { value: -1 } as never,
      { workingDir: "/tmp" },
    );
    expect(result.isError).toBe(true);
    expect(result.output).toContain("value");
  });

  it("re-throws non-ZodError exceptions", async () => {
    const boom = defineTool({
      name: "boom",
      description: "throws",
      parameters: z.object({}),
      execute: async () => {
        throw new TypeError("type error");
      },
    });
    await expect(boom.execute({}, { workingDir: "/tmp" })).rejects.toThrow(
      TypeError,
    );
  });
});

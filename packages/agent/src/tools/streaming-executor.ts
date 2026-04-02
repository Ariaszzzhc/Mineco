import type { ToolRegistry } from "./registry.js";
import type { ToolContext, ToolResult } from "./types.js";

type ToolStatus = "queued" | "executing" | "completed" | "yielded";

interface TrackedTool {
  id: string;
  name: string;
  argsJson: string;
  status: ToolStatus;
  isConcurrencySafe: boolean;
  promise?: Promise<void>;
  result?: { output: string; isError: boolean };
}

interface ToolExecutionResult {
  toolCallId: string;
  toolName: string;
  output: string;
  isError: boolean;
}

/**
 * Executes tools with concurrency control.
 * - Concurrent-safe tools can execute in parallel with other concurrent-safe tools
 * - Non-concurrent tools must execute alone (exclusive access)
 * - Bash errors cancel all parallel siblings; other tool errors don't affect siblings
 * - Results are yielded in the original tool_calls array order
 */
export class StreamingToolExecutor {
  private tools: TrackedTool[] = [];
  private hasErrored = false;
  private siblingAbort = new AbortController();
  private nextYieldIndex = 0;

  constructor(
    private toolRegistry: ToolRegistry,
    private context: ToolContext,
  ) {}

  addTool(toolCallId: string, name: string, argsJson: string): void {
    const isSafe = this.toolRegistry.isConcurrencySafe(name, argsJson);

    this.tools.push({
      id: toolCallId,
      name,
      argsJson,
      status: "queued",
      isConcurrencySafe: isSafe,
    });

    void this.processQueue();
  }

  async *getRemainingResults(): AsyncGenerator<ToolExecutionResult> {
    while (this.hasUnfinishedTools()) {
      await this.processQueue();

      // Yield completed results in original order
      let yielded = false;
      while (this.nextYieldIndex < this.tools.length) {
        const tool = this.tools[this.nextYieldIndex]!;
        if (tool.status === "yielded") {
          this.nextYieldIndex++;
          continue;
        }
        if (tool.status === "completed") {
          tool.status = "yielded";
          this.nextYieldIndex++;
          yielded = true;
          yield {
            toolCallId: tool.id,
            toolName: tool.name,
            output: tool.result?.output ?? "",
            isError: tool.result?.isError ?? false,
          };
        } else {
          // executing or queued — stop to preserve order
          break;
        }
      }

      // If we didn't yield anything and tools are still executing, wait
      if (!yielded && this.hasExecutingTools()) {
        const executing = this.tools.filter(
          (t) => t.status === "executing" && t.promise,
        );
        if (executing.length > 0) {
          await Promise.race(executing.map((t) => t.promise!));
        }
      }
    }
  }

  private canExecuteTool(isConcurrencySafe: boolean): boolean {
    const executing = this.tools.filter((t) => t.status === "executing");
    return (
      executing.length === 0 ||
      (isConcurrencySafe && executing.every((t) => t.isConcurrencySafe))
    );
  }

  private async processQueue(): Promise<void> {
    for (const tool of this.tools) {
      if (tool.status !== "queued") continue;

      if (this.canExecuteTool(tool.isConcurrencySafe)) {
        await this.executeTool(tool);
      } else if (!tool.isConcurrencySafe) {
        break; // Non-safe tool must wait, preserve order
      }
    }
  }

  private async executeTool(tool: TrackedTool): Promise<void> {
    // If already cancelled by sibling error, produce synthetic error
    if (this.hasErrored) {
      tool.result = {
        output: "Cancelled: parallel tool call errored",
        isError: true,
      };
      tool.status = "completed";
      return;
    }

    tool.status = "executing";

    const collectResult = async (): Promise<void> => {
      const signal = this.siblingAbort.signal;
      if (signal.aborted) {
        tool.result = {
          output: "Cancelled: parallel tool call errored",
          isError: true,
        };
        tool.status = "completed";
        return;
      }

      try {
        const result: ToolResult = await this.toolRegistry.execute(
          tool.name,
          tool.argsJson,
          { ...this.context, signal },
        );
        tool.result = {
          output: result.output,
          isError: !!result.isError,
        };

        // Bash errors cancel siblings
        if (result.isError && tool.name === "bash") {
          this.hasErrored = true;
          this.siblingAbort.abort();
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        tool.result = { output: message, isError: true };

        if (tool.name === "bash") {
          this.hasErrored = true;
          this.siblingAbort.abort();
        }
      }

      tool.status = "completed";
    };

    const promise = collectResult();
    tool.promise = promise;

    void promise.finally(() => {
      void this.processQueue();
    });
  }

  private hasExecutingTools(): boolean {
    return this.tools.some((t) => t.status === "executing");
  }

  private hasUnfinishedTools(): boolean {
    return this.tools.some((t) => t.status !== "yielded");
  }
}

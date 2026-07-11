import { describe, expect, it } from "vitest";
import { LOCAL_AGENT_LIMITS } from "../../src/lib/agentLimits";

/** Mirrors flushParallelBatch chunking in ChatPane.svelte. */
async function flushParallelBatch<T>(
  batch: T[],
  maxConcurrent: number,
  run: (item: T) => Promise<T>
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < batch.length; i += maxConcurrent) {
    const chunk = batch.slice(i, i + maxConcurrent);
    out.push(...(await Promise.all(chunk.map(run))));
  }
  return out;
}

describe("parallel tool execution", () => {
  it("default agent limits allow parallel read-only batches", () => {
    expect(LOCAL_AGENT_LIMITS.parallelExecution).toBe(true);
    expect(LOCAL_AGENT_LIMITS.maxConcurrentTools).toBeGreaterThan(1);
  });

  it("runs tools concurrently up to maxConcurrentTools", async () => {
    let concurrent = 0;
    let peak = 0;

    const run = async (id: number) => {
      concurrent++;
      peak = Math.max(peak, concurrent);
      await new Promise((resolve) => setTimeout(resolve, 30));
      concurrent--;
      return id;
    };

    const results = await flushParallelBatch([1, 2, 3, 4], 4, run);
    expect(results).toEqual([1, 2, 3, 4]);
    expect(peak).toBe(4);
  });

  it("chunks large batches by maxConcurrentTools", async () => {
    let peak = 0;
    let concurrent = 0;

    const run = async (id: number) => {
      concurrent++;
      peak = Math.max(peak, concurrent);
      await new Promise((resolve) => setTimeout(resolve, 10));
      concurrent--;
      return id;
    };

    const results = await flushParallelBatch([1, 2, 3, 4, 5], 2, run);
    expect(results).toEqual([1, 2, 3, 4, 5]);
    expect(peak).toBe(2);
  });
});

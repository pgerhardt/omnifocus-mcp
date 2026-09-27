import { describe, expect, it } from "vitest";
import type { TaskId } from "../../domain/ids.js";
import { JxaTransport } from "./JxaTransport.js";
import { fakeTask } from "./sandbox/fixtures.js";
import { runJxaScriptInSandbox } from "./sandbox/index.js";
import type { ScriptSpawner } from "./scriptRunner.js";

const id = "task_parent" as TaskId;

function fixture(initial = false) {
  const native = { completedByChildren: initial, rejectWrites: false };
  const task = fakeTask({ id: () => id });
  // Expose only the supported native property for this regression.
  delete task.containsSingletonActions;
  Object.defineProperty(task, "completedByChildren", {
    get: () => () => native.completedByChildren,
    set: (value: boolean) => {
      if (native.rejectWrites) throw new Error("native write failed");
      native.completedByChildren = value;
    },
  });
  const spawner: ScriptSpawner = async (script, jsonArg) => ({
    stdout: JSON.stringify(runJxaScriptInSandbox(script, JSON.parse(jsonArg), { tasks: [task] })),
    stderr: "",
    exitCode: 0,
    timedOut: false,
  });
  return { native, transport: new JxaTransport({ spawner }) };
}

describe("JxaTransport — completedByChildren", () => {
  it.each([true, false])("reads native completedByChildren=%s", async (value) => {
    const { transport } = fixture(value);
    expect((await transport.getTask(id)).completedByChildren).toBe(value);
  });

  it("forwards both updates to the native setter and reads them back", async () => {
    const { native, transport } = fixture();
    for (const value of [true, false]) {
      await transport.updateTask(id, { completedByChildren: value });
      expect(native.completedByChildren).toBe(value);
      expect((await transport.getTask(id)).completedByChildren).toBe(value);
    }
    native.completedByChildren = true;
    await transport.updateTask(id, { flagged: true });
    expect(native.completedByChildren).toBe(true);
  });

  it("propagates a native write failure instead of reporting success", async () => {
    const { native, transport } = fixture();
    native.rejectWrites = true;
    await expect(transport.updateTask(id, { completedByChildren: true })).rejects.toThrow(
      "native write failed",
    );
    expect(native.completedByChildren).toBe(false);
  });
});

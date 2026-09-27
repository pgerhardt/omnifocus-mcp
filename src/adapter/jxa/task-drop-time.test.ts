import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";
import script from "../../scripts/jxa/task_drop.js";

it.each([null, "2026-08-20T17:32:15.000Z"])("passes drop time %s to the native command", (at) => {
  const task = { id: () => "task" };
  const markDropped = vi.fn();
  const app = { defaultDocument: { flattenedTasks: { byId: () => task } }, markDropped };
  const result = runInNewContext(`${script}\nrun([input])`, {
    Application: () => app,
    input: JSON.stringify({ id: "task", droppedAt: at }),
    Date,
  });
  expect(JSON.parse(result)).toEqual({ id: "task" });
  expect(markDropped).toHaveBeenCalledWith(task, at ? { droppedDate: new Date(at) } : undefined);
});

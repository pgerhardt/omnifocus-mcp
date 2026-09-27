import { expect, it } from "vitest";
import batchCreate from "../../scripts/jxa/task_batch_create.js";
import batchUpdate from "../../scripts/jxa/task_batch_update.js";
import create from "../../scripts/jxa/task_create.js";
import { fakeTask } from "./sandbox/fixtures.js";
import { runJxaScriptInSandbox } from "./sandbox/index.js";

it("sets the supported completion flag on direct creation", () => {
  expect(runJxaScriptInSandbox(create, { name: "task", completedByChildren: true })).toMatchObject({
    task: { completedByChildren: true },
  });
});

it("uses completedByChildren in batch create and update", () => {
  const parent = fakeTask({ id: () => "parent" });
  const doc = { tasks: [parent] };
  expect(
    runJxaScriptInSandbox(
      batchCreate,
      { inputs: [{ name: "child", parentId: "parent", completedByChildren: true }] },
      doc,
    ),
  ).toMatchObject({ failed: [] });
  const child = (parent.tasks as () => Array<{ completedByChildren: () => boolean }>)()[0];
  expect(child?.completedByChildren()).toBe(true);
  runJxaScriptInSandbox(
    batchUpdate,
    { updates: [{ id: "parent", patch: { completedByChildren: true } }] },
    doc,
  );
  expect((parent.completedByChildren as () => boolean)()).toBe(true);
  runJxaScriptInSandbox(
    batchUpdate,
    { updates: [{ id: "parent", patch: { completedByChildren: false } }] },
    doc,
  );
  expect((parent.completedByChildren as () => boolean)()).toBe(false);
});

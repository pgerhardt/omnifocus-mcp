import { describe, expect, it } from "vitest";
import projectGet from "../../../scripts/jxa/project_get.js";
import taskGet from "../../../scripts/jxa/task_get.js";
import { fakeProject, fakeTask } from "./fixtures.js";
import { runJxaScriptInSandbox } from "./index.js";

describe("native dropped timestamps", () => {
  it.each([null, new Date("2026-08-20T17:32:15.000Z")])("preserves %s", (date) => {
    const native = { droppedDate: () => date, completionDate: () => null };
    const task = Object.assign(fakeTask({ id: () => "task" }), native);
    const project = Object.assign(fakeProject({ id: () => "project" }), native);
    expect(runJxaScriptInSandbox(taskGet, { id: "task" }, { tasks: [task] })).toMatchObject({
      task: { droppedAt: date?.toISOString() ?? null },
    });
    expect(
      runJxaScriptInSandbox(projectGet, { id: "project" }, { projects: [project] }),
    ).toMatchObject({
      project: { droppedAt: date?.toISOString() ?? null },
    });
  });
});

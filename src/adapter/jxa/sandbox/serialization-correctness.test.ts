import { describe, expect, it } from "vitest";
import projectGet from "../../../scripts/jxa/project_get.js";
import tagGet from "../../../scripts/jxa/tag_get.js";
import taskGet from "../../../scripts/jxa/task_get.js";
import { fakeProject, fakeTag, fakeTask } from "./fixtures.js";
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

it.each([false, true])("serializes native floating timezone %s", (floating) => {
  const flags = { shouldUseFloatingTimeZone: () => floating };
  const task = Object.assign(fakeTask({ id: () => "task" }), flags);
  const project = Object.assign(fakeProject({ id: () => "project" }), flags);
  const expected = { deferDateFloating: floating, dueDateFloating: floating };
  expect(runJxaScriptInSandbox(taskGet, { id: "task" }, { tasks: [task] })).toMatchObject({
    task: expected,
  });
  expect(
    runJxaScriptInSandbox(projectGet, { id: "project" }, { projects: [project] }),
  ).toMatchObject({ project: expected });
});

it.each([
  [false, true, "active"],
  [false, false, "on-hold"],
  [true, true, "dropped"],
  [true, false, "dropped"],
] as const)("maps native tag flags %s/%s to %s", (hidden, allows, status) => {
  const tag = fakeTag({ id: () => "tag", hidden: () => hidden, allowsNextAction: () => allows });
  tag.status = () => {
    throw new Error("Unsupported accessor");
  };
  expect(runJxaScriptInSandbox(tagGet, { id: "tag" }, { tags: [tag] })).toMatchObject({
    tag: { status },
  });
});

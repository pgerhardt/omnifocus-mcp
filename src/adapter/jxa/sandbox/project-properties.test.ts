import { describe, expect, it, vi } from "vitest";
import projectGet from "../../../scripts/jxa/project_get.js";
import { fakeProject } from "./fixtures.js";
import { runJxaScriptInSandbox } from "./index.js";

function readProject(project: Record<string, unknown>) {
  return runJxaScriptInSandbox<{ project: Record<string, unknown> }>(
    projectGet,
    { id: "project" },
    { projects: [project] },
  ).project;
}

describe("project scalar property records", () => {
  it.each([
    [false, false, "parallel", "active status", "active"],
    [false, true, "sequential", "done status", "done"],
    [true, false, "singleActions", "on hold status", "on-hold"],
    [true, true, "singleActions", "dropped status", "dropped"],
  ])("serializes native flags %s/%s and status %s/%s/%s", (singleton, sequential, type, raw, status) => {
    const date = new Date("2026-09-20T12:34:56.000Z");
    const record = {
      name: "Native project",
      note: "Native note",
      flagged: true,
      status: raw,
      deferDate: date,
      dueDate: date,
      shouldUseFloatingTimeZone: true,
      completionDate: date,
      droppedDate: date,
      estimatedMinutes: 30,
      reviewInterval: { unit: "week", steps: 2, fixed: true },
      nextReviewDate: date,
      lastReviewDate: date,
      singletonActionHolder: singleton,
      sequential,
      creationDate: date,
      modificationDate: date,
      numberOfTasks: 3,
      numberOfCompletedTasks: 1,
    };
    const getters = Object.fromEntries(Object.keys(record).map((key) => [key, vi.fn()]));
    const properties = vi.fn(() => ({ ...record, id: "project" }));
    const project = Object.assign(fakeProject({ id: () => "project" }), getters, {
      properties,
      folder: () => ({ class: () => "folder", id: () => "folder" }),
      tags: () => [{ id: () => "tag" }],
    });
    expect(readProject(project)).toEqual({
      id: "project",
      name: "Native project",
      note: "Native note",
      noteHtml: null,
      folderId: "folder",
      tagIds: ["tag"],
      status,
      completionCriterion: type,
      deferDate: date.toISOString(),
      dueDate: date.toISOString(),
      deferDateFloating: true,
      dueDateFloating: true,
      completedAt: date.toISOString(),
      droppedAt: date.toISOString(),
      estimatedMinutes: 30,
      flagged: true,
      reviewIntervalDays: 14,
      nextReviewDate: date.toISOString(),
      lastReviewDate: date.toISOString(),
      completed: status === "done",
      dropped: status === "dropped",
      taskCount: 3,
      completedTaskCount: 1,
      createdAt: date.toISOString(),
      modifiedAt: date.toISOString(),
    });
    expect(properties).toHaveBeenCalledTimes(1);
    for (const getter of Object.values(getters)) expect(getter).not.toHaveBeenCalled();
  });

  it("preserves false, zero, empty strings and null without falling back", () => {
    const record = {
      name: "",
      note: "",
      flagged: false,
      estimatedMinutes: 0,
      shouldUseFloatingTimeZone: false,
      dueDate: null,
      reviewInterval: null,
      singletonActionHolder: false,
      sequential: false,
      numberOfTasks: 0,
      numberOfCompletedTasks: 0,
    };
    const getters = Object.fromEntries(Object.keys(record).map((key) => [key, vi.fn(() => true)]));
    const project = Object.assign(fakeProject({ id: () => "project" }), getters, {
      properties: () => record,
    });
    expect(readProject(project)).toMatchObject({
      name: "",
      note: null, // Existing public conversion of an empty note remains unchanged.
      flagged: false,
      estimatedMinutes: 0,
      deferDateFloating: false,
      dueDateFloating: false,
      dueDate: null,
      reviewIntervalDays: null,
      completionCriterion: "parallel",
      taskCount: 0,
      completedTaskCount: 0,
    });
    for (const getter of Object.values(getters)) expect(getter).not.toHaveBeenCalled();
  });

  it.each(["throws", "null", "missing", "partial"])("falls back when the record is %s", (kind) => {
    const name = vi.fn(() => "Getter name");
    const flagged = vi.fn(() => true);
    const project = fakeProject({ id: () => "project", name, flagged });
    const expected = readProject(project);
    name.mockClear();
    flagged.mockClear();
    project.properties = vi.fn(() => {
      if (kind === "throws") throw new Error("Native record unavailable");
      if (kind === "null") return null;
      if (kind === "missing") return undefined;
      // Inherited keys are absent from the native record, not scalar values.
      return Object.assign(Object.create({ name: "Wrong inherited name" }), { note: "" });
    });
    expect(readProject(project)).toEqual(expected);
    expect(project.properties).toHaveBeenCalledTimes(1);
    expect(name).toHaveBeenCalledTimes(1);
    expect(flagged).toHaveBeenCalledTimes(1);
  });
});

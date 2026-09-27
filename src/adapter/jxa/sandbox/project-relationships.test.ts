import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import projectList from "../../../scripts/jxa/project_list.js";
import { fakeProject } from "./fixtures.js";

function project(id: string, folderId: string | null, tagIds: string[]) {
  return Object.assign(fakeProject({ id: () => id }), {
    id: vi.fn(() => id),
    properties: vi.fn(() => ({
      id,
      status: "active status",
      flagged: false,
      numberOfTasks: 7,
      numberOfCompletedTasks: 3,
    })),
    folder: vi.fn(() => (folderId ? { class: () => "folder", id: () => folderId } : null)),
    tags: vi.fn(() => tagIds.map((tagId) => ({ id: () => tagId }))),
    numberOfTasks: vi.fn(() => 99),
    numberOfCompletedTasks: vi.fn(() => 99),
  });
}

function list(
  projects: ReturnType<typeof project>[],
  evaluateJavascript: (source: string) => unknown,
  filter = {},
) {
  const app = {
    defaultDocument: {
      flattenedProjects: () => projects,
      folders: { byId: () => ({ projects: () => projects.slice(0, 1) }) },
    },
    evaluateJavascript,
  };
  return JSON.parse(
    runInNewContext(`${projectList}\nrun([input])`, {
      Application: () => app,
      input: JSON.stringify(filter),
    }),
  );
}

describe("batched project relationships", () => {
  it.each([
    {},
    { folderId: "folder" },
  ])("joins by ID and preserves full records for %j", (filter) => {
    const projects = [project("nested", "folder", ["B", "A"]), project("root", null, [])];
    const expected = list(projects, () => undefined, filter);
    vi.clearAllMocks();
    const evaluate = vi.fn((source: string) =>
      runInNewContext(source, {
        flattenedProjects: [
          { id: { primaryKey: "root" }, parentFolder: null, tags: [] },
          {
            id: { primaryKey: "nested" },
            parentFolder: { id: { primaryKey: "folder" } },
            tags: [{ id: { primaryKey: "B" } }, { id: { primaryKey: "A" } }],
          },
        ],
      }),
    );
    expect(list(projects, evaluate, filter)).toEqual(expected);
    expect(evaluate).toHaveBeenCalledTimes(1);
    for (const p of projects) {
      for (const getter of [p.id, p.folder, p.tags, p.numberOfTasks, p.numberOfCompletedTasks])
        expect(getter).not.toHaveBeenCalled();
    }
    expect(projects[0]?.properties).toHaveBeenCalledTimes(1);
  });

  it.each([
    "unavailable",
    "missing ID",
    "invalid folder",
    "invalid tags",
  ])("retains complete getter results when relationships are %s", (kind) => {
    const projects = [project("nested", "folder", ["B", "A"]), project("root", null, [])];
    const expected = list(projects, () => undefined);
    vi.clearAllMocks();
    const evaluate = vi.fn(() => {
      if (kind === "unavailable") throw new Error("OmniJS unavailable");
      return JSON.stringify([
        {
          id: kind === "missing ID" ? "different" : "nested",
          folderId: kind === "invalid folder" ? 42 : "folder",
          tagIds: kind === "invalid tags" ? [null] : ["B", "A"],
        },
      ]);
    });
    expect(list(projects, evaluate)).toEqual(expected);
    expect(evaluate).toHaveBeenCalledTimes(1);
    for (const p of projects) {
      expect(p.folder).toHaveBeenCalledTimes(1);
      expect(p.tags).toHaveBeenCalledTimes(1);
    }
  });

  it("does not read relationships when the prefilter rejects every project", () => {
    const projects = [project("active", null, [])];
    const evaluate = vi.fn();
    expect(list(projects, evaluate, { flagged: true })).toEqual({ projects: [] });
    expect(evaluate).not.toHaveBeenCalled();
    expect(projects[0]?.folder).not.toHaveBeenCalled();
    expect(projects[0]?.tags).not.toHaveBeenCalled();
  });
});

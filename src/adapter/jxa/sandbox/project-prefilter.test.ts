import { describe, expect, it, vi } from "vitest";
import type { Project } from "../../../domain/project.js";
import projectList from "../../../scripts/jxa/project_list.js";
import { fakeProject } from "./fixtures.js";
import { runJxaScriptInSandbox } from "./index.js";

function project(id: string, status: string, flagged: boolean) {
  return Object.assign(
    fakeProject({ id: () => id, status: () => status, flagged: () => flagged }),
    {
      properties: vi.fn(() => ({ status, flagged })),
      folder: vi.fn(() => null),
      tags: vi.fn(() => []),
    },
  );
}

function list(projects: unknown[], filter: { status?: string; flagged?: boolean }) {
  return runJxaScriptInSandbox<{ projects: Project[] }>(projectList, filter, { projects }).projects;
}

describe("project scalar prefilter", () => {
  it.each([
    {},
    { status: "active" },
    { status: "done" },
    { status: "on-hold" },
    { status: "dropped" },
    { flagged: true },
    { flagged: false },
    { status: "done", flagged: false },
    { status: "on-hold", flagged: true },
  ])("preserves full records and skips rejected serializers for %j", (filter) => {
    const projects = [
      project("active", "active status", false),
      project("done", "done status", true),
      project("hold", "on hold status", true),
      project("dropped", "dropped status", false),
    ];
    const expected = list(projects, {}).filter(
      (p) =>
        (filter.status === undefined || p.status === filter.status) &&
        (filter.flagged === undefined || p.flagged === filter.flagged),
    );
    for (const p of projects) {
      p.properties.mockClear();
      p.folder.mockClear();
      p.tags.mockClear();
    }
    expect(list(projects, filter)).toEqual(expected);
    for (const p of projects) {
      expect(p.properties).toHaveBeenCalledTimes(1);
      const serialized = expected.some((item) => item.id === (p.id as () => string)()) ? 1 : 0;
      expect(p.folder).toHaveBeenCalledTimes(serialized);
      expect(p.tags).toHaveBeenCalledTimes(serialized);
    }
  });

  it.each([
    "throws",
    "null",
    "undefined",
    "missing keys",
    "inherited keys",
  ])("retains getter fallback and final guards when the record has %s", (kind) => {
    const p = project("fallback", "done status", true);
    const properties = vi.fn(() => {
      if (kind === "throws") throw new Error("Unavailable record");
      if (kind === "null") return null;
      if (kind === "undefined") return undefined;
      if (kind === "missing keys") return {};
      return Object.create({ status: "active status", flagged: false });
    });
    Object.assign(p, { properties });
    expect(list([p], { status: "done", flagged: true })).toMatchObject([
      { id: "fallback", status: "done", flagged: true },
    ]);
    expect(properties).toHaveBeenCalledTimes(1);
    expect(p.folder).toHaveBeenCalledTimes(1);
    expect(list([p], { status: "active" })).toEqual([]);
    expect(list([p], { flagged: false })).toEqual([]);
  });

  it("retains active/false defaults when both record and getters fail", () => {
    const p = project("fallback", "done status", true);
    const unavailable = () => {
      throw new Error("Unavailable native value");
    };
    Object.assign(p, { properties: unavailable, status: unavailable, flagged: unavailable });
    expect(list([p], { status: "active", flagged: false })).toMatchObject([
      { id: "fallback", status: "active", flagged: false },
    ]);
  });
});

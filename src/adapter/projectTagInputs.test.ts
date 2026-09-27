import vm from "node:vm";
import { expect, it, vi } from "vitest";
import { ProjectId, TagId } from "../domain/ids.js";
import { JxaTransport } from "./jxa/JxaTransport.js";
import { OmniJsTransport } from "./omnijs/OmniJsTransport.js";

const ids = [TagId.of("tag_a"), TagId.of("tag_b")];

function harness() {
  const tags = ids.map((id) => ({ id: { primaryKey: id } }));
  let project: Project | undefined;
  class Project {
    static Status = { Active: "active" };
    static byIdentifier = () => project;
    id = { primaryKey: "project_fixture" };
    status = "active";
    tags: typeof tags = [];
    task = { tags: this.tags };
    constructor(public name: string) {
      project = this;
    }
    addTags(desired: typeof tags) {
      this.tags.push(...desired.filter((tag) => !this.tags.includes(tag)));
    }
    clearTags() {
      this.tags.length = 0;
    }
  }
  const app = {
    defaultDocument: {
      flattenedProjects: {
        byId: () => ({ id: () => project?.id.primaryKey, name: () => project?.name }),
      },
    },
    evaluateJavascript: (source: string) =>
      vm.runInNewContext(source, {
        Project,
        Tag: { byIdentifier: (id: string) => tags.find((tag) => tag.id.primaryKey === id) },
        library: { ending: {} },
        deleteObject: vi.fn(),
      }),
  };
  const spawner = async (body: string, args: string) => ({
    stdout: vm.runInNewContext(`${body}\nrun([${JSON.stringify(args)}])`, {
      Application: () => app,
    }),
    stderr: "",
    exitCode: 0,
    timedOut: false,
  });
  return {
    create: new OmniJsTransport({ spawner }),
    update: new JxaTransport({ spawner }),
    seed: () => new Project("Fixture").addTags(tags),
    project: () => project,
    tagIds: () => project?.tags.map((tag) => tag.id.primaryKey),
  };
}

it("project_create forwards and applies the requested tags", async () => {
  const h = harness();
  await h.create.createProject({ name: "Fixture", tagIds: ids });
  expect(h.tagIds()).toEqual(ids);
});

it.each([
  { tagIds: ids.slice(1) },
  { tagIds: [] },
])("project_update replaces tags with $tagIds", async ({ tagIds }) => {
  const h = harness();
  h.seed();
  await h.update.updateProject(ProjectId.of("project_fixture"), { tagIds });
  expect(h.tagIds()).toEqual(tagIds);
});

it("rejects missing tags before creating a project or clearing existing tags", async () => {
  const h = harness();
  const tagIds = [...ids, TagId.of("missing_tag")];
  await expect(h.create.createProject({ name: "Fixture", tagIds })).rejects.toThrow(
    "Tag not found",
  );
  expect(h.project()).toBeUndefined();
  h.seed();
  await expect(h.update.updateProject(ProjectId.of("project_fixture"), { tagIds })).rejects.toThrow(
    "Tag not found",
  );
  expect(h.tagIds()).toEqual(ids);
});

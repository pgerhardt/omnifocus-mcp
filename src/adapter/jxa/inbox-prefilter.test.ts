import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { OmniFocusLruCache } from "../../cache/lruCache.js";
import { TaskService } from "../../services/taskService.js";
import { JxaTransport } from "./JxaTransport.js";
import { fakeTask } from "./sandbox/fixtures.js";
import type { ScriptSpawner } from "./scriptRunner.js";

function task(id: string, completed: boolean) {
  return fakeTask({
    id: () => id,
    name: vi.fn(() => id),
    completed: vi.fn(() => completed),
    creationDate: () => new Date("2026-01-01T00:00:00Z"),
    modificationDate: () => new Date("2026-01-02T00:00:00Z"),
  });
}

function harness(inbox: ReturnType<typeof task>[]) {
  const notifications = [{ kind: "absolute", fireAt: "2027-01-01T12:00:00.000Z" }];
  const app = {
    defaultDocument: { inboxTasks: () => inbox },
    evaluateJavascript: vi.fn(() => JSON.stringify(notifications)),
  };
  const spawner: ScriptSpawner = vi.fn(async (script, args) => ({
    stdout: runInNewContext(`${script}\nrun([args])`, { Application: () => app, args }),
    stderr: "",
    exitCode: 0,
    timedOut: false,
  }));
  const service = new TaskService({
    adapter: new JxaTransport({ spawner }),
    cache: new OmniFocusLruCache({ ttlMs: 30_000 }),
  });
  return { service, spawner, app, notifications };
}

describe("Inbox completion prefilter through service and JXA transport", () => {
  it("uses native local-completion selection without rereading flags or changing records/order", async () => {
    const done = task("done", true);
    const survivors = [task("zzz", false), task("aaa", false)] as const;
    Object.assign(survivors[0], { effectivelyCompleted: () => true, dropped: () => true });
    const { app, spawner } = harness([survivors[0], done, survivors[1]]);
    const adapter = new JxaTransport({ spawner });
    const baseline = await adapter.listTasks({ inbox: true, completed: false });
    const whose = vi.fn(() => () => survivors);
    Object.assign(app.defaultDocument.inboxTasks, { whose });
    vi.clearAllMocks();
    expect(await adapter.listTasks({ inbox: true, completed: false })).toEqual(baseline);
    expect(whose).toHaveBeenCalledExactlyOnceWith({ completed: false });
    for (const t of [done, ...survivors]) expect(t.completed).not.toHaveBeenCalled();
    expect(done.name).not.toHaveBeenCalled();
  });

  it("falls back to the existing local scan if the native predicate is rejected", async () => {
    const done = task("done", true);
    const open = task("open", false);
    const { app, service } = harness([done, open]);
    Object.assign(app.defaultDocument.inboxTasks, {
      whose: () => {
        throw new Error("Predicate unavailable");
      },
    });
    expect((await service.list({ inbox: true, completed: "exclude" })).tasks).toMatchObject([
      { id: "open", completed: false },
    ]);
    expect(done.name).not.toHaveBeenCalled();
    expect(open.completed).toHaveBeenCalledTimes(1);
  });

  it("skips completed serializers, reuses local state and preserves every survivor field", async () => {
    const done = task("done", true);
    const survivor = task("survivor", false);
    Object.assign(survivor, {
      blocked: () => true,
      effectivelyCompleted: () => true,
      effectivelyDropped: () => true,
      deferDate: () => new Date("2027-01-01T00:00:00Z"),
      tags: () => [{ id: () => "tag" }],
      estimatedMinutes: () => 0,
    });
    const { service, app, notifications } = harness([done, survivor]);
    const baseline = await service.list({ inbox: true, completed: "any" });
    vi.clearAllMocks();
    const result = await service.list({ inbox: true, completed: "exclude" });
    expect(result.tasks).toEqual(baseline.tasks.filter((t) => !t.completed));
    expect(result.tasks[0]).toMatchObject({
      completed: false,
      blocked: true,
      available: false,
      tagIds: ["tag"],
      estimatedMinutes: 0,
      notifications,
    });
    expect(done.name).not.toHaveBeenCalled();
    expect(survivor.completed).toHaveBeenCalledTimes(1);
    expect(app.evaluateJavascript).toHaveBeenCalledTimes(1);
  });

  it.each([
    undefined,
    "any",
    "only",
  ] as const)("preserves completion policy %s", async (completed) => {
    const { service, spawner, app } = harness([task("done", true), task("open", false)]);
    const whose = vi.fn();
    Object.assign(app.defaultDocument.inboxTasks, { whose });
    const result = await service.list({
      inbox: true,
      ...(completed !== undefined ? { completed } : {}),
    });
    expect(result.tasks.map((t) => t.id)).toEqual(
      completed === "only" ? ["done"] : ["done", "open"],
    );
    expect(whose).not.toHaveBeenCalled();
    expect(JSON.parse(vi.mocked(spawner).mock.calls[0]?.[1] ?? "{}")).toMatchObject({
      inbox: true,
      completed: completed === "only" ? true : null,
    });
  });

  it("preserves the serializer's false default on a failed completion read", async () => {
    const t = task("unreadable", false);
    t.completed = vi.fn(() => {
      throw new Error("Can't get object");
    });
    const { service } = harness([t]);
    expect((await service.list({ inbox: true, completed: "exclude" })).tasks).toMatchObject([
      { id: "unreadable", completed: false },
    ]);
    expect(t.completed).toHaveBeenCalledTimes(1);
  });

  it("sorts survivors before stable cursor pagination without dropping later candidates", async () => {
    const { service } = harness([task("zzz", false), task("done", true), task("aaa", false)]);
    const first = await service.list({ inbox: true, completed: "exclude", limit: 1 });
    expect(first.tasks.map((t) => t.id)).toEqual(["aaa"]);
    expect(first.hasMore).toBe(true);
    if (!first.nextCursor) throw new Error("Expected a continuation cursor");
    const last = await service.list({
      inbox: true,
      completed: "exclude",
      limit: 1,
      cursor: first.nextCursor,
    });
    expect(last.tasks.map((t) => t.id)).toEqual(["zzz"]);
    expect(last.hasMore).toBe(false);
    expect(last.nextCursor).toBeNull();
  });
});

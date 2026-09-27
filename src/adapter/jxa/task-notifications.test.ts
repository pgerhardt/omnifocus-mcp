import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";
import script from "../../scripts/jxa/task_get.js";
import listScript from "../../scripts/jxa/task_list.js";
import { fakeTask } from "./sandbox/fixtures.js";

it("reads absolute and relative notifications without losing sign or units", () => {
  const native = {
    notifications: [
      { kind: "absolute", absoluteFireDate: new Date("2027-01-01T12:00:00Z") },
      { kind: "due", relativeFireOffset: -300 },
      { kind: "due", relativeFireOffset: 300 },
      { kind: "defer", relativeFireOffset: -90 },
    ],
  };
  const app = {
    defaultDocument: { flattenedTasks: { byId: () => fakeTask({ id: () => "task" }) } },
    evaluateJavascript: (source: string) =>
      runInNewContext(source, {
        Task: {
          byIdentifier: () => native,
          Notification: {
            Kind: { Absolute: "absolute", DueRelative: "due", DeferRelative: "defer" },
          },
        },
      }),
  };
  const get = () =>
    JSON.parse(runInNewContext(`${script}\nrun(['{"id":"task"}'])`, { Application: () => app }));
  expect(get().task.notifications).toEqual([
    { kind: "absolute", fireAt: "2027-01-01T12:00:00.000Z" },
    { kind: "due-relative", offsetSeconds: 300 },
    { kind: "due-relative", offsetSeconds: -300 },
    { kind: "defer-relative", offsetSeconds: 90 },
  ]);
  native.notifications = [];
  expect(get().task.notifications).toEqual([]);
});

function batchHarness(ids = ["empty", "alarms"]) {
  const native: Record<string, { notifications: object[] }> = {
    alarms: {
      notifications: [
        { kind: "absolute", absoluteFireDate: new Date("2027-01-01T12:00:00Z") },
        { kind: "due", relativeFireOffset: -300 },
        { kind: "due", relativeFireOffset: 300 },
        { kind: "defer", relativeFireOffset: -90 },
      ],
    },
    empty: { notifications: [] },
  };
  const tasks = ids.map((id) => fakeTask({ id: () => id, completed: () => false }));
  const app = {
    defaultDocument: {
      inboxTasks: Object.assign(() => tasks, { whose: () => () => tasks }),
    },
    evaluateJavascript: vi.fn((source: string) =>
      runInNewContext(source, {
        Task: {
          byIdentifier: (id: string) => native[id],
          Notification: {
            Kind: { Absolute: "absolute", DueRelative: "due", DeferRelative: "defer" },
          },
        },
      }),
    ),
  };
  const read = (completed: boolean | null = false) =>
    JSON.parse(
      runInNewContext(`${listScript}\nrun([args])`, {
        Application: () => app,
        args: JSON.stringify({ inbox: true, completed }),
      }),
    ).tasks;
  return { read, app, native };
}

it("batches survivor notifications by ID, preserving fields, kinds, order and empty lists", () => {
  const { read, app } = batchHarness();
  const baseline = read(null);
  expect(app.evaluateJavascript).toHaveBeenCalledTimes(2);
  app.evaluateJavascript.mockClear();
  const batched = read();
  expect(batched).toEqual(baseline);
  expect(batched.map((t: { id: string }) => t.id)).toEqual(["empty", "alarms"]);
  expect(batched[0].notifications).toEqual([]);
  expect(batched[1].notifications).toEqual([
    { kind: "absolute", fireAt: "2027-01-01T12:00:00.000Z" },
    { kind: "due-relative", offsetSeconds: 300 },
    { kind: "due-relative", offsetSeconds: -300 },
    { kind: "defer-relative", offsetSeconds: 90 },
  ]);
  expect(app.evaluateJavascript).toHaveBeenCalledTimes(1);
});

it("does not read notifications for an empty selection", () => {
  const { read, app } = batchHarness([]);
  expect(read()).toEqual([]);
  expect(app.evaluateJavascript).not.toHaveBeenCalled();
});

it("propagates native failures and missing results rather than fabricating empty lists", () => {
  const { read, app, native } = batchHarness();
  delete native.alarms;
  expect(() => read()).toThrow("Task not found: alarms");
  native.alarms = { notifications: [{ kind: "unsupported" }] };
  expect(() => read()).toThrow("Unsupported notification kind");
  app.evaluateJavascript.mockImplementation(() => {
    throw new Error("Native read failed");
  });
  expect(() => read()).toThrow("Native read failed");
  app.evaluateJavascript.mockReturnValue(JSON.stringify({ empty: [] }));
  expect(() => read()).toThrow("Missing notifications for task alarms");
  app.evaluateJavascript.mockReturnValue(JSON.stringify({ empty: null, alarms: [] }));
  expect(() => read()).toThrow("Missing notifications for task empty");
});

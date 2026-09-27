import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";
import script from "../../scripts/jxa/task_get.js";
import { fakeTask } from "./sandbox/fixtures.js";

it("reads absolute and due-relative notifications without losing sign or units", () => {
  const native = {
    notifications: [
      { kind: "absolute", absoluteFireDate: new Date("2027-01-01T12:00:00Z") },
      { kind: "due", relativeFireOffset: -300 },
      { kind: "due", relativeFireOffset: 300 },
    ],
  };
  const app = {
    defaultDocument: { flattenedTasks: { byId: () => fakeTask({ id: () => "task" }) } },
    evaluateJavascript: (source: string) =>
      runInNewContext(source, {
        Task: {
          byIdentifier: () => native,
          Notification: { Kind: { Absolute: "absolute", DueRelative: "due" } },
        },
      }),
  };
  const get = () =>
    JSON.parse(runInNewContext(`${script}\nrun(['{"id":"task"}'])`, { Application: () => app }));
  expect(get().task.notifications).toEqual([
    { kind: "absolute", fireAt: "2027-01-01T12:00:00.000Z" },
    { kind: "due-relative", offsetSeconds: 300 },
    { kind: "due-relative", offsetSeconds: -300 },
  ]);
  native.notifications = [];
  expect(get().task.notifications).toEqual([]);
});

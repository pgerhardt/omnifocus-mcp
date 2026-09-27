import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";
import script from "../../scripts/jxa/perspective_evaluate.js";
import { fakeTask } from "./sandbox/fixtures.js";

it("reads Inbox from the default document without an application-level collection", () => {
  const app = {
    evaluateJavascript: (source: string) =>
      runInNewContext(source, {
        Task: {
          byIdentifier: (id: string) => (id === "inbox-task" ? { notifications: [] } : null),
          Notification: { Kind: {} },
        },
      }),
    defaultDocument: { inboxTasks: () => [fakeTask({ id: () => "inbox-task" })] },
  };
  const output = runInNewContext(`${script}\nrun(['{"perspectiveId":"inbox"}'])`, {
    Application: () => app,
  });
  expect(JSON.parse(output).tasks[0].notifications).toEqual([]);
  expect(JSON.parse(output).tasks.map((t: { id: string }) => t.id)).toEqual(["inbox-task"]);
});

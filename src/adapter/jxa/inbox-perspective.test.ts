import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";
import script from "../../scripts/jxa/perspective_evaluate.js";
import { fakeTask } from "./sandbox/fixtures.js";

it("reads Inbox from the default document without an application-level collection", () => {
  const app = { defaultDocument: { inboxTasks: () => [fakeTask({ id: () => "inbox-task" })] } };
  const output = runInNewContext(`${script}\nrun(['{"perspectiveId":"inbox"}'])`, {
    Application: () => app,
  });
  expect(JSON.parse(output).tasks.map((t: { id: string }) => t.id)).toEqual(["inbox-task"]);
});

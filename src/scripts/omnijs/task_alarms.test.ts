import vm from "node:vm";
import { expect, it, vi } from "vitest";
import clearScript from "./task_clear_alarms.js";
import setScript from "./task_set_alarms.js";

it.each([
  ["clear", clearScript],
  ["replace", setScript],
])("%s removes native notifications and stops on removal failure", (operation, script) => {
  for (const failRemoval of [false, true]) {
    // OmniFocus 4.9.2: removal belongs to Task, not Task.Notification.
    const notifications = [{}, {}];
    const task = {
      notifications,
      removeNotification(notification: object) {
        if (failRemoval) throw new Error("removal failed");
        notifications.splice(notifications.indexOf(notification), 1);
      },
      addNotification: vi.fn(() => notifications.push({})),
    };
    const alarms = [{ kind: "absolute", fireAt: "2030-01-01T12:00:00.000Z" }];
    const result = JSON.parse(
      vm.runInNewContext(script, {
        Task: { byIdentifier: () => task },
        __args: { taskId: "fixture", alarms },
      }),
    );
    if (failRemoval) {
      expect(result).toMatchObject({ error: { code: "REMOVE_FAILED" } });
      expect(notifications).toHaveLength(2);
      expect(task.addNotification).not.toHaveBeenCalled();
    } else {
      expect(result).toEqual({ ok: true });
      expect(notifications).toHaveLength(operation === "replace" ? 1 : 0);
      expect(task.addNotification).toHaveBeenCalledTimes(operation === "replace" ? 1 : 0);
    }
  }
});

it.each([300, -300])("maps public due offset %s to native seconds", (offsetSeconds) => {
  const task = { notifications: [], addNotification: vi.fn() };
  const result = JSON.parse(
    vm.runInNewContext(setScript, {
      Task: { byIdentifier: () => task },
      __args: { taskId: "fixture", alarms: [{ kind: "due-relative", offsetSeconds }] },
    }),
  );
  expect(result).toEqual({ ok: true });
  expect(task.addNotification).toHaveBeenCalledWith(-offsetSeconds);
});

it("rejects unsupported defer anchors before clearing existing notifications", () => {
  const task = { notifications: [{}], removeNotification: vi.fn(), addNotification: vi.fn() };
  const result = JSON.parse(
    vm.runInNewContext(setScript, {
      Task: { byIdentifier: () => task },
      __args: { taskId: "fixture", alarms: [{ kind: "defer-relative", offsetSeconds: 300 }] },
    }),
  );
  expect(result.error.code).toBe("VALIDATION");
  expect(task.removeNotification).not.toHaveBeenCalled();
  expect(task.addNotification).not.toHaveBeenCalled();
});

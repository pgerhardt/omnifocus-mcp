import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";
import script from "../../scripts/jxa/window_set_perspective.js";
import { defineWritableAccessor } from "./sandbox/index.js";

it("switches built-ins by native name and verifies the write", () => {
  const w = {};
  defineWritableAccessor(w, "perspectiveName", "Projects");
  const app = { windows: () => [w], perspectiveNames: () => ["Inbox", "Projects"] };
  const invoke = (name: string) =>
    JSON.parse(
      runInNewContext(`${script}\nrun([input])`, {
        Application: () => app,
        input: JSON.stringify({ perspectiveName: name }),
      }),
    );
  expect(invoke("Inbox")).toEqual({ perspectiveName: "Inbox" });
  expect(invoke("missing").error.code).toBe("NOT_FOUND");
  Object.defineProperty(w, "perspectiveName", { get: () => () => "Projects", set: () => {} });
  expect(() => invoke("Inbox")).toThrow("Perspective switch failed");
});

// @ts-check
/// <reference path="_types/omnifocus.d.ts" />
/// <reference path="_types/jxa-globals.d.ts" />
/// <reference path="_types/jxa-helpers.d.ts" />
/// <reference path="_types/sdef-overrides.d.ts" />

/**
 * JXA: switch the front window to a named perspective.
 *
 * Args (argv[0] JSON): { perspectiveName: string }
 * Returns JSON: { perspectiveName }
 *  or { error: { code: "NO_FRONT_WINDOW" | "NOT_FOUND", message } }
 *
 * Built-in perspectives (Inbox, Projects, Tags, Forecast, Flagged, Review, etc.)
 * and custom perspectives both work — JXA `Window.perspectiveName` accepts either.
 *
 * @see GH issue 466
 * @see src/adapter/jxa/JxaTransport.ts — setWindowPerspective() caller
 */

/** @param {string[]} argv — argv[0] is the JSON-encoded input payload. */
// biome-ignore lint/correctness/noUnusedVariables: osascript invokes run(argv) by convention.
function run(argv) {
  const args = JSON.parse(argv[0]);
  const ofApp = Application("OmniFocus");
  ofApp.includeStandardAdditions = false;

  const wins = ofApp.windows();
  if (!wins || wins.length === 0) {
    return JSON.stringify({
      error: { code: "NO_FRONT_WINDOW", message: "OmniFocus has no front window" },
    });
  }

  const w = wins[0];

  // The names collection includes built-ins without dereferencing them.
  const names = /** @type {string[]} */ (ofApp.perspectiveNames());
  if (names.indexOf(args.perspectiveName) === -1) {
    return JSON.stringify({
      error: {
        code: "NOT_FOUND",
        message: `Perspective not found: ${args.perspectiveName}`,
      },
    });
  }

  w.perspectiveName = args.perspectiveName;
  if (w.perspectiveName() !== args.perspectiveName) throw new Error("Perspective switch failed");
  return JSON.stringify({ perspectiveName: args.perspectiveName });
}

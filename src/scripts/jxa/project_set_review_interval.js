// @ts-check
/// <reference path="_types/omnifocus.d.ts" />
/// <reference path="_types/jxa-globals.d.ts" />
/// <reference path="_types/jxa-helpers.d.ts" />
/// <reference path="_types/sdef-overrides.d.ts" />

/**
 * JXA: set a project's review interval.
 *
 * Args (argv[0] JSON): { id: string, days: number | null }
 * Returns JSON: { id: string }
 *
 * @see src/adapter/jxa/JxaTransport.ts — caller
 * @see src/domain/project.ts — Project domain type
 */

/** @param {string[]} argv — argv[0] is the JSON-encoded input payload. */
// biome-ignore lint/correctness/noUnusedVariables: osascript invokes run(argv) by convention.
function run(argv) {
  const args = JSON.parse(argv[0]);
  const ofApp = Application("OmniFocus");
  ofApp.includeStandardAdditions = false;

  // @inline _helpers/lookup_or_throw.js

  // byId() instead of a flattenedProjects() linear scan (#788/#1089).
  const target = lookupOrThrow(
    ofApp.defaultDocument.flattenedProjects.byId(args.id),
    "Project",
    args.id,
  );

  if (args.days === null) {
    throw new Error(
      "OF_UNSUPPORTED: OmniFocus cannot clear review intervals; supply positive days",
    );
  }

  const interval = /** @type {{ unit: string, steps: number, fixed: boolean }} */ (
    target.reviewInterval()
  );
  // @ts-expect-error — sdef property setter; JXA accepts assignment, generator emits method signature only.
  target.reviewInterval = { unit: "day", steps: args.days, fixed: interval.fixed };
  const actual = /** @type {typeof interval} */ (target.reviewInterval());
  if (actual?.unit !== "day" || actual.steps !== args.days || actual.fixed !== interval.fixed) {
    throw new Error("OF_UNSUPPORTED: requested review interval was not applied");
  }

  return JSON.stringify({ id: args.id });
}

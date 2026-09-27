// @ts-check
/// <reference path="_types/omnifocus.d.ts" />
/// <reference path="_types/jxa-globals.d.ts" />
/// <reference path="_types/jxa-helpers.d.ts" />
/// <reference path="_types/sdef-overrides.d.ts" />

/**
 * JXA: update mutable fields on an existing project.
 *
 * Args (argv[0] JSON): { id: string, name?: string, note?: string|null,
 *   noteHtml?: string|null, status?: string, folderId?: string|null,
 *   deferDate?: string|null, dueDate?: string|null, flagged?: boolean, reviewIntervalDays?: number|null,
 *   tagIds?: string[] (full replacement; [] clears all tags)
 *   estimatedMinutes?: number|null, completionCriterion?: "parallel"|"sequential"|"singleActions" }
 * Returns JSON: { project: Project }
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

  // @inline _helpers/build_project.js
  // @inline _helpers/lookup_or_throw.js

  // byId() instead of a flattenedProjects() linear scan (#788/#1091).
  const target = lookupOrThrow(
    ofApp.defaultDocument.flattenedProjects.byId(args.id),
    "Project",
    args.id,
  );

  if (args.reviewIntervalDays !== undefined) {
    const days = args.reviewIntervalDays;
    if (days === null) {
      throw new Error(
        "OF_UNSUPPORTED: OmniFocus cannot clear review intervals; supply positive days",
      );
    }
    const interval = /** @type {{ unit: string, steps: number, fixed: boolean }} */ (
      target.reviewInterval()
    );
    // @ts-expect-error — sdef property setter; JXA accepts assignment, generator emits method signature only.
    target.reviewInterval = { unit: "day", steps: days, fixed: interval.fixed };
    const actual = /** @type {typeof interval} */ (target.reviewInterval());
    if (actual?.unit !== "day" || actual.steps !== days || actual.fixed !== interval.fixed) {
      throw new Error("OF_UNSUPPORTED: requested review interval was not applied");
    }
  }

  if (args.tagIds !== undefined) {
    // Use supported OmniJS project tag methods through the JXA bridge.
    ofApp.evaluateJavascript(`(() => {
      const project = Project.byIdentifier(${JSON.stringify(args.id)});
      if (!project) throw new Error("Project not found: " + ${JSON.stringify(args.id)});
      const tagIds = Array.from(new Set(${JSON.stringify(args.tagIds)}));
      const tags = tagIds.map(id => {
        const tag = Tag.byIdentifier(id);
        if (!tag) throw new Error("Tag not found: " + id);
        return tag;
      });
      project.clearTags();
      project.addTags(tags);
      const actual = project.tags.map(tag => tag.id.primaryKey);
      if (actual.length !== tagIds.length || tagIds.some(id => !actual.includes(id))) {
        throw new Error("OF_UNSUPPORTED: requested project tags were not applied");
      }
    })()`);
  }

  if (args.completionCriterion !== undefined) {
    if (!["parallel", "sequential", "singleActions"].includes(args.completionCriterion)) {
      throw new Error("ValidationError: unsupported completionCriterion");
    }
    const singleActions = args.completionCriterion === "singleActions";
    const sequential = args.completionCriterion === "sequential";
    // Clear the incompatible flag before enabling the requested project type.
    if (singleActions) {
      // @ts-expect-error JXA accepts property-setter form on sdef properties.
      target.sequential = false;
      // @ts-expect-error JXA accepts property-setter form on sdef properties.
      target.singletonActionHolder = true;
    } else {
      // @ts-expect-error JXA accepts property-setter form on sdef properties.
      target.singletonActionHolder = false;
      // @ts-expect-error JXA accepts property-setter form on sdef properties.
      target.sequential = sequential;
    }
    if (target.singletonActionHolder() !== singleActions || target.sequential() !== sequential) {
      throw new Error("OF_UNSUPPORTED: requested project type was not applied");
    }
  }

  if (args.name !== undefined) target.name = args.name;
  if (args.note !== undefined) target.note = args.note ?? "";
  if (args.noteHtml !== undefined) {
    // noteHtml is a runtime extra (see _types/sdef-overrides.d.ts). On
    // OF 4.x the JXA bridge rejects the accessor entirely ("Can't convert
    // types", both read and write), so surface a typed OF_UNSUPPORTED
    // instead of letting the raw bridge error read like a script bug.
    try {
      target.noteHtml = args.noteHtml ?? "";
    } catch (_e) {
      throw new Error(
        "OF_UNSUPPORTED: this OmniFocus version's JXA bridge rejects noteHtml writes; use note_set (plain text) instead",
      );
    }
  }
  if (args.flagged !== undefined) target.flagged = args.flagged;
  // Null clears the estimate (OF stores null, not 0, for "no estimate") —
  // mirrors task_update.js, which assigns null directly.
  if (args.estimatedMinutes !== undefined) target.estimatedMinutes = args.estimatedMinutes;
  if (args.deferDate !== undefined)
    // @ts-expect-error JXA accepts property-setter form on sdef properties; see _types/sdef-overrides.d.ts.
    target.deferDate = args.deferDate ? new Date(args.deferDate) : null;
  // @ts-expect-error JXA accepts property-setter form on sdef properties; see _types/sdef-overrides.d.ts.
  if (args.dueDate !== undefined) target.dueDate = args.dueDate ? new Date(args.dueDate) : null;
  if (args.status !== undefined) {
    // OmniFocus 4.8.8+ silently no-ops `target.status = "on hold"` (without
    // the " status" suffix). The verbose form is required for assignment
    // even though reads return the verbose form too. Map both wire values
    // to their suffixed JXA equivalents. Note: only "active" and "on-hold"
    // are valid here — the wire contract excludes "done" / "dropped",
    // which JXA refuses anyway and which use markComplete / markDropped
    // verbs instead.
    const jxaStatus = args.status === "on-hold" ? "on hold status" : "active status";
    // @ts-expect-error JXA accepts property-setter form on sdef properties; see _types/sdef-overrides.d.ts.
    target.status = jxaStatus;
  }
  if (args.folderId !== undefined) {
    if (args.folderId) {
      const folder = ofApp.defaultDocument.folders.byId(args.folderId);
      target.move({ to: folder.projects.end });
    } else {
      target.move({ to: ofApp.defaultDocument.projects.end });
    }
  }

  return JSON.stringify({ project: buildProject(target) });
}

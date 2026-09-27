// @ts-check
/// <reference path="_types/omnifocus.d.ts" />
/// <reference path="_types/jxa-globals.d.ts" />
/// <reference path="_types/jxa-helpers.d.ts" />
/// <reference path="_types/sdef-overrides.d.ts" />

/**
 * JXA: list projects, optionally filtered by folderId, status or flagged.
 *
 * Args (argv[0] JSON): { folderId?: string|null, status?: string|null, flagged?: boolean|null }
 * Returns JSON: { projects: Project[] }
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

  let projects;
  if (args.folderId) {
    try {
      const folder = ofApp.defaultDocument.folders.byId(args.folderId);
      projects = folder.projects();
    } catch (_e) {
      throw new Error(`Folder not found: ${args.folderId}`);
    }
  } else {
    projects = ofApp.defaultDocument.flattenedProjects();
  }

  const result = [];
  const hasOwn = Object.prototype.hasOwnProperty;
  let relationships;
  for (let i = 0; i < projects.length; i++) {
    let properties;
    if (args.status != null || args.flagged != null) {
      try {
        properties = projects[i].properties() ?? null;
      } catch (_e) {
        properties = null; // Preserve the serializer's getter fallback.
      }
      if (properties != null) {
        if (
          args.status != null &&
          hasOwn.call(properties, "status") &&
          normalizeStatus(properties.status) !== args.status
        )
          continue;
        if (
          args.flagged != null &&
          hasOwn.call(properties, "flagged") &&
          properties.flagged !== args.flagged
        )
          continue;
      }
    }
    if (relationships === undefined) {
      relationships = null;
      try {
        // Read relationships once, only after a survivor. Join by ID, never collection order.
        const rows = JSON.parse(
          ofApp.evaluateJavascript(
            "JSON.stringify(flattenedProjects.map(p => ({id: p.id.primaryKey, folderId: p.parentFolder ? p.parentFolder.id.primaryKey : null, tagIds: p.tags.map(t => t.id.primaryKey)})))",
          ),
        );
        const byId = Object.create(null);
        for (const row of rows) {
          if (
            typeof row.id === "string" &&
            (row.folderId === null || typeof row.folderId === "string") &&
            Array.isArray(row.tagIds) &&
            row.tagIds.every((/** @type {unknown} */ id) => typeof id === "string")
          )
            byId[row.id] = row;
        }
        relationships = byId;
      } catch (_e) {
        /* Unavailable OmniJS or invalid records: retain the per-project getter path. */
      }
    }
    const built = buildProject(projects[i], properties, relationships);
    if (args.status !== null && args.status !== undefined && built.status !== args.status) continue;
    if (args.flagged != null && built.flagged !== args.flagged) continue;
    result.push(built);
  }

  return JSON.stringify({ projects: result });
}

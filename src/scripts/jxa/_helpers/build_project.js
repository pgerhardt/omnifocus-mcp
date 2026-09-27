/**
 * Canonical buildProject + normalizeStatus helpers for JXA scripts.
 *
 * Inlined into consumer scripts via the `// @inline _helpers/build_project.js`
 * directive expanded by scriptInlinerPlugin (ADR-0020). This file is not
 * loaded as a module at runtime — it is spliced as raw source into each
 * consumer's bundled string before `osascript` evaluates it.
 *
 * Shape and guards merge the prior 5 copies (project_get, project_create,
 * project_get_many, project_list, project_update) preserving every
 * issue-referenced fix verbatim:
 *
 *   - #681 — `f.class()` throws "Can't convert types" on a real Folder
 *     specifier in OF 4.x; only the document responds. Treat the throw as
 *     "is a real folder", a successful `"document"` return as the only
 *     skip path. Same flavor as #673 for `containingProject().class()`.
 *   - #682 — per-element tag guard: a single bad tag must not abort the
 *     loop and zero-out tagIds, which would silently exclude this project
 *     from tagId-filter results.
 *   - #498 — `creationDate()` and `modificationDate()` may be truthy
 *     functions even on objects where invocation throws "Can't get object."
 *     The call must be guarded, not just the property reference.
 *
 * @param {object} proj — JXA Project specifier
 * @param {object|null} [properties] — optional native record already read by the caller
 * @param {object|null} [relationships] — optional folder/tag records keyed by persistent project ID
 * @returns {object} canonical Project shape per `src/domain/project.ts`
 */
// biome-ignore lint/correctness/noUnusedVariables: inlined into JXA consumers via @inline directive (ADR-0020).
function buildProject(proj, properties, relationships) {
  if (properties === undefined) {
    try {
      properties = proj.properties();
    } catch (_e) {
      properties = null; // Fall back to individual getters.
    }
  }
  function readScalar(key) {
    // biome-ignore lint/suspicious/noPrototypeBuiltins: preserve compatibility with older JXA JavaScriptCore runtimes.
    return properties != null && Object.prototype.hasOwnProperty.call(properties, key)
      ? properties[key]
      : proj[key]();
  }
  const id = readScalar("id");
  const relationship = relationships?.[id];

  // OmniFocus 4.x JXA quirk (same flavor as #673's containingProject):
  // `f.class()` throws "Can't convert types" on a real Folder specifier.
  // Treat the throw as "real folder", a successful return of "document"
  // as the only skip path.
  let folderId = relationship ? relationship.folderId : null;
  try {
    const f = relationship ? null : proj.folder();
    if (f) {
      let isDocument = false;
      try {
        isDocument = f.class() === "document";
      } catch (_classErr) {
        /* OF 4.x: real folders throw here */
      }
      if (!isDocument) folderId = f.id();
    }
  } catch (_e) {
    /* OF 4.x: property access may not exist on all object types — default used */
  }

  const tagIds = relationship ? relationship.tagIds.slice() : [];
  try {
    const tags = relationship ? [] : proj.tags();
    for (let i = 0; i < tags.length; i++) {
      // Guard per-element: a single bad tag object must not abort the loop
      // and zero-out all tagIds, which would silently exclude this project
      // from tagId-filter results (see #682).
      try {
        tagIds.push(tags[i].id());
      } catch (_tagErr) {
        /* OF 4.x: individual tag specifier may throw on .id() — skip element */
      }
    }
  } catch (_e) {
    /* OF 4.x: property access may not exist on all object types — default used */
  }

  let rawStatus = "active";
  try {
    rawStatus = readScalar("status");
  } catch (_e) {
    /* OF 4.x: property access may not exist on all object types — default used */
  }
  const status = normalizeStatus(rawStatus);

  let deferDate = null;
  try {
    const dd = readScalar("deferDate");
    if (dd) deferDate = dd.toISOString();
  } catch (_e) {
    /* OF 4.x: property access may not exist on all object types — default used */
  }

  let dueDate = null;
  try {
    const due = readScalar("dueDate");
    if (due) dueDate = due.toISOString();
  } catch (_e) {
    /* OF 4.x: property access may not exist on all object types — default used */
  }

  let floating = false;
  try {
    floating = readScalar("shouldUseFloatingTimeZone");
  } catch (_e) {
    /* Preserve the default when native state is unavailable. */
  }

  let completedAt = null;
  try {
    const cd = readScalar("completionDate");
    if (cd) completedAt = cd.toISOString();
  } catch (_e) {
    /* OF 4.x: property access may not exist on all object types — default used */
  }

  let droppedAt = null;
  try {
    const date = readScalar("droppedDate");
    if (date) droppedAt = date.toISOString();
  } catch (_e) {
    /* Leave unknown drop dates null. */
  }

  let estimatedMinutes = null;
  try {
    const em = readScalar("estimatedMinutes");
    if (em != null) estimatedMinutes = em;
  } catch (_e) {
    /* OF 4.x: property access may not exist on all object types — default used */
  }

  let note = null;
  try {
    note = readScalar("note") || null;
  } catch (_e) {
    /* OF 4.x: property access may not exist on all object types — default used */
  }

  // noteHtml is intentionally omitted from all project responses — use note_get_html
  // to retrieve HTML note content on demand. See perf issue #791.

  let flagged = false;
  try {
    flagged = readScalar("flagged");
  } catch (_e) {
    /* OF 4.x: property access may not exist on all object types — default used */
  }

  let reviewIntervalDays = null;
  try {
    // OF 4.x JXA bridges the sdef record-type `review interval` as a plain
    // object — `{ unit, steps, fixed }` with value fields, not accessors.
    // Calling `ri.steps()` throws (same bug class as #1071's repetition
    // read), and the runtime convenience `reviewIntervalDays()` does not
    // exist on OF 4.8.x ("Can't convert types"), so convert the record by
    // unit. Month/year are calendar-approximate; minute/hour can't be set
    // as review cadences in the OF UI and stay null.
    const ri = readScalar("reviewInterval");
    if (ri && typeof ri.steps === "number" && ri.steps > 0) {
      const unitDays = { day: 1, week: 7, month: 30, year: 365 }[ri.unit];
      if (unitDays) reviewIntervalDays = ri.steps * unitDays;
    }
  } catch (_e) {
    /* OF 4.x: property access may not exist on all object types — default used */
  }

  let nextReviewDate = null;
  try {
    const nrd = readScalar("nextReviewDate");
    if (nrd) nextReviewDate = nrd.toISOString();
  } catch (_e) {
    /* OF 4.x: property access may not exist on all object types — default used */
  }

  let lastReviewDate = null;
  try {
    const lrd = readScalar("lastReviewDate");
    if (lrd) lastReviewDate = lrd.toISOString();
  } catch (_e) {
    /* OF 4.x: property access may not exist on all object types — default used */
  }

  let taskCount = 0;
  try {
    taskCount = readScalar("numberOfTasks");
  } catch (_e) {
    /* OF 4.x: property access may not exist on all object types — default used */
  }

  let completedTaskCount = 0;
  try {
    completedTaskCount = readScalar("numberOfCompletedTasks");
  } catch (_e) {
    /* OF 4.x: property access may not exist on all object types — default used */
  }

  let completionCriterion = "parallel";
  if (readScalar("singletonActionHolder")) completionCriterion = "singleActions";
  else if (readScalar("sequential")) completionCriterion = "sequential";

  // Guard against "Can't get object." thrown when invoking these — see #498.
  // JXA reports creationDate/modificationDate as truthy functions even on
  // projects where invocation throws. The call must be guarded, not just the
  // property reference.
  let createdAt;
  try {
    createdAt = readScalar("creationDate").toISOString();
  } catch (_e) {
    createdAt = new Date().toISOString();
  }

  let modifiedAt;
  try {
    modifiedAt = readScalar("modificationDate").toISOString();
  } catch (_e) {
    modifiedAt = new Date().toISOString();
  }

  return {
    id: id,
    name: readScalar("name"),
    note: note,
    noteHtml: null,
    folderId: folderId,
    tagIds: tagIds,
    status: status,
    completionCriterion: completionCriterion,
    deferDate: deferDate,
    dueDate: dueDate,
    deferDateFloating: floating,
    dueDateFloating: floating,
    estimatedMinutes: estimatedMinutes,
    flagged: flagged,
    reviewIntervalDays: reviewIntervalDays,
    nextReviewDate: nextReviewDate,
    lastReviewDate: lastReviewDate,
    completed: status === "done",
    completedAt: completedAt,
    dropped: status === "dropped",
    droppedAt: droppedAt,
    taskCount: taskCount,
    completedTaskCount: completedTaskCount,
    createdAt: createdAt,
    modifiedAt: modifiedAt,
  };
}

function normalizeStatus(raw) {
  // OmniFocus 4.8.8 returns verbose strings with a " status" suffix
  // (e.g. "active status", "on hold status"). Strip for uniform handling.
  const s = typeof raw === "string" ? raw.replace(/ status$/, "") : raw;
  if (s === "on hold") return "on-hold";
  return s; // "active", "done", "dropped"
}

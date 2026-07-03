/*
 * Workout Sheet — a static, mobile-first workout reference.
 *
 * Reads workout-plan.md (structure + prescriptions) and exercise-notes.md
 * (detailed form notes), renders the selected day, and stores a free-text
 * "best" value per exercise in localStorage.
 *
 * No frameworks, no build step. Marked.js (CDN) renders the note Markdown.
 */

// localStorage keys.
const LS_BEST = "gymWorkout.bestValues";
const LS_DAY = "gymWorkout.selectedDay";

// In-memory state (kept intentionally small).
let plan = null;        // { title, days: [{ id, name, sections: [...] }] }
let notes = {};         // { [exerciseId]: { name, type, markdown } }
let bestValues = {};    // { [exerciseId]: { best, updatedAt } }
let selectedDayId = null;

// --- Elements ---
const els = {
  daySelector: document.getElementById("day-selector"),
  status: document.getElementById("status"),
  workout: document.getElementById("workout"),
};

// Normalize an ID for lookups: trimmed + lowercased. Display names keep their case.
function normalizeId(raw) {
  return raw.trim().toLowerCase();
}

/**
 * Parse workout-plan.md into { title, days }.
 * Headings: # title, ## day, ### section, #### exercise.
 * Metadata (name:, prescription:) attaches to the nearest active heading.
 */
function parseWorkoutPlan(markdown) {
  const result = { title: "", days: [] };
  let day = null;
  let section = null;
  let exercise = null;

  const lines = markdown.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") continue; // ignore blank lines

    // Order matters: check deeper headings (####) before shallower (#).
    if (trimmed.startsWith("#### ")) {
      exercise = {
        id: normalizeId(trimmed.slice(5)),
        name: trimmed.slice(5).trim(),
        prescription: "",
      };
      if (section) section.exercises.push(exercise);
      continue;
    }
    if (trimmed.startsWith("### ")) {
      section = { id: normalizeId(trimmed.slice(4)), name: trimmed.slice(4).trim(), exercises: [] };
      exercise = null;
      if (day) day.sections.push(section);
      continue;
    }
    if (trimmed.startsWith("## ")) {
      day = { id: normalizeId(trimmed.slice(3)), name: trimmed.slice(3).trim(), sections: [] };
      section = null;
      exercise = null;
      result.days.push(day);
      continue;
    }
    if (trimmed.startsWith("# ")) {
      result.title = trimmed.slice(2).trim();
      continue;
    }

    // Metadata line — attach to the nearest active heading.
    const meta = parseMetaLine(trimmed);
    if (!meta) continue;
    const target = exercise || section || day;
    if (!target) continue;
    if (meta.key === "name") target.name = meta.value;
    else if (meta.key === "prescription" && exercise) exercise.prescription = meta.value;
  }

  return result;
}

// Split "key: value" into { key, value }; returns null if not a metadata line.
function parseMetaLine(line) {
  const idx = line.indexOf(":");
  if (idx === -1) return null;
  return { key: line.slice(0, idx).trim().toLowerCase(), value: line.slice(idx + 1).trim() };
}

/**
 * Parse exercise-notes.md into { [id]: { name, type, markdown } }.
 * Each "## id" starts a note block; everything until the next "## " is stored.
 * name: and type: are optional; the remaining Markdown body is kept for rendering.
 */
function parseExerciseNotes(markdown) {
  const blocks = {};
  const lines = markdown.split(/\r?\n/);

  let current = null; // { id, name, type, bodyLines }

  const commit = () => {
    if (!current) return;
    blocks[current.id] = {
      name: current.name,
      type: current.type,
      markdown: current.bodyLines.join("\n").trim(),
    };
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("## ")) {
      commit();
      current = { id: normalizeId(trimmed.slice(3)), name: "", type: "", bodyLines: [] };
      continue;
    }
    if (!current) continue; // skip the document title / preamble before the first block

    // Capture optional name:/type: metadata only while still at the top of a block
    // (before any body content has started), so a "name:" inside notes is left intact.
    if (current.bodyLines.length === 0) {
      const meta = parseMetaLine(trimmed);
      if (meta && (meta.key === "name" || meta.key === "type")) {
        current[meta.key] = meta.value;
        continue;
      }
    }
    // Preserve the original line (not trimmed) so Markdown formatting survives.
    current.bodyLines.push(line);
  }
  commit();

  return blocks;
}

// --- localStorage helpers ---

function loadBestValues() {
  try {
    const raw = localStorage.getItem(LS_BEST);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveBestValue(exerciseId, value) {
  const trimmed = value.trim();
  if (trimmed === "") {
    delete bestValues[exerciseId];
  } else {
    bestValues[exerciseId] = { best: trimmed, updatedAt: todayISO() };
  }
  try {
    localStorage.setItem(LS_BEST, JSON.stringify(bestValues));
  } catch {
    /* storage may be full or blocked — fail silently, the UI still works */
  }
}

function todayISO() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

// --- Dev warnings: help spot missing/unused notes ---
function warnAboutNotes() {
  const planIds = new Set();
  for (const day of plan.days) {
    for (const section of day.sections) {
      for (const ex of section.exercises) planIds.add(ex.id);
    }
  }
  const noteIds = new Set(Object.keys(notes));

  for (const id of planIds) {
    if (!noteIds.has(id)) console.warn(`[workout] Plan exercise "${id}" has no matching notes.`);
  }
  for (const id of noteIds) {
    if (!planIds.has(id)) console.warn(`[workout] Note "${id}" is not used in any workout day.`);
  }
}

// --- Rendering ---

function showStatus(message, isError) {
  els.status.textContent = message;
  els.status.classList.toggle("error", !!isError);
  els.status.hidden = false;
}

function hideStatus() {
  els.status.hidden = true;
}

function renderDaySelector(days) {
  els.daySelector.innerHTML = "";
  for (const day of days) {
    const btn = document.createElement("button");
    btn.className = "day-btn";
    btn.type = "button";
    btn.textContent = day.name;
    btn.setAttribute("aria-pressed", String(day.id === selectedDayId));
    btn.addEventListener("click", () => selectDay(day.id));
    els.daySelector.appendChild(btn);
  }
}

function selectDay(dayId) {
  selectedDayId = dayId;
  try {
    localStorage.setItem(LS_DAY, dayId);
  } catch {
    /* ignore storage errors */
  }
  // Update pressed state without rebuilding the whole selector.
  for (const btn of els.daySelector.querySelectorAll(".day-btn")) {
    btn.setAttribute("aria-pressed", String(btn.textContent === findDay(dayId).name));
  }
  renderWorkoutDay(findDay(dayId));
}

function findDay(dayId) {
  return plan.days.find((d) => d.id === dayId) || null;
}

function renderWorkoutDay(day) {
  els.workout.innerHTML = "";
  if (!day) return;
  for (const section of day.sections) {
    els.workout.appendChild(renderSection(section));
  }
}

function renderSection(section) {
  const wrap = document.createElement("section");
  wrap.className = "section";

  const title = document.createElement("h2");
  title.className = "section-title";
  title.textContent = section.name;
  wrap.appendChild(title);

  for (const exercise of section.exercises) {
    wrap.appendChild(renderExerciseCard(exercise));
  }
  return wrap;
}

function renderExerciseCard(exercise) {
  const card = document.createElement("article");
  card.className = "card";

  // Header: name + prescription
  const head = document.createElement("div");
  head.className = "card-head";
  const name = document.createElement("h3");
  name.className = "exercise-name";
  name.textContent = exercise.name;
  head.appendChild(name);
  if (exercise.prescription) {
    const presc = document.createElement("span");
    presc.className = "prescription";
    presc.textContent = exercise.prescription;
    head.appendChild(presc);
  }
  card.appendChild(head);

  // Best value input (free text — never a number field).
  const saved = bestValues[exercise.id];
  const bestRow = document.createElement("div");
  bestRow.className = "best-row";

  const label = document.createElement("label");
  label.className = "best-label";
  label.textContent = "Best";
  const inputId = `best-${exercise.id}`;
  label.setAttribute("for", inputId);
  bestRow.appendChild(label);

  const input = document.createElement("input");
  input.type = "text";
  input.className = "best-input";
  input.id = inputId;
  input.value = saved ? saved.best : "";
  input.placeholder = "e.g. 22.5kg x 12, 30s, bodyweight x 15";
  input.autocomplete = "off";
  input.setAttribute("enterkeyhint", "done");

  const updated = document.createElement("div");
  updated.className = "updated-at";
  updated.textContent = saved ? `Updated ${saved.updatedAt}` : "";

  const persist = () => {
    saveBestValue(exercise.id, input.value);
    const entry = bestValues[exercise.id];
    updated.textContent = entry ? `Updated ${entry.updatedAt}` : "";
  };
  input.addEventListener("change", persist);
  input.addEventListener("blur", persist);

  bestRow.appendChild(input);
  bestRow.appendChild(updated);
  card.appendChild(bestRow);

  // Notes accordion (native <details>).
  card.appendChild(renderNotes(exercise.id));

  return card;
}

function renderNotes(exerciseId) {
  const details = document.createElement("details");
  details.className = "notes";

  const summary = document.createElement("summary");
  summary.textContent = "Notes";
  details.appendChild(summary);

  const body = document.createElement("div");
  body.className = "notes-body";

  const note = notes[exerciseId];
  if (note && note.markdown) {
    // Marked renders the trusted repo Markdown. User "best" values are never
    // passed through here — they are set via input.value (text), not HTML.
    body.innerHTML = marked.parse(note.markdown);
  } else {
    const empty = document.createElement("p");
    empty.className = "no-notes";
    empty.textContent = "No notes yet";
    body.appendChild(empty);
  }
  details.appendChild(body);
  return details;
}

// --- App boot ---

async function fetchMarkdown(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path} (${res.status})`);
  return res.text();
}

async function loadApp() {
  try {
    // Relative paths keep this working under any GitHub Pages subpath.
    const [planText, notesText] = await Promise.all([
      fetchMarkdown("./workout-plan.md"),
      fetchMarkdown("./exercise-notes.md"),
    ]);

    plan = parseWorkoutPlan(planText);
    notes = parseExerciseNotes(notesText);
    bestValues = loadBestValues();

    if (!plan.days.length) {
      showStatus("No workout days found in workout-plan.md.", true);
      return;
    }

    warnAboutNotes();

    // Restore the last selected day if it still exists, else default to the first.
    const savedDay = safeGet(LS_DAY);
    selectedDayId = savedDay && findDay(savedDay) ? savedDay : plan.days[0].id;

    hideStatus();
    renderDaySelector(plan.days);
    renderWorkoutDay(findDay(selectedDayId));
  } catch (err) {
    console.error(err);
    showStatus(
      "Couldn't load the workout files. If you opened this file directly, run a local server (see README) — the app needs to fetch the Markdown files.",
      true
    );
  }
}

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

loadApp();

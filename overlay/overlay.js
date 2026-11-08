import { Chess } from "../lib/chess.js";
import { Engine } from "./engine.js";
import { RemoteEngine } from "./remote-engine.js";
import { ENGINES, DEFAULT_ENGINE } from "./engines.js";
import { classify, CATEGORIES, fmtEval, lineToCp, winPct } from "./classify.js";
import { lookupOpening } from "./book.js";
import { coachTip } from "./coach.js";
import { principlesFor } from "./principles.js";
import { THEMES, moveThemes } from "./themes.js";
import { openingSuggestions } from "./openings.js";
import { analyseGame, gameRecord, upsertRecord, buildProfile, gameAccuracy, verdict } from "./profile.js";

const $ = (id) => document.getElementById(id);
const els = {
  status: $("status"), badge: $("badge"), glyph: $("glyph"), label: $("label"),
  move: $("move"), evalBefore: $("evalBefore"), evalAfter: $("evalAfter"),
  detail: $("detail"), bestline: $("bestline"),
  opening: $("opening"),
  settings: $("settings"), engineSel: $("engineSel"), engineNote: $("engineNote"), think: $("think"), thinkVal: $("thinkVal"),
  accW: $("accW"), accB: $("accB"), ringW: $("ringW"), ringB: $("ringB"), table: $("table"), caption: $("caption"),
  coachOn: $("coachOn"), arrowOn: $("arrowOn"), coach: $("coach"), sheet: $("tab-sheet"), profile: $("tab-profile"),
  info: $("info"), launcher: $("launcher"), lbadge: $("lbadge"), panel: $("panel"), root: $("root"),
};

// Runs as an extension page normally; falls back gracefully when opened
// over plain http for development (no chrome.* APIs there).
const isExt = typeof chrome !== "undefined" && !!chrome.storage;
const storage = isExt
  ? chrome.storage.local
  : { get: (_k, cb) => setTimeout(() => cb({}), 0), set: () => {} };
const assetUrl = (p) => (isExt ? chrome.runtime.getURL(p) : new URL("../" + p, location.href).href);

// ----------------------------------------------------------------- settings
// lv* are read by the content script (live-game tools), same keys and defaults as there
const LIVE_TOGGLES = { lvRatings: false, lvAnon: false, lvLowTime: true, lvGlow: true, lvGlowFull: true,
  // chesscom-extras.js, same keys and defaults as there
  lvArrows: true, lvClutter: true, lvLifetime: true, lvFriends: false };
const settings = { thinkMs: 1000, level: 3, coach: true, arrow: true, nextArrow: true, oppArrow: true, engine: DEFAULT_ENGINE, ...LIVE_TOGGLES };

// French display labels (chess.com wording); classify.js keeps the English keys.
const FR = {
  brilliant: "Brillant", great: "Très bon", best: "Meilleur", excellent: "Excellent", good: "Bon",
  book: "Théorie", forced: "Forcé", inaccuracy: "Imprécision", miss: "Manqué", mistake: "Erreur",
  blunder: "Gaffe", mate: "Mat", none: "—",
};
const TABLE_CATS = ["brilliant", "great", "best", "excellent", "good", "book", "inaccuracy", "mistake", "miss", "blunder"];

const fmtSecs = (ms) => (ms / 1000).toFixed(1) + "s";

function applySettingsToUi() {
  els.engineSel.value = settings.engine;
  els.engineNote.textContent = ENGINES[settings.engine].note;
  els.think.value = settings.thinkMs;
  els.thinkVal.textContent = fmtSecs(settings.thinkMs);
  els.coachOn.checked = settings.coach;
  els.arrowOn.checked = settings.arrow;
  $("nextOn").checked = settings.nextArrow;
  $("level").value = settings.level;
  $("levelVal").textContent = levelText(settings.level);
  $("oppOn").checked = settings.oppArrow;
  for (const k in LIVE_TOGGLES) $(k).checked = settings[k];
}

storage.get(Object.keys(settings), (v) => {
  Object.assign(settings, v);
  if (!ENGINES[settings.engine]) settings.engine = DEFAULT_ENGINE; // e.g. the Stockfish 16 of earlier versions
  applySettingsToUi();
  startEngine(settings.engine);
  renderCurrent();
});

function saveSetting(k, v) {
  settings[k] = v;
  storage.set({ [k]: v });
}
els.think.addEventListener("input", () => { saveSetting("thinkMs", +els.think.value); els.thinkVal.textContent = fmtSecs(settings.thinkMs); });
els.coachOn.addEventListener("change", () => { saveSetting("coach", els.coachOn.checked); renderCurrent(); });
els.arrowOn.addEventListener("change", () => { saveSetting("arrow", els.arrowOn.checked); renderCurrent(); });
$("level").addEventListener("input", async () => {
  saveSetting("level", +$("level").value);
  $("levelVal").textContent = levelText(settings.level);
  // redo the arrows of the latest position at the new level
  humanPv.clear();
  const last = sans.length - 1, g = grades[last], gen = generation;
  if (!g || g.after.terminal) return;
  await humanLine(fens[last + 1], gen);
  if (gen !== generation || last !== sans.length - 1) return;
  if (selected < 0 || selected === last) renderNext(g);
  postGrade(g);
});
$("nextOn").addEventListener("change", () => { saveSetting("nextArrow", $("nextOn").checked); renderCurrent(); });
$("oppOn").addEventListener("change", () => { saveSetting("oppArrow", $("oppOn").checked); renderCurrent(); });
for (const k in LIVE_TOGGLES) $(k).addEventListener("change", () => saveSetting(k, $(k).checked));
$("session").addEventListener("click", () => parent.postMessage({ type: "movegrade:session" }, "*"));
$("pip").addEventListener("click", () => { $("pipStatus").textContent = "…"; parent.postMessage({ type: "movegrade:pip" }, "*"); });
window.addEventListener("message", (ev) => {
  if (ev.data && ev.data.type === "movegrade:pip-status") $("pipStatus").textContent = ev.data.text;
});

for (const [id, e] of Object.entries(ENGINES)) els.engineSel.append(new Option(e.label, id));
els.engineSel.addEventListener("change", () => {
  saveSetting("engine", els.engineSel.value);
  els.engineNote.textContent = ENGINES[settings.engine].note;
  startEngine(settings.engine);
});

$("gear").addEventListener("click", () => {
  els.settings.hidden = !els.settings.hidden;
  $("gear").classList.toggle("active", !els.settings.hidden);
  reportLayout();
});
// ----------------------------------------------------------------- tabs
let tab = "move";
for (const b of document.querySelectorAll("#tabs button")) {
  b.addEventListener("click", () => {
    tab = b.dataset.tab;
    for (const o of document.querySelectorAll("#tabs button")) o.classList.toggle("active", o === b);
    for (const t of ["move", "sheet", "profile"]) $("tab-" + t).hidden = t !== tab;
    if (tab === "sheet") renderSheet();
    if (tab === "profile") renderProfile();
    reportLayout();
  });
}
$("resetProfile").addEventListener("click", () => { records = []; storage.set({ mgGames: [] }); renderProfile(); });

// ----------------------------------------------------------------- launcher / panel
let open = false;
function applyOpen() {
  els.panel.hidden = !open;
  els.launcher.classList.toggle("open", open);
  if (open) refresh();
  reportLayout();
}
function setOpen(v) { open = v; storage.set({ panelOpen: open }); applyOpen(); }
// The launcher can be dragged anywhere: the page moves the iframe, we only report the drag.
// Screen coordinates stay valid while the iframe moves under the pointer.
let drag = null, dragged = false;
els.launcher.addEventListener("pointerdown", (e) => {
  drag = { x: e.screenX, y: e.screenY, moved: false };
  els.launcher.setPointerCapture(e.pointerId);
});
els.launcher.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const dx = e.screenX - drag.x, dy = e.screenY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) < 5) return;
  if (!drag.moved) parent.postMessage({ type: "movegrade:drag", phase: "start" }, "*");
  drag.moved = true;
  parent.postMessage({ type: "movegrade:drag", phase: "move", dx, dy }, "*");
});
const endDrag = () => {
  if (drag && drag.moved) { dragged = true; parent.postMessage({ type: "movegrade:drag", phase: "end" }, "*"); }
  drag = null;
};
els.launcher.addEventListener("pointerup", endDrag);
els.launcher.addEventListener("pointercancel", endDrag);
els.launcher.addEventListener("click", () => {
  if (dragged) { dragged = false; return; } // the end of a drag is not a click
  setOpen(!open);
});
$("close").addEventListener("click", () => setOpen(false));
storage.get("panelOpen", (v) => { open = !!(v && v.panelOpen); applyOpen(); });
window.addEventListener("message", (ev) => {
  if (ev.data && ev.data.type === "movegrade:toggle") setOpen(!open);
});

function setLauncherBadge(cat) {
  if (!cat || cat === "none") { els.lbadge.hidden = true; return; }
  els.lbadge.hidden = false;
  els.lbadge.className = "lbadge cat-" + cat;
  els.lbadge.textContent = CATEGORIES[cat].glyph;
}

function setStatus(t) {
  els.status.textContent = t;
  parent.postMessage({ type: "movegrade:status", status: t }, "*");
}

/** Tell the content script what to draw on the site's board. */
// The engine's move is drawn as an arrow on the site's board when the move played fell short of it.
const ARROW_CATS = new Set(["good", "inaccuracy", "mistake", "miss", "blunder"]);
function bestArrow(g) {
  const uci = g.before && g.before.lines && g.before.lines[0] && g.before.lines[0].pv[0];
  if (!settings.arrow || g.isEngineBest || !uci || !ARROW_CATS.has(g.cat)) return null;
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

// Play arrows, drawn before the move is played: your move when it is your turn; when it is the
// opponent's, their expected move and your premove answer. They come from a shallow search
// (depth 1 to 5, chosen with the "Niveau des flèches" slider) so they show natural moves, not the engine's
// deepest line. Grading never runs during a live game against a person (content.js pauses
// it), so none of this shows there.
const humanPv = new Map(); // fen -> pv of the shallow search
// shortcut: Elo figures are rough club-level estimates for each search depth, not a calibration.
const LEVEL_ELO = [0, 800, 1200, 1500, 1800, 2000];
const levelText = (d) => `≈ ${LEVEL_ELO[d]} Elo (prof. ${d})`;
async function humanLine(fen, gen) {
  if (humanPv.has(fen)) return humanPv.get(fen);
  await engineChosen;
  const e = engine;
  try { await e.readyPromise; } catch { return null; }
  const depth = Math.min(5, Math.max(1, settings.level || 3));
  const r = await e.analyse(fen, 2000, null, depth);
  if (gen !== generation || !r || !r.lines.length) return null;
  const pv = [...r.lines[0].pv];
  // shallow searches often stop the line after one move: search the reply for the premove arrow
  if (pv.length === 1) {
    try {
      const c = new Chess(fen);
      c.move({ from: pv[0].slice(0, 2), to: pv[0].slice(2, 4), promotion: pv[0][4] });
      const r2 = c.isGameOver() ? null : await e.analyse(c.fen(), 2000, null, depth);
      if (gen !== generation) return null;
      if (r2 && r2.lines.length) pv.push(r2.lines[0].pv[0]);
    } catch { /* no premove then */ }
  }
  humanPv.set(fen, pv);
  return pv;
}
/** "À jouer : humain Nf3 · meilleur Nf3" for the position after the move shown. */
function renderNext(g) {
  const el = $("nextline");
  const pv = humanPv.get(fens[g.ply + 1]);
  const deep = g.after && !g.after.terminal && g.after.lines && g.after.lines[0] && g.after.lines[0].pv[0];
  if (!pv || !deep || !(settings.nextArrow || settings.oppArrow)) { el.textContent = ""; return; }
  const san = (u) => pvToSan(fens[g.ply + 1], [u], 1);
  const same = pv[0] === deep;
  el.replaceChildren("À jouer : ", h("b", "hn", "humain " + san(pv[0])), " · ", h("b", "dp", "meilleur " + san(deep)),
    same ? " (le même coup)" : "");
}
function playArrows(g) {
  const pv = humanPv.get(fens[g.ply + 1]);
  if (!pv) return {};
  const a = (u) => (u ? { from: u.slice(0, 2), to: u.slice(2, 4) } : null);
  const toMove = g.ply % 2 === 0 ? "b" : "w";
  // the engine's deepest move, drawn dashed only when it differs from the human one
  const deepUci = g.after && !g.after.terminal && g.after.lines && g.after.lines[0] && g.after.lines[0].pv[0];
  const deep = deepUci && deepUci !== pv[0] ? a(deepUci) : null;
  if (toMove === (mineSide() || (flipped ? "b" : "w"))) return settings.nextArrow ? { next: a(pv[0]), deep } : {};
  return settings.oppArrow ? { opp: a(pv[0]), pre: a(pv[1]), deep } : {};
}

function postGrade(g) {
  setLauncherBadge(g && g.move ? g.cat : null);
  if (!g || !g.move) {
    parent.postMessage({ type: "movegrade:grade", cat: null }, "*");
    return;
  }
  parent.postMessage({
    type: "movegrade:grade",
    cat: g.cat,
    glyph: CATEGORIES[g.cat].glyph,
    label: FR[g.cat] || CATEGORIES[g.cat].label,
    from: g.move.from,
    to: g.move.to,
    ply: g.ply,
    provisional: !!g.provisional,
    evalAfter: els.evalAfter.textContent,
    best: bestArrow(g),
    ...playArrows(g),
  }, "*");
}

function reportLayout() {
  const r = els.root.getBoundingClientRect();
  parent.postMessage({ type: "movegrade:layout", open, width: Math.ceil(r.width), height: Math.ceil(r.height) }, "*");
}
new ResizeObserver(reportLayout).observe(els.root);

// ----------------------------------------------------------------- engine
// In the extension the engine lives in an offscreen document (see
// background.js for why); the in-page Worker is only used for http dev testing.
const engineOpts = {
  onError: (msg) => { setStatus("erreur du moteur : " + msg); els.status.title = msg; console.error("[Mentor64]", msg); diagnoseEngine(msg); },
  onLog: (line) => console.debug("[Mentor64 engine]", line),
  onStatus: (t) => setStatus(t),
};
// The engine is created once the settings say which one; analyseFen() waits on this.
let engine = null;
let engineStarted;
const engineChosen = new Promise((r) => { engineStarted = r; });

/** Start the engine `id` (or switch to it): grades from another engine are thrown away. */
function startEngine(id) {
  if (engine && engine.which === id) return;
  const def = ENGINES[id];
  if (engine) engine.terminate();
  engine = isExt
    ? new RemoteEngine({ ...engineOpts, which: id })
    : new Engine(assetUrl(def.script), engineOpts);
  engine.which = id;
  engine.readyPromise.then(() => setStatus(`${def.label} prêt`)).catch(() => {});
  if (engineStarted) { engineStarted(); engineStarted = null; return; }
  evalCache.clear();
  humanPv.clear();
  grades = [];
  tipLog.clear();
  lastSaved = "";
  if (sans.length) { renderCurrent(); run(); }
}

/** On engine failure, check each piece of the loading chain and show the results in the panel. */
async function diagnoseEngine(msg) {
  const lines = ["Échec du moteur : " + msg];
  for (const f of ENGINES[settings.engine].files) {
    try {
      const r = await fetch(assetUrl(f));
      const len = r.headers.get("content-length") || (await r.arrayBuffer()).byteLength;
      lines.push(`${f.split("/").pop()}: HTTP ${r.status}, ${len} bytes, type ${r.headers.get("content-type") || "?"}`);
    } catch (e) {
      lines.push(`${f.split("/").pop()}: fetch failed (${e.message})`);
    }
  }
  try {
    new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
    lines.push("WebAssembly compile: allowed");
  } catch (e) {
    lines.push("WebAssembly compile: BLOCKED (" + e.message + ")");
  }
  lines.push("Worker support: " + (typeof Worker === "function"));
  console.error("[Mentor64 diagnostics]\n" + lines.join("\n"));
  els.label.className = "cat-none";
  els.label.textContent = "Le moteur n'a pas pu démarrer";
  els.move.textContent = "";
  els.detail.innerHTML = "";
  for (const l of lines) {
    const d = document.createElement("div");
    d.textContent = l;
    els.detail.appendChild(d);
  }
  els.detail.style.userSelect = "text";
  reportLayout();
}

// The first grade is shown as soon as both positions have been searched to
// this depth; every deeper iteration up to the user's selected depth then
// re-grades and updates the badge. Nothing is searched beyond the selected depth.
const QUICK_MS = 150;
// Think time of the first pass over earlier moves.
const BACKFILL_MS = 300;

// ----------------------------------------------------------------- game state
let sans = [];            // current mainline
let fens = [];            // fens[i] = position after i plies (fens[0] = start)
let grades = [];          // grades[i] = classification of sans[i] (or undefined)
let selected = -1;        // ply shown when not the latest (-1 = latest)
const evalCache = new Map(); // fen -> analysis result
let generation = 0;
let paused = "";
let flipped = false;      // mirror the site's board orientation (black at bottom)

function rebuild(newSans) {
  const chess = new Chess();
  const newFens = [chess.fen()];
  const ok = [];
  for (const san of newSans) {
    try {
      if (!chess.move(san)) break;
    } catch { break; }
    ok.push(san);
    newFens.push(chess.fen());
  }
  let keep = 0;
  while (keep < ok.length && keep < sans.length && ok[keep] === sans[keep]) keep++;
  grades = grades.slice(0, keep);
  if (ok.length !== sans.length) selected = -1;
  sans = ok;
  fens = newFens;
  return ok.length === newSans.length;
}

/**
 * Analyse `fen` to at least `depth`. Cached results shallower than `depth`
 * are re-searched. `onPartial(snapshot)` fires after each completed depth.
 */
async function analyseFen(fen, gen, ms, onPartial) {
  const cached = evalCache.get(fen);
  if (cached && (cached.terminal || (cached.ms || 0) >= ms)) return cached;
  const chess = new Chess(fen);
  if (chess.isGameOver()) {
    const r = { bestMove: null, lines: [], depth: 0, ms, terminal: true };
    evalCache.set(fen, r);
    return r;
  }
  await engineChosen;
  const e = engine;
  try { await e.readyPromise; } catch { return null; }
  const r = await e.analyse(fen, ms, (snap) => {
    if (gen !== generation) return;
    setStatus(`${fmtSecs(Math.min(snap.elapsed, ms))} / ${fmtSecs(ms)} · profondeur ${snap.depth}`);
    if (onPartial) onPartial(snap);
  });
  // a longer think supersedes a shorter one; an interrupted search does not
  if (r && r.lines.length && (!cached || (r.ms || 0) >= (cached.ms || 0))) {
    evalCache.set(fen, r);
  }
  return r && r.lines.length ? r : (cached || null);
}

/**
 * A move both of whose positions are named theory, before the engine has said
 * anything. Book is the one grade that needs no search, and that is the point:
 * 1.e4 should never spend a third of a second labelled an inaccuracy while a
 * shallow search catches up.
 */
function isBookMove(i) {
  if (fens[i + 1] === undefined) return false;
  return !!lookupOpening(fens[i + 1]) && (i === 0 || !!lookupOpening(fens[i]));
}

function bookGrade(i) {
  const chess = new Chess(fens[i]);
  let move = null;
  try { move = chess.move(sans[i]); } catch { /* unparsable: leave it */ }
  const empty = { bestMove: null, lines: [], depth: 0, ms: 0 };
  return {
    cat: "book", loss: 0, move, san: sans[i], ply: i,
    before: empty, after: empty,
    cpBest: 0, cpAfter: 0, isEngineBest: false,
    opening: lookupOpening(fens[i + 1]),
    depth: 0, provisional: true, fromBook: true,
  };
}

function buildGrade(i, before, after, provisional) {
  const g = classify(before, after, fens[i], sans[i], i);
  g.before = before;
  g.after = after;
  g.san = sans[i];
  g.ply = i;
  g.depth = Math.min(before.terminal ? 99 : before.depth, after.terminal ? 99 : after.depth);
  g.provisional = provisional;
  return g;
}

function isShown(i) {
  return (selected >= 0 ? selected : sans.length - 1) === i;
}

/**
 * Grade ply i to `depth`. When `live` is set the badge updates after every
 * completed depth so a provisional grade appears within a second or so.
 */
async function gradePly(i, gen, ms, live) {
  const existing = grades[i];
  if (existing && !existing.provisional && (existing.ms || 0) >= ms) return existing;

  // Theory first, and without waiting for the engine at all: a move that
  // reaches a named position is named straight away rather than after a
  // shallow search has had a chance to call 1.e4 an inaccuracy. classify()
  // still runs behind this and still has the last word - a named line that
  // leaves the mover simply lost loses the badge on the next render.
  if (live && !existing && isBookMove(i)) {
    grades[i] = bookGrade(i);
    if (isShown(i)) renderCurrent();
    refresh();
  }

  // Quick pass: get both positions to FIRST_GRADE_DEPTH so a grade shows
  // right away, before the (much longer) full-depth search starts.
  if (live && ms > QUICK_MS && !(existing && (existing.ms || 0) >= QUICK_MS)) {
    const b0 = await analyseFen(fens[i], gen, QUICK_MS, null);
    if (!b0 || gen !== generation) return null;
    const a0 = await analyseFen(fens[i + 1], gen, QUICK_MS, null);
    if (!a0 || gen !== generation) return null;
    grades[i] = buildGrade(i, b0, a0, true);
    if (isShown(i)) renderCurrent();
    refresh();
  }

  const before = await analyseFen(fens[i], gen, ms, live ? (snap) => {
    // "before" is usually cached (it was the previous "after"); if not, grade
    // provisionally against whatever we have for "after" so far.
    const aft = evalCache.get(fens[i + 1]);
    if (aft && gen === generation) { grades[i] = buildGrade(i, snap, aft, true); if (isShown(i)) renderCurrent(); refresh(); }
  } : null);
  if (!before || gen !== generation) return null;

  const after = await analyseFen(fens[i + 1], gen, ms, live ? (snap) => {
    if (gen !== generation) return;
    grades[i] = buildGrade(i, before, snap, true);
    if (isShown(i)) renderCurrent();
    refresh();
  } : null);
  if (!after || gen !== generation) return null;

  const g = buildGrade(i, before, after, false);
  g.ms = ms;
  grades[i] = g;
  return g;
}

async function run() {
  const gen = ++generation;
  if (paused) {
    showIdle(paused, "en pause");
    return;
  }
  if (!sans.length) {
    showIdle("En attente de coups", "en attente");
    return;
  }
  const last = sans.length - 1;

  // 0. the shallow line takes milliseconds: get it first so the play arrows show at once
  if (settings.nextArrow || settings.oppArrow) {
    await humanLine(fens[last + 1], gen);
    if (gen !== generation) return;
  }
  // 1. latest move, progressively, to the configured depth (each snapshot redraws the arrows)
  const g = await gradePly(last, gen, settings.thinkMs, true);
  if (gen !== generation) return;
  if (g) renderCurrent();
  refresh();

  // 2. earlier moves: a quick pass so the sheet and the profile fill fast, then a pass at
  // the full think time that refines them (each move needs one new search per pass)
  for (const ms of [Math.min(BACKFILL_MS, settings.thinkMs), settings.thinkMs]) {
    for (let i = last - 1; i >= 0; i--) {
      if (gen !== generation) return;
      if (grades[i] && !grades[i].provisional && (grades[i].ms || 0) >= ms) continue;
      setStatus(`${ms < settings.thinkMs ? "analyse rapide" : "affinage"} des coups précédents… (${i + 1}/${sans.length})`);
      await gradePly(i, gen, ms, false);
      if (gen !== generation) return;
      refresh();
      if (selected === i) renderCurrent();
    }
  }

  setStatus(`profondeur ${g ? g.depth : "?"} en ${fmtSecs(settings.thinkMs)} · en attente du prochain coup`);
}



function h(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

// ----------------------------------------------------------------- coach
const tipLog = new Map(); // ply -> id of the card shown for it
function renderCoach(g) {
  const box = els.coach;
  // cards already shown on the previous few moves are avoided, so the coach varies
  const avoid = new Set();
  if (g) for (const [p, id] of tipLog) if (p !== g.ply && Math.abs(p - g.ply) <= 8) avoid.add(id);
  const tip = g && settings.coach ? coachTip(g, { fens, sans, grades, ply: g.ply, avoid }) : null;
  if (!tip) { box.hidden = true; box.replaceChildren(); return; }
  if (!g.provisional) tipLog.set(g.ply, tip.id);
  box.hidden = false;
  const head = h("div", "chead");
  head.append(h("span", "cicon", tip.icon), h("span", "ctitle", tip.title));
  const how = h("div", "chow");
  how.append(h("b", null, tip.howLabel || "Pour progresser : "), tip.how);
  const parts = [h("div", "kicker neon", tip.label), head, h("div", "ctext", tip.text)];
  if (tip.why) { const why = h("div", "chow"); why.append(h("b", null, "Pourquoi : "), tip.why); parts.push(why); }
  parts.push(how);
  // what the move shows, explained (fork, recapture, outpost...): the two that matter most
  for (const k of themesOf(g).slice(0, 2)) {
    const t = h("div", "chow");
    t.append(h("b", null, "🏷 " + THEMES[k][0] + " : "), THEMES[k][1]);
    parts.push(t);
  }
  box.replaceChildren(...parts);
}

// ----------------------------------------------------------------- summary table + accuracy
const cells = {};
(function buildTable() {
  const head = document.createElement("div");
  head.className = "trow head";
  head.innerHTML = '<span></span><span class="chip w" title="Blancs"></span><span class="chip b" title="Noirs"></span>';
  els.table.appendChild(head);
  for (const cat of TABLE_CATS) {
    const row = document.createElement("div");
    row.className = "trow zero";
    row.innerHTML = '<span class="tname"></span><span class="tn">0</span><span class="tn">0</span>';
    row.firstChild.textContent = FR[cat];
    const [w, b] = row.querySelectorAll(".tn");
    cells[cat] = { row, w, b };
    els.table.appendChild(row);
  }
})();

const RING_LEN = 2 * Math.PI * 18;
function setRing(textEl, ringEl, value) {
  if (value === null) { textEl.textContent = "—"; ringEl.style.strokeDashoffset = RING_LEN; return; }
  textEl.textContent = value.toFixed(1);
  ringEl.style.strokeDasharray = RING_LEN;
  ringEl.style.strokeDashoffset = RING_LEN * (1 - value / 100);
}

function renderSummary() {
  const counts = { w: {}, b: {} };
  let graded = 0;
  for (let i = 0; i < sans.length; i++) {
    const g = grades[i];
    if (!g) continue;
    graded++;
    const side = i % 2 === 0 ? "w" : "b";
    counts[side][g.cat] = (counts[side][g.cat] || 0) + 1;
  }
  for (const cat of TABLE_CATS) {
    const w = counts.w[cat] || 0, b = counts.b[cat] || 0;
    cells[cat].w.textContent = w;
    cells[cat].b.textContent = b;
    cells[cat].row.classList.toggle("zero", w + b === 0);
  }
  setRing(els.accW, els.ringW, gameAccuracy(grades.slice(0, sans.length), "w"));
  setRing(els.accB, els.ringB, gameAccuracy(grades.slice(0, sans.length), "b"));

  els.caption.textContent = !sans.length ? "" :
    graded < sans.length ? `Analyse en cours : ${graded}/${sans.length} coups` : `${sans.length} coups analysés`;
}

// ----------------------------------------------------------------- rendering
function moveNumber(ply) {
  return Math.floor(ply / 2) + 1 + (ply % 2 === 0 ? "." : "…");
}

function setCat(cat) {
  els.badge.className = "cat-" + cat;
  els.info.style.setProperty("--cat", `var(--${cat})`);
  els.glyph.textContent = CATEGORIES[cat].glyph;
  els.label.textContent = FR[cat] || CATEGORIES[cat].label;
  els.badge.classList.add("pop");
  setTimeout(() => els.badge.classList.remove("pop"), 160);
}

function pvToSan(fen, pv, n = 5) {
  const chess = new Chess(fen);
  const out = [];
  for (const uci of pv.slice(0, n)) {
    try {
      const m = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      if (!m) break;
      out.push(m.san);
    } catch { break; }
  }
  return out.join(" ");
}

/**
 * Name the line under the badge. Once the game leaves theory the last name it
 * had is kept, dimmed, so the panel still says which opening was played rather
 * than going blank on the first new move.
 */
function renderOpening(g) {
  let name = g.opening;
  let stale = false;
  for (let i = g.ply - 1; !name && i >= 0; i--) {
    if (grades[i] && grades[i].opening) {
      name = grades[i].opening;
      stale = true;
    }
  }
  els.opening.textContent = name || "";
  els.opening.classList.toggle("stale", stale);
  els.opening.title = name ? (stale ? name + " (hors théorie)" : name) : "";
  renderPrinciples(settings.coach && g.ply < 30 ? name : null);
}

/** The ideas behind the opening being played, folded under the coach card for the first moves. */
function renderPrinciples(name) {
  const box = $("principles");
  if (!name) { box.hidden = true; return; }
  const p = principlesFor(name);
  box.hidden = false;
  if (box.dataset.title === p.title) return; // keep it open or closed as the user left it
  box.dataset.title = p.title;
  const ul = h("ul");
  for (const t of p.points) ul.append(h("li", null, t));
  box.replaceChildren(h("summary", null, "📖 Principes : " + p.title), h("div", "ctext", p.idea), ul);
}

// Most telling first: a mate or a tactic says more than "capture" or "pawn in the centre".
const THEME_ORDER = ["backRankMate", "queenMate", "rookMate", "mate", "brilliantSac", "queenSac", "royalFork", "knightFork",
  "fork", "doubleCheck", "discoveredCheck", "absolutePin", "pin", "defendsMate", "freePiece", "winningCapture", "promotion",
  "outpost", "rooksSeventh", "rookSeventh", "rookBehindPassed", "rookBlocksPassed", "makesPassed", "protectedPassed",
  "pushesPassed", "opposition", "activatesKing", "completesDev", "connectsRooks", "castles", "fianchetto", "strikeCenter",
  "kick", "recapture", "equalTrade", "defends", "blocks", "retreat", "rookOpenFile", "dev", "centerPawn", "check",
  "capture", "book", "pawnEnding", "rookEnding", "queenEnding", "minorEnding"];
/** The move's themes, most telling first. */
function themesOf(g) {
  if (!g || !g.move) return [];
  let prev = null;
  try { if (g.ply > 0) prev = new Chess(fens[g.ply - 1]).move(sans[g.ply - 1]); } catch { /* none */ }
  const rank = (k) => { const i = THEME_ORDER.indexOf(k); return i < 0 ? 99 : i; };
  const keys = moveThemes(fens[g.ply], fens[g.ply + 1], g.move, prev, g.cat);
  // the specific theme says it all: "knight fork" makes "fork" redundant
  const covered = { fork: ["knightFork", "royalFork"], mate: ["backRankMate", "queenMate", "rookMate"], rookSeventh: ["rooksSeventh"],
    capture: ["winningCapture", "freePiece", "recapture", "equalTrade"], pin: ["absolutePin"] };
  return keys.filter((k) => !(covered[k] || []).some((x) => keys.includes(x))).sort((x, y) => rank(x) - rank(y));
}

/** Known openings your side can still follow, with your next move, for the first moves. */
function renderOpenings() {
  const box = $("openings");
  const side = mineSide() || (flipped ? "b" : "w");
  const list = settings.coach && !paused && sans.length < 16 ? openingSuggestions(sans, side) : [];
  if (!list.length) { box.hidden = true; return; }
  box.hidden = false;
  box.replaceChildren(h("div", "kicker neon", `🎯 Ouvertures à suivre (${side === "w" ? "Blancs" : "Noirs"})`),
    ...list.map((o) => {
      const d = h("div", "op");
      d.append(h("div", null, o.name + (o.next ? " · prochain coup : " : "")));
      if (o.next) d.firstChild.append(h("b", null, o.next));
      d.append(h("div", "ctext", o.idea));
      return d;
    }));
}

function renderGrade(g) {
  setCat(g.cat);
  const white = g.ply % 2 === 0;
  els.move.textContent = `${moveNumber(g.ply)} ${g.san} · ${white ? "Blancs" : "Noirs"}`;
  // engine scores are from the side to move: White before a White move, Black after it.
  els.evalBefore.textContent = fmtEval(g.before.lines[0], white);
  els.evalAfter.textContent = g.after.terminal ? (g.cat === "mate" ? "#" : "½") : fmtEval(g.after.lines[0], !white);

  renderOpening(g);

  const bits = [];
  if (g.loss > 0.05) bits.push(`−${g.loss.toFixed(1)} % de chances de gain`);
  if (g.fromBook) bits.push("théorie d'ouverture…");
  else bits.push(`profondeur ${g.depth}${g.provisional ? "…" : ""}`);
  els.detail.textContent = bits.join(" · ");

  if (!g.isEngineBest && g.before.lines[0] && g.cat !== "mate" && g.cat !== "book") {
    els.bestline.replaceChildren("Meilleur coup : ", h("b", null, pvToSan(fens[g.ply], g.before.lines[0].pv, 4)));
  } else {
    els.bestline.textContent = "";
  }
  renderNext(g);
  // the on-board badge only ever shows the latest move
  renderCoach(g);
  if (g.ply === sans.length - 1) postGrade(g);
}

function renderCurrent() {
  const idx = selected >= 0 ? selected : sans.length - 1;
  if (idx < 0) return;
  const g = grades[idx];
  if (g) {
    renderGrade(g);
  } else {
    setCat("none");
    els.label.textContent = "Analyse…";
    els.move.textContent = `${moveNumber(idx)} ${sans[idx]}`;
    els.evalBefore.textContent = "·";
    els.evalAfter.textContent = "·";
    els.detail.textContent = "";
    els.bestline.textContent = "";
    renderCoach(null);
  }
  renderOpenings();
}

function showIdle(text, status) {
  setCat("none");
  els.label.textContent = text;
  els.move.textContent = "—";
  els.evalBefore.textContent = "·";
  els.evalAfter.textContent = "·";
  els.detail.textContent = "";
  els.bestline.textContent = "";
  renderCoach(null);
  renderPrinciples(null);
  renderOpenings();
  renderSummary();
  setStatus(status);
  postGrade(null);
}

/** Everything that depends on the whole game: counts, accuracy, the sheet, the stored record. */
function refresh() {
  renderSummary();
  if (tab === "sheet") renderSheet();
  saveGame();
  reportLayout();
}

// ----------------------------------------------------------------- player sheet & profile
// The sheet shows the side the user picked, else the side at the bottom of the board.
let sheetPick = null;
const sheetSide = () => sheetPick || (flipped ? "b" : "w");

// Only the user's own games go into the profile: a game against the computer (the page says
// so), one the user marked with "C'est ma partie", or one already stored. `claim` is the
// user's explicit answer for this game (a side, or null for "not mine"); undefined = not asked.
let claim, pageMine = false, pageBot = false;
const isThisGame = (r) => { const cur = sans.join(" "); return r.moves.startsWith(cur) || cur.startsWith(r.moves); };
function mineSide() {
  if (claim !== undefined) return claim;
  if (pageMine) return flipped ? "b" : "w";
  const r = sans.length ? records.find(isThisGame) : null;
  return r ? r.side : null;
}
const SIDE_FR = { w: "Blancs", b: "Noirs" };
const fmt = (x) => (x === null || x === undefined ? "—" : Math.round(x));

let records = [];
storage.get("mgGames", (v) => { records = (v && v.mgGames) || []; });

/** Store the game once every move of the player's side has its final grade. */
let lastSaved = "";
function saveGame() {
  const side = mineSide();
  if (paused || sans.length < 16 || !side) return;
  for (let i = side === "w" ? 0 : 1; i < sans.length; i += 2) if (!grades[i] || grades[i].provisional) return;
  const sheet = analyseGame({ fens, sans, grades }, side);
  if (!sheet) return;
  const rec = gameRecord(sheet, sans);
  if (pageBot) rec.bot = true;
  const key = rec.side + rec.moves + Math.round(rec.acc);
  if (key === lastSaved) return;
  lastSaved = key;
  records = upsertRecord(records, rec);
  storage.set({ mgGames: records });
  if (tab === "profile") renderProfile();
}

function card(cls, ...children) {
  const c = h("div", "card " + (cls || ""));
  c.append(...children);
  return c;
}

/** Side picker and the "C'est ma partie" switch at the top of the sheet. */
function sheetControls(side) {
  const row = h("div", "sheet-controls");
  const seg = h("div", "seg");
  for (const s of ["w", "b"]) {
    const b = h("button", s === side ? "active" : "", SIDE_FR[s]);
    b.addEventListener("click", () => { sheetPick = s; renderSheet(); });
    seg.append(b);
  }
  const own = mineSide() === side;
  const claimBtn = h("button", "claim" + (own ? " on" : ""), own ? "✓ Ma partie" : "C'est ma partie");
  claimBtn.title = own ? "Retirer cette partie de votre profil" : `Ajouter les coups des ${SIDE_FR[side]} à votre profil`;
  claimBtn.addEventListener("click", () => {
    claim = own ? null : side;
    lastSaved = "";
    if (own) { records = records.filter((r) => !isThisGame(r)); storage.set({ mgGames: records }); }
    else saveGame();
    renderSheet();
  });
  row.append(seg, claimBtn);
  return row;
}

function renderSheet() {
  const side = sheetSide();
  const sheet = sans.length ? analyseGame({ fens, sans, grades }, side) : null;
  if (!sheet) {
    els.sheet.replaceChildren(sheetControls(side), h("div", "empty", "La fiche apparaît dès que quelques coups des " + SIDE_FR[side].toLowerCase() + " sont analysés."));
    reportLayout();
    return;
  }
  const head = h("div", "sheet-head");
  head.append(h("h3", null, `Fiche des ${SIDE_FR[side]} · ${fmt(sheet.acc)} %`), h("span", null, sheet.opening ? sheet.opening.split(":")[0] : ""));
  const grid = h("div", "domains");
  for (const d of sheet.domains) {
    const top = h("div", "dom-top");
    top.append(h("span", null, d.label), h("span", "score", fmt(d.score)));
    const bar = h("div", "bar");
    const fill = h("i");
    fill.style.width = (d.score ?? 0) + "%";
    bar.append(fill);
    grid.append(card("dom", top, bar, h("div", "dom-verdict", verdict(d.score)), h("div", "dom-note", d.note)));
  }
  const weakest = sheet.domains.filter((d) => d.score !== null).sort((a, b) => a.score - b.score)[0];
  const tipText = weakest && weakest.score < 85
    ? `Domaine le plus fragile dans cette partie : ${weakest.label.toLowerCase()} (${weakest.note.toLowerCase()}).`
    : "Partie homogène : aucun domaine nettement en dessous des autres.";
  const pending = mineSide() === side && !records.some(isThisGame)
    ? h("div", "dom-note", sans.length < 16 ? "Ajout au profil à partir de 16 demi-coups." : "Ajout au profil dès la fin de l'analyse rapide.") : null;
  const measured = card("", h("div", "kicker", "Mesuré dans cette partie"), tacticsGrid(sheet.tactics),
    h("div", "dom-note", sheet.bookExit ? `Dernier coup théorique : coup ${sheet.bookExit}` : "Aucun coup théorique joué"));
  els.sheet.replaceChildren(...[sheetControls(side), pending, head, grid, measured,
    card("", h("div", "kicker neon", "À retenir · interprétation du coach"), h("div", "ctext", tipText))].filter(Boolean));
  reportLayout();
}

function sparkline(series) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 96 36");
  svg.setAttribute("class", "spark");
  const line = document.createElementNS(ns, "polyline");
  const lo = Math.min(...series) - 2, hi = Math.max(...series) + 2;
  line.setAttribute("points", series.map((v, i) =>
    `${series.length > 1 ? (i * 92) / (series.length - 1) + 2 : 48},${34 - ((v - lo) / (hi - lo)) * 32}`).join(" "));
  svg.append(line);
  svg.append(Object.assign(document.createElementNS(ns, "title"), { textContent: "Précision des dernières parties" }));
  return svg;
}

function list(items) {
  const ul = h("ul");
  for (const t of items) ul.append(h("li", null, t));
  return ul;
}

/** Found / missed counts, measured move by move (see analyseGame). */
function tacticsGrid(t) {
  const grid = h("div", "stats");
  const cell = (label, found, missed) => {
    const c = h("div", "stat");
    const v = h("div", "stat-val");
    v.append(h("b", null, String(found)));
    if (missed !== undefined) v.append(h("span", "missed", " / " + missed));
    c.append(v, h("div", "stat-label", label));
    grid.append(c);
  };
  cell("Fourchettes trouvées / manquées", t.forkFound || 0, t.forkMissed || 0);
  cell("Clouages trouvés / manqués", t.pinFound || 0, t.pinMissed || 0);
  cell("Mats donnés / manqués", t.mateFound || 0, t.mateMissed || 0);
  cell("Pièces laissées en prise", t.hanging || 0);
  cell("Coups brillants", t.brilliant || 0);
  return grid;
}

function renderProfile() {
  const p = buildProfile(records);
  if (!p) {
    els.profile.replaceChildren(h("div", "empty",
      "Votre profil se construit à partir de vos parties contre des personnes (16 demi-coups minimum) : " +
      "les parties contre les bots n'y comptent pas. Ouvrez la fiche d'une partie terminée et cliquez « C'est ma partie »."));
    reportLayout();
    return;
  }
  const pair = (a, b) => { const g = h("div", "grid2"); g.append(a, b); return g; };
  // secondary sections fold to one line each so the tab stays short on a laptop screen
  const box = (title, items) => {
    const d = h("details", "card fold");
    const sum = h("summary", "kicker", title);
    sum.append(h("span", "count", String(items.length)));
    d.append(sum, list(items));
    d.addEventListener("toggle", reportLayout);
    return d;
  };

  // --- measured: numbers taken straight from the games
  const trend = p.trend === null ? "" : ` · tendance ${p.trend >= 0 ? "+" : "−"}${Math.abs(p.trend).toFixed(1)}`;
  const sideAcc = (s) => (p.sideGames[s] ? `${fmt(p.bySide[s])} % (${p.sideGames[s]})` : "—");
  const accText = h("div");
  accText.append(h("div", "kicker", "Précision moyenne"), h("div", "big", `${fmt(p.acc)} %`),
    h("p", null, `Blancs ${sideAcc("w")} · Noirs ${sideAcc("b")}${trend}`),
    h("p", null, p.bookExit ? `Sortie de théorie en moyenne au coup ${Math.round(p.bookExit)}` : "Pas encore de coup théorique enregistré"));
  const accCard = card("style-card", accText);
  accText.style.flex = "1";
  if (p.series.length >= 2) accCard.append(sparkline(p.series));
  const eg = p.endgame.score === null ? ["Pas encore de finale jouée."]
    : [`${fmt(p.endgame.score)} % sur ${p.endgame.games} finale${p.endgame.games > 1 ? "s" : ""} (${verdict(p.endgame.score).toLowerCase()})`];

  // --- interpreted: what the coach reads into those numbers
  const big = h("div", "big", p.style);
  if (p.styleMissing) big.append(h("span", "provisional", "provisoire"));
  const styleText = h("div");
  styleText.append(h("div", "kicker", "Style dominant"), big,
    h("p", null, p.styleText + (p.styleMissing ? ` Encore ${p.styleMissing} partie${p.styleMissing > 1 ? "s" : ""} pour le confirmer.` : "")));
  const goals = h("div", "goals");
  for (const g of p.goals) {
    const row = h("div", "goal");
    const t = h("div");
    t.append(h("b", null, g.title), g.text);
    row.append(t);
    goals.append(row);
  }

  els.profile.replaceChildren(
    h("div", "section-title", `Mesuré · ${p.games} partie${p.games > 1 ? "s" : ""}`),
    accCard,
    card("", h("div", "kicker", "Tactique"), tacticsGrid(p.tactics)),
    pair(box("Ouvertures les plus réussies", p.openings.map((o) => `${o.name} (${fmt(o.acc)} %, ${o.n}×)`)),
      box("Niveau en finale", eg)),
    pair(box("Erreurs récurrentes", p.errors.map((e) => `${e.text} ×${e.c}`)),
      box("Pièces les moins exploitées", p.weakPieces.map((x) => `${PIECE_NAMES[x.t]} : ${fmt(x.acc)} % sur ${x.n} coups`))),
    h("div", "section-title", "Interprétation du coach"),
    card("", styleText),
    pair(box("Points forts", p.strengths.map((s) => `${s.label} (${fmt(s.score)})`)),
      box("Mauvaises habitudes", p.habits.map((x) => x.text))),
    card("", h("div", "kicker neon", "Vos 3 objectifs pour la prochaine séance"), goals),
  );
  reportLayout();
}
const PIECE_NAMES = { n: "Cavaliers", b: "Fous", r: "Tours", q: "Dame" };

// ----------------------------------------------------------------- positions -> moves
// juliensong.com only gives successive piece placements: find the legal move (or two, when
// the bot answered between two reads) that leads from one to the next. Placements that match
// nothing (a half-drawn board) are skipped.
// shortcut: a game joined mid-way (first placement not the start) yields no moves; fine for a bot page.
function boardsToSans(boards) {
  const c = new Chess();
  const place = () => c.fen().split(" ")[0];
  const play = (m) => c.move({ from: m.from, to: m.to, promotion: m.promotion });
  const leadsTo = (m, b) => { play(m); const ok = place() === b; c.undo(); return ok; };
  const out = [];
  for (const b of boards) {
    if (b === place()) continue;
    const one = c.moves({ verbose: true }).find((m) => leadsTo(m, b));
    if (one) { out.push(play(one).san); continue; }
    for (const m of c.moves({ verbose: true })) {
      play(m);
      const two = c.moves({ verbose: true }).find((r) => leadsTo(r, b));
      c.undo();
      if (two) { out.push(play(m).san, play(two).san); break; }
    }
  }
  return out;
}

// ----------------------------------------------------------------- messages
window.addEventListener("message", (ev) => {
  const d = ev.data;
  if (!d || d.type !== "movegrade:moves") return;
  paused = d.allowed ? "" : d.reason || "En pause";
  const fair = document.getElementById("fair");
  const reallyPaused = !!paused && d.mode !== "none";
  if (fair) { fair.hidden = !reallyPaused; fair.textContent = "En pause"; }
  const orientationChanged = !!d.flipped !== flipped;
  flipped = !!d.flipped;
  pageMine = !!d.mine;
  pageBot = !!d.bot;
  if (orientationChanged) tipLog.clear();
  const prevSans = sans;
  const complete = rebuild(d.boards ? boardsToSans(d.boards) : d.sans || []);
  // another game (not a step forward or back in this one): forget which cards were shown
  if (sans.slice(0, prevSans.length).join() !== prevSans.slice(0, sans.length).join()) {
    tipLog.clear();
    claim = undefined;
    sheetPick = null;
  }
  if (orientationChanged && sans.length) renderCurrent();
  if (!complete) setStatus("liste de coups incomplète");
  if (!grades[sans.length - 1]) postGrade(null); // new move: clear the stale board badge
  if (!paused && sans.length) renderCurrent();
  run();
});

window.__movegrade = { get sans() { return sans; }, get grades() { return grades; }, evalCache };

showIdle("En attente de coups", "chargement du moteur…");
parent.postMessage({ type: "movegrade:ready" }, "*");
reportLayout();

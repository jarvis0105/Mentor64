// Player sheet ("fiche de partie") and player profile ("profil échiquéen").
//
// analyseGame() reads one graded game for one side and scores six domains (opening,
// middlegame, endgame, pieces, defence, attack) from the accuracy of the moves that belong
// to each, plus concrete counts taken from the positions (pieces developed, castling move,
// tactics missed, pieces left hanging...). Scores are lichess's per-move accuracy averaged
// over the moves of the domain, so 100 = every move as good as the engine's.
//
// gameRecord() shrinks that into what is kept across games (chrome.storage), and
// buildProfile(records) turns the stored games into the profile: dominant style,
// strengths, habits, least well used pieces, best openings, endgame level, recurring
// errors, progression and three goals for the next session.

import { Chess } from "../lib/chess.js";
import { phaseOf, relRank, PIECE_FR, tacticsOf, bestMoveOf } from "./coach.js";

/** lichess's per-move accuracy curve, applied to the win% lost on a move. */
export const moveAccuracy = (loss) => Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));

const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const START = { w: { b1: "n", g1: "n", c1: "b", f1: "b" }, b: { b8: "n", g8: "n", c8: "b", f8: "b" } };
const BAD = new Set(["inaccuracy", "mistake", "miss", "blunder"]);
// Fewer moves than this in a domain and it gets no score ("—") rather than a misleading one.
const MIN_MOVES = 3;
const score = (a) => (a.length >= MIN_MOVES ? avg(a) : null);
// Each piece left hanging costs the defence score this many points.
const HANGING_PENALTY = 12;

export const DOMAINS = [
  ["opening", "Ouverture"], ["middlegame", "Milieu de jeu"], ["endgame", "Finale"],
  ["pieces", "Pièces"], ["defense", "Défense"], ["attack", "Attaque"],
];
const DOMAIN_FR = Object.fromEntries(DOMAINS);

export const ERRORS_FR = {
  hanging: "Pièces laissées en prise",
  tactic: "Tactiques adverses non vues / gains manqués",
  mate: "Mats manqués",
  conversion: "Positions gagnantes non concrétisées",
  endgame: "Imprécisions en finale",
  "queen-early": "Dame sortie trop tôt",
  "phase-opening": "Imprécisions d'ouverture",
  "phase-middlegame": "Imprécisions de milieu de jeu",
};

export const verdict = (s) => (s === null ? "" : s >= 85 ? "Solide" : s >= 70 ? "Correct" : "À travailler");
const plural = (n, word) => `${n} ${word}${n > 1 ? "s" : ""}`;

/**
 * @param game  { fens, sans, grades } as kept by the panel
 * @param side  "w" | "b"
 * Returns null until the side has a few final grades.
 */
export function analyseGame({ fens, sans, grades }, side) {
  const opp = side === "w" ? "b" : "w";
  const ph = { opening: [], middlegame: [], endgame: [] };
  const byPiece = { p: [], n: [], b: [], r: [], q: [], k: [] };
  const def = [], att = [], all = [];
  const errors = {};
  const st = { moves: 0, checks: 0, captures: 0, sacs: 0, forward: 0, quiet: 0, great: 0, trades: 0 };
  // measured tactics: found = played and the move was good; missed = the engine's move had it and the move played lost ground
  const tac = { forkFound: 0, forkMissed: 0, pinFound: 0, pinMissed: 0, mateFound: 0, mateMissed: 0, hanging: 0, brilliant: 0 };
  let bookExit = null;
  let missedTactics = 0, hanging = 0, kingSteps = 0, passedPushes = 0, castledAt = null, opening = null;
  const err = (k) => { errors[k] = (errors[k] || 0) + 1; };

  for (let i = 0; i < sans.length; i++) if (grades[i] && grades[i].opening) opening = grades[i].opening;

  for (let i = side === "w" ? 0 : 1; i < sans.length; i += 2) {
    const g = grades[i];
    if (!g || g.provisional || !g.move || g.cat === "none") continue;
    const m = g.move;
    const a = moveAccuracy(g.loss || 0);
    let before;
    try { before = new Chess(fens[i]); } catch { continue; }
    const phase = phaseOf(before, i);
    all.push(a);
    ph[phase].push(a);
    byPiece[m.piece].push(a);
    const cp = g.cpBest || 0; // mover's point of view
    if (cp <= -80 || before.inCheck()) def.push(a);
    if (cp >= 80) att.push(a);

    st.moves++;
    if (m.san.includes("+")) st.checks++;
    if (m.captured) st.captures++;
    if (g.cat === "brilliant") st.sacs++;
    if (g.cat === "great" || g.cat === "brilliant") st.great++;
    if (m.piece !== "p" && m.piece !== "k" && relRank(m.to, side) >= 5) st.forward++;
    if (!m.captured && !m.san.includes("+")) st.quiet++;
    if (m.captured && m.piece !== "p" && VAL[m.captured] === VAL[m.piece]) st.trades++;
    if (m.flags.includes("k") || m.flags.includes("q")) castledAt = Math.floor(i / 2) + 1;
    if (phase === "endgame" && m.piece === "k" && "cdef".includes(m.to[0])) kingSteps++;
    if (phase === "endgame" && m.piece === "p" && relRank(m.to, side) >= 5) passedPushes++;
    if (g.cat === "book") bookExit = Math.floor(i / 2) + 1;

    if (g.cat === "brilliant") tac.brilliant++;
    const mateLine = g.before && g.before.lines && g.before.lines[0] && g.before.lines[0].mate;
    if (g.cat === "mate") tac.mateFound++;
    else if (mateLine > 0 && !g.isEngineBest) tac.mateMissed++;
    const played = fens[i + 1] ? tacticsOf(fens[i + 1], m) : { fork: false, pin: false };
    if (["best", "great", "brilliant", "excellent", "mate"].includes(g.cat)) {
      if (played.fork) tac.forkFound++;
      if (played.pin) tac.pinFound++;
    }
    if (BAD.has(g.cat) && (g.loss || 0) >= 5) {
      const b = bestMoveOf(g, fens[i]);
      const t = b ? tacticsOf(b.fen, b.move) : null;
      if (t && t.fork && !played.fork) tac.forkMissed++;
      if (t && t.pin && !played.pin) tac.pinMissed++;
    }

    if (!BAD.has(g.cat)) continue;
    let after = null;
    try { after = new Chess(fens[i + 1]); } catch { /* ignore */ }
    let tagged = false;
    if (after && m.piece !== "p" && m.piece !== "k" && (g.loss || 0) >= 8) {
      const at = after.attackers(m.to, opp);
      if (at.length) {
        const cheapest = Math.min(...at.map((sq) => VAL[after.get(sq).type]));
        if (!after.attackers(m.to, side).length || cheapest < VAL[m.piece]) { err("hanging"); hanging++; tac.hanging++; tagged = true; }
      }
    }
    const best = g.before && g.before.lines && g.before.lines[0];
    if (best && best.mate > 0) { err("mate"); tagged = true; }
    else if (best && best.pv[0] && (g.loss || 0) >= 8) {
      const target = before.get(best.pv[0].slice(2, 4));
      if (target && target.color === opp) { err("tactic"); missedTactics++; tagged = true; }
    }
    if (g.cat === "miss") { err("conversion"); tagged = true; }
    if (phase === "opening" && m.piece === "q") { err("queen-early"); tagged = true; }
    if (phase === "endgame") { err("endgame"); tagged = true; }
    if (!tagged) err("phase-" + phase);
  }
  if (st.moves < 4) return null;

  // development and centre after ten moves (or at the end of a shorter game)
  let developed = 0;
  try {
    const at10 = new Chess(fens[Math.min(20, fens.length - 1)]);
    developed = Object.entries(START[side]).filter(([sq, t]) => {
      const p = at10.get(sq);
      return !(p && p.type === t && p.color === side);
    }).length;
  } catch { /* keep 0 */ }

  const pieceAcc = {};
  for (const t of ["n", "b", "r", "q"]) if (byPiece[t].length) pieceAcc[t] = { n: byPiece[t].length, acc: avg(byPiece[t]) };
  const ranked = Object.entries(pieceAcc).filter(([, v]) => v.n >= 2).sort((x, y) => y[1].acc - x[1].acc);
  const pieceMoves = [...byPiece.n, ...byPiece.b, ...byPiece.r, ...byPiece.q];

  // defence: accuracy under pressure, minus the pieces left hanging (which say as much)
  const defBase = def.length >= MIN_MOVES ? avg(def) : hanging ? avg(all) : null;
  const defScore = defBase === null ? null : Math.max(0, defBase - HANGING_PENALTY * hanging);

  const domains = [
    { key: "opening", score: score(ph.opening), note: ph.opening.length >= MIN_MOVES
      ? `${developed}/4 pièces mineures sorties · ${castledAt ? "roque au coup " + castledAt : "pas de roque"}`
      : "Pas assez de coups d'ouverture" },
    { key: "middlegame", score: score(ph.middlegame), note: ph.middlegame.length >= MIN_MOVES
      ? `${missedTactics} ${missedTactics > 1 ? "occasions tactiques manquées" : "occasion tactique manquée"} · ${plural(st.trades, "échange")}`
      : "Trop peu de coups de milieu de jeu pour noter" },
    { key: "endgame", score: score(ph.endgame), note: ph.endgame.length >= MIN_MOVES
      ? `roi actif ${kingSteps} fois · ${plural(passedPushes, "poussée")} de pion avancé`
      : ph.endgame.length ? "Trop peu de coups de finale pour noter" : "Pas de finale dans cette partie" },
    { key: "pieces", score: score(pieceMoves), note: ranked.length >= 2
      ? `Meilleure : ${PIECE_FR[ranked[0][0]]} (${Math.round(ranked[0][1].acc)}) · à soigner : ${PIECE_FR[ranked.at(-1)[0]]} (${Math.round(ranked.at(-1)[1].acc)})`
      : Object.entries(pieceAcc).map(([t, v]) => `${PIECE_FR[t]} ${Math.round(v.acc)} (${v.n})`).join(" · ") || "Aucun coup de pièce" },
    { key: "defense", score: defScore, note: def.length
      ? `${plural(def.length, "coup")} sous pression · ${plural(hanging, "pièce")} en prise`
      : hanging ? `${plural(hanging, "pièce")} laissée${hanging > 1 ? "s" : ""} en prise` : "Jamais vraiment sous pression" },
    { key: "attack", score: score(att), note: att.length < MIN_MOVES && !st.checks && !st.captures ? "Jamais vraiment en position d'attaquer" : `${plural(st.checks, "échec")} · ${plural(st.captures, "prise")}${st.sacs ? " · " + plural(st.sacs, "sacrifice") : ""}${errors.conversion ? " · " + plural(errors.conversion, "gain") + " manqué" + (errors.conversion > 1 ? "s" : "") : ""}` },
  ].map((d) => ({ ...d, label: DOMAIN_FR[d.key] }));

  return {
    side, acc: avg(all), domains, pieces: pieceAcc, errors, style: st, opening, tactics: tac, bookExit,
    flags: { lateCastle: !castledAt || castledAt > 12, slowDev: developed < 3 },
  };
}

/** What is kept of a game across sessions (small: about 400 bytes). */
export function gameRecord(sheet, sans) {
  return {
    moves: sans.join(" "), date: Date.now(), side: sheet.side, acc: sheet.acc, opening: sheet.opening,
    domains: Object.fromEntries(sheet.domains.map((d) => [d.key, d.score])),
    pieces: sheet.pieces, errors: sheet.errors, style: sheet.style, flags: sheet.flags, plies: sans.length,
    tactics: sheet.tactics, bookExit: sheet.bookExit,
  };
}

/** Insert or update `rec` in `records` (same game = one move list is a prefix of the other). */
export function upsertRecord(records, rec, max = 60) {
  const out = records.filter((r) => !(r.side === rec.side && (r.moves.startsWith(rec.moves) || rec.moves.startsWith(r.moves))));
  const old = records.find((r) => !out.includes(r));
  if (old && old.moves.length > rec.moves.length) return records; // we are looking at an earlier point of a stored game
  out.push(old ? { ...rec, date: old.date } : rec);
  return out.slice(-max);
}

const STYLES = {
  Agressif: "Vous cherchez le contact : échecs, pièces avancées, sacrifices.",
  Tactique: "Vous trouvez souvent le coup unique dans les positions tendues.",
  Positionnel: "Vous jouez des coups calmes et précis, en améliorant vos pièces.",
  Défensif: "Vous êtes plus à l'aise pour tenir une position que pour l'attaquer.",
  Équilibré: "Aucun penchant marqué : vous adaptez votre jeu à la position.",
};

const OBJECTIVES = {
  opening: ["Ouverture", "Sortez vos quatre pièces mineures et roquez avant le 10ᵉ coup, dans chaque partie de la séance."],
  middlegame: ["Milieu de jeu", "Avant chaque coup, listez les échecs, les prises et les menaces des deux camps."],
  endgame: ["Finale", "Rejouez trois finales de tours ou de pions contre le moteur en activant votre roi dès l'échange des dames."],
  pieces: ["Coordination", "À chaque coup calme, identifiez votre pièce la moins active et donnez-lui une meilleure case."],
  defense: ["Défense", "Après chaque coup adverse, nommez sa menace avant de chercher votre propre plan."],
  attack: ["Attaque", "Quand vous êtes mieux, cherchez d'abord les coups forçants puis amenez une pièce de plus vers le roi."],
  hanging: ["Vigilance", "Avant de lâcher une pièce, vérifiez qui attaque et qui défend sa case d'arrivée."],
  tactic: ["Tactique", "Faites 15 minutes de problèmes tactiques (fourchettes, clouages) avant de jouer."],
  mate: ["Motifs de mat", "Révisez dix motifs de mat (couloir, étouffé, dame + fou) et cherchez les échecs à chaque coup."],
  conversion: ["Conversion", "Quand vous menez, simplifiez : échangez les pièces et éliminez le contre-jeu avant d'attaquer."],
  "queen-early": ["Dame", "Ne sortez pas la dame avant d'avoir développé deux pièces mineures."],
  lateCastle: ["Sécurité du roi", "Roquez avant le 10ᵉ coup dans toutes vos parties de la séance."],
  slowDev: ["Développement", "Au 10ᵉ coup, comptez vos pièces mineures sorties : visez 4 sur 4."],
};

/** Aggregate the stored games into the profile shown in the "Profil" tab. */
export function buildProfile(records) {
  if (!records.length) return null;
  const n = records.length;

  // domains: average of each game's score
  const dom = {};
  for (const [k] of DOMAINS) {
    const v = records.map((r) => r.domains[k]).filter((x) => x !== null && x !== undefined);
    dom[k] = { score: avg(v), games: v.length };
  }

  // style, from per-move rates over every stored game
  const s = { moves: 0, checks: 0, captures: 0, sacs: 0, forward: 0, quiet: 0, great: 0 };
  for (const r of records) for (const k in s) s[k] += r.style[k] || 0;
  const accAll = avg(records.map((r) => r.acc));
  const mv = Math.max(1, s.moves);
  const scores = {
    Agressif: (s.checks + s.forward + 2 * s.sacs) / mv / 0.3,
    Tactique: (s.great + s.sacs) / mv / 0.06,
    Positionnel: (s.quiet / mv / 0.8) * ((accAll || 0) / 85),
    Défensif: dom.defense.score !== null && dom.attack.score !== null && s.forward / mv < 0.12
      ? (dom.defense.score - dom.attack.score + 10) / 15 : 0,
  };
  const order = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const style = order[0][1] < 1 || order[0][1] - order[1][1] < 0.1 ? "Équilibré" : order[0][0];
  // a style read off fewer games than this is shown as provisional
  const STYLE_GAMES = 5;

  const scored = DOMAINS.filter(([k]) => dom[k].score !== null).map(([k, label]) => ({ k, label, score: dom[k].score }));
  const strengths = scored.filter((d) => d.score >= 80).sort((a, b) => b.score - a.score).slice(0, 2);
  if (!strengths.length && scored.length) strengths.push([...scored].sort((a, b) => b.score - a.score)[0]);

  const habits = [];
  const lateCastle = records.filter((r) => r.flags && r.flags.lateCastle).length;
  const slowDev = records.filter((r) => r.flags && r.flags.slowDev).length;
  const queenEarly = records.filter((r) => r.errors["queen-early"]).length;
  const hangingGames = records.filter((r) => r.errors.hanging).length;
  const freq = (k) => k >= 2 || (n <= 2 && k >= 1);
  if (freq(lateCastle)) habits.push({ k: "lateCastle", text: `Roque tardif ou absent (${lateCastle}/${n} partie${n > 1 ? "s" : ""})` });
  if (freq(slowDev)) habits.push({ k: "slowDev", text: `Développement lent (${slowDev}/${n} partie${n > 1 ? "s" : ""})` });
  if (freq(queenEarly)) habits.push({ k: "queen-early", text: `Dame sortie trop tôt (${queenEarly}/${n} partie${n > 1 ? "s" : ""})` });
  if (freq(hangingGames)) habits.push({ k: "hanging", text: `Pièces laissées en prise (${hangingGames}/${n} partie${n > 1 ? "s" : ""})` });

  const pc = {};
  for (const r of records) for (const [t, v] of Object.entries(r.pieces || {})) {
    pc[t] = pc[t] || { n: 0, sum: 0 };
    pc[t].n += v.n; pc[t].sum += v.acc * v.n;
  }
  const weakPieces = Object.entries(pc).filter(([, v]) => v.n >= 3)
    .map(([t, v]) => ({ t, n: v.n, acc: v.sum / v.n })).sort((a, b) => a.acc - b.acc).slice(0, 2);

  const fam = {};
  for (const r of records) if (r.opening) {
    const f = r.opening.split(":")[0];
    (fam[f] = fam[f] || []).push(r.acc);
  }
  const openings = Object.entries(fam).map(([name, a]) => ({ name, n: a.length, acc: avg(a) }))
    .sort((a, b) => b.acc - a.acc).slice(0, 2);

  const errs = {};
  for (const r of records) for (const [k, v] of Object.entries(r.errors)) errs[k] = (errs[k] || 0) + v;
  const errors = Object.entries(errs).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([k, c]) => ({ k, c, text: ERRORS_FR[k] || k }));

  const series = [...records].sort((a, b) => a.date - b.date).map((r) => r.acc).slice(-12);
  const half = Math.min(3, Math.floor(series.length / 2));
  const trend = half ? avg(series.slice(-half)) - avg(series.slice(-2 * half, -half)) : null;

  // three goals: weakest domains first, then the most frequent error and habit
  const cand = [];
  for (const d of [...scored].sort((a, b) => a.score - b.score)) if (d.score < 85) cand.push({ k: d.k, w: d.score });
  if (errors[0]) cand.push({ k: errors[0].k, w: 70 - errors[0].c });
  for (const h of habits) cand.push({ k: h.k, w: 72 });
  const goals = [];
  for (const c of cand.sort((a, b) => a.w - b.w)) {
    if (!OBJECTIVES[c.k] || goals.some((g) => g.k === c.k)) continue;
    goals.push({ k: c.k, title: OBJECTIVES[c.k][0], text: OBJECTIVES[c.k][1] });
    if (goals.length === 3) break;
  }
  for (const k of ["middlegame", "endgame", "pieces"]) if (goals.length < 3 && !goals.some((g) => g.k === k))
    goals.push({ k, title: OBJECTIVES[k][0], text: OBJECTIVES[k][1] });

  // measured, straight sums and averages over the stored games (older records may lack tactics)
  const tactics = {};
  for (const r of records) for (const [k, v] of Object.entries(r.tactics || {})) tactics[k] = (tactics[k] || 0) + v;
  const bySide = { w: avg(records.filter((r) => r.side === "w").map((r) => r.acc)), b: avg(records.filter((r) => r.side === "b").map((r) => r.acc)) };
  const sideGames = { w: records.filter((r) => r.side === "w").length, b: records.filter((r) => r.side === "b").length };
  const exits = records.map((r) => r.bookExit).filter((x) => x);
  const bookExit = avg(exits);

  return {
    tactics, bySide, sideGames, bookExit,
    games: n, acc: accAll, style, styleText: STYLES[style], styleMissing: Math.max(0, STYLE_GAMES - n), domains: dom, strengths, habits, weakPieces,
    openings, endgame: dom.endgame, errors, series, trend, goals,
  };
}

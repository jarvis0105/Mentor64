// Coach: turns a graded move into one short, human tip (French).
//
// Everything here is plain chess knowledge computed with chess.js on the two
// positions around the move; the engine only contributes the grade, the loss and the
// best line. Several tips can apply to one move; the highest-priority one that was not
// shown on the last few moves wins, so the same card does not come back move after move.
//
// coachTip(g, ctx) -> { id, cat, icon, title, text, how } | null
//   g    a grade from classify() (needs g.move, g.cat, g.loss, g.before, g.after, g.cpAfter)
//   ctx  { fens, sans, grades, ply, avoid?: Set<tip id> }
//   cat  the card's family (Vision tactique, Développement, ...), `how` says how to progress.

import { Chess } from "../lib/chess.js";
import { lineToCp, winPct } from "./classify.js";

export const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
export const START = { w: { b1: "n", g1: "n", c1: "b", f1: "b" }, b: { b8: "n", g8: "n", c8: "b", f8: "b" } };
export const PIECE_FR = { p: "pion", n: "cavalier", b: "fou", r: "tour", q: "dame", k: "roi" };

export const relRank = (sq, color) => (color === "w" ? +sq[1] : 9 - +sq[1]);

export function pieces(chess) {
  const out = [];
  for (const row of chess.board()) for (const p of row) if (p) out.push(p);
  return out;
}

function pawnsOnFile(chess, file) {
  const n = { w: 0, b: 0 };
  for (const p of pieces(chess)) if (p.type === "p" && p.square[0] === file) n[p.color]++;
  return n;
}

function material(chess, color) {
  let s = 0;
  for (const p of pieces(chess)) if (p.color === color && p.type !== "p" && p.type !== "k") s += VAL[p.type];
  return s;
}

/** "opening" | "middlegame" | "endgame", from the material left and the move number. */
export function phaseOf(chess, ply) {
  const total = material(chess, "w") + material(chess, "b");
  if (total <= 26) return "endgame";
  return ply < 20 && total >= 50 ? "opening" : "middlegame";
}

/** The same position with `side` to move (and no en passant), or null if chess.js refuses it. */
export function withTurn(fen, side) {
  const parts = fen.split(" ");
  parts[1] = side;
  parts[3] = "-";
  try { return new Chess(parts.join(" ")); } catch { return null; }
}

export function isPassed(chess, sq, color) {
  const f = "abcdefgh".indexOf(sq[0]);
  const r = relRank(sq, color);
  for (const p of pieces(chess)) {
    if (p.type !== "p" || p.color === color) continue;
    const pf = "abcdefgh".indexOf(p.square[0]);
    if (Math.abs(pf - f) <= 1 && relRank(p.square, color) > r) return false;
  }
  return true;
}

/** Can no enemy pawn ever attack `sq`? (no enemy pawn on a neighbouring file still "above" it) */
export function pawnProof(chess, sq, color) {
  const f = "abcdefgh".indexOf(sq[0]);
  const r = relRank(sq, color);
  for (const p of pieces(chess)) {
    if (p.type !== "p" || p.color === color) continue;
    const pf = "abcdefgh".indexOf(p.square[0]);
    if (Math.abs(pf - f) === 1 && relRank(p.square, color) > r) return false;
  }
  return true;
}

/** Valuable enemy pieces the piece on `sq` attacks (side to move flipped to the mover). */
export function forkTargets(fenAfter, sq, side) {
  const c = withTurn(fenAfter, side);
  if (!c) return [];
  const opp = side === "w" ? "b" : "w";
  const moved = c.get(sq);
  if (!moved) return [];
  const out = [];
  for (const mv of c.moves({ square: sq, verbose: true })) {
    if (!mv.captured || mv.captured === "k" || mv.captured === "p") continue;
    const undefended = c.attackers(mv.to, opp).length === 0;
    if (undefended || VAL[mv.captured] > VAL[moved.type]) out.push(mv.captured);
  }
  return out;
}

const DIRS = { b: [[1, 1], [1, -1], [-1, 1], [-1, -1]], r: [[1, 0], [-1, 0], [0, 1], [0, -1]] };

/** Enemy pieces the bishop, rook or queen on `sq` pins: to the king, or to a more valuable piece behind. */
export function pinsBy(chess, sq) {
  const p = chess.get(sq);
  if (!p || !"brq".includes(p.type)) return [];
  const out = [];
  for (const [df, dr] of p.type === "q" ? [...DIRS.b, ...DIRS.r] : DIRS[p.type]) {
    let f = sq.charCodeAt(0) - 97 + df, r = +sq[1] + dr, first = null;
    while (f >= 0 && f < 8 && r >= 1 && r <= 8) {
      const q = chess.get(String.fromCharCode(97 + f) + r);
      if (q) {
        if (q.color === p.color) break;
        if (!first) { if (q.type === "k") break; first = q; }
        else { if (q.type === "k" || VAL[q.type] > VAL[first.type]) out.push(first.type); break; }
      }
      f += df; r += dr;
    }
  }
  return out;
}

/** Does `move` (already played, giving `fenAfter`) fork or pin? */
export function tacticsOf(fenAfter, move) {
  let pin = false;
  try { pin = pinsBy(new Chess(fenAfter), move.to).length > 0; } catch { /* keep false */ }
  const fork = move.piece !== "k" && forkTargets(fenAfter, move.to, move.color).length + (move.san.endsWith("+") ? 1 : 0) >= 2;
  return { fork, pin };
}

/** The engine's preferred move in the position before `g`, with the position it leads to. */
export function bestMoveOf(g, fenBefore) {
  const uci = g.before && g.before.lines && g.before.lines[0] && g.before.lines[0].pv[0];
  if (!uci || g.isEngineBest) return null;
  try {
    const c = new Chess(fenBefore);
    const move = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    return { move, fen: c.fen() };
  } catch { return null; }
}

/** The mover's least mobile piece (knight, bishop, rook or queen) in `fen`, with its move count. */
function worstPiece(fen, side) {
  const c = withTurn(fen, side);
  if (!c) return null;
  let worst = null;
  for (const p of pieces(c)) {
    if (p.color !== side || p.type === "p" || p.type === "k") continue;
    const n = c.moves({ square: p.square }).length;
    if (!worst || n < worst.n) worst = { ...p, n };
  }
  return worst;
}

const ARTICLE = { p: "le pion", n: "le cavalier", b: "le fou", r: "la tour", q: "la dame", k: "le roi" };
const listFr = (types) => {
  const names = [...new Set(types)].map((t) => ARTICLE[t]);
  return names.length > 1 ? names.slice(0, -1).join(", ") + " et " + names.at(-1) : names[0];
};

const GENERIC = {
  opening: [
    ["dev", "Contrôlez le centre", "Les cases e4, d4, e5 et d5 sont encore disputées.", "Avant chaque coup d'ouverture, demandez-vous s'il agit sur le centre ou développe une pièce."],
    ["dev", "Pensez au roque", "Votre roi est encore au centre.", "Visez le roque dans les dix premiers coups : un roi à l'abri, une tour en jeu."],
  ],
  middlegame: [
    ["plan", "Fixez-vous un plan", "La position est calme : c'est le moment de choisir une cible.", "Repérez la faiblesse adverse (pion isolé, case trouée, roi exposé) et regroupez vos pièces vers elle."],
    ["def", "Quelle est la menace ?", "Votre adversaire vient de jouer : son coup a forcément une idée.", "Avant de chercher votre plan, nommez à voix basse ce que son dernier coup menace."],
  ],
  endgame: [
    ["tech", "Activez votre roi", "En finale, le roi n'est plus en danger.", "Amenez-le vers le centre ou vers les pions : il vaut alors presque une pièce."],
    ["tech", "Comptez les temps", "Dans les finales de pions, un seul tempo décide souvent du résultat.", "Comptez les coups nécessaires à chaque camp pour promouvoir avant de pousser."],
  ],
};

export const TIP_CATS = {
  tactic: "Vision tactique", dev: "Développement", strat: "Stratégie", def: "Défense",
  plan: "Planification", time: "Gestion du temps", tech: "Technique de finale", attack: "Attaque", praise: "Bien joué",
};

/**
 * A plain explanation of what the move does, for the moves no specific card covers:
 * the coach then has something to say about almost every move, for both sides.
 */
const CENTRE = new Set(["d4", "e4", "d5", "e5"]);

/** What a move does, in a few words: "prend la dame en d5", "donne échec", "développe le cavalier"… */
function whatItDoes(mv, side) {
  if (!mv) return "";
  const parts = [];
  if (mv.flags.includes("k") || mv.flags.includes("q")) parts.push("met le roi à l'abri par le roque");
  else if (mv.captured) parts.push(`prend ${ARTICLE[mv.captured]} en ${mv.to}`);
  else if (START[side][mv.from] === mv.piece) parts.push(`développe ${ARTICLE[mv.piece]}`);
  else if (CENTRE.has(mv.to)) parts.push("prend le centre");
  if (mv.san.includes("#")) parts.push("fait mat");
  else if (mv.san.includes("+")) parts.push("donne échec");
  return parts.join(" et ") || `amène ${ARTICLE[mv.piece]} en ${mv.to}`;
}

/** Pieces of `side` (not pawns, not the king) attacked and either undefended or attacked by something cheaper. */
function hanging(chess, side) {
  const opp = side === "w" ? "b" : "w";
  const out = new Set();
  for (const row of chess.board()) for (const p of row) {
    if (!p || p.color !== side || p.type === "p" || p.type === "k") continue;
    const att = chess.attackers(p.square, opp);
    if (!att.length) continue;
    const cheapest = Math.min(...att.map((sq) => VAL[chess.get(sq).type] || 0));
    if (!chess.attackers(p.square, side).length || cheapest < VAL[p.type]) out.add(p.square);
  }
  return out;
}

/**
 * Why the move is good or bad, from concrete facts on the board: what the best answer to it
 * wins, what it left hanging, what threat it parried or created, what the better move did.
 */
function whyMove(g, ctx, bestMv) {
  const m = g.move, side = m.color, ply = ctx.ply;
  const bad = ["inaccuracy", "mistake", "miss", "blunder"].includes(g.cat) || (g.loss || 0) >= 3;
  let reply = null;
  const uci = g.after && g.after.lines && g.after.lines[0] && g.after.lines[0].pv[0];
  if (uci) try { reply = new Chess(ctx.fens[ply + 1]).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }); } catch { /* none */ }
  let before = null, after = null;
  try { before = new Chess(ctx.fens[ply]); after = new Chess(ctx.fens[ply + 1]); } catch { /* none */ }

  if (bad) {
    let reason = "";
    if (reply && reply.captured && reply.captured !== "p")
      reason = `il laisse ${ARTICLE[reply.captured]} en ${reply.to} sans protection : ${reply.san} le prend`;
    else if (reply && reply.san.includes("#")) reason = `il permet ${reply.san}, qui fait mat`;
    else if (reply && reply.san.includes("+")) reason = `il expose votre roi : ${reply.san} donne échec`;
    else if (reply && reply.captured) reason = `il perd un pion : ${reply.san}`;
    else if (reply && after) {
      // the answer creates threats: pieces of ours that become hanging after it
      try {
        const c = new Chess(ctx.fens[ply + 1]);
        c.move(reply.san);
        const was = hanging(after, side);
        const hit = [...hanging(c, side)].filter((sq) => !was.has(sq)).map((sq) => c.get(sq).type);
        if (hit.length) reason = `il permet ${reply.san}, qui attaque ${listFr(hit)}${hit.length > 1 ? " en même temps" : ""}`;
      } catch { /* none */ }
    }
    const cost = ` (−${(g.loss || 0).toFixed(1)} % de chances de gain)`;
    const better = bestMv ? ` ${bestMv.san} était plus fort, car il ${whatItDoes(bestMv, side)}.` : "";
    return (reason ? `Mauvais coup, car ${reason}${cost}.` : `Coup imprécis${cost}.`) + better;
  }

  const out = [];
  if (m.captured) {
    const safe = !after || !after.attackers(m.to, side === "w" ? "b" : "w").length;
    out.push(`il prend ${ARTICLE[m.captured]}${safe ? " sans risque de reprise" : ""}`);
  }
  if (before && after) {
    // a piece that was in danger is now safe
    const was = hanging(before, side), now = hanging(after, side);
    const saved = [...was].filter((sq) => !now.has(sq) && sq !== m.from);
    if (was.has(m.from) && !now.has(m.to)) out.push(`il met ${ARTICLE[m.piece]} à l'abri`);
    else if (saved.length) out.push(`il protège ${ARTICLE[before.get(saved[0]).type]} en ${saved[0]}, qui était menacé`);
    // a new threat on an enemy piece
    const opp = side === "w" ? "b" : "w";
    const threat = [...hanging(after, opp)].filter((sq) => !hanging(before, opp).has(sq));
    if (threat.length) out.push(`il menace ${ARTICLE[after.get(threat[0]).type]} en ${threat[0]}`);
  }
  if (m.san.includes("#")) out.push("il fait mat");
  else if (m.san.includes("+")) out.push("il donne échec et force la réponse");
  if (m.flags.includes("k") || m.flags.includes("q")) out.push("il met le roi à l'abri et active la tour");
  else if (START[side][m.from] === m.piece && !m.captured) out.push(`il développe ${ARTICLE[m.piece]} vers le centre`);
  else if (CENTRE.has(m.to) && !m.captured) out.push("il occupe le centre");
  if (!out.length) out.push("il garde l'équilibre sans créer de faiblesse");
  const best = g.isEngineBest || g.cat === "best" || g.cat === "great" || g.cat === "brilliant";
  return (best ? "Excellent coup, car " : "Bon coup, car ") + out.join(", ") + ".";
}
function explainMove(g, ctx, bestMv) {
  const m = g.move, side = m.color, ply = ctx.ply;
  const who = side === "w" ? "Les Blancs" : "Les Noirs";
  const P = PIECE_FR[m.piece];
  const bits = [];
  if (m.flags.includes("k") || m.flags.includes("q")) {
    bits.push(`${who} roquent côté ${m.flags.includes("k") ? "roi" : "dame"} : le roi se met à l'abri et la tour rejoint le jeu`);
  } else if (m.captured) {
    bits.push(`${who} prennent ${ARTICLE[m.captured]} en ${m.to} avec ${ARTICLE[m.piece]}`);
  } else if (START[side][m.from] === m.piece) {
    bits.push(`${who} développent ${ARTICLE[m.piece]} de ${m.from} vers ${m.to}`);
  } else if (m.piece === "p") {
    bits.push(`${who} avancent le pion ${m.from[0]} jusqu'en ${m.to}${m.promotion ? ` et le promeuvent en ${PIECE_FR[m.promotion]}` : ""}`);
  } else {
    bits.push(`${who} jouent ${ARTICLE[m.piece]} de ${m.from} en ${m.to}`);
  }
  if (CENTRE.has(m.to)) bits.push("ce qui occupe le centre");
  if (m.san.includes("#")) bits.push("et c'est mat");
  else if (m.san.includes("+")) bits.push("avec échec");
  // what the piece now hits (pieces only, the king is the check above)
  let hits = [];
  try {
    const c = withTurn(ctx.fens[ply + 1], side);
    if (c) hits = c.moves({ square: m.to, verbose: true }).filter((x) => x.captured && x.captured !== "p" && x.captured !== "k").map((x) => x.captured);
  } catch { /* none */ }
  let text = bits.join(", ") + ".";
  if (hits.length) text += ` ${P[0].toUpperCase() + P.slice(1)} en ${m.to} attaque maintenant ${listFr(hits)}.`;

  // why it is good or bad, then the expected answer
  const how = [whyMove(g, ctx, bestMv)];
  const reply = g.after && g.after.lines && g.after.lines[0] && g.after.lines[0].pv[0];
  if (reply) {
    try {
      const r = new Chess(ctx.fens[ply + 1]).move({ from: reply.slice(0, 2), to: reply.slice(2, 4), promotion: reply[4] });
      how.push(`Réponse attendue : ${r.san}${r.captured ? `, qui prend ${ARTICLE[r.captured]}` : ""}.`);
    } catch { /* keep */ }
  }
  const bad = ["inaccuracy", "mistake", "miss", "blunder"].includes(g.cat);
  return { id: "explain-" + ply, cat: bad ? "plan" : g.cat === "book" ? "dev" : "praise", icon: "🔎",
    title: "Ce que fait " + m.san, text, how: how.join(" "), howLabel: "Pourquoi : " };
}

export function coachTip(g, ctx) {
  if (!g || !g.move || g.cat === "none" || g.cat === "mate" || g.cat === "forced") return null;
  const { fens, sans, grades, ply } = ctx;
  const avoid = ctx.avoid || new Set();
  const m = g.move;
  const side = m.color;
  const opp = side === "w" ? "b" : "w";
  const fenBefore = fens[ply];
  const fenAfter = fens[ply + 1];
  if (!fenBefore || !fenAfter) return null;

  let before, after;
  try { before = new Chess(fenBefore); after = new Chess(fenAfter); } catch { return null; }

  const loss = g.loss || 0;
  const bad = g.cat === "inaccuracy" || g.cat === "mistake" || g.cat === "miss" || g.cat === "blunder";
  const phase = phaseOf(after, ply);
  const opening = phase === "opening";
  const endgame = phase === "endgame";
  const P = PIECE_FR[m.piece];

  const tips = [];
  const add = (id, p, cat, icon, title, text, how) => tips.push({ id, p, cat, icon, title, text, how });

  // best move according to the engine, in SAN, for the "you missed" tips
  let bestMv = null, fenBest = null;
  const bestUci = g.before && g.before.lines && g.before.lines[0] && g.before.lines[0].pv[0];
  if (bestUci && !g.isEngineBest) {
    try {
      const c = new Chess(fenBefore);
      bestMv = c.move({ from: bestUci.slice(0, 2), to: bestUci.slice(2, 4), promotion: bestUci[4] });
      fenBest = c.fen();
    } catch { bestMv = null; }
  }
  // how much the best move was ahead of the second: a big gap means one move held everything
  const lines = (g.before && g.before.lines) || [];
  const critical = lines[0] && lines[1] ? winPct(lineToCp(lines[0])) - winPct(lineToCp(lines[1])) : 0;

  // --- praise & positional ideas ----------------------------------------------------------
  if (g.cat === "brilliant") add("brilliant", 100, "attack", "💎", "Sacrifice brillant",
    `Votre ${P} en ${m.to} se donne pour une compensation décisive.`,
    "Gardez ce réflexe : quand le roi adverse est exposé, comptez les pièces qui attaquent plutôt que le matériel.");
  if (g.cat === "great") add("great", 85, "tactic", "🎯", "Le seul bon coup",
    `${m.san} était presque le seul coup qui tenait la position.`,
    "Dans les positions tendues, listez tous les coups forcés (échecs, prises, menaces) avant de choisir.");

  if (!bad) {
    if (m.piece === "r" && m.from[0] !== m.to[0]) {
      const own = pawnsOnFile(after, m.to[0])[side];
      const enemy = pawnsOnFile(after, m.to[0])[opp];
      if (own === 0 && enemy === 0) add("rook-open", 80, "strat", "🏰", "Tour sur colonne ouverte",
        `Votre tour contrôle toute la colonne ${m.to[0]}.`,
        "Prochaine étape : doublez les tours ou visez la 7ᵉ rangée pour pénétrer.");
      else if (own === 0) add("rook-semi", 72, "strat", "🏰", "Colonne semi-ouverte",
        `Votre tour met la pression sur le pion adverse de la colonne ${m.to[0]}.`,
        "Ajoutez une deuxième pièce sur ce pion : un pion attaqué deux fois devient une cible.");
    }
    if (m.piece === "r" && relRank(m.to, side) === 7) add("rook-7th", 68, "attack", "⚡", "Tour en 7ᵉ rangée",
      `Depuis ${m.to}, votre tour attaque les pions de base et enferme le roi.`,
      "Une deuxième tour sur la même rangée crée souvent des menaces de mat.");
    if (m.flags.includes("k") || m.flags.includes("q")) add("castle", 75, "dev", "🛡️", "Roque",
      `Roi à l'abri en ${m.to} et tour en jeu en un seul coup.`,
      "Maintenant, reliez vos tours : sortez la dernière pièce mineure et la dame.");
    if (opening && (m.piece === "n" || m.piece === "b") && START[side][m.from] === m.piece)
      add("develop", 30, "dev", "♞", "Développement",
        `Votre ${P} quitte ${m.from} pour ${m.to}.`,
        "Comptez vos pièces sorties face à celles de l'adversaire : l'avance de développement se transforme en initiative.");
    if (opening && m.piece === "p" && ["d4", "e4", "d5", "e5"].includes(m.to) && !m.captured)
      add("center", 32, "dev", "🎯", "Pion au centre",
        `Le pion ${m.to} contrôle des cases clés et libère vos pièces.`,
        "Soutenez-le avec un cavalier ou un deuxième pion avant qu'il ne soit attaqué.");
    if (m.piece === "b" && ["g2", "b2", "g7", "b7"].includes(m.to) && ply < 40) {
      const pawnSq = { g2: "g3", b2: "b3", g7: "g6", b7: "b6" }[m.to];
      const pp = after.get(pawnSq);
      if (pp && pp.type === "p" && pp.color === side) add("fianchetto", 38, "strat", "📐", "Fianchetto",
        `Votre fou en ${m.to} règne sur la grande diagonale.`,
        "Évitez désormais d'échanger ce fou : sans lui, les cases autour du roque s'affaiblissent.");
    }
    if (m.piece === "n" && relRank(m.to, side) >= 5 && relRank(m.to, side) <= 7) {
      const supported = after.attackers(m.to, side).some((sq) => after.get(sq).type === "p");
      if (supported && pawnProof(after, m.to, side)) add("outpost", 70, "strat", "📍", "Avant-poste",
        `Votre cavalier en ${m.to} est soutenu par un pion et aucun pion adverse ne pourra le chasser.`,
        "Cherchez ces cases trouées dès le milieu de jeu : un cavalier installé vaut souvent une tour.");
    }
    if (m.piece === "p" && relRank(m.to, side) >= 5 && isPassed(after, m.to, side))
      add("passed", 66, "tech", "🚀", "Pion passé",
        `Plus aucun pion adverse ne peut arrêter le pion ${m.to}.`,
        "Placez une tour derrière lui et poussez-le : chaque case gagnée immobilise une pièce adverse.");
    if (endgame && m.piece === "k" && "cdef".includes(m.to[0]) && relRank(m.to, side) >= 3 && relRank(m.to, side) <= 6)
      add("king-active", 48, "tech", "👑", "Roi actif",
        `Votre roi monte en ${m.to} : en finale, c'est une pièce d'attaque.`,
        "Visez les pions adverses ou soutenez vos pions passés avec lui.");
    if (m.captured && m.piece !== "p" && VAL[m.captured] === VAL[m.piece] && (g.cpAfter || 0) >= 200)
      add("trade-ahead", 58, "strat", "🔁", "Échanger quand on mène",
        `Avec l'avantage, l'échange en ${m.to} réduit le contre-jeu adverse.`,
        "Échangez les pièces, pas les pions : chaque pion restant augmente vos chances de gagner la finale.");
    if (m.piece === "p" && m.captured && pawnsOnFile(after, m.to[0])[side] >= 2)
      add("doubled", 42, "strat", "🧱", "Pions doublés",
        `Vous doublez vos pions sur la colonne ${m.to[0]}.`,
        "Compensez en utilisant la colonne semi-ouverte qui s'ouvre à côté pour vos tours.");
    if (m.captured === "b") {
      const bishops = (c) => pieces(after).filter((p) => p.color === c && p.type === "b").length;
      if (bishops(side) >= 2 && bishops(opp) <= 1) add("bishop-pair", 40, "strat", "⛪", "Paire de fous",
        "Vous gardez vos deux fous contre un seul.",
        "Ouvrez la position (échanges de pions) : la paire de fous s'y montre décisive.");
    }
    if (m.piece === "p" && ply < 40) {
      const kingSq = pieces(after).find((p) => p.type === "k" && p.color === side).square;
      const luft = side === "w" ? ["h3", "g3"] : ["h6", "g6"];
      if (luft.includes(m.to) && ["g1", "h1", "g8", "h8"].includes(kingSq))
        add("luft", 34, "def", "🪟", "Case de fuite",
          `Le pion ${m.to} donne de l'air à votre roi en ${kingSq}.`,
          "Prévoyez cette case avant que les tours adverses arrivent sur votre première rangée.");
    }
    if (["best", "great", "brilliant", "excellent"].includes(g.cat) && m.piece !== "p") {
      const t = forkTargets(fenAfter, m.to, side);
      const royal = m.san.endsWith("+");
      if (t.length + (royal ? 1 : 0) >= 2)
        add("fork", 88, "tactic", "🍴", royal ? "Fourchette avec échec" : "Fourchette",
          `Votre ${P} en ${m.to} attaque ${royal ? "le roi et " : ""}${listFr(t)} à la fois.`,
          "Continuez à chercher les cases d'où une pièce touche deux cibles non protégées.");
    }
    if (["best", "great", "brilliant", "excellent"].includes(g.cat)) {
      const pinned = pinsBy(after, m.to);
      if (pinned.length) add("pin", 78, "tactic", "📌", "Clouage",
        `Votre ${P} en ${m.to} cloue ${listFr(pinned)} adverse${pinned.length > 1 ? "s" : ""}.`,
        "Une pièce clouée ne défend plus rien : attaquez-la une deuxième fois, un pion suffit souvent.");
    }
    // a quiet moment: point at the piece doing least
    if (phase === "middlegame" && !m.captured && !m.san.includes("+") && (g.cat === "good" || g.cat === "excellent")) {
      const w = worstPiece(fenAfter, side);
      if (w && w.n <= 2 && w.square !== m.to) add("worst-piece", 46, "strat", "🧭", "Améliorez votre pire pièce",
        `Votre ${PIECE_FR[w.type]} en ${w.square} n'a que ${w.n} case${w.n > 1 ? "s" : ""} disponible${w.n > 1 ? "s" : ""}.`,
        "Quand rien ne presse, cherchez un trajet en deux ou trois coups qui l'amène sur une case active.");
    }
    // a simple recapture: nothing to calculate
    if (m.captured && ply > 0 && critical < 5 && (g.cat === "best" || g.cat === "excellent")) {
      let prev = null;
      try { prev = new Chess(fens[ply - 1]).move(sans[ply - 1]); } catch { /* ignore */ }
      if (prev && prev.captured && prev.to === m.to) add("time-simple", 18, "time", "⏱️", "Reprise naturelle",
        `La reprise en ${m.to} s'imposait.`,
        "Jouez ces coups évidents rapidement et gardez votre temps pour les positions où un seul coup tient.");
    }
  }

  // --- development that never happened ------------------------------------------------------
  if (ply >= 16 && ply < 44 && !endgame) {
    const idle = Object.entries(START[side]).find(([sq, t]) => {
      const p = after.get(sq);
      return p && p.type === t && p.color === side;
    });
    if (idle) add("idle-minor", bad ? 38 : 44, "dev", "💤", "Pièce endormie",
      `Votre ${PIECE_FR[idle[1]]} n'a pas quitté ${idle[0]} depuis le début de la partie.`,
      "Avant d'attaquer, faites participer chaque pièce : une pièce restée chez elle, c'est jouer à une de moins.");
  }

  // --- theory exit ------------------------------------------------------------------------
  if (g.cat !== "book" && ply >= 2 && ply < 30 && grades[ply - 2] && grades[ply - 2].cat === "book")
    add("book-exit", 62, "plan", "📖", "Fin de la théorie",
      `Avec ${m.san}, vous quittez les lignes connues.`,
      "Appuyez-vous sur les principes : centre, développement, sécurité du roi. Puis notez la ligne pour l'apprendre.");

  // --- the f7 / f2 weakness ---------------------------------------------------------------
  if (ply < 24) {
    const fSq = side === "w" ? "f2" : "f7";
    const kSq = side === "w" ? "e1" : "e8";
    const fp = after.get(fSq), kp = after.get(kSq);
    if (fp && fp.type === "p" && fp.color === side && kp && kp.type === "k" && kp.color === side) {
      const hits = after.attackers(fSq, opp).length;
      const guards = after.attackers(fSq, side).filter((sq) => sq !== kSq).length;
      if (hits >= 2 && guards === 0) add("weak-f7", 78, "def", "🎯", `Attention à ${fSq}`,
        `${hits} pièces adverses visent ${fSq}, que seul votre roi défend.`,
        "Roquez au plus vite ou couvrez la case avec une pièce (cavalier, dame) avant toute autre idée.");
    }
  }

  // --- habits worth correcting ------------------------------------------------------------
  if (opening && ply < 14 && m.piece === "q" && !m.captured && loss >= 1.5)
    add("queen-early", 60, "dev", "👸", "Dame sortie trop tôt",
      `Votre dame en ${m.to} va servir de cible et faire gagner des temps à l'adversaire.`,
      "Sortez d'abord cavaliers et fous ; la dame entre en jeu une fois le roque fait.");
  if (opening && ply >= 2 && m.piece !== "p" && !m.captured && loss >= 1) {
    try {
      const prev = new Chess(fens[ply - 2]).move(sans[ply - 2]);
      if (prev && prev.piece === m.piece && prev.to === m.from && !prev.captured)
        add("twice", 52, "dev", "🔄", "Même pièce deux fois",
          `Votre ${P} rejoue alors que d'autres pièces attendent encore.`,
          "En ouverture, un coup = une nouvelle pièce développée, sauf menace concrète.");
    } catch { /* ignore */ }
  }
  if (m.piece === "n" && (m.to[0] === "a" || m.to[0] === "h") && loss >= 1)
    add("rim", 50, "strat", "🚧", "Cavalier au bord",
      `En ${m.to}, votre cavalier ne contrôle que ${(withTurn(fenAfter, side) || after).moves({ square: m.to }).length} case(s).`,
      "Au centre il en contrôle jusqu'à huit : ramenez-le vers d4, e4, d5 ou e5 dès que possible.");

  if (bad && loss >= 8 && m.piece !== "p" && m.piece !== "k") {
    const attackers = after.attackers(m.to, opp);
    if (attackers.length) {
      const cheapest = Math.min(...attackers.map((sq) => VAL[after.get(sq).type]));
      const defended = after.attackers(m.to, side).length > 0;
      if (!defended || cheapest < VAL[m.piece])
        add("hanging", 95, "def", "⚠️", "Pièce en prise",
          `Votre ${P} en ${m.to} peut être capturé${m.piece === "q" || m.piece === "r" ? "e" : ""} sans compensation.`,
          "Avant de lâcher la pièce, vérifiez qui attaque la case d'arrivée et qui la défend.");
    }
  }
  // the opponent's best reply wins something other than the piece that just moved
  const reply = g.after && g.after.lines && g.after.lines[0] && g.after.lines[0].pv[0];
  if (bad && loss >= 8 && reply) {
    let rm = null, fenR = null;
    try { const c = new Chess(fenAfter); rm = c.move({ from: reply.slice(0, 2), to: reply.slice(2, 4), promotion: reply[4] }); fenR = c.fen(); } catch { /* ignore */ }
    const hit = rm && rm.piece !== "p" ? forkTargets(fenR, rm.to, opp) : [];
    if (hit.length + (rm && rm.san.endsWith("+") ? 1 : 0) >= 2)
      add("threat-fork", 86, "def", "🍴", "Fourchette adverse",
        `Après ${m.san}, ${rm.san} attaque ${rm.san.endsWith("+") ? "le roi et " : ""}${listFr(hit)} à la fois.`,
        "Avant chaque coup, repérez les cases de fourchette des cavaliers adverses (c2, c7, f2, f7 sont les classiques).");
    const target = after.get(reply.slice(2, 4));
    if (target && target.color === side && target.type !== "p" && reply.slice(2, 4) !== m.to) {
      let replySan = reply;
      try { replySan = new Chess(fenAfter).move({ from: reply.slice(0, 2), to: reply.slice(2, 4), promotion: reply[4] }).san; } catch { /* keep uci */ }
      add("threat", 82, "def", "🛡️", "Menace non parée",
        `Après ce coup, ${replySan} gagne votre ${PIECE_FR[target.type]} en ${reply.slice(2, 4)}.`,
        "Après chaque coup adverse, demandez-vous : « qu'est-ce qu'il menace maintenant ? »");
    }
  }
  if (bad && loss >= 5 && bestMv && bestMv.piece !== "p" && fenBest) {
    const t = forkTargets(fenBest, bestMv.to, side);
    const royal = bestMv.san.endsWith("+");
    if (t.length + (royal ? 1 : 0) >= 2)
      add("missed-fork", 92, "tactic", "🍴", "Fourchette manquée",
        `Avec ${bestMv.san}, votre ${PIECE_FR[bestMv.piece]} attaquait ${royal ? "le roi et " : ""}${listFr(t)} en même temps.`,
        "Entraînez-vous aux motifs de fourchette : cherchez les cases qui touchent deux pièces non protégées.");
  }
  if (bad && loss >= 5 && bestMv && fenBest) {
    let pinned = [];
    try { pinned = pinsBy(new Chess(fenBest), bestMv.to); } catch { /* none */ }
    if (pinned.length) add("missed-pin", 89, "tactic", "📌", "Clouage manqué",
      `Avec ${bestMv.san}, votre ${PIECE_FR[bestMv.piece]} clouait ${listFr(pinned)}.`,
      "Cherchez les pièces adverses alignées avec leur roi ou leur dame : un fou ou une tour peut les clouer.");
  }
  if (bad && loss >= 8 && bestMv && bestMv.captured && bestMv.captured !== "p") {
    let recapture = true;
    try { recapture = new Chess(fenBest).attackers(bestMv.to, opp).length > 0; } catch { /* keep */ }
    if (!recapture || VAL[bestMv.captured] > VAL[bestMv.piece])
      add("missed-capture", 90, "tactic", "👀", "Matériel à gagner",
        `${bestMv.san} gagnait ${PIECE_FR[bestMv.captured] === "dame" || PIECE_FR[bestMv.captured] === "tour" ? "la" : "le"} ${PIECE_FR[bestMv.captured]} en ${bestMv.to}.`,
        "À chaque coup, faites la liste des pièces adverses non protégées : c'est là que naissent les tactiques.");
  }
  const mate = lines[0] && lines[0].mate;
  if ((bad || g.cat === "good") && mate && mate > 0 && bestMv)
    add("missed-mate", 99, "tactic", "🏁", "Un mat était possible",
      `Il y avait un mat en ${mate} qui commençait par ${bestMv.san}.`,
      "Passez en revue tous les échecs avant de jouer : il suffit parfois d'un seul.");

  // a pawn break was the plan, a piece move was played
  if ((g.cat === "inaccuracy" || g.cat === "mistake") && bestMv && bestMv.piece === "p" && !bestMv.captured && m.piece !== "p" && !opening)
    add("pawn-break", 54, "plan", "♟️", "Préparez la poussée",
      `${bestMv.san} était plus fort : une poussée de pion qui gagne de l'espace avant d'attaquer.`,
      "Avant d'amener vos pièces à l'attaque, ouvrez des lignes avec un pion : elles auront ensuite des cibles.");

  // one move held everything and another one was played
  if (bad && critical >= 15 && bestMv)
    add("time-critical", 70, "time", "⏳", "Moment critique",
      `Ici, ${bestMv.san} était le seul coup qui gardait l'équilibre ; les autres perdaient tous.`,
      "Repérez ces moments (échecs, prises, pièces attaquées) et investissez-y votre temps de réflexion.");

  if (g.cat === "miss") add("miss", 45, "plan", "🪙", "Occasion manquée",
    "Vous aviez une position gagnante et elle vous échappe.",
    "Quand vous menez, cherchez le coup le plus simple et le plus sûr plutôt que le plus spectaculaire.");
  if (g.cat === "blunder") add("blunder", 40, "def", "🧯", "Réflexe anti-gaffe",
    `${m.san} coûte cher : la position bascule.`,
    "Avant de jouer, faites le tour : échecs, captures, menaces adverses. Dix secondes suffisent.");
  if (g.cat === "mistake" || g.cat === "inaccuracy") add("compare", 22, "plan", "⚖️", "Comparez vos candidats",
    bestMv ? `${bestMv.san} était plus précis que ${m.san}.` : `${m.san} laisse un peu de terrain.`,
    "Gardez deux ou trois coups candidats en tête et choisissez celui qui laisse le moins de failles.");

  // --- phase reminders, now and then ------------------------------------------------------
  if (!tips.length && ply % 3 === 0 && g.cat !== "book") {
    const list = GENERIC[phase];
    const [cat, title, text, how] = list[Math.floor(ply / 3) % list.length];
    add("generic-" + phase + "-" + title, 10, cat, "💡", title, text, how);
  }

  tips.sort((a, b) => b.p - a.p);
  // something important always speaks; otherwise prefer a card not seen on the last moves,
  // and when nothing specific applies, explain the move itself
  const pick = tips.find((t) => !avoid.has(t.id) || t.p >= 90) || explainMove(g, ctx, bestMv);
  const { id, cat, icon, title, text, how, howLabel } = pick;
  return { id, cat, label: TIP_CATS[cat], icon, title, text, how, howLabel,
    why: id.startsWith("explain-") ? null : whyMove(g, ctx, bestMv) };
}


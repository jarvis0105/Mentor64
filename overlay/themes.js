// Move themes: a French glossary of what a move can do, and a detector that tags each move
// with the themes it shows. Definitions are written for the panel, "vous" form like the coach.
import { Chess } from "../lib/chess.js";
import { VAL, START, relRank, pieces, withTurn, isPassed, pawnProof, forkTargets } from "./coach.js";

/** key -> [name, definition]. Order = the glossary order. */
export const THEMES = {
  book: ["Coup théorique", "Un coup déjà joué par des maîtres : il fait partie de la théorie d'ouverture connue."],
  dev: ["Développe une pièce", "Sort une pièce de sa case de départ vers une case plus active, d'où elle contrôle plus de cases."],
  centerPawn: ["Pion au centre", "Place un pion sur une case centrale (d4, e4, d5, e5)."],
  strikeCenter: ["Frappe au centre", "Un pion attaque un pion adverse installé au centre."],
  castles: ["Roque", "Coup spécial qui met le roi à l'abri et développe la tour en un seul temps."],
  connectsRooks: ["Relie les tours", "Plus aucune pièce entre vos deux tours sur la dernière rangée : elles se protègent."],
  completesDev: ["Développement terminé", "Cavaliers et fous sont sortis et le roi a roqué : l'objectif de l'ouverture est atteint."],
  fianchetto: ["Fianchetto", "Le fou se place sur la grande diagonale (b2, g2, b7 ou g7) d'où il vise le centre."],
  capture: ["Prise", "Une pièce en prend une autre en se posant sur sa case."],
  recapture: ["Reprise", "Reprend aussitôt la pièce qui vient de prendre l'une des vôtres."],
  winningCapture: ["Prise gagnante", "Une prise qui gagne du matériel : pièce gratuite ou échange favorable."],
  freePiece: ["Pièce gratuite", "Prend une pièce que l'adversaire ne pouvait pas reprendre."],
  equalTrade: ["Échange égal", "Échange une pièce contre une pièce adverse de même valeur."],
  retreat: ["Repli", "Ramène une pièce attaquée vers son camp pour la mettre à l'abri."],
  defends: ["Défend une pièce", "Protège une pièce qui était attaquée et sans défense."],
  blocks: ["Interpose une pièce", "Place une pièce entre l'attaquant et la pièce visée (souvent pour parer un échec)."],
  defendsMate: ["Pare le mat", "Empêche l'adversaire de faire mat au coup suivant."],
  kick: ["Chasse une pièce", "Un pion attaque une pièce adverse et la force à quitter une bonne case."],
  fork: ["Fourchette", "Une pièce en attaque deux (ou plus) en même temps."],
  knightFork: ["Fourchette de cavalier", "Un cavalier attaque deux pièces ou plus en même temps."],
  royalFork: ["Fourchette royale", "Une fourchette qui attaque à la fois le roi et la dame."],
  pin: ["Clouage", "Une pièce attaquée ne peut pas bouger sans laisser prendre une pièce plus précieuse derrière elle."],
  absolutePin: ["Clouage absolu", "La pièce clouée ne peut pas bouger du tout : elle exposerait son roi à l'échec."],
  discoveredCheck: ["Échec à la découverte", "Une pièce se déplace et démasque un échec donné par une autre pièce."],
  doubleCheck: ["Échec double", "Deux pièces donnent échec en même temps : seul le roi peut bouger."],
  discoveredAttack: ["Attaque à la découverte", "Une pièce se déplace et démasque l'attaque d'une autre pièce."],
  skewer: ["Enfilade", "On attaque une pièce précieuse qui doit bouger, et l'on prend la pièce placée derrière elle."],
  attacksPinned: ["Attaque une pièce clouée", "Met encore plus de pression sur une pièce déjà clouée pour la gagner."],
  trapsPiece: ["Pièce piégée", "Une pièce adverse n'a plus aucune case sûre."],
  removesDefender: ["Élimine le défenseur", "Prend ou chasse la pièce qui en défendait une autre."],
  counterThreat: ["Contre-menace", "Répond à une menace par une menace plus forte au lieu de défendre."],
  brilliantSac: ["Sacrifice brillant", "Un sacrifice difficile à voir qui rapporte assez pour compenser le matériel donné."],
  queenSac: ["Sacrifice de dame", "Donne volontairement sa dame pour un avantage tactique ou positionnel."],
  goodBishop: ["Fou actif", "Un fou mobile, que ses propres pions ne bloquent pas."],
  rookOpenFile: ["Tour sur colonne ouverte", "Place une tour sur une colonne sans pions : c'est là qu'elle est la plus active."],
  rookSeventh: ["Tour en 7e rangée", "Une tour sur la 7e rangée (2e pour les Noirs) attaque les pions et menace le roi."],
  rooksSeventh: ["Tours doublées en 7e", "Les deux tours sur la 7e rangée : pression énorme sur les pions et le roi."],
  outpost: ["Avant-poste", "Une case protégée dans le camp adverse qu'aucun pion ne peut attaquer : idéale pour un cavalier."],
  promotion: ["Promotion", "Un pion atteint la dernière rangée et devient une dame (ou une tour, un fou, un cavalier)."],
  makesPassed: ["Crée un pion passé", "Un pion qu'aucun pion adverse ne peut plus arrêter sur sa route."],
  pushesPassed: ["Pousse un pion passé", "Avance un pion passé vers la promotion."],
  protectedPassed: ["Pion passé protégé", "Un pion passé défendu par un autre pion."],
  rookBehindPassed: ["Tour derrière le pion passé", "La tour se place derrière son pion passé pour soutenir son avance."],
  rookBlocksPassed: ["Tour contre le pion passé", "La tour se place derrière le pion passé adverse pour l'arrêter."],
  activatesKing: ["Active le roi", "En finale, le roi devient une pièce d'attaque : il se rapproche du centre ou des pions."],
  opposition: ["Opposition", "Les rois se font face avec une case entre eux : le camp au trait est souvent gêné."],
  check: ["Échec", "Attaque directement le roi adverse, qui doit y répondre."],
  mate: ["Échec et mat", "Le roi est attaqué et ne peut pas s'échapper : la partie est gagnée."],
  queenMate: ["Mat de la dame", "Un mat donné par la dame."],
  rookMate: ["Mat de la tour", "Un mat donné par une tour."],
  backRankMate: ["Mat du couloir", "Mat par une tour ou une dame sur la dernière rangée, le roi enfermé par ses propres pions."],
  ladderMate: ["Mat de l'escalier", "Deux tours (ou dame et tour) repoussent le roi rangée après rangée jusqu'au bord."],
  minorEnding: ["Finale de pièces mineures", "Finale avec cavaliers, fous et pions, sans dames ni tours."],
  rookEnding: ["Finale de tours", "Finale où il reste des tours de chaque côté (sans dames)."],
  queenEnding: ["Finale de dames", "Finale où chaque camp a encore sa dame (et plus de tours ni pièces mineures)."],
  pawnEnding: ["Finale de pions", "Il ne reste que les rois et les pions."],
};

const CENTRE = ["d4", "e4", "d5", "e5"];
const DIRS = { b: [[1, 1], [1, -1], [-1, 1], [-1, -1]], r: [[1, 0], [-1, 0], [0, 1], [0, -1]] };

/** Pins by the piece on `sq`: "abs" (to the king) or "rel" (a non-pawn in front of a rook or queen). */
function pinsFrom(chess, sq) {
  const p = chess.get(sq);
  const out = new Set();
  if (!p || !"brq".includes(p.type)) return out;
  for (const [df, dr] of p.type === "q" ? [...DIRS.b, ...DIRS.r] : DIRS[p.type]) {
    let f = sq.charCodeAt(0) - 97 + df, r = +sq[1] + dr, first = null;
    while (f >= 0 && f < 8 && r >= 1 && r <= 8) {
      const q = chess.get(String.fromCharCode(97 + f) + r);
      if (q) {
        if (q.color === p.color || (!first && q.type === "k")) break;
        if (!first) first = q;
        else {
          if (q.type === "k") out.add("abs");
          else if (first.type !== "p" && VAL[q.type] >= 5 && VAL[q.type] > VAL[first.type]) out.add("rel");
          break;
        }
      }
      f += df; r += dr;
    }
  }
  return out;
}
const opp = (c) => (c === "w" ? "b" : "w");
const backRank = (c) => (c === "w" ? "1" : "8");

function mateInOne(chess) {
  for (const m of chess.moves({ verbose: true })) {
    chess.move(m);
    const mate = chess.isCheckmate();
    chess.undo();
    if (mate) return true;
  }
  return false;
}

/** Endgame label for the position, or null. */
function endingOf(chess) {
  const n = { q: 0, r: 0, minor: 0 };
  for (const p of pieces(chess)) {
    if (p.type === "q") n.q++;
    else if (p.type === "r") n.r++;
    else if (p.type === "n" || p.type === "b") n.minor++;
  }
  const total = n.q + n.r + n.minor;
  if (total === 0) return "pawnEnding";
  if (n.q === 2 && total === 2) return "queenEnding";
  if (n.q === 0 && n.r >= 2 && n.minor <= 2) return "rookEnding";
  if (n.q === 0 && n.r === 0 && n.minor <= 4) return "minorEnding";
  return null;
}

/**
 * Themes shown by `move` (chess.js verbose move) played from `fenBefore` to `fenAfter`.
 * `prev` is the move before it (or null), `cat` the grade category.
 */
export function moveThemes(fenBefore, fenAfter, move, prev, cat) {
  const out = new Set();
  let before, after;
  try { before = new Chess(fenBefore); after = new Chess(fenAfter); } catch { return []; }
  const side = move.color, them = opp(side), to = move.to;
  const castle = move.flags.includes("k") || move.flags.includes("q");

  if (cat === "book") out.add("book");
  if (cat === "brilliant") out.add("brilliantSac");

  // opening
  if (START[side][move.from] === move.piece && !move.captured) out.add("dev");
  if (move.piece === "p" && CENTRE.includes(to)) out.add("centerPawn");
  if (move.piece === "p") {
    const df = side === "w" ? 1 : -1;
    for (const f of [-1, 1]) {
      const sq = String.fromCharCode(to.charCodeAt(0) + f) + (+to[1] + df);
      const p = after.get(sq);
      if (p && p.type === "p" && p.color === them && CENTRE.includes(sq)) out.add("strikeCenter");
      if (p && p.color === them && p.type !== "p" && p.type !== "k") out.add("kick");
    }
  }
  if (castle) out.add("castles");
  const rooksLinked = (c) => {
    const rs = pieces(c).filter((p) => p.type === "r" && p.color === side && p.square[1] === backRank(side)).map((p) => p.square.charCodeAt(0));
    if (rs.length !== 2) return false;
    for (let f = Math.min(...rs) + 1; f < Math.max(...rs); f++) if (c.get(String.fromCharCode(f) + backRank(side))) return false;
    return true;
  };
  if (!rooksLinked(before) && rooksLinked(after)) out.add("connectsRooks");
  const developed = (c) => {
    const k = pieces(c).find((p) => p.type === "k" && p.color === side);
    const castled = k && k.square[1] === backRank(side) && "gcb".includes(k.square[0]);
    return castled && Object.entries(START[side]).every(([sq, t]) => { const p = c.get(sq); return !(p && p.type === t && p.color === side); });
  };
  if (!developed(before) && developed(after)) out.add("completesDev");
  if (move.piece === "b" && (side === "w" ? ["b2", "g2"] : ["b7", "g7"]).includes(to)) out.add("fianchetto");

  // captures
  if (move.captured) {
    out.add("capture");
    if (prev && prev.captured && prev.to === to) out.add("recapture");
    const defended = after.attackers(to, them).length > 0;
    if (!defended && move.captured !== "p" && !(prev && prev.captured && prev.to === to)) out.add("freePiece");
    if (!defended || VAL[move.captured] > VAL[move.piece]) out.add("winningCapture");
    else if (VAL[move.captured] === VAL[move.piece] && move.piece !== "p") out.add("equalTrade");
  }

  // defence
  const attackedFree = (c, sq) => c.attackers(sq, them).length > 0 && c.attackers(sq, side).length === 0;
  if (!move.captured && !castle && move.piece !== "p" && relRank(to, side) < relRank(move.from, side) && before.attackers(move.from, them).length) out.add("retreat");
  for (const p of pieces(before)) {
    if (p.color !== side || p.type === "k" || p.type === "p" || p.square === move.from) continue;
    if (attackedFree(before, p.square) && after.get(p.square) && !attackedFree(after, p.square)) { out.add("defends"); break; }
  }
  if (before.inCheck() && move.piece !== "k" && !move.captured) out.add("blocks");
  const threatBefore = withTurn(fenBefore, them);
  if (threatBefore && !before.inCheck() && mateInOne(threatBefore) && !mateInOne(new Chess(fenAfter))) out.add("defendsMate");

  // tactics
  if (move.piece !== "k") {
    const targets = forkTargets(fenAfter, to, side);
    const check = after.inCheck();
    if (targets.length + (check ? 1 : 0) >= 2) {
      out.add("fork");
      if (move.piece === "n") out.add("knightFork");
      if (check && targets.includes("q")) out.add("royalFork");
    }
  }
  const pins = pinsFrom(after, to);
  if (pins.has("abs")) out.add("absolutePin");
  if (pins.has("rel")) out.add("pin");
  if (after.inCheck()) {
    out.add("check");
    const k = pieces(after).find((p) => p.type === "k" && p.color === them);
    const checkers = after.attackers(k.square, side);
    if (checkers.length >= 2) out.add("doubleCheck");
    else if (!checkers.includes(to)) out.add("discoveredCheck");
  }
  if (after.isCheckmate()) {
    out.delete("check");
    out.add("mate");
    if (move.piece === "q") out.add("queenMate");
    if (move.piece === "r") out.add("rookMate");
    const k = pieces(after).find((p) => p.type === "k" && p.color === them);
    if ((move.piece === "r" || move.piece === "q") && to[1] === k.square[1] && k.square[1] === backRank(them)) out.add("backRankMate");
  }
  if (move.piece === "q" && !move.captured && after.attackers(to, them).length && !after.attackers(to, side).length && (cat === "brilliant" || cat === "great" || cat === "best")) out.add("queenSac");

  // pieces and files
  if (move.piece === "r") {
    if (!pieces(after).some((p) => p.type === "p" && p.square[0] === to[0])) out.add("rookOpenFile");
    if (relRank(to, side) === 7) {
      out.add("rookSeventh");
      if (pieces(after).filter((p) => p.type === "r" && p.color === side && relRank(p.square, side) === 7).length === 2) out.add("rooksSeventh");
    }
    // behind a passed pawn on the same file
    for (const p of pieces(after)) {
      if (p.type !== "p" || p.square[0] !== to[0] || !isPassed(after, p.square, p.color)) continue;
      const behind = p.color === "w" ? +to[1] < +p.square[1] : +to[1] > +p.square[1];
      if (behind) out.add(p.color === side ? "rookBehindPassed" : "rookBlocksPassed");
    }
  }
  if (move.piece === "n" && relRank(to, side) >= 4 && relRank(to, side) <= 6 && pawnProof(after, to, side) &&
      after.attackers(to, side).some((sq) => after.get(sq).type === "p")) out.add("outpost");

  // pawns
  if (move.promotion) out.add("promotion");
  if (move.piece === "p" && !move.promotion && isPassed(after, to, side)) {
    out.add(isPassed(before, move.from, side) ? "pushesPassed" : "makesPassed");
    if (after.attackers(to, side).some((sq) => after.get(sq).type === "p")) out.add("protectedPassed");
  }

  // king and endings
  const ending = endingOf(after);
  if (move.piece === "k" && !castle && ending) {
    const centre = (sq) => Math.abs(sq.charCodeAt(0) - 100.5) + Math.abs(+sq[1] - 4.5);
    if (centre(to) < centre(move.from)) out.add("activatesKing");
    const k2 = pieces(after).find((p) => p.type === "k" && p.color === them);
    const df = Math.abs(k2.square.charCodeAt(0) - to.charCodeAt(0)), dr = Math.abs(+k2.square[1] - +to[1]);
    if ((df === 0 && dr === 2) || (dr === 0 && df === 2)) out.add("opposition");
  }
  if (ending && endingOf(before) !== ending) out.add(ending);

  return [...out];
}

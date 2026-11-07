// Known, easy-to-follow openings suggested at the start of a game. Each is a plan of YOUR
// moves (from-to squares), so it adapts to what the opponent plays: the next step is the
// first planned move not done yet that is legal now.
import { Chess } from "../lib/chess.js";

const PLANS = {
  w: [
    { name: "Partie italienne", when: () => true,
      idea: "e4, cavalier f3, fou c4 qui vise f7, puis c3 et d4 (ou d3) et le roque. Simple, actif, plein de pièges.",
      plan: ["e2e4", "g1f3", "f1c4", "c2c3", "d2d3", "e1g1"] },
    { name: "Système de Londres", when: () => true,
      idea: "d4, fou f4, e3, cavalier f3, c3, cavalier d2, fou d3 et roque : le même schéma contre presque tout.",
      plan: ["d2d4", "c1f4", "e2e3", "g1f3", "c2c3", "b1d2", "f1d3", "e1g1"] },
    { name: "Gambit dame", when: () => true,
      idea: "d4 et c4 : on offre le pion c pour prendre le centre. Classique et solide.",
      plan: ["d2d4", "c2c4", "b1c3", "g1f3", "c1g5", "e2e3"] },
  ],
  b: [
    { name: "Ouverture ouverte (…e5)", when: (first) => first === "e2e4",
      idea: "Répondez e5, sortez le cavalier c6, le fou en c5 ou e7, puis d6 et le roque.",
      plan: ["e7e5", "b8c6", "g8f6", "f8c5", "d7d6", "e8g8"] },
    { name: "Caro-Kann", when: (first) => first === "e2e4",
      idea: "c6 puis d5 : le centre est solide, le fou c8 sort en f5 avant e6. Très peu de risques.",
      plan: ["c7c6", "d7d5", "c8f5", "e7e6", "b8d7", "g8f6"] },
    { name: "Scandinave", when: (first) => first === "e2e4",
      idea: "d5 tout de suite : on attaque e4. Après la prise, la dame se replie en a5 ou d6.",
      plan: ["d7d5", "g8f6", "c7c6", "c8f5", "e7e6"] },
    { name: "Gambit dame refusé", when: (first) => first !== "e2e4",
      idea: "d5, e6, cavalier f6, fou e7 et roque : on garde le centre sans prendre de risques.",
      plan: ["d7d5", "e7e6", "g8f6", "f8e7", "e8g8", "c7c6"] },
    { name: "Défense slave", when: (first) => first !== "e2e4",
      idea: "d5 et c6 : le pion d5 est bien soutenu et le fou c8 sort avant e6.",
      plan: ["d7d5", "c7c6", "g8f6", "c8f5", "e7e6"] },
  ],
};

/**
 * The next move of `plan`: { san } on your turn, { pending } on the opponent's, or null when the
 * plan is finished or broken (you played a move outside it, or its next move is not legal).
 */
function nextStep(chess, plan, side, mine) {
  if (mine.some((m) => !plan.includes(m))) return null;
  const step = plan.find((s) => !mine.includes(s));
  if (!step) return null;
  if (chess.turn() !== side) return { pending: true };
  const m = chess.moves({ verbose: true }).find((x) => x.from === step.slice(0, 2) && x.to === step.slice(2, 4));
  return m ? { san: m.san } : null;
}

/**
 * Openings `side` can still follow after the moves `sans` (from the start position):
 * [{ name, idea, next }] where `next` is your next move ("" while the opponent is to move).
 */
export function openingSuggestions(sans, side) {
  const chess = new Chess();
  let first = null;
  const mine = [];
  try {
    for (const s of sans) {
      const m = chess.move(s);
      if (!first && m.color === "w") first = m.from + m.to;
      if (m.color === side) mine.push(m.from + m.to);
    }
  } catch { return []; }
  const out = [];
  for (const o of PLANS[side]) {
    if (side === "b" && !first) { out.push({ name: o.name, idea: o.idea, next: "" }); continue; }
    if (!o.when(first)) continue;
    const step = nextStep(chess, o.plan, side, mine);
    if (!step) continue;
    out.push({ name: o.name, idea: o.idea, next: step.pending ? "" : step.san });
  }
  return out;
}

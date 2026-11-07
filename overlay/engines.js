// The engines the user can pick in ⚙, shared by the panel and the offscreen engine host.
// Each one is a UCI engine shipped as a single-threaded WASM/JS web worker in engine/,
// with its evaluation built in (no separate net file to load). The first one is the default.
export const ENGINES = {
  stockfish: {
    label: "Stockfish 17.1",
    note: "Le plus fort. Réseau neuronal compact intégré (7 Mo).",
    script: "engine/stockfish-17.1-lite-single-03e3232.js",
    files: ["engine/stockfish-17.1-lite-single-03e3232.js", "engine/stockfish-17.1-lite-single-03e3232.wasm"],
  },
  lozza: {
    label: "Lozza 11",
    note: "Moteur indépendant écrit en JavaScript, plus faible : un autre regard sur vos coups.",
    script: "engine/lozza11.js",
    files: ["engine/lozza11.js"],
  },
};
export const DEFAULT_ENGINE = Object.keys(ENGINES)[0];

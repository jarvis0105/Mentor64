// Mentor64, chess.com page world. The content scripts cannot see the board's own game
// object, so this copies what they need into data attributes on <html>:
//   data-mentor64-sans  the move line up to the move being viewed (survives figurine
//                       notation, languages and markup changes that trip the DOM scraper)
//   data-mentor64-game  {over, result, white, black} for the session and lifetime-score tools
// Read-only: it never touches the game.
(() => {
  const last = {};
  const put = (key, v) => {
    if (v === last[key]) return;
    last[key] = v;
    if (v) document.documentElement.dataset[key] = v;
    else delete document.documentElement.dataset[key];
  };
  setInterval(() => {
    let sans = "", game = "";
    try {
      const g = document.querySelector("wc-chess-board")?.game;
      const line = g && (g.getCurrentFullLine?.() || []).map((n) => n.san);
      if (line && line.every((s) => typeof s === "string")) sans = JSON.stringify(line);
      if (g) {
        const h = g.getHeaders?.() || {};
        game = JSON.stringify({ over: !!g.isGameOver?.(), result: g.getResult?.() || h.Result || "*", white: h.White || "", black: h.Black || "" });
      }
    } catch {}
    put("mentor64Sans", sans);
    put("mentor64Game", game);
  }, 300);
})();

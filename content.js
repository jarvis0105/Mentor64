// Mentor64 content script (lichess.org + chess.com).
//
// Responsibilities:
//   1. Work out what kind of page this is and whether grading is allowed.
//      FAIR PLAY: grading is never allowed during a live or daily game against a
//      human (that is engine assistance on chess.com and lichess alike). The rule is
//      fail-closed: a board page is only graded when it is positively identified as
//      finished / analysis / vs computer / broadcast, and everything else is paused.
//      A cross-tab lock also pauses every tab while any tab holds a live human game.
//   2. Scrape the mainline move list (SAN) up to the currently selected move.
//   3. Mount the overlay iframe and push it move-list updates.
//
// Both sites obfuscate or frequently change their markup, so the scraper is
// structural rather than selector-based: it finds the element that contains
// the most SAN-looking leaf nodes and treats that as the move list.
// All chess/engine logic lives in the overlay page.

(() => {
  if (window.__movegradeLoaded) return;
  window.__movegradeLoaded = true;

  // juliensong.com's bot page uses the lichess board (chessground), so it shares lichess' board code
  const SITE = /chess\.com$/.test(location.hostname) ? "chesscom" : /juliensong\.com$/.test(location.hostname) ? "juliensong" : "lichess";
  const SAN_RE = /^(?:[NBRQK][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x?[a-h]?[1-8](?:=[NBRQ])?|O-O(?:-O)?)[+#]?$/;
  const VARIATION_SEL = "interrupt, line, lines, comment, .variation, .sub-line, .sub-variation, .variation-component";
  const ACTIVE_SEL = ".a1t, .active, .selected, .current, .node-highlight-content.selected";
  const FIGURINE = { "♔": "K", "♕": "Q", "♖": "R", "♗": "B", "♘": "N", "♙": "" };

  // Lets the panel page be opened directly (for debugging) without knowing the extension id.
  document.documentElement.dataset.movegradeUrl = chrome.runtime.getURL("overlay/overlay.html");

  let frame = null;
  let lastGrade = null;
  let engineStatus = "";
  let lastPayload = "";

  // ---------------------------------------------------------------- board badge
  const CAT_COLORS = {
    brilliant: "#26c2a3", great: "#749bbf", best: "#81b64c", excellent: "#81b64c",
    good: "#95b776", book: "#d5a47d", inaccuracy: "#f7c631", mistake: "#ffa459",
    miss: "#ff7769", forced: "#96af8b", blunder: "#fa412d",
    mate: "#e8e8e8", none: "#3a3a4a",
  };
  const DARK_TEXT = new Set(["inaccuracy", "mate", "forced"]);
  let badge = null;

  /** The site's 8x8 board element and which colour sits at the bottom. */
  function findBoard() {
    if (SITE === "chesscom") {
      const b = document.querySelector("wc-chess-board, chess-board");
      if (!b) return null;
      return { el: b, flipped: b.classList.contains("flipped") };
    }
    const b = document.querySelector(".round__app cg-board, .analyse__board cg-board, .main-board cg-board, cg-board");
    if (!b) return null;
    const wrap = b.closest(".cg-wrap");
    return { el: b, flipped: !!(wrap && wrap.classList.contains("orientation-black")) };
  }

  /**
   * Screen rectangle of a square ("e4"). Prefers the site's own square-bound
   * elements (exact), falling back to dividing the board box by 8.
   */
  function squareRect(sqName) {
    const file = sqName.charCodeAt(0) - 97;
    const rank = +sqName[1];
    const board = findBoard();
    if (!board) return null;

    if (SITE === "chesscom") {
      // chess.com tags pieces and highlights with square-<file><rank>, 1-based
      const el = board.el.querySelector(`.piece.square-${file + 1}${rank}, .highlight.square-${file + 1}${rank}`);
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.width > 5) return r;
      }
    }

    const r = board.el.getBoundingClientRect();
    if (r.width < 50) return null;
    const sq = r.width / 8;
    const col = board.flipped ? 7 - file : file;
    const row = board.flipped ? rank - 1 : 8 - rank;
    const calc = { left: r.left + col * sq, top: r.top + row * sq, width: sq, height: sq };
    calc.right = calc.left + sq;
    calc.bottom = calc.top + sq;

    if (SITE !== "chesscom") {
      // lichess draws <square class="last-move"> under both squares of the last
      // move; snap to whichever one our computed square overlaps.
      let best = null, bestDist = Infinity;
      for (const s of board.el.querySelectorAll("square.last-move")) {
        const sr = s.getBoundingClientRect();
        const d = Math.hypot(sr.left + sr.width / 2 - (calc.left + sq / 2), sr.top + sr.height / 2 - (calc.top + sq / 2));
        if (d < bestDist) { bestDist = d; best = sr; }
      }
      if (best && bestDist < sq * 0.6) return best;
    }
    return calc;
  }

  function ensureBadge() {
    if (badge) return badge;
    badge = document.createElement("div");
    badge.id = "movegrade-badge";
    Object.assign(badge.style, {
      position: "fixed", display: "none", zIndex: "2147483646", pointerEvents: "none",
      borderRadius: "50%", color: "#fff", fontWeight: "900", textAlign: "center",
      fontFamily: "system-ui, Segoe UI, Roboto, sans-serif",
      boxShadow: "0 1px 4px rgba(0,0,0,0.6)", textShadow: "0 1px 2px rgba(0,0,0,0.4)",
      transition: "background 0.15s",
    });
    document.documentElement.appendChild(badge);
    return badge;
  }

  function positionBadge() {
    const b = ensureBadge();
    if (!lastGrade || !lastGrade.cat) { b.style.display = "none"; return; }
    const sqRect = squareRect(lastGrade.to);
    if (!sqRect) { b.style.display = "none"; return; }
    const size = Math.max(18, Math.min(34, sqRect.width * 0.42));
    Object.assign(b.style, {
      display: "",
      width: size + "px", height: size + "px", lineHeight: size + "px",
      fontSize: Math.round(size * 0.55) + "px",
      // overlap the square's top-right corner
      left: sqRect.right - size * 0.62 + "px",
      top: sqRect.top - size * 0.38 + "px",
      background: CAT_COLORS[lastGrade.cat] || CAT_COLORS.none,
      color: DARK_TEXT.has(lastGrade.cat) ? "#222" : "#fff",
      opacity: lastGrade.provisional ? "0.8" : "1",
    });
    b.textContent = lastGrade.glyph;
    b.title = `${lastGrade.label} (${lastGrade.evalAfter})`;
  }
  // Arrows laid over the board in one SVG, square centres computed from the board box:
  // cyan = the engine's move where the move played fell short, amber = your move to play,
  // red = the opponent's expected move, green = your premove answer to it, dashed violet =
  // the engine's deepest move when it differs from the human one.
  const ARROWS = { best: "#22d3ee", next: "#fbbf24", opp: "#f87171", pre: "#4ade80", deep: "#e879f9" };
  let arrow = null;
  function positionArrow() {
    const board = findBoard();
    const r = board && board.el.getBoundingClientRect();
    const want = Object.keys(ARROWS).filter((k) => lastGrade && lastGrade[k]);
    if (!want.length || !r || r.width < 50) { if (arrow) arrow.style.display = "none"; return; }
    if (!arrow) {
      arrow = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      arrow.id = "movegrade-arrow";
      arrow.setAttribute("viewBox", "0 0 8 8");
      arrow.innerHTML = "<defs>" + Object.entries(ARROWS).map(([k, c]) =>
        `<marker id="movegrade-head-${k}" viewBox="0 0 4 4" refX="2" refY="2" markerWidth="2.6" markerHeight="2.6" orient="auto">` +
        `<path d="M0,0 L4,2 L0,4 z" fill="${c}"/></marker>`).join("") + "</defs>" +
        Object.entries(ARROWS).map(([k, c]) =>
          `<line data-k="${k}" stroke="${c}" stroke-width="0.16" stroke-linecap="round"${k === "deep" ? ' stroke-dasharray="0.3 0.2"' : ""} marker-end="url(#movegrade-head-${k})"/>`).join("");
      Object.assign(arrow.style, { position: "fixed", zIndex: "2147483645", pointerEvents: "none", opacity: "0.82",
        filter: "drop-shadow(0 0 3px rgba(0,0,0,0.6))" });
      document.documentElement.appendChild(arrow);
    }
    const centre = (sq) => {
      const f = sq.charCodeAt(0) - 97, rank = +sq[1];
      return board.flipped ? [7 - f + 0.5, rank - 0.5] : [f + 0.5, 8 - rank + 0.5];
    };
    for (const k of Object.keys(ARROWS)) {
      const line = arrow.querySelector(`line[data-k="${k}"]`), a = lastGrade && lastGrade[k];
      line.style.display = a ? "" : "none";
      if (!a) continue;
      const [x1, y1] = centre(a.from), [x2, y2] = centre(a.to);
      // stop short of the target centre so the head sits inside the square
      const len = Math.hypot(x2 - x1, y2 - y1), q = (len - 0.32) / len;
      line.setAttribute("x1", x1); line.setAttribute("y1", y1);
      line.setAttribute("x2", x1 + (x2 - x1) * q); line.setAttribute("y2", y1 + (y2 - y1) * q);
    }
    Object.assign(arrow.style, { display: "", left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
  }
  window.addEventListener("resize", positionArrow);
  window.addEventListener("scroll", positionArrow, true);
  setInterval(positionArrow, 500);

  window.addEventListener("resize", positionBadge);
  window.addEventListener("scroll", positionBadge, true);
  setInterval(positionBadge, 500);

  // ---------------------------------------------------------------- context
  function detectLichess() {
    const round = document.querySelector(".round__app");
    const analyse = document.querySelector(".analyse__moves, .tview2, .study__multiboard");
    if (round) {
      const finished = !!round.querySelector(".result, .result-wrap, .status");
      const playing =
        document.body.classList.contains("playing") ||
        !!round.querySelector(".rcontrols .ricons");
      const names = [...round.querySelectorAll(".ruser")].map((e) => e.textContent || "");
      const vsEngine = names.some((t) => /stockfish|level\s*\d|\bBOT\b/i.test(t));
      if (playing && !finished && !vsEngine) {
        return { mode: "round", allowed: false, reason: PAUSED_LIVE, root: round, live: true };
      }
      return { mode: "round", allowed: true, reason: "", root: round, mine: vsEngine };
    }
    if (analyse) return { mode: "analysis", allowed: true, reason: "", root: analyse.closest("main") || analyse.parentElement || analyse };
    return { mode: "none", allowed: false, reason: "" };
  }

  // ---------------------------------------------------------------- fair-play lock
  // While ANY tab of this browser is inside a live/daily game against a human, every
  // other tab is paused too -- otherwise a second tab (analysis board, a finished
  // game, a spectated copy of your own game) could be used to get engine help.
  const LOCK_KEY = "movegradeLiveLock";
  const LOCK_TTL = 8000;                       // heartbeat every <=2s, so 8s = tab gone
  const TAB_ID = Math.random().toString(36).slice(2);
  let lockReady = false;                       // fail closed until storage has answered
  let otherLockAt = 0;
  let lastBeat = 0;

  function readLockValue(l) { otherLockAt = l && l.tab !== TAB_ID ? l.t || 0 : 0; }
  try {
    chrome.storage.local.get(LOCK_KEY).then((r) => {
      readLockValue(r && r[LOCK_KEY]);
      lockReady = true;
      lastPayload = "";
      update();
    }).catch(() => {});
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area === "local" && ch[LOCK_KEY]) { readLockValue(ch[LOCK_KEY].newValue); lastPayload = ""; update(); }
    });
  } catch {}
  const lockedElsewhere = () => !lockReady || (otherLockAt && Date.now() - otherLockAt < LOCK_TTL);

  function beatLock(liveHumanGame) {
    try {
      if (liveHumanGame) {
        if (Date.now() - lastBeat < 1500) return;
        lastBeat = Date.now();
        chrome.storage.local.set({ [LOCK_KEY]: { tab: TAB_ID, t: Date.now() } });
      } else if (lastBeat) {
        lastBeat = 0;
        chrome.storage.local.get(LOCK_KEY).then((r) => {
          const l = r && r[LOCK_KEY];
          if (l && l.tab === TAB_ID) chrome.storage.local.remove(LOCK_KEY);
        });
      }
    } catch {}
  }
  window.addEventListener("pagehide", () => {
    try { if (lastBeat) chrome.storage.local.remove(LOCK_KEY); } catch {}
  });

  const PAUSED_LIVE = "En pause : partie en direct contre un humain";
  const PAUSED_OTHER_TAB = "En pause : partie en direct ouverte dans un autre onglet";
  const PAUSED_UNKNOWN = "En pause : partie en cours (fair play)";

  function detectChesscom() {
    const path = location.pathname.replace(/^\/[a-z]{2}(?:-[A-Z]{2})?(?=\/)/, ""); // strip /fr, /pt-BR...
    const board = document.querySelector("wc-chess-board, chess-board, .board");
    if (!board) return { mode: "none", allowed: false, reason: "", live: false };
    const root =
      document.querySelector("wc-move-list, wc-simple-move-list, .move-list, [class*='move-list-component']") ||
      document.querySelector(".board-layout-sidebar, .sidebar-component, #board-layout-sidebar") ||
      document.body;

    const vsComputer = /^\/play\/computer/.test(path);
    // Resign/draw/abort controls only exist for a participant in a running game.
    const participant = !!document.querySelector(
      ".resign-button-component, button[aria-label='Resign'], button[aria-label='Abort'], [data-cy='resign'], " +
      ".live-game-buttons-component, .game-controls-component .resign, .daily-game-footer-component, [class*='draw-button']"
    );
    const finished = !!document.querySelector(
      ".game-over-modal-content, .game-result, .game-over-header-component, [class*='game-over'], [class*='game-review']"
    );
    const analysisRoute = /^\/(analysis|library|lessons|practice|openings|explorer)(\/|$)/.test(path);
    const broadcastRoute = /^\/(events|watch)(\/|$)/.test(path);
    const liveHuman = participant && !finished && !vsComputer;

    if (liveHuman) return { mode: "round", allowed: false, reason: PAUSED_LIVE, root, live: true };
    if (vsComputer) return { mode: "round", allowed: true, reason: "", root, live: false, mine: true };
    if (analysisRoute || broadcastRoute) {
      return { mode: "analysis", allowed: true, reason: "", root, live: false };
    }
    // Game pages (live or daily, mine or spectated): only once positively finished.
    if (finished) return { mode: "round", allowed: true, reason: "", root, live: false };
    // Anything else showing a board (in-progress game, puzzles, unknown page): paused.
    return { mode: "round", allowed: false, reason: PAUSED_UNKNOWN, root, live: false };
  }

  // juliensong.com: games against Julien's bots only, so always allowed
  function detectJulien() {
    const b = document.querySelector("cg-board");
    return b ? { mode: "analysis", allowed: true, reason: "", root: b, mine: true } : { mode: "none", allowed: false, reason: "" };
  }
  function detectBase() { return SITE === "chesscom" ? detectChesscom() : SITE === "juliensong" ? detectJulien() : detectLichess(); }

  function detectContext() {
    const ctx = detectBase();
    if (ctx.mode === "none") { beatLock(false); return ctx; }
    if (SITE === "lichess" && ctx.allowed === false && ctx.reason === PAUSED_LIVE) ctx.live = true;
    beatLock(!!ctx.live);
    if (ctx.allowed && lockedElsewhere()) {
      return { ...ctx, allowed: false, reason: lockReady ? PAUSED_OTHER_TAB : "En pause : vérification du verrou fair-play" };
    }
    return ctx;
  }

  // ---------------------------------------------------------------- scraping
  function cleanSan(text) {
    return (text || "")
      .trim()
      .replace(/^\d+\.+\s*/, "")
      .replace(/[♔♕♖♗♘♙]/g, (c) => FIGURINE[c])
      .replace(/[!?□⌓∞±∓⩲⩱⨀→↑⇆⇔]/g, "")
      .replace(/[^\w=+#O-]/g, "")
      .trim();
  }

  function elSan(el) {
    const sanEl = el.querySelector("san");
    if (sanEl) return cleanSan(sanEl.textContent);
    const fig = el.querySelector("[data-figurine]");
    const prefix = fig ? fig.dataset.figurine || "" : "";
    return cleanSan(prefix + el.textContent);
  }

  function isSanEl(el) {
    if (!SAN_RE.test(elSan(el))) return false;
    // deepest match only: no child should itself be a SAN element
    for (const c of el.children) if (SAN_RE.test(elSan(c))) return false;
    return true;
  }

  /** Find the element that contains the most SAN nodes; return its SAN nodes in order. */
  function findMoveNodes(root) {
    const all = root.querySelectorAll("*");
    const candidates = [];
    for (const el of all) {
      if (el.children.length > 3) continue;
      if (el.closest(VARIATION_SEL)) continue;
      if (isSanEl(el)) candidates.push(el);
    }
    if (candidates.length < 2) return candidates.length ? candidates : [];

    const counts = new Map();
    for (const el of candidates) {
      let a = el.parentElement;
      for (let i = 0; i < 6 && a && a !== root.parentElement; i++, a = a.parentElement) {
        counts.set(a, (counts.get(a) || 0) + 1);
      }
    }
    let best = null, bestCount = 0;
    for (const [el, c] of counts) {
      // prefer the highest count; on ties prefer the deeper (inner) element
      if (c > bestCount || (c === bestCount && best && best.contains(el))) {
        best = el;
        bestCount = c;
      }
    }
    return candidates.filter((el) => best.contains(el));
  }

  // juliensong.com shows no move list: read the piece placement off the board instead and
  // let the panel turn the successive positions into moves.
  const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";
  let julienBoards = [];
  function boardPlacement() {
    const b = findBoard();
    if (!b) return null;
    const sq = b.el.clientWidth / 8;
    if (sq < 5) return null;
    const grid = Array.from({ length: 8 }, () => Array(8).fill(""));
    for (const p of b.el.querySelectorAll("piece")) {
      // a piece moving or being dragged is between squares: wait for it to land
      if (/\b(anim|dragging|ghost|fading)\b/.test(p.className)) return null;
      const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(p.style.transform || "");
      if (!m) continue;
      const col = Math.round(+m[1] / sq), row = Math.round(+m[2] / sq);
      if (col < 0 || col > 7 || row < 0 || row > 7) continue;
      const [color, role] = p.className.split(/\s+/);
      const letter = { pawn: "p", knight: "n", bishop: "b", rook: "r", queen: "q", king: "k" }[role];
      if (!letter) continue;
      const r = b.flipped ? 7 - row : row, f = b.flipped ? 7 - col : col;
      grid[r][f] = color === "white" ? letter.toUpperCase() : letter;
    }
    return grid.map((row) => row.map((c) => c || "1").join("").replace(/1+/g, (s) => s.length)).join("/");
  }
  function julienHistory() {
    const now = boardPlacement();
    if (!now) return julienBoards;
    if (now === START) julienBoards = [START];
    else if (julienBoards[julienBoards.length - 1] !== now) julienBoards = [...julienBoards, now];
    return julienBoards;
  }

  function scrapeMoves(ctx) {
    // chess.com: the board's own move line, copied by chesscom-main.js (exact, any notation)
    if (SITE === "chesscom" && document.documentElement.dataset.mentor64Sans) {
      try {
        const line = JSON.parse(document.documentElement.dataset.mentor64Sans);
        if (Array.isArray(line) && line.every((s) => SAN_RE.test(s))) return line;
      } catch {}
    }
    const nodes = findMoveNodes(ctx.root || document.body);
    const sans = [];
    let activeIndex = -1;
    for (const el of nodes) {
      const san = elSan(el);
      if (!SAN_RE.test(san)) continue;
      let a = el;
      for (let i = 0; i < 3 && a; i++, a = a.parentElement) {
        if (a.matches(ACTIVE_SEL)) { activeIndex = sans.length; break; }
      }
      sans.push(san);
    }
    // In analysis the user can step back through the game; grade the move
    // they are currently looking at rather than the last one in the list.
    const cut = activeIndex >= 0 ? activeIndex + 1 : sans.length;
    return sans.slice(0, cut);
  }

  // ---------------------------------------------------------------- overlay
  function mountFrame() {
    if (frame) return frame;
    frame = document.createElement("iframe");
    frame.id = "movegrade-frame";
    frame.src = chrome.runtime.getURL("overlay/overlay.html");
    frame.setAttribute("allowtransparency", "true");
    // Docked bottom-right, always. The overlay reports its own size (launcher only,
    // or launcher + panel) so the iframe never covers more of the page than it draws.
    Object.assign(frame.style, {
      position: "fixed",
      right: "16px",
      bottom: "16px",
      top: "auto",
      left: "auto",
      width: "88px",
      height: "88px",
      border: "0",
      zIndex: "2147483647",
      background: "transparent",
      colorScheme: "normal",
      pointerEvents: "auto",
    });
    document.documentElement.appendChild(frame);
    chrome.storage.local.get(POS_KEY).then((r) => { if (r[POS_KEY]) placeFrame(r[POS_KEY]); }).catch(() => {});
    return frame;
  }

  // Where the launcher sits, as distances from the right and bottom edges (dragged by the user).
  const POS_KEY = "mentor64Pos";
  let pos = { r: 16, b: 16 }, dragStart = null;
  function placeFrame(p) {
    pos = {
      r: Math.max(0, Math.min(p.r, window.innerWidth - 88)),
      b: Math.max(0, Math.min(p.b, window.innerHeight - 88)),
    };
    frame.style.right = pos.r + "px";
    frame.style.bottom = pos.b + "px";
  }

  function post(msg) {
    if (frame && frame.contentWindow) frame.contentWindow.postMessage(msg, "*");
  }

  function update() {
    const ctx = detectContext();
    liveTools(ctx);
    mountFrame();
    frame.style.display = "";
    if (ctx.mode === "none") {
      if (badge) badge.style.display = "none";
      const idle = JSON.stringify({ mode: "none", allowed: false, reason: "Aucune partie sur cette page", sans: [], flipped: false });
      if (idle !== lastPayload) { lastPayload = idle; post({ type: "movegrade:moves", ...JSON.parse(idle) }); }
      return;
    }
    let sans = [], boards;
    try {
      if (ctx.allowed && SITE === "juliensong") boards = julienHistory();
      else sans = ctx.allowed ? scrapeMoves(ctx) : [];
    } catch (e) { console.warn("[Mentor64] scrape failed", e); }
    const board = findBoard();
    const flipped = !!(board && board.flipped);
    const payload = JSON.stringify({ mode: ctx.mode, allowed: ctx.allowed, reason: ctx.reason, sans, boards, flipped, mine: !!ctx.mine });
    if (payload === lastPayload) return;
    lastPayload = payload;
    post({ type: "movegrade:moves", ...JSON.parse(payload) });
  }

  // ---------------------------------------------------------------- live-game tools
  // Comfort tools for the games you play against people. None of them runs or reads an
  // engine: they hide parts of the page, read the two clocks the site already shows, and
  // move the board into a floating window. Settings are toggled in the panel's ⚙.
  const LIVE_DEFAULTS = { lvRatings: false, lvAnon: false, lvLowTime: true, lvGlow: true, lvGlowFull: true };
  const live = { ...LIVE_DEFAULTS, on: false, revealed: false };
  try {
    chrome.storage.local.get(Object.keys(LIVE_DEFAULTS)).then((r) => { Object.assign(live, r); applyLiveCss(); }).catch(() => {});
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area !== "local") return;
      for (const k in LIVE_DEFAULTS) if (ch[k]) live[k] = ch[k].newValue;
      applyLiveCss();
    });
  } catch {}

  const LIVE_SEL = {
    lichess: {
      ratings: ".ruser rating, .game__meta rating",
      anon: ".ruser-top .user-link, .ruser-top .utitle, .ruser-top .uflair, .crosstable, .game__meta__players",
      top: ".ruser-top",
      clocks: [".rclock-bottom .time", ".rclock-top .time"],
      board: ".cg-wrap",
    },
    chesscom: {
      // selectors cross-checked with Chess.com Enhancer (ISC), which was built against logged-in games
      ratings: ".user-tagline-rating, .user-rating, .rating-score-component, .cc-user-rating-white, .player-component [class*='rating']",
      anon: "#board-layout-player-top .cc-user-block-component, #board-layout-player-top .player-avatar img, " +
        ".player-top .player-avatar, .player-top .cc-user-username-component, .player-top [class*='country-flag'], " +
        ".player-top [class*='chess-title'], .player-top [class*='user-badge']",
      top: "#board-layout-player-top, .player-top",
      clocks: ["#board-layout-player-bottom .clock-component, .clock-bottom .clock-time-monospace",
        "#board-layout-player-top .clock-component, .clock-top .clock-time-monospace"],
      board: "#board-single, wc-chess-board, chess-board",
    },
  }[SITE === "chesscom" ? "chesscom" : "lichess"];

  let liveStyle = null, revealBtn = null;
  function applyLiveCss() {
    if (!liveStyle) {
      liveStyle = document.createElement("style");
      liveStyle.id = "movegrade-live";
      document.documentElement.appendChild(liveStyle);
    }
    const anon = live.on && live.lvAnon && !live.revealed;
    const css =
      (live.on && live.lvRatings ? `${LIVE_SEL.ratings} { display: none !important; }\n` : "") +
      (anon ? `${LIVE_SEL.anon} { visibility: hidden !important; }` : "");
    // only on change: rewriting it would wake the page observer, which calls us again
    if (liveStyle.textContent !== css) liveStyle.textContent = css;
    // one click shows the opponent again, for this game
    const top = anon && document.querySelector(LIVE_SEL.top);
    if (!top) { if (revealBtn) revealBtn.remove(); return; }
    if (!revealBtn) {
      revealBtn = document.createElement("button");
      revealBtn.textContent = "👁 Afficher l'adversaire";
      Object.assign(revealBtn.style, { font: "600 12px system-ui, sans-serif", padding: "2px 8px", margin: "0 6px",
        border: "1px solid #3b9dff", borderRadius: "8px", background: "#0b1020", color: "#e6ecff", cursor: "pointer" });
      revealBtn.addEventListener("click", (e) => { e.stopPropagation(); live.revealed = true; applyLiveCss(); });
    }
    if (revealBtn.parentNode !== top) top.appendChild(revealBtn);
  }

  /** Comfort tools only (no engine), so they run on any game page, against people or bots. */
  function liveTools(ctx) {
    const on = ctx.mode === "round";
    if (on !== live.on) {
      live.on = on;
      live.revealed = false;
      lowDone.clear();
      lastMine = null;
      glow(null);
    }
    applyLiveCss();
  }

  // clocks: "1:02:03", "2:59", "0:05.9" -> seconds
  function clockSecs(sel) {
    const el = document.querySelector(sel);
    if (!el) return null;
    // the clock element can hold other text (icons, labels): keep the first time-looking token
    const m = el.textContent.match(/\d+(?::\d+){0,2}(?:\.\d+)?/);
    return m ? m[0].split(":").map(parseFloat).reduce((s, p) => s * 60 + p, 0) : null;
  }

  const LOW_TIME = [30, 10]; // seconds left on your clock that trigger the alarm
  const lowDone = new Set();
  let lastMine = null, audio = null;
  function beep(times) {
    try {
      audio = audio || new AudioContext();
      for (let k = 0; k < times; k++) {
        const o = audio.createOscillator(), g = audio.createGain();
        o.type = "square";
        o.frequency.value = 880;
        g.gain.value = 0.25;
        o.connect(g).connect(audio.destination);
        const t = audio.currentTime + k * 0.22;
        o.start(t);
        o.stop(t + 0.14);
      }
    } catch { /* no audio before the first click on the page */ }
  }

  let glowing = null;
  function glow(state) {
    const b = document.querySelector(LIVE_SEL.board);
    if (glowing && glowing !== b) glowing.style.boxShadow = "";
    glowing = state ? b : null;
    if (!b) return;
    const c = { up: "#22c55e", down: "#ef4444", even: "#3b9dff" }[state];
    b.style.boxShadow = c ? `0 0 0 3px ${c}, 0 0 24px ${c}` : "";
  }

  function checkClocks() {
    if (!live.on) return;
    const [mineSel, theirSel] = LIVE_SEL.clocks;
    const mine = clockSecs(mineSel), theirs = clockSecs(theirSel);
    if (mine === null) return;
    if (live.lvLowTime && lastMine !== null) {
      for (const t of LOW_TIME) if (mine <= t && lastMine > t && !lowDone.has(t)) { lowDone.add(t); beep(t <= 10 ? 3 : 2); }
    }
    // under 10 s: the board flashes red three times (as in Chess.com Enhancer)
    const board = live.lvGlow && lastMine !== null && mine <= 10 && lastMine > 10 && document.querySelector(LIVE_SEL.board);
    if (board) board.animate([{ outline: "5px solid transparent" }, { outline: "5px solid #ff1f0f" }, { outline: "5px solid transparent" }],
      { duration: 250, iterations: 3 });
    lastMine = mine;
    // ahead or behind on time by more than 10 %; all game long, or only under 10 s
    const shown = live.lvGlow && theirs !== null && (live.lvGlowFull || mine <= 10);
    glow(shown ? (mine > theirs * 1.1 ? "up" : mine < theirs * 0.9 ? "down" : "even") : null);
  }
  setInterval(checkClocks, 250);

  // Floating board: the site's own board element is moved into a Document Picture-in-Picture
  // window (Chrome 116+) with the page's styles, and put back where it was when that closes.
  let pip = null;
  async function togglePip() {
    if (pip) { pip.close(); return "Fenêtre fermée"; }
    if (!("documentPictureInPicture" in window)) return "Non disponible dans ce navigateur";
    const el = SITE !== "chesscom"
      ? document.querySelector(".round__app__board, .analyse__board, .main-board, .cg-wrap")
      : (document.querySelector("#board-layout-player-top") || {}).parentElement || document.querySelector(LIVE_SEL.board);
    if (!el) return "Aucun échiquier sur cette page";
    const r = el.getBoundingClientRect();
    const w = await window.documentPictureInPicture.requestWindow({ width: Math.round(r.width) || 480, height: Math.round(r.height) || 520 });
    for (const s of document.styleSheets) {
      try {
        const st = w.document.createElement("style");
        st.textContent = [...s.cssRules].map((x) => x.cssText).join("\n");
        w.document.head.appendChild(st);
      } catch {
        if (s.href) { const l = w.document.createElement("link"); l.rel = "stylesheet"; l.href = s.href; w.document.head.appendChild(l); }
      }
    }
    for (const [src, dst] of [[document.documentElement, w.document.documentElement], [document.body, w.document.body]]) {
      for (const a of src.attributes) dst.setAttribute(a.name, a.value);
    }
    const parent = el.parentNode, next = el.nextSibling;
    w.document.body.style.margin = "0";
    w.document.body.appendChild(el);
    pip = w;
    w.addEventListener("pagehide", () => {
      parent.insertBefore(el, next);
      pip = null;
      window.dispatchEvent(new Event("resize"));
    });
    return "Fenêtre ouverte";
  }

  // ---------------------------------------------------------------- wiring
  let timer = null;
  const observer = new MutationObserver((muts) => {
    // ignore mutations we cause ourselves (the iframe)
    const ours = (n) => n === frame || n === badge || n === liveStyle || n === revealBtn;
    if (muts.every((m) => ours(m.target) || (m.type === "childList" && m.target === document.documentElement && [...m.addedNodes].every(ours)))) return;
    clearTimeout(timer);
    timer = setTimeout(update, 150);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "data-mentor64-sans"] });

  window.addEventListener("message", (ev) => {
    const d = ev.data;
    if (!d || typeof d !== "object") return;
    if (d.type === "movegrade:ready") {
      lastPayload = "";
      update();
    } else if (d.type === "movegrade:layout" && frame) {
      frame.style.width = Math.max(88, Math.min(d.width, window.innerWidth - pos.r - 8)) + "px";
      frame.style.height = Math.max(88, Math.min(d.height, window.innerHeight - pos.b - 8)) + "px";
    } else if (d.type === "movegrade:drag" && frame && ev.source === frame.contentWindow) {
      if (d.phase === "start") dragStart = { ...pos };
      else if (d.phase === "move" && dragStart) placeFrame({ r: dragStart.r - d.dx, b: dragStart.b - d.dy });
      else if (d.phase === "end") { dragStart = null; chrome.storage.local.set({ [POS_KEY]: pos }).catch(() => {}); }
    } else if (d.type === "movegrade:status") {
      engineStatus = d.status || "";
    } else if (d.type === "movegrade:pip" && frame && ev.source === frame.contentWindow) {
      togglePip().then((text) => post({ type: "movegrade:pip-status", text }), (e) => post({ type: "movegrade:pip-status", text: "Impossible : " + e.message }));
    } else if (d.type === "movegrade:grade") {
      lastGrade = d.cat ? d : null;
      positionBadge();
    }
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "movegrade:toggle") {
      mountFrame();
      post({ type: "movegrade:toggle" });
    }
  });

  update();
  // SPA navigations (both sites) don't reload the page.
  // juliensong.com moves pieces by changing their style only, which the observer does not watch
  setInterval(update, SITE === "juliensong" ? 400 : 2000);
})();

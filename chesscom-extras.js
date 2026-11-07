// Mentor64, chess.com comfort tools ported from Chess.com Enhancer (ISC licence):
// coloured & numbered arrows, hidden ads, lifetime score against the opponent, your
// rating on the friends page, and session mode. None of them uses the engine. Toggles
// live in the panel's ⚙ (same chrome.storage keys and defaults as overlay.js).
(() => {
  if (window.__mentor64Extras) return;
  window.__mentor64Extras = true;

  const S = { lvArrows: true, lvClutter: true, lvLifetime: true, lvFriends: false };
  const html = document.documentElement;

  function apply() {
    html.classList.toggle("mentor64-arrows", !!S.lvArrows);
    html.classList.toggle("mentor64-clutter", !!S.lvClutter);
    if (!S.lvArrows) clearLabels();
    if (!S.lvLifetime) removeScore();
    if (S.lvFriends) friends(); else document.querySelectorAll(".mentor64-my-score-row").forEach((e) => e.remove());
  }
  chrome.storage.local.get(Object.keys(S)).then((r) => { Object.assign(S, r); apply(); }).catch(() => {});
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== "local") return;
    let hit = false;
    for (const k in S) if (ch[k]) { S[k] = ch[k].newValue; hit = true; }
    if (hit) apply();
  });

  // ------------------------------------------------------------- page facts
  let me; // {name, id, csrf} of the logged-in user, from the context chess.com inlines in the page
  function pageUser() {
    if (me !== undefined) return me;
    me = null;
    for (const s of document.querySelectorAll("script:not([src])")) {
      const m = s.textContent.match(/context\s*=\s*(\{[\s\S]*?\});/);
      if (!m) continue;
      try {
        const c = JSON.parse(m[1]);
        if (c && c.user) { me = { name: c.user.username, id: c.user.id, csrf: c.csrf && c.csrf.token }; break; }
      } catch {}
    }
    return me;
  }
  const nameAt = (side) =>
    (document.querySelector(`#board-layout-player-${side} [data-test-element="user-tagline-username"]`)?.innerText || "").trim();
  function gameState() {
    try { return JSON.parse(html.dataset.mentor64Game || "null"); } catch { return null; }
  }
  /** "win" | "draw" | "lose" for the logged-in user, or null if it is not their game. */
  function myResult(g) {
    const u = pageUser();
    if (!g || !u) return null;
    if (g.result === "1/2-1/2") return "draw";
    const side = g.white.toLowerCase() === u.name.toLowerCase() ? "1-0" : g.black.toLowerCase() === u.name.toLowerCase() ? "0-1" : null;
    if (!side || (g.result !== "1-0" && g.result !== "0-1")) return null;
    return g.result === side ? "win" : "lose";
  }
  function myRating() {
    const t = document.querySelector("#board-layout-player-bottom .cc-user-rating-white, #board-layout-player-bottom [data-cy='user-tagline-rating']")?.textContent || "";
    const m = t.match(/\d{3,4}/);
    return m ? +m[0] : null;
  }

  // ------------------------------------------------------------- numbered arrows
  // Colours come from the CSS (html.mentor64-arrows); the numbers are labels over the board.
  let arrowsBox = null, arrowsObs = null;
  function clearLabels() { document.querySelectorAll(".mentor64-arrow-label").forEach((e) => e.remove()); }
  function labelArrows() {
    clearLabels();
    const board = document.querySelector("#board-single, wc-chess-board");
    if (!S.lvArrows || !board || !arrowsBox) return;
    const b = board.getBoundingClientRect();
    if (getComputedStyle(board).position === "static") board.style.position = "relative";
    [...arrowsBox.children].forEach((a, i) => {
      const r = a.getBoundingClientRect();
      const l = document.createElement("div");
      l.className = "mentor64-arrow-label";
      l.textContent = String(i + 1);
      l.style.left = `${r.left - b.left + r.width / 2}px`;
      l.style.top = `${r.top - b.top + r.height / 2}px`;
      board.appendChild(l);
    });
  }
  function watchArrows() {
    const box = document.querySelector("#board-single .arrows, wc-chess-board .arrows");
    if (box === arrowsBox) return;
    arrowsObs?.disconnect();
    arrowsBox = box;
    if (!box) return;
    arrowsObs = new MutationObserver(labelArrows);
    arrowsObs.observe(box, { childList: true });
  }

  // ------------------------------------------------------------- lifetime score
  let scoreFor = "", scoreEl = null;
  function removeScore() { scoreEl?.remove(); scoreEl = null; scoreFor = ""; }
  async function lifetimeScore() {
    const u = pageUser(), opp = nameAt("top");
    if (!S.lvLifetime || !u || !u.id || !opp || opp === u.name || nameAt("bottom") !== u.name) {
      if (scoreEl) removeScore();
      return;
    }
    if (scoreFor === opp && scoreEl?.isConnected) return;
    if (scoreFor === opp + "…") return; // request in flight
    scoreFor = opp + "…";
    try {
      const o = await fetch(`/callback/user/popup/${encodeURIComponent(opp)}`).then((r) => r.json());
      const s = await fetch(`/callback/user/lifetime-score/${u.id}/${o.userId}`, {
        method: "POST", body: JSON.stringify({ _token: u.csrf }),
      }).then((r) => r.json());
      if (scoreFor !== opp + "…" || nameAt("top") !== opp) return;
      const a = document.createElement("a");
      a.className = "mentor64-lifetime";
      a.href = `/games/archive/${encodeURIComponent(u.name)}?opponent=${encodeURIComponent(opp)}`;
      a.target = "_blank";
      a.title = "Votre score à vie contre cet adversaire (victoires / nulles / défaites)";
      a.innerHTML = `<h5>Votre score</h5><div><span class="w">${+s.win || 0}</span><span class="sl">/</span>` +
        `<span>${+s.draw || 0}</span><span class="sl">/</span><span class="l">${+s.lose || 0}</span></div>`;
      const anchor = document.querySelector("#board-layout-player-top .player-tagline");
      if (!anchor) { scoreFor = ""; return; }
      scoreEl?.remove();
      anchor.after(a);
      scoreEl = a;
      scoreFor = opp;
    } catch {
      scoreFor = opp; // shortcut: no retry after a failed request, until the opponent changes
    }
  }

  // ------------------------------------------------------------- friends page score
  const GAME_TYPES = { Blitz: "lightning", "Daily Chess": "chess", Bullet: "bullet", Rapid: "rapid", Puzzles: "tactics",
    Éclair: "lightning", "Échecs Quotidiens": "chess", "Échecs quotidiens": "chess", Problèmes: "tactics" };
  let friendStats = null;
  async function friends() {
    if (!S.lvFriends || !(/\/member\/[^/]+\/friends/.test(location.pathname) || location.pathname === "/friends")) return;
    if (!document.querySelector(".top-friends-item:not(.mentor64-my-score-row), .top-user-item:not(.mentor64-my-score-row)")) return;
    const u = pageUser();
    if (!u) return;
    if (!friendStats) {
      try {
        const d = await fetch(`/callback/member/stats/${encodeURIComponent(u.name.toLowerCase())}`, { credentials: "include" }).then((r) => r.json());
        friendStats = {};
        for (const e of d.stats || []) if (e.stats && e.stats.rating) friendStats[e.key] = e.stats.rating;
      } catch { return; }
    }
    for (const header of document.querySelectorAll("a.top-friends-header, a.top-user-header")) {
      const label = (header.querySelector(".top-friends-header-name, .top-user-header-title") || header).textContent.trim();
      const mine = friendStats[GAME_TYPES[label]];
      const list = header.nextElementSibling;
      if (!mine || !list || !list.matches(".top-friends-details, .top-user-details")) continue;
      if (list.querySelector(".mentor64-my-score-row")) continue;
      const items = [...list.querySelectorAll(".top-friends-item, .top-user-item")];
      if (!items.length) continue;
      const row = items[0].cloneNode(true);
      row.classList.add("mentor64-my-score-row");
      row.setAttribute("href", `/member/${u.name.toLowerCase()}`);
      const nameEl = row.querySelector("[data-test-element='user-tagline-username']");
      if (nameEl) nameEl.textContent = u.name;
      const scoreCell = row.querySelector(".top-friends-score, .top-user-score");
      if (scoreCell) scoreCell.textContent = mine;
      const before = items.find((it) => mine >= parseInt(it.querySelector(".top-friends-score, .top-user-score")?.textContent, 10));
      list.insertBefore(row, before || null);
      list.querySelectorAll(".top-friends-item, .top-user-item").forEach((it, i) => {
        const rank = it.querySelector(".top-friends-rank, .top-user-rank");
        if (rank) rank.textContent = `#${i + 1}`;
      });
    }
  }

  // ------------------------------------------------------------- session mode
  // Play N games / N minutes / until N losses: after each game it counts the result,
  // waits 3 s (pausable) and clicks chess.com's own "new game" button, then shows a summary.
  const NEW_GAME_TAB = '[data-tab="newGame"]';
  const START_BUTTON = ".new-game-primary > button";
  const NEXT_BUTTON = ".new-game-buttons-buttons button";
  const UNITS = { games: "parties", minutes: "minutes", losses: "défaites" };
  let ses = null, sesUi = null, countdown = null;
  let cfg = { goal: 3, unit: "games" };
  chrome.storage.local.get("lvSessionCfg").then((r) => { if (r.lvSessionCfg) cfg = r.lvSessionCfg; }).catch(() => {});

  const btn = (attr, text, primary) =>
    `<button ${attr} class="cc-button-component ${primary ? "cc-button-primary cc-bg-primary" : "cc-button-secondary cc-bg-secondary"} cc-button-medium">${text}</button>`;

  function sessionUi(title, content, buttons) {
    if (!sesUi || !sesUi.isConnected) {
      sesUi = document.createElement("div");
      sesUi.id = "mentor64-session";
      document.body.appendChild(sesUi);
    }
    sesUi.innerHTML = `<h2 class="header-title-component">${title}</h2>` +
      `<div class="mentor64-session-content">${content}</div><div class="mentor64-session-buttons">${buttons}</div>`;
    return sesUi;
  }

  function openSession() {
    clearInterval(countdown);
    ses = null;
    const ui = sessionUi("Nouvelle session",
      `<div class="mentor64-session-inputs"><h3>Jouer</h3><input type="number" min="1" value="${cfg.goal}" />` +
      `<select>${Object.entries(UNITS).map(([k, v]) => `<option value="${k}"${k === cfg.unit ? " selected" : ""}>${v}</option>`).join("")}</select></div>` +
      `<div class="mentor64-session-presets">${[[1, "losses", "1 défaite"], [3, "games", "3 parties"], [10, "minutes", "10 minutes"]]
        .map(([g, u, l]) => `<button data-preset="${g}:${u}" class="cc-button-component cc-button-secondary cc-button-small cc-bg-secondary">${l}</button>`).join("")}</div>`,
      btn("data-start", "Démarrer", true) + btn("data-close", "Fermer"));
    const input = ui.querySelector("input"), select = ui.querySelector("select");
    const save = () => { cfg = { goal: Math.max(1, +input.value || 1), unit: select.value }; chrome.storage.local.set({ lvSessionCfg: cfg }); };
    input.onchange = select.onchange = save;
    ui.querySelectorAll("[data-preset]").forEach((b) => (b.onclick = () => {
      const [g, u] = b.dataset.preset.split(":");
      input.value = g; select.value = u; save();
    }));
    ui.querySelector("[data-close]").onclick = closeSession;
    ui.querySelector("[data-start]").onclick = () => { save(); startSession(); };
  }

  function closeSession() {
    clearInterval(countdown);
    ses = null;
    sesUi?.remove();
    sesUi = null;
  }

  function startSession() {
    ses = { ...cfg, games: 0, start: Date.now(), ratingStart: myRating(), win: 0, draw: 0, lose: 0, streak: 0, best: 0, paused: false };
    document.querySelector(NEW_GAME_TAB)?.click();
    setTimeout(() => {
      const b = document.querySelector(START_BUTTON) || document.querySelector(NEXT_BUTTON);
      if (!b) { openSession(); return; }
      b.click();
      runningUi();
    }, 150);
  }

  function progress() {
    if (ses.unit === "games") return `Partie ${Math.min(ses.games + 1, ses.goal)} / ${ses.goal}`;
    if (ses.unit === "losses") return `Défaites ${ses.lose} / ${ses.goal}`;
    const left = Math.max(0, Math.ceil(ses.goal - (Date.now() - ses.start) / 60000));
    return `${left} minute${left > 1 ? "s" : ""} restante${left > 1 ? "s" : ""}`;
  }

  function runningUi() {
    const ui = sessionUi(progress(), "", btn("data-pause", ses.paused ? "Reprendre" : "Pause") + btn("data-end", "Terminer"));
    ui.querySelector(".mentor64-session-content").hidden = true;
    ui.querySelector("[data-pause]").onclick = (e) => { ses.paused = !ses.paused; e.target.textContent = ses.paused ? "Reprendre" : "Pause"; };
    ui.querySelector("[data-end]").onclick = () => (ses.games ? endSession() : openSession());
  }

  const goalReached = () =>
    ses.unit === "games" ? ses.games >= ses.goal
      : ses.unit === "losses" ? ses.lose >= ses.goal
        : Date.now() - ses.start >= ses.goal * 60000;

  function onGameOver(g) {
    const r = myResult(g);
    if (!ses || !r) return;
    ses.games++;
    ses[r]++;
    ses.streak = r === "win" ? ses.streak + 1 : 0;
    ses.best = Math.max(ses.best, ses.streak);
    if (goalReached()) { setTimeout(endSession, 1500); return; }
    let t = 3;
    const ui = sessionUi(progress(), `<p>Partie suivante dans</p><div class="mentor64-countdown">${t}</div><div class="mentor64-countdown-bar"></div>`,
      btn("data-pause", ses.paused ? "Reprendre" : "Pause") + btn("data-end", "Terminer"));
    const bar = ui.querySelector(".mentor64-countdown-bar"), num = ui.querySelector(".mentor64-countdown");
    ui.querySelector("[data-pause]").onclick = (e) => { ses.paused = !ses.paused; e.target.textContent = ses.paused ? "Reprendre" : "Pause"; };
    ui.querySelector("[data-end]").onclick = () => { clearInterval(countdown); endSession(); };
    let ms = 3000;
    clearInterval(countdown);
    countdown = setInterval(() => {
      if (!ses || ses.paused) return;
      ms -= 50;
      bar.style.width = `${(ms / 3000) * 100}%`;
      if (Math.ceil(ms / 1000) !== t) num.textContent = t = Math.ceil(ms / 1000);
      if (ms > 0) return;
      clearInterval(countdown);
      const next = document.querySelector(NEXT_BUTTON);
      if (!next) { openSession(); return; }
      next.click();
      runningUi();
    }, 50);
  }

  function endSession() {
    if (!ses) return;
    const s = ses, ratingEnd = myRating();
    closeSession();
    const secs = Math.floor((Date.now() - s.start) / 1000);
    const dur = `${Math.floor(secs / 3600) ? Math.floor(secs / 3600) + " h " : ""}${Math.floor((secs % 3600) / 60)} min ${secs % 60} s`;
    const diff = s.ratingStart && ratingEnd ? ratingEnd - s.ratingStart : null;
    const pop = document.createElement("div");
    pop.id = "mentor64-session-popover";
    pop.popover = "manual";
    pop.innerHTML = `<h2 class="header-title-component">Session terminée</h2><div class="mentor64-session-content">` +
      `<div class="mentor64-results"><div class="w"><div>${s.win}</div><div>Victoires</div></div>` +
      `<div class="l"><div>${s.lose}</div><div>Défaites</div></div><div><div>${s.draw}</div><div>Nulles</div></div></div>` +
      `<div class="mentor64-stats"><span>Durée :</span><span>${dur}</span><span>Parties jouées :</span><span>${s.win + s.lose + s.draw}</span>` +
      (diff === null ? "" : `<span>Classement :</span><span>${diff > 0 ? "+" + diff : diff}</span>`) +
      `<span>Plus longue série :</span><span>${s.best}</span></div></div>` +
      `<div class="mentor64-session-buttons">${btn("data-new", "Nouvelle", true)}${btn("data-close", "Fermer")}</div>`;
    document.body.appendChild(pop);
    pop.showPopover();
    pop.querySelector("[data-close]").onclick = () => pop.remove();
    pop.querySelector("[data-new]").onclick = () => { pop.remove(); openSession(); };
  }

  // the panel's "Mode session" button
  const extOrigin = new URL(chrome.runtime.getURL("")).origin;
  window.addEventListener("message", (ev) => {
    if (ev.origin === extOrigin && ev.data && ev.data.type === "movegrade:session") {
      if (sesUi && !ses) closeSession(); else if (!sesUi) openSession();
    }
  });

  // ------------------------------------------------------------- polling
  let wasOver = null;
  setInterval(() => {
    watchArrows();
    lifetimeScore();
    friends();
    const g = gameState();
    const over = !!(g && g.over);
    if (wasOver === false && over) {
      onGameOver(g);
      if (scoreEl) scoreFor = ""; // refresh the lifetime score with this result
    }
    wasOver = g ? over : null;
    if (ses && sesUi && ses.unit === "minutes" && !sesUi.querySelector(".mentor64-countdown")) {
      sesUi.querySelector(".header-title-component").textContent = progress();
    }
  }, 1000);
})();

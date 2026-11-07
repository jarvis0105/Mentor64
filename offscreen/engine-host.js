// Offscreen document: hosts the engine workers and serves analysis requests from
// panel iframes over runtime ports.
//
// Engines are registered by id (overlay/engines.js); each one is an independent worker,
// started the first time a panel asks for it. To add another UCI engine that ships as a
// WASM/JS worker: drop its files in engine/ and add it to ENGINES in overlay/engines.js.
//
// Port protocol (panel -> host), every message carries `engine` (an id from ENGINES):
//   { type: "hello", engine } | { type: "analyse", id, engine, fen, depth } | { type: "stop", engine }
// (host -> panel):
//   { type: "ready", engine } | { type: "error", engine, message }
//   { type: "progress", id, snapshot } | { type: "result", id, result }

import { Engine } from "../overlay/engine.js";
import { ENGINES, DEFAULT_ENGINE } from "../overlay/engines.js";


const ports = new Set();
const slots = {}; // id -> { engine, error }

function broadcast(msg) {
  for (const p of ports) safePost(p, msg);
}

function safePost(port, msg) {
  try { port.postMessage(msg); } catch { ports.delete(port); }
}

function startEngine(id) {
  const slot = slots[id] || (slots[id] = { engine: null, error: null });
  slot.error = null;
  const e = new Engine(chrome.runtime.getURL(ENGINES[id].script), {
    onError: (msg) => {
      if (e !== slot.engine) return;
      slot.error = msg;
      broadcast({ type: "error", engine: id, message: msg });
    },
    onLog: (line) => console.debug(`[engine ${id}]`, line),
  });
  slot.engine = e;
  e.readyPromise.then(
    () => { if (e === slot.engine) broadcast({ type: "ready", engine: id }); },
    () => {}
  );
}

/** Engines other than the main one start the first time somebody asks for them. */
function getSlot(id) {
  if (!ENGINES[id]) return null;
  if (!slots[id]) startEngine(id);
  return slots[id];
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "movegrade-engine") return;
  ports.add(port);

  port.onMessage.addListener(async (msg) => {
    if (!msg) return;
    const id = msg.engine || DEFAULT_ENGINE;
    const slot = getSlot(id);
    if (!slot) { safePost(port, { type: "error", engine: id, message: "unknown engine " + id }); return; }

    if (msg.type === "hello") {
      if (slot.error) safePost(port, { type: "error", engine: id, message: slot.error });
      else if (slot.engine.ready) safePost(port, { type: "ready", engine: id });
      return;
    }
    if (msg.type === "stop") { slot.engine.stop(); return; }
    if (msg.type === "analyse") {
      // wait for whichever instance ends up ready (NNUE or its classical fallback)
      while (slot.engine && !slot.engine.ready && !slot.error) {
        try { await slot.engine.readyPromise; } catch { await new Promise((r) => setTimeout(r, 200)); }
      }
      if (!slot.engine || slot.error) { safePost(port, { type: "result", id: msg.id, result: null }); return; }
      const result = await slot.engine.analyse(msg.fen, msg.depth, (snapshot) =>
        safePost(port, { type: "progress", id: msg.id, snapshot }), msg.maxDepth
      );
      safePost(port, { type: "result", id: msg.id, result });
    }
  });
  port.onDisconnect.addListener(() => {
    ports.delete(port);
    if (!ports.size) for (const s of Object.values(slots)) s.engine && s.engine.stop();
  });
});

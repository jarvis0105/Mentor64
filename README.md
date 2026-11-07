# Mentor64

Chrome extension that overlays a live move-quality badge on lichess.org and chess.com —
**Brilliant / Great / Best / Excellent / Good / Book / Forced / Inaccuracy / Miss / Mistake / Blunder** —
after every move, plus a coach, a game sheet and a player profile. Stockfish 17.1
(WebAssembly) runs locally inside the extension; nothing is sent anywhere.
Moves that are still theory are named and graded **Book** against a database of
3,328 openings rather than against the engine.

Works on:

- games you **watch** as broadcasts (lichess TV, studies, chess.com events/watch); chess.com games you spectate are graded once they are finished
- the **analysis board** and **studies** on either site (steps with you as you click through moves)
- games **against the computer** (lichess Stockfish level N / BOT accounts, chess.com `/play/computer`)
- **finished** games (the main use: post-game review)

Both sites change their markup often (lichess even randomises tag names), so
the scraper is structural: it looks for the element holding the most SAN-like
nodes (scoped to `wc-move-list` on chess.com) and uses the `.selected` /
`.active` / `.a1t` marker for the current move.

## Fair play (chess.com and lichess)

Both sites forbid engine assistance in games you are playing against humans. Mentor64
is built so that it cannot be used that way. The check is **fail-closed**: a board page is
graded only when it is positively identified as safe, and everything else is paused.

| Page | Graded? |
|------|---------|
| Finished game / game review (result or game-over screen visible) | yes |
| Analysis board, library, openings explorer, lessons | yes |
| Games vs the computer (`/play/computer`, lichess Stockfish/BOT) | yes |
| Broadcasts / events (`/events`, `/watch`) and lichess studies | yes |
| Live or daily game you are playing (resign / abort / draw controls present) | **never** |
| Any game page that is not finished yet, even one you only spectate | **never** |
| Puzzles and any unrecognised page with a board | **never** |
| Any page, in **any tab**, while another tab holds a live game vs a human | **never** |

The cross-tab lock closes the obvious loophole: a live game in one tab pauses Mentor64 in
every other tab of the browser (a heartbeat in `chrome.storage.local`, expiring 8 s after the
tab goes away). The panel shows a green *Fair play* pill, or an amber *Paused* pill with the reason.

Live-game tools (⚙ → *Pendant vos parties en direct*) run only while that lock is on, and never touch
the engine: hide ratings, hide the opponent (one-click reveal), a louder beep at 30 s and 10 s on your
clock, a halo around the board (green ahead on time, red behind, blue within 10 %), and the board in a
Document Picture-in-Picture window (Chrome 116+). They read the two clocks the site displays, nothing else.

What it cannot see: a second device, or another browser profile. Do not use any analysis
tool for a game you are still playing — that is on you, not on the extension.

## Install (unpacked)

**[Download MoveGrade.zip](https://github.com/Leonid-Elkin/MoveGrade/releases/latest/download/MoveGrade.zip)** — always the current release.

1. Unzip it; you get a `Mentor64` folder.
2. Open `chrome://extensions`, turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick that `Mentor64` folder.
4. Open any lichess game / analysis page. The panel appears top-right.

Cloning the repo works just as well — pick the checkout in step 3. Chrome keeps
loading the folder from where it is, so do not delete it afterwards.

To cut a new release, bump `version` in `manifest.json`, then:

```
sh tools/package.sh
gh release create v<version> dist/MoveGrade.zip
```

The asset has to keep the name `MoveGrade.zip` for the download link above to
go on working.

The round icon (bottom-right corner, always visible) or the toolbar icon opens and closes the
panel. ⚙ opens settings: think time (0.2–5s), coach on/off, and clearing the profile. Earlier moves are always
graded in the background: a quick pass at 0.3s per move first, then a second pass at the chosen think time.

**On-board badge.** The badge is also drawn directly on the site's board, on
the destination square of the latest move (chess.com-review style), slightly
transparent while the grade is still provisional. ⊡ hides the panel, leaving
just the on-board badge; the extension's toolbar icon shows the panel again.

## How grading works

For each move the engine evaluates the position before (MultiPV 2, so it knows
the best and second-best move) and after. Both are converted to a win
probability (lichess's formula) and the drop is measured from the mover's side:

| Category   | Rule |
|------------|------|
| Book       | still following theory (see [Opening book](#opening-book)) |
| Best       | engine's top move, or < 0.5 % lost |
| Brilliant  | Best **and** a real sacrifice (piece left en prise / taken by a cheaper piece) in a position that wasn't already won |
| Great      | Best **and** the only good move (second-best ≥ 10 % worse) |
| Excellent  | < 2 % lost |
| Good       | < 5 % lost |
| Inaccuracy | < 10 % lost |
| Mistake    | < 20 % lost |
| Blunder    | ≥ 20 % lost |
| Miss       | a mate or a won position was there and the move does not keep it; shown instead of Mistake or Blunder |
| Forced     | only one legal move, so there is nothing to grade |
| Checkmate  | the move mates |

Thresholds are chess.com's published Expected Points bands rather than numbers
invented here; `overlay/classify.js` cites the source. Tweak them there.

Searches are bounded by time, not depth (`go movetime`). A fixed depth costs
whatever the position happens to cost — instant in a bare ending, many seconds
in a sharp middlegame — so the badge arrived whenever it liked and the slider's
number meant nothing a player could feel. Every move now gets the same wall
clock (1s by default) and the engine goes as deep as the position allows.

A move that reaches a named position is graded from the book *before the engine
is asked anything*, so 1.e4 never spends a moment labelled an inaccuracy while a
shallow search catches up. The engine still runs behind it and still has the
last word.

## Opening book

Grading a gambit purely on eval is wrong: 3. c3 in the Smith-Morra hands over a
pawn, so the engine marks it down and it used to come out as an *Inaccuracy*.
It is theory, and theory is what "Book" is supposed to mean.

So the book is a real database — every position of all 3,328 named openings in
[lichess-org/chess-openings](https://github.com/lichess-org/chess-openings)
(CC0), 7,853 positions in total, from `1. Nh3` to twenty-ply main lines. A move
is **Book** when:

- the position it reaches is in the book, **and**
- the game had not already left theory (otherwise shuffling a knight out and
  back would transpose into a book position and re-enter book), **and**
- it does not leave the mover worse than about −1.5 pawns.

That last threshold is what stops a name on a line from excusing everything
played in it. A dubious opening keeps the badge while it is merely worse — the
Damiano Defence, 2... f6, is about −0.85 and stays Book — and loses it at the
point the mover is simply lost, which in the Damiano is 3... fxe5, a pawn down
to 4. Qh5+ at about −2.3, graded a Mistake.

Positions are keyed by structure (board, side to move, castling rights), not by
move order, so lines that transpose into theory are recognised as theory.

The opening's name is shown under the badge whatever the grade is, and stays on
screen dimmed once the game leaves book.

### Regenerating

`overlay/book.js` is generated and checked in, so nothing is fetched at runtime:

```
node tools/build-book.mjs     # tools/eco/*.tsv -> overlay/book.js
node tools/check-book.mjs     # coverage + grading checks, non-zero on failure
```

To pick up new openings, refresh the TSVs from upstream and rebuild.

## Interface

Thème « Nuit néon » (fond bleu nuit, détails bleu néon et cyan). Trois onglets :

- **Coup** : précision Blancs / Noirs en anneaux, tableau des coups par catégorie et par camp, coup affiché
  (note, évaluation avant → après, ouverture, meilleur coup) et **carte du coach**.
- **Fiche de partie** : six domaines notés pour le camp choisi (Blancs / Noirs, par défaut celui du bas) — ouverture
  (développement, roque), milieu de jeu (tactiques manquées, échanges), finale (roi actif, pions avancés),
  pièces (la mieux et la moins bien jouée), défense (coups sous pression, pièces en prise), attaque
  (échecs, prises, sacrifices, gains manqués). Calculé dans `overlay/profile.js`.
- **Votre profil** : agrégé sur **vos** parties uniquement (stockées localement dans `chrome.storage`, 60 au plus) :
  les parties contre l'ordinateur sont ajoutées d'elles-mêmes, les autres avec le bouton « C'est ma partie » de la
  fiche (un second clic les retire). Un domaine joué en moins de 3 coups n'est pas noté ; chaque pièce laissée en
  prise retire 12 points à la défense ; le style reste « provisoire » sous 5 parties. Contenu : style dominant, points forts, mauvaises habitudes, pièces les moins exploitées, ouvertures
  les plus réussies, niveau en finale, erreurs récurrentes, progression et trois objectifs pour la prochaine
  séance. ⚙ permet d'effacer cet historique.

La **carte du coach** porte une famille (Vision tactique, Développement, Stratégie, Défense, Planification,
Gestion du temps, Technique de finale, Attaque), un constat lié à la position (cases et pièces réelles) et une
ligne « Pour progresser ». Une carte vue sur les huit demi-coups voisins n'est pas répétée, sauf alerte
importante. « Gestion du temps » se base sur la criticité de la position (un seul bon coup, ou reprise
évidente), la pendule n'étant pas lue.

## Moteurs

Le moteur se choisit dans ⚙ ; changer de moteur efface les notes de la partie et relance l'analyse.

| Moteur | Fichiers | Particularité |
|--------|----------|---------------|
| Stockfish 17.1 (défaut) | `stockfish-17.1-lite-single-03e3232.{js,wasm}` (npm `stockfish@17.1.0`, build « lite ») | réseau neuronal compact intégré (7 Mo) |
| Lozza 11 | `lozza11.js` (release v11.0 de op12no2/lozza) | moteur indépendant en JavaScript, plus faible : un autre regard |

La liste est dans `overlay/engines.js`, partagée par le panneau et l'hôte hors écran. Pour ajouter un moteur UCI
livré en worker WASM/JS : copier ses fichiers dans `engine/` et ajouter une entrée à `ENGINES`.

## Layout

```
manifest.json          MV3 manifest (CSP allows wasm)
background.js          toolbar-button toggle; creates the offscreen engine document
offscreen/             engine host page: owns the Stockfish worker, serves panels over a runtime port
overlay/remote-engine.js  panel-side proxy to the offscreen engine
content.js             lichess/chess.com DOM scraping + iframe mounting + human-game guard
chesscom-main.js       chess.com page world: copies the board's move line and game state (read-only)
chesscom-extras.js/css chess.com comfort tools ported from Chess.com Enhancer: lifetime score, numbered
                       arrows, hidden ads, friends-page rating, session mode
overlay/overlay.html   the panel (runs as an extension page inside an iframe)
overlay/overlay.js     game state, engine scheduling, rendering
overlay/engine.js      UCI wrapper around the Stockfish worker
overlay/classify.js    win%-based classification + the book rule
overlay/coach.js       coach cards (family, position-linked tip, how to progress)
overlay/profile.js     game sheet (six domains) and cross-game player profile
overlay/book.js        generated opening book (position key -> ECO name)
overlay/book-key.js    the position-keying used by the book, both sides of the build
tools/build-book.mjs   rebuilds overlay/book.js from tools/eco/*.tsv
tools/check-book.mjs   book coverage and grading checks
tools/eco/             ECO tables from lichess-org/chess-openings (CC0)
engine/                Stockfish 17.1 lite (7 MB) and Lozza 11 (0.7 MB)
lib/chess.js           chess.js 1.4 (SAN parsing, legality, attackers)
```

## Dev testing without loading the extension

`python -m http.server 8765` in this folder, then open
`http://localhost:8765/overlay/overlay.html` and feed it moves from the console:

```js
window.postMessage({ type: "movegrade:moves", mode: "analysis", allowed: true, reason: "",
  sans: ["e4","e5","Nf3","Nc6","Bc4","Nf6","Ng5","d5","exd5","Nxd5","Nxf7"] }, "*");
```

## Credits

Based on [MoveGrade](https://github.com/Leonid-Elkin/MoveGrade) by Leonid Elkin.
Stockfish (GPL-3.0) via stockfish.js, Lozza by Colin Jenkins (permissive licence, `engine/LICENCE-lozza.txt`), chess.js (BSD-2-Clause). chess.com comfort tools (lifetime score, arrows, clutter, friends page, session mode, time-warning flash) ported from Chess.com Enhancer by rumpetrollet_rumpa (ISC licence, codeberg.org/rumpetrollet_rumpa/chesscom-enhancer-extension). See the LICENSE
files in `engine/` and `lib/`. Opening names from
[lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) (CC0-1.0).

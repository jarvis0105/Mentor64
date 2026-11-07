// Opening principles shown under the opening name. Keyed by family: the part of the
// lichess name between the ECO code and the first ":" or ",". Families not listed get
// the general principles. Text is "vous" form like the coach.

const GENERAL = {
  title: "Principes généraux de l'ouverture",
  idea: "Les dix premiers coups servent à mettre ses pièces en jeu, pas à attaquer tout de suite.",
  points: [
    "Occupez ou contrôlez le centre (e4, d4, e5, d5) avec un ou deux pions.",
    "Sortez les cavaliers avant les fous, et chaque pièce une seule fois.",
    "Roquez tôt : le roi à l'abri, la tour vers le centre.",
    "Ne sortez pas la dame trop tôt : elle se fait chasser et vous perdez du temps.",
    "Reliez les tours (plus rien entre elles) avant de lancer un plan.",
  ],
};

const FAMILIES = [
  [/^Italian Game|^Giuoco|^Two Knights|^Evans Gambit/, {
    title: "Partie italienne",
    idea: "Le fou en c4 vise f7, le point faible noir. Jeu ouvert et rapide, idéal pour apprendre le développement.",
    points: [
      "Blancs : préparez d4 avec c3, puis roquez avant d'ouvrir le centre.",
      "Blancs : d3 et a4/h3 mènent à une partie lente (Giuoco Pianissimo) où l'on manœuvre Cb1-d2-f1-g3.",
      "Noirs : …Fc5 ou …Cf6 ; avec …Cf6, attention à Cg5 qui attaque f7 une deuxième fois.",
      "Noirs : …d6 et …a6 donnent une retraite au fou (a7) contre b4-b5 ou d4-d5.",
    ],
  }],
  [/^Ruy Lopez|^Spanish/, {
    title: "Partie espagnole",
    idea: "Le fou en b5 met la pression sur le cavalier qui défend e5. Une lutte longue pour le centre.",
    points: [
      "Blancs : c3 puis d4, en gardant le fou sur la diagonale a2-g8 après …a6 et …b5 (Fb3).",
      "Blancs : la manœuvre Cb1-d2-f1-g3 relance le cavalier vers le roque adverse.",
      "Noirs : …a6 et …b5 chassent le fou ; …Cf6 et …Fe7 pour roquer vite.",
      "Noirs : tenez e5 (…d6) ; la défense Berlin (…Cf6, échange en c6) mène à une finale solide.",
    ],
  }],
  [/^Scotch/, {
    title: "Partie écossaise",
    idea: "Les Blancs ouvrent le centre tout de suite par d4. Jeu ouvert où le développement rapide compte.",
    points: [
      "Blancs : après Cxd4, centralisez et sortez vite le fou de cases noires.",
      "Noirs : …Fc5 ou …Cf6 attaquent e4 et le cavalier d4.",
      "Noirs : après Cxc6 bxc6, le pion c6 renforce le centre (…d5).",
    ],
  }],
  [/^Four Knights|^Three Knights|^Petrov|^Russian/, {
    title: "Ouverture symétrique (Quatre cavaliers, Petrov)",
    idea: "Les deux camps développent les cavaliers vers le centre. Partie solide où le moindre temps perdu compte.",
    points: [
      "Gardez la symétrie tant que c'est sûr, mais cherchez le coup qui donne l'initiative (d4, Fb5).",
      "Dans la Petrov, ne copiez pas aveuglément : …Cxe4 trop tôt peut perdre du matériel.",
      "Roquez et visez la colonne e une fois le centre ouvert.",
    ],
  }],
  [/^Vienna|^Bishop's Opening|^King's Pawn|^King's Knight Opening|^Center Game|^Danish|^Ponziani|^Latvian|^Elephant/, {
    title: "Début du pion roi (e4 e5)",
    idea: "Jeu ouvert : le développement et la sécurité du roi décident vite de la partie.",
    points: [
      "Visez f7 (Blancs) ou f2 (Noirs), les cases défendues seulement par le roi.",
      "Avancez f4 seulement si votre roi peut roquer rapidement ensuite.",
      "Contestez le centre par …d5 (Noirs) ou d4 (Blancs) dès que c'est possible.",
    ],
  }],
  [/^King's Gambit/, {
    title: "Gambit du roi",
    idea: "Les Blancs donnent un pion (f4) pour ouvrir la colonne f et prendre le centre. Jeu tranchant.",
    points: [
      "Blancs : d4, Fc4 et roque rapide ; la colonne f est votre récompense.",
      "Noirs : …d5 rend le pion pour ouvrir le jeu, ou gardez-le avec …g5 en connaissant la théorie.",
      "Les deux rois sont exposés : le premier qui roque prend l'avantage.",
    ],
  }],
  [/^Philidor/, {
    title: "Défense Philidor",
    idea: "Les Noirs défendent e5 par …d6 : position solide mais passive.",
    points: [
      "Noirs : …Cf6, …Fe7, …O-O, et préparez …c6 et …d5 ou …exd4 au bon moment.",
      "Blancs : d4 et un développement normal donnent un avantage d'espace durable.",
    ],
  }],
  [/^Sicilian/, {
    title: "Défense sicilienne",
    idea: "…c5 combat d4 sans copier e5 : déséquilibre voulu, les Noirs jouent à l'aile dame, les Blancs souvent au roi.",
    points: [
      "Noirs : après d4 cxd4, vous avez deux pions centraux contre un : jouez …d6/…e6 puis …d5 au bon moment.",
      "Noirs : la colonne c semi-ouverte et …b5 sont votre contre-jeu.",
      "Blancs : développez vite, roquez souvent du côté opposé et avancez f4, g4 contre le roi.",
      "Ne laissez pas le cavalier d4 sans protection : les tactiques …Cxd4 ou …Db6 guettent.",
    ],
  }],
  [/^French/, {
    title: "Défense française",
    idea: "…e6 et …d5 : centre solide, mais le fou c8 est enfermé derrière e6.",
    points: [
      "Noirs : attaquez la chaîne de pions par …c5 et …f6.",
      "Noirs : sortez le fou c8 par b7 (après …b6) ou échangez-le (…Fd7-b5).",
      "Blancs : avec e5, gagnez de l'espace et attaquez au roi (f4, Dg4).",
    ],
  }],
  [/^Caro-Kann/, {
    title: "Défense Caro-Kann",
    idea: "…c6 puis …d5 : solide comme la française, mais le fou c8 sort avant …e6.",
    points: [
      "Noirs : sortez le fou en f5 ou g4 avant de jouer …e6.",
      "Noirs : …c5 ou …e5 libèrent le jeu plus tard.",
      "Blancs : l'avance e5 gagne de l'espace ; h4-h5 chasse le fou f5.",
    ],
  }],
  [/^Scandinavian/, {
    title: "Défense scandinave",
    idea: "…d5 attaque e4 tout de suite. Jeu simple, mais la dame noire sort tôt.",
    points: [
      "Noirs : après …Dxd5 et Cc3, mettez la dame en a5 ou d6 pour qu'elle ne soit plus chassée.",
      "Noirs : …c6 et …Ff5 donnent une structure proche de la Caro-Kann.",
      "Blancs : gagnez du temps en attaquant la dame avec vos pièces mineures.",
    ],
  }],
  [/^Alekhine/, {
    title: "Défense Alekhine",
    idea: "Le cavalier en f6 provoque l'avance des pions blancs pour mieux les attaquer ensuite.",
    points: [
      "Noirs : attaquez le centre avancé par …d6, …Fg4 et …c5.",
      "Blancs : ne poussez pas tous vos pions : un centre trop avancé devient une cible.",
    ],
  }],
  [/^Pirc|^Modern Defense|^Robatsch|^Pterodactyl/, {
    title: "Défense Pirc / moderne",
    idea: "Les Noirs laissent le centre aux Blancs et le frappent ensuite avec le fou en fianchetto (g7).",
    points: [
      "Noirs : …g6, …Fg7, …d6 puis …e5 ou …c5 pour casser le centre.",
      "Blancs : f4 ou Fe3, Dd2 et grand roque permettent une attaque h4-h5.",
    ],
  }],
  [/^Queen's Gambit Declined|^Tarrasch|^Semi-Slav|^Slav|^Queen's Gambit Accepted|^Queen's Gambit/, {
    title: "Gambit dame",
    idea: "c4 attaque d5 pour gagner le centre. Ce n'est pas un vrai gambit : le pion se récupère presque toujours.",
    points: [
      "Blancs : Cc3, Fg5 ou Ff4, e3, puis roque ; la poussée e4 ou l'attaque minoritaire (b4-b5) sont les plans.",
      "Noirs : tenez d5 avec …e6 ou …c6 ; libérez le jeu par …c5 ou …e5.",
      "Noirs : dans le gambit accepté, ne gardez pas le pion c4 à tout prix : développez-vous.",
      "Dans la Slave, sortez le fou c8 (…Ff5) avant de jouer …e6.",
    ],
  }],
  [/^London|^Queen's Pawn Game|^Colle|^Torre|^Jobava|^Rapport-Jobava|^Zukertort|^Trompowsky|^Richter-Veresov|^Blackmar-Diemer/, {
    title: "Système de Londres / jeu du pion dame",
    idea: "Un même schéma contre presque tout : d4, Ff4, e3, Cf3, c3. Solide et facile à jouer.",
    points: [
      "Blancs : sortez le fou en f4 avant e3 pour qu'il ne soit pas enfermé.",
      "Blancs : Ce5 et une attaque au roi (Dh5, g4) viennent souvent ensuite.",
      "Noirs : …c5 et …Db6 visent b2 ; échangez le fou f4 par …Ch5 ou …Fd6.",
    ],
  }],
  [/^King's Indian|^Old Indian/, {
    title: "Défense est-indienne",
    idea: "Les Noirs cèdent le centre puis le contestent par …e5 ou …c5, et attaquent souvent au roi.",
    points: [
      "Noirs : …g6, …Fg7, …d6, …O-O, puis …e5 ; si d5, l'attaque …f5-f4 suit.",
      "Blancs : jouez à l'aile dame (c5, b4) pendant que les Noirs attaquent votre roi.",
    ],
  }],
  [/^Nimzo-Indian|^Queen's Indian|^Bogo-Indian|^Indian Defense|^Catalan/, {
    title: "Défenses indiennes (Nimzo, ouest-indienne, catalane)",
    idea: "Les Noirs contrôlent e4 avec les pièces plutôt qu'avec les pions.",
    points: [
      "Noirs : …Fb4 (Nimzo) ou …b6 et …Fb7 (ouest-indienne) visent e4.",
      "Noirs : dans la Nimzo, céder la paire de fous en c3 abîme les pions blancs.",
      "Blancs : la paire de fous et le centre sont vos atouts : ouvrez le jeu.",
    ],
  }],
  [/^Grünfeld|^Gruenfeld|^Neo-Grünfeld/, {
    title: "Défense Grünfeld",
    idea: "Les Noirs laissent les Blancs bâtir un grand centre pour l'attaquer avec …c5 et le fou g7.",
    points: [
      "Noirs : …d5, …Cxd5 puis …c5 et …Fg7 contre d4.",
      "Blancs : soutenez le centre (Fe3, Tc1) et cherchez d5.",
    ],
  }],
  [/^Benoni|^Benko/, {
    title: "Benoni / gambit Benko",
    idea: "Structure déséquilibrée : majorité noire à l'aile dame contre majorité blanche au centre.",
    points: [
      "Noirs : …a6, …b5 et les colonnes a et b ouvertes.",
      "Blancs : la poussée e4-e5 au centre est votre plan principal.",
    ],
  }],
  [/^Dutch/, {
    title: "Défense hollandaise",
    idea: "…f5 contrôle e4 et prépare une attaque à l'aile roi, mais affaiblit le roi noir.",
    points: [
      "Noirs : …Cf6, …e6 ou …g6, puis …De8-h5 pour attaquer.",
      "Blancs : fianchetto g3/Fg2 et la poussée e4 pour ouvrir le roi noir.",
    ],
  }],
  [/^English|^Réti|^Reti/, {
    title: "Ouverture anglaise / Réti",
    idea: "c4 ou Cf3 : contrôler le centre de loin avant de l'occuper.",
    points: [
      "Blancs : fianchetto (g3, Fg2) et pression sur d5 et la grande diagonale.",
      "Noirs : occupez le centre (…e5 ou …d5) puisque les Blancs vous le laissent.",
    ],
  }],
  [/^Bird|^Larsen|^Nimzo-Larsen|^Polish|^Grob|^Hungarian|^Van Geet|^Amar|^Anderssen|^Barnes|^Clemenz|^Kádas|^Nimzowitsch Defense|^Englund|^Rat Defense|^Owen|^Lion|^Borg|^St\. George|^Kangaroo|^Ware|^Mieses|^Sodium|^Van't Kruijs/, {
    title: "Début irrégulier",
    idea: "Un coup peu joué au premier coup : rien d'obligé, revenez aux principes de base.",
    points: [
      "Prenez le centre que l'adversaire vous laisse.",
      "Développez vite et roquez : les débuts irréguliers punissent rarement un jeu simple.",
    ],
  }],
];

/** {title, idea, points} for a lichess opening name ("C54 Italian Game: …"), or general principles. */
export function principlesFor(name) {
  const family = (name || "").replace(/^[A-E]\d\d\s+/, "").split(/[:,]/)[0].trim();
  const hit = FAMILIES.find(([re]) => re.test(family));
  return hit ? hit[1] : GENERAL;
}

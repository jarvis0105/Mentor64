# Politique de confidentialité — Mentor64

*Dernière mise à jour : 7 novembre 2026*

Mentor64 est une extension Chrome qui analyse les parties d'échecs affichées sur lichess.org et chess.com.
Elle a été conçue pour qu'**aucune donnée ne quitte votre ordinateur**.

## Ce que l'extension lit

Sur lichess.org et chess.com uniquement, l'extension lit dans la page :

- la liste des coups de la partie affichée ;
- l'orientation de l'échiquier (quel camp est en bas) ;
- des indices sur le type de page (partie terminée, analyse, partie contre l'ordinateur, partie en direct),
  pour ne jamais fonctionner pendant une partie en direct contre un humain. Sur lichess, cela inclut les noms
  affichés des joueurs, utilisés uniquement pour reconnaître un adversaire ordinateur et jamais enregistrés.

Pendant une partie en direct, si vous avez activé les outils de partie en direct (⚙), elle lit aussi :

- le temps affiché sur les deux pendules, pour l'alarme de temps faible et le halo autour de l'échiquier.

Ces outils ne font tourner aucun moteur et n'enregistrent rien : ils masquent des éléments de la page
(classements, nom de l'adversaire) et peuvent déplacer l'échiquier dans une fenêtre flottante.

Elle ne lit rien sur les autres sites.

## Ce que l'extension enregistre

Tout est stocké **localement** dans votre navigateur (`chrome.storage.local`) :

- vos réglages (moteur choisi, temps de calcul, conseils et flèche activés, outils de partie en direct,
  panneau ouvert ou fermé) ;
- votre profil de joueur : pour chaque partie que vous déclarez comme la vôtre (ou jouée contre l'ordinateur),
  la liste des coups, la date, le camp joué, le nom de l'ouverture et les scores calculés (60 parties au plus) ;
- un indicateur temporaire signalant qu'un onglet contient une partie en direct (effacé quelques secondes après
  la fermeture de l'onglet).

Vous pouvez effacer le profil à tout moment (⚙ → « Effacer l'historique du profil »). Désinstaller l'extension
supprime toutes ces données.

## Ce que l'extension n'envoie pas

- Aucune donnée n'est envoyée à un serveur, ni à nous, ni à un tiers.
- Seule exception, sur chess.com et si vous les gardez activés : le « score à vie » et « votre classement sur la
  page Amis » interrogent chess.com lui-même (votre score contre l'adversaire, vos classements), avec votre session
  chess.com, exactement comme le fait le site. Rien n'est conservé ni transmis ailleurs.
- Aucun compte, aucune publicité, aucun outil de mesure d'audience, aucun cookie.
- Les moteurs d'échecs (Stockfish, Lozza) tournent dans votre navigateur ; les positions ne sont jamais
  envoyées en ligne pour être analysées.

## Autorisations demandées

| Autorisation | Pourquoi |
|---|---|
| `storage` | garder vos réglages et votre profil sur votre ordinateur |
| `offscreen` | faire tourner le moteur d'échecs en arrière-plan sans ralentir la page |
| accès à lichess.org et chess.com | lire la liste des coups et afficher le panneau sur ces deux sites |

## Contact

Pour toute question : **[votre adresse e-mail de contact]**

# Tests de LifeLegend

```
npm test
```

Lance tous les fichiers `tests/*.test.js` avec le lanceur de tests intégré à Node (`node --test`). Aucune IA n'est
appelée : quand un test a besoin de l'IA, elle est simulée.

| Fichier | Ce qu'il vérifie | Données |
|---|---|---|
| `charte.test.js` | La feuille de style n'écrit que les valeurs de la charte (tailles, graisses, rayons, interlettrages, hauteurs de boutons), sauf ce qui porte la mention « hors échelle ». | aucune |
| `i18n.test.js` | Les cinq dictionnaires (`lifelegend/i18n`) ont les mêmes textes et les mêmes paramètres `{x}`, et couvrent tout ce que l'interface et le moteur affichent (textes passés à `tr()`, tables de libellés, étapes de la barre de progression, messages d'erreur). | aucune |
| `postTexts.test.js` | Les textes écrits sans IA (posts officiels, promesses, brief du matin, réponses types) dans les six langues : le français ne change pas, aucune autre langue ne garde de français. | carrière inventée |
| `agent.test.js` | Quand l'agent écrit son point mercato ; la réorientation d'offres refusée tant qu'elle n'est pas activée. | aucune |
| `influence.test.js` | Noms des formations (celui du jeu, le nom courant), chances et demandes impossibles, décisions (mercato fermé, prête, expirée, écrite puis gardée par le jeu, coéquipier retenu), rien d'écrit sans le réglage ; écriture d'une formation et d'un transfert dans une copie de la sauvegarde. | carrière inventée ; la sauvegarde copiée pour l'écriture |
| `training.test.js` | Lecture de l'écran Entraînement du jeu (barres, geste et poste en cours, points), les 41 gestes du jeu (numéros 67 à 107), les 13 postes (codes 1 à 13), geste appris d'une synchro à l'autre (qui fait une édition) ; lecture dans la sauvegarde copiée. | sauvegarde inventée ; la sauvegarde copiée |
| `transversale.test.js` | La Transversale : une longue lecture (récit du match ou chronique d'abord), des formats moyens et au moins une brève par édition (la conférence de presse et l'analyse toujours en format moyen ; le numéro spécial de fin de saison ; après un match, le regard du consultant, l'édito et « Le Débrief » à tour de rôle), la longueur relue selon le format de chaque article avec une marge, les formats dans les consignes, les reprises envoyées ensemble. | aucune |
| `savekeys.test.js` | Clés de sauvegarde : une sauvegarde chiffrée avec une autre clé que PES 2021 (Football Life 2027) refusée sans elle avec un message qui dit quoi faire, lue avec elle, réécrite avec la même clé à l'octet près ; PES 2021 toujours lu. Une vraie carrière Football Life 2027 si sa copie et sa clé sont là. | sauvegardes fabriquées (clé tirée au hasard) ; `fl2027/BL00000000` et `fl2027/key.bin` |
| `rumors.test.js` | Rumeurs mercato : le niveau de fiabilité vient de la sauvegarde (offre en cours, club qui le suit vraiment, sinon spéculation près du mercato), pas deux fois le même club en 30 jours, confirmées s'il y signe, démenties quand le mercato ferme. | instantanés fabriqués |
| `coachAdvice.test.js` | Conseils du coach : le point faible vient des derniers matchs, de leurs notes, de sa forme et du programme d'entraînement (rien s'il y met déjà assez de points ou s'il a peu joué), un conseil à la fois et un par mois, sa réponse dans le fil, suivi seulement si la barre monte dans la sauvegarde. | instantanés fabriqués |
| `dms.test.js` | Messages privés de Kop : à qui il peut écrire (coéquipiers du moment et supporters, pas la presse, les adversaires ni les comptes officiels), le message sans IA après un match (bon match, mauvaise défaite, un tous les 14 jours, pas de relance à qui attend sa réponse), ce que l'IA reçoit de la conversation. | instantanés fabriqués |
| `national.test.js` | Sélection nationale : première convocation (il n'avait pas de sélection), nouvelle liste annoncée par le compte de la sélection (avec lui en tête s'il y est, pas pour un seul nom qui change), rumeur quand sa sélection joue dans les 14 jours sans lui. | instantanés fabriqués |
| `notoriety.test.js` | Notoriété : l'image dans la presse sur 100 (place que les journaux lui donnent, forme, buts et passes, titularisations, humeur des supporters quand elle le vise), un point par jour de jeu. | aucune |
| `awards.test.js` | Récompenses sur les notes du jeu : équipe type de la dernière journée finie (4-3-3, sans les entrées en fin de match), classement à la note moyenne, trophées de la saison finie (meilleur joueur, buteur, passeur, gardien, équipe type), annoncés une seule fois à l'édition. | matchs fabriqués |
| `pantheon.test.js` | Panthéon : un chapitre de la biographie demandé seulement pour un vrai événement (ses débuts sur la page, premier match ou premier but au club, transfert, prolongation, trophée, palier, fin de saison), chapitre gardé s'il a un titre et un texte ; la biographie écrite par le joueur donne le premier chapitre, refait si le texte change ; un joueur réel n'a pas de biographie. | aucune |
| `quota.test.js` | Quota de l'IA : le modèle léger du fournisseur pour les tâches courtes, un modèle dont le quota du jour est épuisé laissé de côté au lieu d'être redemandé à chaque étape. | réponses simulées |
| `career.test.js` | Synchro complète (IA simulée) : mails de l'agent, posts automatiques en anglais, ancien club donné à l'IA dans les fils d'avant un transfert ; La Transversale et l'édition écrites en même temps (l'édition connaît le plan des articles), discussions sur Kop au modèle léger, durées du bloc parallèle ; message clair pour une sauvegarde introuvable ; premier chapitre du Panthéon demandé à l'édition et enregistré. | copies d'une vraie carrière |

## Copies de référence

`career.test.js`, `influence.test.js`, `training.test.js` et `savekeys.test.js` ont des tests qui lisent une vraie
carrière Football Life 2027. Ces copies ne sont pas dans le dépôt (données personnelles). Sans elles, ces tests sont
sautés. Mets dans `tests/fixtures/` (ignoré par git, et absent de la version portable, qui ne copie pas les tests), ou
dans le dossier indiqué par la variable `LIFELEGEND_FIXTURES` :

- `state.json` : copie de `%APPDATA%\LiveTweet\data\careers\<carrière>\state.json` ;
- `clubs.json` : copie du `clubs.json` de la même carrière ;
- `BL00000000` : copie de la sauvegarde correspondante (`Documents\SPGAME\Football Life\2027\save`) ;
- `key.bin` : la clé de sauvegarde de Football Life 2027 (64 octets). Elle n'est jamais dans le dépôt ni livrée avec LifeLegend.

Les tests travaillent en mémoire ou dans un dossier temporaire : ni les copies, ni la vraie carrière, ni la vraie
sauvegarde ne sont modifiées. Les noms attendus (AS Nancy Lorraine, Oswald Tanchot, Lucas Vermeulen…) et le poste
travaillé (Milieu offensif) sont ceux de la carrière de référence I. Morel ; avec une autre carrière, ces tests sont à
adapter.

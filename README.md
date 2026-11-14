# LifeLegend

**L'internet de ta carrière Become a Legend** (SP Football Life 2027 ; eFootball PES 2021 reste pris en charge).
*The internet of your Become a Legend career — English below.*

LifeLegend lit ta sauvegarde Become a Legend et en tire un monde qui réagit à chaque match. Les faits viennent de la
sauvegarde, le style vient de l'IA, avec ta propre clé. En six langues : français, English, español, italiano,
português, Deutsch.

| Site | Ce que c'est |
|---|---|
| **La Transversale** | le quotidien du football : ton match et ta carrière, les grands championnats et les coupes d'Europe, le joueur du mois et le footballeur de l'année, et à chaque édition un édito sur la vie d'un championnat |
| **Le blog des supporters** | le blog de ton club (son nom change avec le club : L'Écho des Chardons à Nancy…) et le mur des supporters |
| **Kop** | le réseau social : supporters, rivaux, journalistes, comptes officiels des clubs et des compétitions, de vrais joueurs ; tu peux poster, répondre et citer |
| **Mails** | ta boîte mail (ton agent, ton entraîneur, la presse, tes proches, les marques), ton dossier de carrière (contrat, transferts, objectifs fixés par ton entraîneur, relation avec le club) et Influence (convaincre ton entraîneur ou ton club) |
| **Vestiaire** | le groupe privé de ton club, et celui de ta sélection : chacun y écrit à sa façon |
| **Scoreline** | les scores, classements et statistiques de tout le monde du jeu |
| **Panthéon** | l'encyclopédie : ta page, qui s'écrit chapitre après chapitre |

Thème clair ou sombre sur tous les sites, couleurs au choix (cinq palettes ou ton nuancier). Les écussons, logos de
compétitions et visages des joueurs sont lus dans les fichiers de ton jeu à chaque synchro : LifeLegend n'en contient
aucun. Un souci ? Réglages › À propos › « Préparer le rapport » (un fichier à relire, sans clé ni données
personnelles ; rien ne part tout seul).

> **Version 1.0.1.** LifeLegend est une fiction : les vrais joueurs, entraîneurs et clubs viennent de ton jeu,
> mais tout ce qu'on leur fait dire est écrit par l'IA. Ce ne sont pas leurs propos ; ne les leur attribue pas hors de
> LifeLegend. Mod de fan non officiel, sans lien avec Konami, les auteurs de Football Life, les clubs ni les joueurs.

## Installer (joueurs)

Télécharge le dossier portable de la dernière version (`LifeLegend-1.0.1-win-x64.zip`, page **Releases** du dépôt), décompresse-le
où tu veux et lance `LifeLegend.exe`. Le mode d'emploi complet est dans [docs/LISEZMOI.txt](docs/LISEZMOI.txt) (copié
dans le dossier portable). Ce qui change d'une version à l'autre : [CHANGELOG.md](CHANGELOG.md).

Il faut : Windows 10 ou 11 (64 bits), SP Football Life 2027 avec une carrière Become a Legend, sa clé de sauvegarde (un
fichier de 64 octets que LifeLegend ne fournit pas ; lien « Download FL27 Encryption Key » de
[cette page de PES Smoke Patch](https://www.pessmokepatch.com/p/customizations-and-mods.html)) et une clé d'IA (gratuite
chez Google AI Studio ou Groq).

Par défaut, LifeLegend ne fait que **lire** ta sauvegarde. Deux options, à activer dans Réglages › Sauvegarde, lui
permettent d'y écrire, jeu fermé et avec une copie de sécurité à chaque fois : les effets d'Influence (une formation
acceptée par ton entraîneur, vérifiée dans Football Life 2027 ; un transfert accepté par ton club, encore expérimental)
et la réorientation d'une offre reçue vers un autre club (expérimentale).

## Développer

Il faut [Node.js](https://nodejs.org) (version 22 ou plus récente). Dans ce dossier :

```
npm install
npm start          # lance LifeLegend
npm test           # tests (voir tests/README.md)
npm run dist       # dossier portable dans dist\ (ajoute « -- --zip » pour l'archive)
```

| Dossier | Contenu |
|---|---|
| `main.js`, `preload.js` | processus principal d'Electron : fenêtre, réglages, synchro, accès aux fichiers |
| `lifelegend/` | l'interface (HTML, CSS, JS sans framework), ses polices et ses dictionnaires `i18n/` |
| `src/save/` | lecture de la sauvegarde et des fichiers du jeu (écussons, logos, visages) ; écritures expérimentales (réorientation d'offres, Influence) |
| `src/world/` | le moteur : instantanés, éditions, football du monde, Kop, agent, Influence, promesses, saisons, textes sans IA |
| `src/ai/` | fournisseurs d'IA, consignes (prompts), vérification des faits |
| `src/data/` | données fixes : comptes officiels des clubs et des compétitions |
| `tests/` | tests (`node --test`) |
| `tools/` | vérification d'une sauvegarde, construction du dossier portable |
| `docs/` | modes d'emploi du dossier portable, charte graphique |

Les données du joueur (réglages, carrières) sont dans `%APPDATA%\LiveTweet\data` (nom historique gardé pour ne pas
perdre les carrières existantes). La clé de sauvegarde et les sauvegardes des tests restent dans `tests/fixtures/`, qui
n'est jamais publié.

Vérifier une sauvegarde sans IA :

```
npm run check-save -- "C:\Users\<toi>\Documents\SPGAME\Football Life\2027\save\BL00000000"
```

## Licence

LifeLegend est publié sous licence MIT ([LICENSE](LICENSE)). Polices, icônes, mises en page reprises et dépendances
ont leurs propres licences : [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt).

## Remerciements

Déchiffrement des sauvegardes d'après [pesXdecrypter](https://github.com/the4chancup/pesXdecrypter) (domaine public).
Emplacements de la fiche du joueur dans la sauvegarde établis en étudiant, sans l'exécuter, le « PES21 BAL Ultimate
Editor » d'AlexDelPiero23. Idée d'origine : TyNet (College Football 27), réécrit de zéro pour le football.

---

## English

LifeLegend reads your SP Football Life 2027 Become a Legend save and builds a world that reacts to every match. Facts
come from the save, the writing comes from the AI, with your own key. Available in French, English, Spanish, Italian,
Portuguese and German (Settings › Appearance).

- **La Transversale**: the football daily: your match and career, the big leagues and European cups, the player of the
  month and of the year, and in every edition an editorial on the life of one league.
- **The fan blog** of your club, with its supporters' wall.
- **Kop**: the social network (fans, rivals, journalists, official club and competition accounts, real players); post,
  reply and quote.
- **Mails**: your inbox (agent, coach, press, family, brands), your career file (contract, transfers, objectives set
  by your coach, relationship with the club) and Influence (convince your coach or your club).
- **Vestiaire**: your club's private group chat, and your national team's.
- **Scoreline**: scores, tables and stats for the whole game world.
- **Panthéon**: the encyclopedia page of your career, written chapter by chapter.

Light or dark theme on every site, your own colours (five palettes or a colour picker). Crests, competition logos and
player faces are read from your game files at each sync: LifeLegend ships none of them.

**Version 1.0.1.** LifeLegend is fiction: real players, coaches and clubs come from your game, but everything
they say here is written by AI and is not their words; never attribute it to them outside LifeLegend. Unofficial fan
mod, not affiliated with Konami, the makers of Football Life, any club or player.

Players: download the latest build (`LifeLegend-1.0.1-win-x64.zip`, **Releases** page), unzip it anywhere and run
`LifeLegend.exe`; see [docs/README.txt](docs/README.txt). By default LifeLegend only reads your save; two options
(Settings › Save) let it write Influence effects (a formation agreed with your coach, verified in Football Life 2027; a
transfer, still experimental) and offer redirects (experimental), with the game closed and a backup each time. Developers: `npm install`, `npm start`, `npm test`, `npm run dist`. MIT licence.

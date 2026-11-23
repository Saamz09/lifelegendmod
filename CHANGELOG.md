# Journal des changements

## 1.2.0 — 2026-11-23

### Influence
- **Le style de jeu** (demandé par des joueurs) : Influence montre les 7 consignes de ton entraîneur, celles de l'écran
  du jeu « Plan de jeu › Tactiques définies » (style offensif, construction, zone d'attaque, placement, style défensif,
  zone de pressing, pressing constant), et tu peux lui en proposer d'autres. Plus tu en changes, plus c'est dur à
  obtenir ; il répond dans Mails. Acceptées, et avec « Influence : effets réels dans le jeu » coché, elles sont écrites
  dans ta sauvegarde (jeu fermé, copie gardée) et le plan de jeu les affiche quand tu relances (vérifié dans Football
  Life 2027). Quand le jeu les a gardées, la presse et les supporters peuvent remarquer le changement, sans jamais
  révéler ta demande.
- **Le style de jeu s'écrit aussi dans une sauvegarde agrandie** (GigaPack, FL Mod Studio) : c'est la première
  écriture permise dans ce genre de sauvegarde. Essayé en jeu sur le GigaPack de Matozanato : le plan de jeu affiche le
  nouveau style, et la sauvegarde du jeu le garde. La formation, les transferts et les offres redirigées y restent en
  lecture seule.

### Relation avec le club
- **Les mises à l'écart comptent dans le jeu** : quand ton club te sanctionne pour tes propos (1 match, puis 2 en cas
  de récidive), le bouton « Appliquer dans le jeu » sous son mail écrit une vraie suspension dans ta sauvegarde, au même
  endroit que le jeu après un carton rouge (jeu fermé, copie gardée). L'écran Composition affiche « Suspendu », tu n'es
  pas retenu, et le jeu décompte les matchs tout seul. Essayé en jeu dans Football Life 2027 (GigaPack). Une suspension
  plus longue déjà en cours (vrai carton rouge) est gardée. Ça marche aussi dans une sauvegarde agrandie (GigaPack, FL
  Mod Studio). Jusqu'ici, après le rappel à l'ordre, l'ambiance se tendait seulement : aucune sanction n'était écrite.
- Tant que tu es suspendu, le calendrier du menu du jeu montre chaque match en double : c'est l'affichage du jeu, le
  même après un vrai carton rouge.

### Kop
- **Des posts plus longs** (demandé sur Discord) : un post, une réponse ou le commentaire d'une citation peut faire
  1 000 caractères, au lieu de 280. Les supporters et les comptes qui te répondent lisent ton texte en entier.

### IA
- **Plus de fournisseurs** : Mistral AI, DeepSeek, xAI (Grok) et Cerebras rejoignent la liste des réglages, avec leurs
  modèles du moment.
- **Des modèles à jour** : GPT-6 chez OpenAI (6.2 Sol par défaut, 6.2 Astra, 6.1 Terra, 6 Luna pour les tâches
  courtes), Claude Fable 5.2 chez Anthropic (Sonnet 5.5 est maintenant proposé d'office), Llama 3.3 70B chez Groq, et
  deux modèles Gemini gratuits de plus à choisir (Gemini 4 Hydrogen, 3.8 Flash). Rien ne change pour qui a déjà choisi
  son modèle.
- **La liste des modèles vient du fournisseur** : « Actualiser la liste », sous le champ Modèle, demande au fournisseur
  ses modèles du moment avec ta clé (seulement ceux qui écrivent du texte : ni image, ni voix). LifeLegend le fait aussi
  tout seul à l'ouverture des réglages, une fois par semaine, si une clé est enregistrée. Un nouveau modèle sorti après
  cette version apparaît donc sans attendre la suivante.

### Mises à jour
- **Les nouveautés à chaque mise à jour** : à la première ouverture après avoir installé une nouvelle version, une
  fenêtre montre en quelques lignes ce qui change (et toutes les versions sautées, s'il en a manqué). Elle ne s'ouvre
  qu'une fois ; « Voir les nouveautés » la rouvre dans Réglages › À propos. Une nouvelle installation ne la voit pas.

### Corrigé
- **Des matchs sans compétition** : la table des compétitions de la sauvegarde a des places vides au milieu, et
  LifeLegend s'arrêtait à la première. Dans une sauvegarde du GigaPack, 48 245 matchs sur 59 664 restaient sans
  compétition, dont tous ceux du joueur (EFL League Two) : « Mes matchs » de Scoreline était vide, et son championnat
  manquait. Même souci, moins grave, dans une sauvegarde du jeu sans modules (2 958 matchs sur 10 289). LifeLegend saute
  maintenant les places vides : Scoreline montre ses matchs, et toutes les ligues du GigaPack (405 compétitions au lieu
  de 61).
- **Les notes des matchs au dixième près** : LifeLegend lisait la note de chaque joueur sans son dernier bit et
  l'arrondissait au demi-point (5,8 dans le jeu devenait 6,0). Il la lit maintenant comme le jeu, au dixième : les 22
  notes d'un écran de fin de match tombent juste. Ça vaut pour Scoreline, tes statistiques, l'équipe type de la journée,
  les trophées et ce que racontent les journaux et les supporters. Les matchs déjà joués sont corrigés à la synchro
  suivante. Les modules qui changent le calcul des notes (comme fair_rating) sont donc suivis aussi.
- **Les effectifs dans les sauvegardes du GigaPack** : Influence montrait le joueur seul sur le terrain, sans un
  coéquipier. Dans ces sauvegardes, le numéro interne de chaque joueur de l'effectif est marqué « vide » (seul le joueur
  créé en a un), et LifeLegend arrêtait la liste à la première place « vide » : 1 839 effectifs sur 4 096 étaient vides
  ou coupés, dont celui du joueur. La liste s'arrête maintenant à la première place sans joueur. Ça rend aussi leurs
  joueurs à Scoreline, au Vestiaire, aux sélections et au suivi des transferts (sans faux transfert à la synchro
  suivante : vérifié). Rien ne change pour une sauvegarde normale ou FL Mod Studio.
- **Les écussons et logos des packs installés en fichiers libres** (le GigaPack de Matozanato, tout pack déclaré dans
  le sider.ini de Football Life) : LifeLegend ne les cherchait que dans les archives du jeu. Sur une carrière avec le
  GigaPack, 133 clubs sur 490 (dont celui du joueur) et 8 compétitions sur 56 restaient sans écusson. Les dossiers de
  Sider sont maintenant lus en premier, dans leur ordre de priorité, comme le fait le jeu ; et un écusson déjà extrait
  est relu quand un pack le remplace ou le met à jour.
- **Le logo de toutes les ligues dans Scoreline** : seules les compétitions avec un compte sur Kop avaient leur logo.
  Une ligue ajoutée par un pack (Bahreïn, Inde, Algérie, Angola…) n'a aucun club connu de LifeLegend, donc pas de
  compte, et restait sans logo (18 ligues sur 61 avec le GigaPack). Chaque compétition a maintenant le sien, même deux
  ligues au même sigle (« BPL » : Bahreïn, Bangladesh, Botswana).
- **Un compte Kop par ligue, même quand deux ligues ont le même sigle** : le pseudo inventé d'une compétition sans compte
  officiel est son sigle, et deux ligues pouvaient tomber sur le même (@SPL_officiel réunissait la Syrie et Singapour,
  22 équipes sous le nom de la Syrie). Chacune a maintenant le sien (@SyrianPL_officiel, @SingaporePL_officiel), et les
  posts déjà publiés suivent.

### Synchro
- **« Google est lent en ce moment : la synchro continue. »** Quand une étape dure bien plus que d'habitude (deux fois
  sa durée habituelle, apprise sur tes dernières synchros), la barre de progression le dit : c'est le fournisseur d'IA
  qui est lent, LifeLegend n'est pas bloqué.
- **Une IA figée ne bloque plus la synchro** : si le fournisseur ne renvoie plus rien pendant 5 minutes, LifeLegend
  coupe la requête et passe au modèle suivant (et sans modèle qui réponde, les discussions sur Kop sont sautées :
  l'édition est publiée sans elles). Avant, la synchro pouvait attendre sans fin.

Aucune requête d'IA en plus par synchro (la réponse de l'entraîneur est une requête, seulement quand tu fais la demande).

## 1.1.1 — 2026-11-16

### Corrigé
- **Les carrières faites avec FL Mod Studio et un joueur créé** : la 1.1.0 disait « la fiche de ton joueur est
  introuvable ». Le jeu donne à ce joueur un identifiant particulier (0x80000000), que LifeLegend refusait ; il est
  maintenant reconnu, avec ses matchs, ses buts et ses passes.
- **« Invalid time value » à chaque synchro** (vu sur PES 2021) : la date de la sauvegarde suit la langue du jeu
  (23/11/2021, 11/23/2021 ou 2021/11/23) et LifeLegend ne lisait que le premier format. Les trois sont lus, et sans
  date lisible la synchro prend le dernier match joué ou le début de ta carrière au lieu de planter.

### Ta blessure compte
- Blessé pendant un match, tu n'étais le sujet de personne : l'édition parlait du match et c'est tout. Maintenant, La
  Transversale consacre un article à ta blessure (le temps d'indisponibilité, les matchs que tu vas manquer), ton
  entraîneur ou le médecin du club t'écrit, le Vestiaire te souhaite un prompt rétablissement, les supporters s'inquiètent
  sur Kop, le blog en parle ; tant que tu es indisponible, personne ne t'attend au match suivant, et ton retour est
  salué. Le jeu ne dit pas de quelle blessure il s'agit : personne ne l'invente.

### Kop
- **Les emojis** : le clavier du Vestiaire (catégories, couleur de peau, récents) sous le champ de post et sous tes
  réponses.

### Mises à jour
- **Une nouvelle version ne passe plus inaperçue** : à l'ouverture, une petite fenêtre en bas à droite annonce la
  dernière version publiée sur GitHub, avec le lien pour la télécharger. « Plus tard » la ferme jusqu'à la prochaine
  ouverture ; « Ne plus me prévenir pour cette version » attend la suivante. LifeLegend ne demande à GitHub que le
  numéro de la dernière version, et la case se décoche dans Réglages › À propos.

Aucune requête d'IA en plus par synchro.

## 1.1.0 — 2026-11-16

### Ta carrière racontée autrement
- **Un rival** : un joueur de ton championnat, d'un autre club, à ta ligne, avec des chiffres proches, choisi pour la
  saison. La Transversale publie « le duel » (vos deux visages), Kop débat « lui ou toi ? », le Vestiaire en parle quand il
  brille ou joue contre vous, et Scoreline a un onglet Rival sur ta page.
- **Les derbys** (Nancy–Metz, PSG–OM, Lyon–Saint-Étienne, Liverpool–Everton, Real–Atlético, Milan–Inter… et deux clubs
  de la même ville) : l'avant-match du derby, banderoles et chants sur Kop, le Vestiaire qui le vit, le récit qui dit ce
  qu'il signifie.
- **Les retrouvailles avec un ancien club** : « le retour » dans La Transversale, un ancien coéquipier encore là-bas et
  les supporters de ton ancien club sur Kop, l'accueil selon ton passage là-bas.
- **Le joueur du mois de ton club, élu par les supporters** : un sondage du compte officiel du club chaque mois ; ta
  victoire entre au Panthéon et sur ta page Scoreline.
- **Ton chant de supporters** : quand tu deviens le chouchou (triplé, but dans un derby gagné, vote des supporters, trois
  matchs de suite avec un but), les supporters t'inventent un chant, présenté sur le blog et chanté sur Kop.
- **Les rumeurs reprises par la presse** : La Transversale reprend une piste sérieuse ou une vraie offre, et ton agent
  t'écrit pour confirmer ou démentir.
- **L'interview exclusive** : environ une fois par mois, un journaliste te demande un entretien par mail, avec quatre
  questions ; ta réponse devient un long article « L'entretien », tes mots tels quels.

### Partager et comparer
- **Partager en image** un article, un post Kop ou une carte de Scoreline : l'image est copiée, prête à coller sur X ou
  Discord, avec « LifeLegend » en petit dans un coin ; « Enregistrer » la garde en PNG.
- **Le comparateur de Scoreline** : toi contre n'importe quel joueur des grands championnats, des coupes d'Europe ou de
  tes compétitions, la saison côte à côte.

### Quand l'IA ne répond plus
- **La synchro de secours** : quand le quota gratuit du jour est épuisé, la synchro garde tout ce qui se fait sans IA
  (scores, Scoreline, posts officiels, mails) au lieu de tout perdre ; la synchro suivante rattrape les articles.

### Compatibilité
- **Les sauvegardes agrandies par des modules du jeu** (les modules Lua de FL Mod Studio, le GigaPack de Matozanato…)
  sont lues : ces modules déplacent les tables de la sauvegarde, et LifeLegend y voyait 0 match, 0 but et « rien de
  nouveau ». Il les retrouve maintenant à leur nouvelle place. Sur une sauvegarde de ce genre, LifeLegend n'écrit pas
  (Influence, réorientation d'offres) : il le dit, et rien n'est modifié.

### Langue
- **Les questions des journalistes en conférence de presse** arrivaient encore en français pour un joueur réglé dans une
  autre langue. La demande envoyée à l'IA contenait des repères français (rôles des journalistes, une règle sur le
  « vous », et des valeurs comme « extérieur », « défenseur central », « à 19h (le soir) », la forme « VVNDV ») : tout
  part maintenant dans la langue de l'IA, pour toutes les demandes.

Aucune requête d'IA en plus par synchro ; seule l'interview en utilise une, quand tu y réponds (à la place de la réponse
au mail). Une édition a au plus deux articles spéciaux sur ton club (derby, retrouvailles, rumeur, duel), pour garder la
place des éditos.

## 1.0.1 — 2026-11-14

### Langue
- **Les textes de l'IA restent dans la langue choisie.** Réglé en anglais (ou dans une autre langue que le français),
  des articles, des posts Kop, des réponses ou le Vestiaire pouvaient revenir en français, surtout après quelques
  échanges. La consigne de langue accompagne maintenant chaque requête, les indications données à l'IA ne sont plus en
  français, et une réponse revenue en français est redemandée une fois (une requête de plus, seulement dans ce cas). La
  dictée vocale ne traduit plus en français.

### La Transversale
- **Deux éditos par édition**, sur deux championnats différents : ceux dont le journal n'a pas parlé depuis le plus
  longtemps (le tien compris), avec un sujet qui change (titre, places européennes, maintien, buteurs). Chaque édito
  entre dans la rubrique de son championnat.
- **Nouvelles vignettes** : fond sobre, liseré aux couleurs des clubs, score dans un cadre net (plus d'écussons floutés).
- **La vignette d'un joueur refaite** : son visage net, l'écusson de son club en filigrane et, sur les grandes
  vignettes, son nom en titre.

### Réglages
- **Vérifier les mises à jour** (Réglages › À propos) : LifeLegend regarde la dernière version publiée sur sa page
  GitHub, seulement quand tu cliques.

## 1.0.0 — 2026-11-10 · première version publique

### Deux sites renommés
- **MailBox devient Mails** et **Huddle devient Vestiaire**, partout, textes déjà écrits compris.

### La Transversale
- **Un journal du football mondial** : une rubrique par compétition, le football ailleurs (grands championnats,
  coupes d'Europe), et chaque édition un article sur la vie d'un championnat (course au titre, maintien, buteurs).
- **Le fil du mercato** : tous les transferts lus dans la sauvegarde, par jour, avec filtres et récapitulatif par club.
- **Le classement de puissance** des grands championnats, et **les équipes types du mois et de la saison**.
- **Le footballeur de l'année du jeu**, lu dans la sauvegarde.
- **Plus de vie autour des matchs** : la conférence de presse à chaque match de ton club, un article d'après-match qui
  tourne (analyse tactique, « Le Débrief », regard du consultant), la conférence d'avant-match ; deux résumés de
  matchs du monde au plus par édition, les autres compétitions dans un article commun.
- Les règles du journal sont vérifiées par le code (ordre des buts, scènes inventées, noms) avant publication.

### Kop
- **Plus de monde et plus de vie** : consultants, compte de mèmes (Héros du Gazon), deuxième journaliste, supporters
  qui racontent leur déplacement ; prénoms du pays du club de chaque compte ; le football mondial et les tendances du
  mercato dans les tendances.
- **Les sondages** : 2 à 4 choix, les supporters votent.

### Vestiaire
- **Un vrai vestiaire** : ceux qui ont marqué ou brillé parlent, chacun avec sa façon d'écrire ; un sujet de vie de
  vestiaire à chaque édition ; l'heure des messages et des réactions emoji. Les joueurs parlent librement de leurs
  jeux vidéo et de leurs crampons.

### Mails
- **Négocier avec ton agent** : trois questions toutes prêtes sous son mail quand une offre attend dans le jeu.
- **Objectifs personnels** fixés par ton entraîneur en début de saison et à ton retour de blessure, suivis dans ta
  sauvegarde, avec un bilan en fin de championnat (onglet « Objectifs » du Dossier de carrière).
- **Relation avec le club** : ce que tu dis de ton coach, de tes coéquipiers et de ton club en conférence de presse, sur
  Kop et dans le Vestiaire compte. Rappel à l'ordre, puis une ambiance de plus en plus tendue (onglet « Relation »). Aucune
  sanction n'est encore écrite dans le jeu.
- **Influence** : la formation obtenue de ton entraîneur, écrite dans ta sauvegarde, est vérifiée dans Football Life 2027
  (le plan de jeu l'affiche et le match la joue) ; le transfert reste expérimental.

### Interface
- **Thème sombre partout**, et les **couleurs du thème au choix** (cinq palettes et un nuancier) dans Réglages ›
  Apparence. Nouvelle page Réglages.
- **Vignettes d'articles cohérentes** : ton visage quand l'article parle d'abord de toi.
- **Logos des compétitions** : les vrais logos de Football Life sont gardés.
- **Signaler un problème** (Réglages › À propos) : un fichier texte à relire puis envoyer soi-même, sans clé d'IA,
  adresse e-mail ni textes personnels.
- Réglages simplifiés : « Biographie » et « Ma vie » deviennent « Ton histoire ».
- **Noms des sites en capitales** (LA TRANSVERSALE., KOP., MAILS.…), avec un point de la couleur du site ; l'onglet du
  haut ne répète plus le nom. **Barre de navigation noire.**
- **Scoreline a un vrai thème clair**, et la **frise de tes matchs** (écusson, note, buts ; un clic affiche le match)
  remplace le terrain des postes quand tu joues à un seul poste.
- **Animation d'ouverture** au tout premier lancement, à revoir dans Réglages › À propos (réalisée avec Profounder).
- **Premier lancement** : pendant les étapes de démarrage, le bouton de synchro ramène aux étapes au lieu d'échouer.

### Corrections et sécurité
- **Kop** : les discussions sous les posts disparaissaient quand l'IA inventait un compte.
- **Écriture dans la sauvegarde** : si Windows ne dit pas si le jeu est ouvert, LifeLegend n'écrit plus rien.

## 1.0.0-beta.2 — 2026-11-05 · version testeurs

### Corrections
- **Changement automatique de modèle** : avec Google, LifeLegend n'essayait que deux modèles et affichait ensuite l'erreur
  du premier, comme si aucun autre n'avait été tenté. Il essaie maintenant cinq modèles gratuits et dit combien ont répondu non.
- **Quota du jour épuisé** : ce n'est plus présenté comme un souci passager. Le message dit que le quota se renouvelle
  chaque jour et mène aux réglages de l'IA.

## 1.0.0-beta.1 — 2026-11-05 · version testeurs

### Nouvelle interface
- **Tout est refait, site par site** : La Transversale, L'Écho des Chardons, Kop, MailBox, Huddle, Scoreline et Panthéon,
  dans un même cadre avec le menu à gauche. Le bouton doré lance la synchro.
- **Charte commune** : noir et or, une seule police (Manrope), mêmes tailles, arrondis et boutons partout. En thème clair,
  le blanc est adouci.
- **MailBox** : nouvelle boîte de réception, Dossier de carrière et Influence.
- **Visages** : les joueurs et les entraîneurs ont leur visage, lu dans le jeu du joueur.
- **Offres d'équipementier** : les marques du jeu proposent un contrat dans MailBox, sans requête à l'IA lors de la synchro.

### Corrections
- **« de Ilan », « de AS Nancy »** : les textes français écrivent maintenant « d’Ilan Morel », « de l’AS Nancy Lorraine »
  et « du FC Metz », dans l'interface comme dans les posts automatiques.
- **Écriture dans la sauvegarde pendant que le jeu tourne** : le contrôle « le jeu est ouvert » ne reconnaissait que
  `PES2021.exe`. Il reconnaît maintenant Football Life (`FL_2027.exe`…).
- **Football Life 2027 partout** : le premier écran, les réglages, les messages, les consignes à l'IA et les modes
  d'emploi parlent du bon jeu et du bon dossier (`Documents\SPGAME\Football Life\2027\save`). Les vidéos de Football
  Life dans le dossier des captures sont reconnues.

### Nouveautés
- **Rubrique « Compétitions » dans La Transversale** : une entrée dans le menu du journal et une section sur la une,
  pour chaque compétition de son club : le classement, les derniers résultats, les prochains matchs et les articles qui
  racontent la compétition entière.
- **Sauvegarde verrouillée** : sans la clé de Football Life 2027, LifeLegend le dit clairement, à la première ouverture
  comme dans les réglages : ce qui manque, un bouton vers la page de PES Smoke Patch où la télécharger, et un autre pour
  l'ajouter. Si la clé n'ouvre pas la
  sauvegarde, il le dit aussi, et une synchro qui échoue pour cette raison mène directement au bon réglage.
- **Huddle**, le groupe de discussion privé de son club, un nouveau site dans le menu du haut : les joueurs de
  l'effectif, l'entraîneur et un staff inventé (adjoint, préparateur physique, kiné, intendant), toujours le même pour
  un club. Les arrivées et les départs s'affichent d'après la sauvegarde, et l'intendant annonce le prochain match, sans
  IA. Chaque édition y ajoute quelques messages, dans sa requête habituelle et relus par la vérification des faits. Il
  peut écrire dans le groupe : un à trois membres répondent, au modèle léger, avec une requête seulement à ce moment-là.
  Rien de ce qui s'y dit ne part vers la presse ni vers Kop. Quand il change de club, il quitte le groupe et rejoint
  celui du nouveau club ; l'ancien reste à relire. Convoqué en sélection, il rejoint aussi le groupe de sa sélection
  (joueurs de la liste, sélectionneur, staff), qui parle quand la sélection fait l'actualité. Hors de la liste, il en
  sort ; rappelé, il y revient.
- **La Transversale suit aussi les compétitions**, plus seulement le joueur et son club. Chaque article a maintenant
  son point de vue : son club et lui, ou la compétition tout entière, où les autres clubs sont les personnages. Nouveau
  rendez-vous, **« Le tour des terrains »**, tenu par une nouvelle plume de la rédaction (Nadia Castelli, rubrique
  compétitions) : la dernière journée de championnat de terrain en terrain, la coupe qui vient de se jouer, ou la
  prochaine journée avant un match. Le code calcule ce qui fait l'actualité (course au titre, relégation, séries,
  plus gros score, surprise, affiche à venir) et donne son sujet à la chronique, à tour de rôle. Une relecture renvoie
  un de ces articles s'il cite trop peu d'autres clubs ou revient sans cesse au sien. Après un match, l'analyse
  tactique entre dans la rotation du quatrième article. Aucune requête ni aucun mot de plus par édition.
- **Fenêtre de configuration** à la première ouverture : sa sauvegarde (le joueur déjà créé dans le jeu et sauvegardé),
  sa clé d'IA, puis, s'il veut, le choix entre un joueur créé et un joueur réel, et la **biographie** de son joueur (sauf joueur réel). Elle part dans la première synchro, sans requête de plus : la presse
  le présente ainsi dès la première édition, La Transversale fait son portrait et Panthéon en tire le premier chapitre
  de sa page. Si la synchro échoue, elle est gardée pour la tentative suivante. Une nouvelle carrière choisie plus tard
  repasse par cette étape, et la biographie reste modifiable (Réglages, ou « modifier » dans Panthéon).
- **Messages privés sur Kop** : une entrée « Messages » et un bouton enveloppe sur les profils, pour écrire à ses
  coéquipiers et aux supporters vus sur Kop (pas à la presse ni aux comptes officiels). L'IA répond seulement quand il
  écrit, au modèle léger, sans le dossier de l'agent : un coéquipier ne sait rien de ses négociations, un supporter ne
  sait que ce qui est public. Après un match, un message peut aussi arriver tout seul (un but, une passe décisive, une
  défaite où il a été mauvais), écrit sans IA, un tous les 14 jours au plus. Rien de ce qui se dit là ne part dans
  l'édition. Si la réponse échoue, « Réessayer » la redemande sans renvoyer son message.
- **Conseils du coach à l'entraînement** dans MailBox : au plus un par mois, quand ses derniers matchs et son programme
  montrent un point faible (la finition d'un attaquant qui ne marque plus, l'endurance s'il sort tôt, les passes d'un
  milieu sans passe décisive, le repli d'un défenseur si l'équipe encaisse, le domaine clé de son poste si ses notes
  baissent, l'endurance si sa forme chute). Pas de reproche s'il vole, à 7,5 de moyenne ou plus. Il répond « Suivre son conseil » ou « Pas
  cette fois », et c'est la sauvegarde qui tranche : si la barre monte dans les 3 semaines, le conseil est suivi, sinon
  non, même s'il avait dit oui. La presse et le vestiaire peuvent en parler. Aucune requête de plus à l'IA.
- **« Le Débrief »**, l'émission de débat d'après-match de La Transversale : la transcription du plateau (l'animateur,
  deux ou trois consultants et un invité du jour, tous inventés, jamais de vraies personnes), une intervention par paragraphe avec le nom en
  gras. Après un match, le quatrième article de l'édition tourne entre le regard du consultant, l'édito et le débat,
  dans la même requête que les autres articles.
- **Rumeurs mercato** sur Kop : trois comptes « insider » (Mercato Secret, Inside Football, The Scoop) parlent de lui,
  avec une étiquette de fiabilité fixée d'après la sauvegarde : « Très fiable » pour une vraie offre en cours,
  « Piste sérieuse » pour un club qui le suit vraiment (liste cachée du jeu), « Invérifiable » pour une spéculation
  près du mercato. L'étiquette passe à « Officiel » s'il signe dans ce club, à « Démenti » quand le mercato ferme
  sans ce transfert, et la presse s'en souvient. Une rumeur au plus par édition, sans requête de plus à l'IA.
- **Sélection nationale** : quand sa sélection joue dans les 14 jours et qu'il n'est pas dans le groupe, la presse et
  les comptes « insider » de Kop se demandent s'il sera appelé (une fois par match) ; chaque nouvelle liste est
  annoncée par le compte officiel de la sélection sur Kop, lui en tête s'il y est, et la presse réagit (convocation
  ou oubli). La toute première convocation, qui n'était pas repérée quand il n'avait encore aucune sélection, l'est
  maintenant et ouvre un chapitre du Panthéon.
- **Bilan de saison** : quand son championnat se termine, La Transversale sort un numéro spécial (bandeau sur la
  une) : la saison du championnat, la saison en chiffres et les trophées, l'édito de la saison, la saison de son club
  et la sienne avec sa note. Le bilan de Scoreline devient une rétrospective : son meilleur match, ses matchs mois
  par mois, les trophées du championnat et l'équipe type de la saison.
- **Notoriété** (Scoreline › Joueur) : ses abonnés Kop, sa valeur marchande (quand la sauvegarde la donne) et son image
  dans la presse sur 100 au fil des synchros, en courbes avec infobulle. Elle est calculée sans IA : la place que les
  journaux lui donnent (articles de leurs 3 dernières éditions), sa forme (notes des 5 derniers matchs), ses buts et passes, ses titularisations et l'humeur des supporters à son égard.
- **Récompenses**, calculées sur les notes du jeu (aucune IA) : l'équipe type de chaque journée de son championnat
  (en 4-3-3) et son joueur de la journée, publiés par le compte officiel du championnat sur Kop ; le classement des
  meilleurs joueurs à la note moyenne (Scoreline › Compétitions › Meilleurs joueurs) ; en fin de saison, les trophées
  (meilleur joueur, buteur, passeur, gardien, équipe type de la saison). Scoreline montre l'équipe type de la dernière
  journée ; la presse en parle quand il y figure ; le Panthéon garde ses distinctions individuelles.
- **Panthéon**, l'encyclopédie de ce monde : la page du joueur, comme dans une encyclopédie en ligne. Infobox (âge,
  taille, pied, poste, club, arrivée, contrat, valeur, sélection, parcours en club), sommaire, statistiques par saison,
  club et compétition avec le total de carrière, palmarès, et les derniers articles qui parlent de lui (un clic ouvre
  l'article). La biographie avance par chapitres, écrits par l'édition seulement quand la carrière a un vrai événement
  (ses débuts, premier match ou premier but dans un club, transfert, prolongation, trophée, palier, fin de saison) et
  relus par la vérification des faits : aucune requête de plus à l'IA.
- **SP Football Life 2027** : le jeu est trouvé tout seul (installé dans `C:\Games`, `C:\Program Files`…), avec sa base
  de joueurs et ses écussons ; ses carrières sont cherchées dans `Documents\SPGAME\Football Life\2027\save`, son
  nouveau dossier de sauvegardes. Football Life 2027 chiffre ses sauvegardes avec sa propre clé : LifeLegend ne la
  fournit pas, le joueur l'ajoute dans Réglages › Sauvegarde (« Ajouter une clé de sauvegarde… », un fichier de
  64 octets, gardé sur son PC). Une sauvegarde réécrite par LifeLegend garde la clé de son jeu. Sans la clé, la
  carrière apparaît comme illisible, avec la marche à suivre. Vérifié sur une copie d'une carrière Football Life 2027 :
  lecture complète, 100 % des joueurs reconnus, une synchro entière, réécriture identique à l'octet près.
- **Influence** (MailBox › Carrière › Influence) : une jauge de 0 à 100 calculée sur la sauvegarde (titularisations
  depuis l'arrivée au club, forme, ancienneté, rôle d'équipe du jeu, bilan des demandes), et des demandes avec leurs
  chances : changer le plan de jeu (à l'entraîneur), recommander une recrue, demander un départ, retenir un
  coéquipier, parler de son avenir (à la direction sportive). L'app décide, la réponse arrive dans MailBox (écrite
  par l'IA, ou toute prête sans IA), et la presse et Kop remarquent les effets sans révéler les demandes privées.
- **Effets réels dans le jeu** (expérimental, désactivé par défaut : Réglages › Ta sauvegarde) : une formation
  acceptée s'écrit tout de suite dans la sauvegarde (tactiques du club et de l'entraîneur) ; un transfert accepté
  attend l'ouverture du mercato, comme dans le jeu (effectifs, numéros de maillot et nombre de joueurs des deux
  clubs). Jeu fermé, copie de sécurité, relecture ; à la synchro suivante, LifeLegend vérifie que le jeu a gardé la
  décision. Vérifié en jeu sur la carrière de référence (le 4-4-2 joué et gardé, une recrue dans l'effectif), puis
  sur une nouvelle carrière (une recrue gardée par les sauvegardes du jeu, un match et dix jours plus tard). Le
  transfert s'accompagne du message du jeu : « Arrivée d'un nouveau » pour une recrue, « Départ d'un joueur » pour un
  coéquipier qui part. « Infos marché transferts » reste celui du jeu, qui choisit seul les transferts qu'il y montre.
- **Recommander une recrue par poste** : on choisit le poste à renforcer (poste officiel du jeu, lu dans sa base) ;
  LifeLegend dit combien le club a de joueurs à ce poste et propose ceux qui sont à portée, avec leurs chances. Un
  poste où le club manque de monde rend la recrue plus facile à obtenir, un poste déjà fourni la rend plus difficile.
  En début de saison (moins de 3 matchs joués par son club), le temps de jeu d'un joueur ne compte pas encore, et
  quand aucune recrue n'a de bonnes chances, les meilleures sont proposées quand même plutôt qu'une liste vide.
- **Entraînement** (Scoreline › Joueur) : les réglages de l'écran Entraînement du jeu, lus dans la sauvegarde
  (points par domaine sur 6, geste technique et nouveau poste en cours, points restants). Les rédacteurs en parlent
  de temps en temps, et le jour où le geste travaillé est appris, c'est une édition. Les 41 gestes du jeu portent le
  nom que leur donne le jeu, dans chaque langue, et les 13 postes aussi (d'Avant-centre à Gardien, dans l'ordre de la
  fiche du joueur ; vérifié en jeu sur Second attaquant et Milieu offensif).
- Formations proposées tirées de la base du jeu, sous le nom qu'affiche le plan de jeu (« 4-2-2-2 », avec le nom
  courant « ≈ 4-4-2 » quand il diffère).

### Changements
- **Réponses plus légères dans Huddle et les messages privés** : elles n'envoient plus le détail des matchs des autres
  clubs ni les comptes officiels, soit à peu près deux fois moins de faits à chaque réponse. Le quota dure plus longtemps.
- **La Transversale** : des articles de longueurs variées dans chaque édition, au lieu de quatre longues lectures.
  Une longue lecture (environ 4 min, le récit du match ou la chronique) ; la conférence de presse et l'analyse
  tactique en format moyen (environ 2 min), même en ouverture ; les autres en formats moyens et brèves (environ
  1 min), en alternance d'une édition à l'autre. Presque deux fois moins de texte à écrire : la synchronisation est
  plus rapide.
- **Moins de requêtes à l'IA par synchronisation** (le quota gratuit de Gemini est de 20 par jour) : un article n'est
  plus renvoyé à son auteur pour quelques mots de moins (il passe à 60 % de son format) ; les articles à reprendre
  (clichés, copie, ouverture interdite, vraiment trop courts) partent ensemble, en une seule requête au lieu d'une par
  article.
- **Échap revient d'un cran**, comme dans le jeu : elle ferme l'article de La Transversale ou du blog, la conférence
  de presse, le post ou le profil de Kop (et ses menus), Influence et le dossier de MailBox, le match déplié de
  Scoreline. Jamais en pleine saisie ni dans une fenêtre ouverte.
- **Erreurs de synchro guidées** : le message dit quoi faire et propose le bon bouton (« Ma sauvegarde », « Réglages
  de l'IA », « Réessayer ») : sauvegarde introuvable ou illisible, clé ou modèle d'IA refusés, quota gratuit du jour
  épuisé (plus de nouvel essai automatique toutes les 3 minutes, inutile jusqu'au lendemain), sauvegarde en cours
  d'écriture par le jeu, erreur passagère. Une sauvegarde déplacée ou supprimée donne « Sauvegarde introuvable » au
  lieu de l'erreur brute de Windows.
- **Synchronisation allégée** : La Transversale et l'édition (blog, Kop, mails) s'écrivent en même temps (l'édition
  connaît le plan des articles du jour, auteurs et sujets, sans attendre leur texte) ; les discussions sur Kop passent
  au modèle léger du fournisseur (gemini-3.5-flash-lite, Claude Haiku, GPT mini…), la vérification des faits reste au
  modèle choisi. Une édition demande 3 requêtes au modèle choisi au lieu de 4 ou 5 (plus une s'il faut reprendre des
  articles), et dure environ deux fois moins longtemps. Quand le quota du jour d'un modèle est épuisé, le suivant
  répond directement pendant une heure, sans le redemander à chaque étape.
- Le journal de la synchronisation donne la durée de chaque étape (lecture de la sauvegarde, La Transversale et ses
  reprises, édition, vérification des faits, discussions sur Kop, enregistrement) et le modèle d'IA qui a répondu
  (celui de secours quand le premier est saturé), aussi notés dans `activity.log`.

## 0.9.0 — 2026-10-21 · première bêta

Première version distribuée, à des testeurs.

### Nouveautés
- **Six langues** : français, English, español, italiano, português (Brasil), Deutsch. Un seul réglage « Langue »,
  en tête des Réglages, pour l'interface et pour tout ce que l'IA écrit. Les posts écrits sans IA (comptes officiels
  des clubs et des compétitions, ralentis, réponses types des joueurs), les promesses, le brief du matin, les
  fenêtres de Windows, les notifications et les messages d'erreur suivent aussi la langue. Ce qui est déjà publié
  reste dans sa langue d'origine.
- **Interface LifeLegend** (charte « Or et nuit », polices Mona Sans et Newsreader, icônes Heroicons) : La
  Transversale, le blog des supporters, Kop, MailBox, Scoreline, Réglages.
- **Scoreline** : la saison du joueur sur tous ses clubs après un transfert (statistiques, graphiques avec le repère
  du transfert, matchs avec l'ancien club).
- **MailBox** : les fils d'avant un transfert gardent l'identité de l'ancien club ; l'agent écrit moins souvent,
  seulement quand il a du nouveau ; objets de mails plus variés.
- Section « À propos » dans les Réglages (version, avertissement, licences).
- Nouvelle icône : le logo LifeLegend sur deux lignes, LIFE au-dessus de LEGEND, lisible jusqu’en petit (fenêtre,
  raccourci, `LifeLegend.exe`), générée par `npm run icons`.

### Changements
- La **réorientation d'offres** (l'agent fait passer une vraie offre au nom d'un autre club en modifiant la
  sauvegarde) devient **facultative et désactivée par défaut**, signalée comme expérimentale
  (Réglages › Ta sauvegarde). Sans elle, LifeLegend ne fait que lire la sauvegarde.
- Avertissement sur les vraies personnes : à l'accueil, dans « À propos », en pied de page de La Transversale et de
  Kop, et dans les notices.
- Kop : « Se désabonner » devient « Ne plus suivre » (« Se désabonner » reste pour la newsletter).

### Licences
- LifeLegend est publié sous licence MIT (`LICENSE`).
- `THIRD-PARTY-NOTICES.txt` liste les polices (OFL), icônes et mises en page reprises (MIT), données Wikidata (CC0),
  Electron et les dépendances, avec leurs licences.

### Distribution
- Dossier portable pour Windows (`npm run dist`) : `LifeLegend.exe`, sans installation, avec un mode d'emploi en
  français (`LISEZMOI.txt`) et en anglais (`README.txt`), et une fiche pour les bêta-testeurs (`BETA.txt`).
- Tests dans le projet (`npm test`, voir `tests/README.md`).

### Limites connues
- Testé surtout sur PES 2021 de base avec Google AI Studio (Gemini) ; Football Life et les autres fournisseurs d'IA
  sont moins éprouvés.
- `LifeLegend.exe` n'est pas signé (avertissement de Windows au premier lancement).
- Les journalistes et le journal national gardent leurs noms français dans toutes les langues.

## Avant la 0.9.0

Développement sous les noms LiveTweet puis LegendLife (interface archivée), versions 0.1.x non distribuées.

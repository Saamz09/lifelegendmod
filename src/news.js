'use strict';
// Les nouveautés montrées une fois après une mise à jour (demandé le 2026-11-23) : quelques points par version, ceux
// qui changent quelque chose pour le joueur, en français. Ils sont traduits par les dictionnaires de l'interface
// (lifelegend/i18n, vérifié par tests/news.test.js). Le détail complet reste dans CHANGELOG.md. À écrire à chaque version
// publiée, la plus récente en premier. icon : une icône de l'interface (HI dans lifelegend/app.js).

const { compareVersions } = require('./update');

const NEWS = [
  {
    version: '1.2.0',
    items: [
      { icon: 'clipboard', title: 'Propose ton style de jeu à ton entraîneur', text: 'Dans Influence, propose-lui d’autres consignes : style offensif, construction, pressing… S’il accepte, LifeLegend les écrit dans ta sauvegarde et le plan de jeu les affiche quand tu relances le jeu.' },
      { icon: 'shieldCheck', title: 'Le GigaPack mieux pris en charge', text: 'Effectifs complets, écussons des clubs, logos de toutes les ligues et un compte Kop par ligue. Le style de jeu et les sanctions de ton club s’écrivent aussi dans ces sauvegardes.' },
      { icon: 'flag', title: 'Les sanctions de ton club comptent dans le jeu', text: 'Si ton club te met à l’écart pour tes propos, un bouton de Mails écrit ta suspension dans ta sauvegarde (1 ou 2 matchs), comme après un carton rouge. Le jeu l’affiche dans l’écran Composition et décompte les matchs tout seul.' },
      { icon: 'bars', title: 'Scoreline plus juste', text: 'Les notes sont au dixième près, comme dans le jeu (5,8 au lieu de 6,0). Dans le GigaPack, tous tes matchs et toutes les ligues apparaissent enfin.' },
      { icon: 'pencil', title: 'Des posts plus longs sur Kop', text: 'Jusqu’à 1 000 caractères pour un post, une réponse ou une citation, au lieu de 280.' },
      { icon: 'clock', title: 'Une synchro qui ne reste plus bloquée', text: 'Quand l’IA est lente, la barre de progression le dit. Si elle ne répond plus pendant 5 minutes, LifeLegend passe au modèle suivant au lieu d’attendre.' },
      { icon: 'swap', title: 'Plus de choix pour l’IA', text: 'Mistral AI, DeepSeek, xAI (Grok) et Cerebras rejoignent la liste, et LifeLegend demande à ton fournisseur ses modèles du moment : GPT-6, Claude Fable, Gemini 4…' },
      { icon: 'bell', title: 'Cet écran', text: 'À chaque mise à jour, LifeLegend te montre ses nouveautés. Tu les retrouves dans Réglages › À propos.' },
    ],
  },
];

// Ce qu'il faut montrer à l'ouverture. seen : la dernière version dont il a vu les nouveautés (réglage newsSeen).
// returning : il utilisait déjà LifeLegend (une sauvegarde choisie). Sans seen, une nouvelle installation ne voit rien ;
// un joueur qui vient d'une version d'avant cet écran voit celles de la version installée. Rend { show, last } : show,
// les versions pas encore vues jusqu'à celle installée (la plus récente d'abord) ; last, les nouveautés de la version
// installée ou de la dernière avant elle (pour les revoir dans les réglages), ou null.
function whatsNew({ seen = '', current, returning = false, news = NEWS }) {
  const upTo = news.filter((n) => compareVersions(n.version, current) <= 0).sort((a, b) => compareVersions(b.version, a.version));
  let show;
  if (seen) show = upTo.filter((n) => compareVersions(n.version, seen) > 0);
  else show = returning ? upTo.filter((n) => compareVersions(n.version, current) === 0) : [];
  return { show, last: upTo[0] || null };
}

module.exports = { NEWS, whatsNew };

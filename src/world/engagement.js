'use strict';
// Likes et reposts des messages de Kop, comme sur un vrai réseau : ils suivent les abonnés du compte (même échelle
// que l'interface) et l'importance du moment, avec une vraie dispersion : beaucoup de petits chiffres, quelques posts
// qui partent en viral. Un supporter à 700 abonnés fait quelques likes ; le club à 584 294 abonnés, des milliers.

// Abonnés par type de compte : ordre de grandeur stable tiré du pseudo (lifelegend/app.js, ACCOUNT_SCALE, le même).
const ACCOUNT_SCALE = {
  national: [80000, 7000000], competition: [150000, 9000000], club: [60000, 2500000], player: [20000, 3000000], coach: [10000, 800000],
  journalist: [6000, 150000], pundit: [20000, 600000], stats: [30000, 900000], meme: [20000, 700000], highlights: [50000, 1500000],
  betting: [8000, 120000], rival: [80, 6000], fan: [60, 9000],
};
function hashOf(str) {
  let h = 2166136261;
  for (const c of String(str).toLowerCase()) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

// Abonnés d'un compte : le joueur (son profil), un club calé sur le jeu (fiche du club), sinon l'échelle du type.
function followersOf(author, state = null) {
  if (author.isMe) return state?.profile?.followers || 1000;
  const page = author.type === 'club' ? state?.clubPages?.[String(author.handle).toLowerCase()] : null;
  if (Number.isFinite(page?.followers)) return page.followers;
  const [lo, hi] = ACCOUNT_SCALE[author.type] || ACCOUNT_SCALE.fan;
  return Math.round(lo * (hi / lo) ** ((hashOf(author.handle) % 10007) / 10007));
}

// Tirage log-normal de médiane 1 : la dispersion d'un vrai fil.
const lognormal = (sigma) => Math.exp(sigma * Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random()));

// Likes d'un post. weight = importance du moment (1 = post ordinaire ; son but, une signature : plus).
// Les vraies personnes (lui, joueurs, coachs) touchent une plus grande part de leurs abonnés que les autres comptes.
function postLikes(author, state, weight = 1) {
  const rate = author.isMe ? 0.3 : author.type === 'player' || author.type === 'coach' ? 0.08 : 0.025;
  const followers = followersOf(author, state);
  let likes = followers ** 0.85 * rate * weight * lognormal(0.8);
  if (Math.random() < 0.04) likes *= 4 + Math.random() * 6; // de temps en temps, un post qui part en viral
  return Math.round(Math.min(likes, followers * (author.isMe ? 0.5 : 0.2) + 20));
}
const repostsFor = (likes) => Math.round(likes * (0.04 + Math.random() * 0.12));

// Likes d'une réponse : une petite part de ceux du post, plus ce que son propre public lui donne ; la plupart en ont peu.
function replyLikes(author, parentLikes, state) {
  const own = followersOf(author, state) ** 0.85 * (author.isMe ? 0.05 : 0.008);
  return Math.round(((parentLikes || 0) * 0.015 + own) * lognormal(1));
}

module.exports = { ACCOUNT_SCALE, followersOf, postLikes, repostsFor, replyLikes };

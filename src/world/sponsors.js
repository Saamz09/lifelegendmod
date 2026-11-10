'use strict';
// Contrats d'équipementier, sans IA : quand ses matchs le justifient, une marque du jeu (src/save/boots.js) lui écrit dans Mails,
// directement ou par son agent. Il accepte, refuse, ou demande à son agent de négocier une fois. Une offre à la fois, un contrat à
// la fois ; les primes se comptent d'après ses matchs. Tout reste dans LifeLegend : le jeu ne sait rien de ces contrats, et
// LifeLegend ne change ni ne vérifie les crampons qu'il porte.

const { LOCALES } = require('./postTexts');
const { sponsorTexts } = require('./sponsorTexts');

const OFFER_DAYS = 30, COOLDOWN_DAYS = 60, BRAND_PAUSE_DAYS = 365;
const MIN_APPS = 3, MIN_RATING = 6, MIN_INVOLVED = 2;
const RISING = 100000, STAR = 1000000; // abonnés sur Kop
const RATES = { starter: [0.04, 0.08], rising: [0.08, 0.14], star: [0.12, 0.2] };
const MIN_FEE = 5000;
// Les interlocuteurs sont inventés : ils ne parlent qu'au nom de ce contrat de fiction.
const PEOPLE = ['Clara Weiss', 'Marco Ferri', 'Elena Duarte', 'Tom Hartley', 'Inès Moreau', 'Jonas Keller', 'Sofia Marin', 'Daniel Reyes'];

const days = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function hash(str) { let h = 7; for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }
const round = (n, step) => Math.max(step, Math.round(n / step) * step);

function ensureSponsor(state) {
  if (!state.sponsor) state.sponsor = { offer: null, deal: null, history: [], news: null, closedOn: null };
  return state.sponsor;
}

// Ses matchs attirent-ils une marque ?
function eligible(snapshot) {
  const t = snapshot.stats?.total;
  return Boolean(t && t.apps >= MIN_APPS && (t.avgRating >= MIN_RATING || (t.goals || 0) + (t.assists || 0) >= MIN_INVOLVED));
}
const tierOf = (followers) => (followers >= STAR ? 'star' : followers >= RISING ? 'rising' : 'starter');

// Les marques à sa portée. Pas de liste de marques ici : c'est la table du jeu qui les donne, les plus représentées étant les plus
// grandes. Une marque qu'il a refusée attend un an.
function brandPool(catalog, tier, history, today) {
  const count = new Map();
  for (const b of catalog) count.set(b.brand, (count.get(b.brand) || 0) + 1);
  const ranked = [...count.keys()].sort((a, b) => count.get(b) - count.get(a) || a.localeCompare(b));
  const pause = new Set(history.filter((h) => h.status === 'declined' && days(h.on, today) < BRAND_PAUSE_DAYS).map((h) => h.brand));
  const open = ranked.filter((b) => !pause.has(b));
  const pool = (tier === 'star' ? ranked.slice(0, 3) : tier === 'rising' ? ranked.slice(1, 5) : ranked.slice(2)).filter((b) => !pause.has(b));
  return pool.length ? pool : open;
}

// Fin de contrat : le 30 juin de la dernière saison.
function seasonEnd(today, seasons) {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  return `${(m >= 7 ? y + 1 : y) + seasons - 1}-06-30`;
}

function makeOffer(state, snapshot, catalog, newId, hasAgent) {
  const today = snapshot.gameDate, sp = state.sponsor;
  const tier = tierOf(state.profile?.followers || 0);
  const pool = brandPool(catalog, tier, sp.history, today);
  if (!pool.length) return null;
  const key = `${state.careerId || snapshot.player?.id}|${today}`;
  const brand = pool[hash(`${key}|marque`) % pool.length];
  // Parmi ses modèles les plus récents (les plus grands numéros).
  const models = catalog.filter((b) => b.brand === brand).map((b) => b.id).sort((a, b) => a - b);
  const recent = models.slice(Math.floor(models.length / 2));
  const bootId = recent[hash(`${key}|modèle`) % recent.length];
  const [lo, hi] = RATES[tier];
  const rate = lo + ((hash(`${key}|montant`) % 100) / 100) * (hi - lo);
  const salary = snapshot.player?.salary || 0;
  const fee = round(Math.max(MIN_FEE, salary * rate), 500);
  const seasons = tier === 'starter' ? 1 + (hash(`${key}|durée`) % 2) : 2 + (hash(`${key}|durée`) % 2);
  // Les grandes marques passent par l'agent ; les autres, parfois.
  const viaAgent = hasAgent && (tier !== 'starter' || hash(`${key}|voie`) % 3 === 0);
  return {
    id: newId(), brand, bootId, photo: null, logo: null, person: PEOPLE[hash(`${key}|contact`) % PEOPLE.length], via: viaAgent ? 'agent' : 'direct',
    tier, fee, bonus: round(fee * 0.03, 50), seasons, until: seasonEnd(today, seasons), on: today, expires: addDays(today, OFFER_DAYS), status: 'open', negotiated: false, threadId: null,
  };
}

// Ce que les mails ont besoin de savoir, mis en forme dans la langue du joueur.
function vars(offer, snapshot, state, language) {
  const locale = LOCALES[language] || LOCALES.fr;
  const money = (n) => `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(n)} €`;
  const date = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  return {
    first: String(state.profile?.displayName || snapshot.player?.name || '').trim().split(/\s+/)[0], club: snapshot.club?.name || '', brand: offer.brand, person: offer.person,
    agent: state.agent?.name || '', fee: money(offer.fee), bonus: money(offer.bonus), until: date(offer.until), deadline: date(offer.expires || offer.until),
  };
}
const threadOf = (state, id) => (state.mail || []).find((m) => m.id === id);
function say(state, offer, text, gameDate, unread = false) {
  const t = threadOf(state, offer.threadId);
  if (!t) return;
  t.messages.push({ who: 'them', body: text, gameDate });
  if (unread) t.unread = true;
}
const closeOffer = (sp, offer, status, on) => { sp.history.push({ id: offer.id, brand: offer.brand, status, on, bootId: offer.bootId, fee: offer.fee, person: offer.person, photo: offer.photo, logo: offer.logo, threadId: offer.threadId, bonus: offer.bonus, until: offer.until, via: offer.via, seasons: offer.seasons, expires: offer.expires, tier: offer.tier, negotiated: offer.negotiated }); sp.offer = null; sp.closedOn = on; };

// À chaque synchro : compte les primes, ferme ce qui est arrivé à terme, propose un contrat si le moment s'y prête.
// Rend { mail, offer } : le mail à publier, et l'offre dont il reste à préparer les images.
function sponsorTick(state, snapshot, { language = 'fr', newId, catalog = [] }) {
  const out = { mail: null, offer: null };
  const sp = ensureSponsor(state), today = snapshot.gameDate, L = sponsorTexts(language);
  const deal = sp.deal;
  if (deal) {
    for (const f of snapshot.fixtures || []) {
      const n = f.played && f.me ? (f.me.goals || 0) + (f.me.assists || 0) : 0;
      if (n > 0 && f.date >= deal.since && !deal.counted.includes(f.id)) { deal.counted.push(f.id); deal.contributions += n; }
    }
    if (today >= deal.until) {
      say(state, deal, L.ended[deal.via](vars(deal, snapshot, state, language)), today, true);
      sp.history.push({ ...deal, status: 'ended', on: today });
      sp.deal = null;
      sp.closedOn = today;
      sp.news = { kind: 'ended', brand: deal.brand };
    }
  }
  if (sp.offer && today >= sp.offer.expires) {
    say(state, sp.offer, L.lapsed[sp.offer.via](vars(sp.offer, snapshot, state, language)), today, true);
    closeOffer(sp, sp.offer, 'lapsed', today);
  }
  if (sp.deal || sp.offer || !catalog.length || !eligible(snapshot) || (sp.closedOn && days(sp.closedOn, today) < COOLDOWN_DAYS)) return out;
  const offer = makeOffer(state, snapshot, catalog, newId, Boolean(state.agent?.name));
  if (!offer) return out;
  const v = vars(offer, snapshot, state, language);
  const via = offer.via === 'agent';
  const mail = { id: newId(), from: via ? state.agent.name : offer.person, role: via ? 'agent' : 'sponsor', org: offer.brand, club: snapshot.club?.name, subject: L.subject(v), unread: true, closed: false,
    sponsorOffer: offer.id, messages: [{ who: 'them', body: L[via ? 'agent' : 'direct'](v), gameDate: today }] };
  offer.threadId = mail.id;
  sp.offer = offer;
  out.mail = mail;
  out.offer = offer;
  return out;
}

// Sa réponse dans Mails. Ses boutons ne lui font rien dire : c'est l'autre qui répond.
function answerSponsor(state, choice, { language = 'fr', gameDate }) {
  const sp = ensureSponsor(state), offer = sp.offer;
  if (!offer || offer.status !== 'open') throw new Error('Cette offre n’attend plus de réponse.');
  if (!['accept', 'decline', 'negotiate'].includes(choice)) throw new Error('Réponse inconnue.');
  const L = sponsorTexts(language), snapshot = state.snapshot || {};
  if (choice === 'negotiate') {
    if (offer.negotiated) throw new Error('Ton agent a déjà négocié cette offre.');
    if (!state.agent?.name) throw new Error('Tu n’as pas d’agent pour négocier.');
    offer.negotiated = true;
    // Une fois sur deux ou un peu plus, la marque monte de 10 à 20 %.
    const up = hash(`${offer.id}|négo`) % 100 < 60;
    if (up) {
      const gain = 1.1 + ((hash(`${offer.id}|gain`) % 11) / 100);
      offer.fee = round(offer.fee * gain, 500);
      offer.bonus = round(offer.fee * 0.03, 50);
    }
    say(state, offer, L[up ? 'up' : 'no'][offer.via](vars(offer, snapshot, state, language)), gameDate);
    return offer;
  }
  if (choice === 'decline') {
    say(state, offer, L.declined[offer.via](vars(offer, snapshot, state, language)), gameDate);
    closeOffer(sp, offer, 'declined', gameDate);
    return null;
  }
  say(state, offer, L.accepted[offer.via](vars(offer, snapshot, state, language)), gameDate);
  sp.deal = { ...offer, status: 'signed', since: gameDate, contributions: 0, counted: [] };
  sp.offer = null;
  sp.news = { kind: 'signed', brand: offer.brand, until: offer.until };
  return sp.deal;
}

// Pour les rédactions : un fait de plus, sans requête de plus.
function sponsorFacts(state) {
  const deal = state?.sponsor?.deal;
  return deal ? { brand: deal.brand, since: deal.since, until: deal.until } : undefined;
}

module.exports = { sponsorTick, answerSponsor, sponsorFacts, ensureSponsor, eligible, tierOf, brandPool, seasonEnd };

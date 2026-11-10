'use strict';
// Rumeurs mercato sur Kop : trois comptes « insider » parlent de lui, avec un niveau de fiabilité fixé par le code
// d'après la sauvegarde. Une vraie offre en cours : « très fiable » ; un club qui le suit vraiment (liste cachée du jeu) :
// « piste sérieuse » ; rien dans la sauvegarde : « invérifiable » (l'insider spécule, et c'est affiché). Quand le mercato
// tranche, les rumeurs sont confirmées (il signe dans ce club) ou démenties (le mercato ferme sans ce transfert).
// Une rumeur au plus par édition, et pas deux fois le même club en 30 jours.

const INSIDERS = {
  unverified: { handle: 'MercatoSecret', name: 'Mercato Secret', bio: 'Les rumeurs du mercato, vérifiées ou pas.' },
  serious: { handle: 'InsideFootball', name: 'Inside Football', bio: 'Ce qui se dit dans les cellules de recrutement.' },
  reliable: { handle: 'TheScoopFC', name: 'The Scoop', bio: 'Transferts : les infos avant tout le monde.' },
};
const COOLDOWN_DAYS = 30;
const days = (a, b) => (Date.parse(b) - Date.parse(a)) / 864e5;

// Le mercato est ouvert, ou ouvre dans les 3 semaines.
const nearWindow = (s) => (s.windows || []).some((w) => s.gameDate <= w.close && days(s.gameDate, w.open) <= 21);

// La rumeur de cette édition, ou null. rand : un tirage entre 0 et 1 (déterministe dans le moteur).
function pickRumor({ state, snapshot: s, rand = Math.random }) {
  const recent = new Set((state.rumors || []).filter((r) => days(r.gameDate, s.gameDate) < COOLDOWN_DAYS).map((r) => r.club));
  const offer = (s.player.offers || []).find((o) => o.status === 'pending' && o.club && o.clubRef !== s.club.ref && !recent.has(o.club));
  if (offer) return { tier: 'reliable', club: offer.club, source: 'offer' };
  const window = nearWindow(s);
  const follower = (s.player.interests || []).find((i) => i.club && i.clubRef !== s.club.ref && !recent.has(i.club));
  if (follower && (window || rand() < 0.25)) return { tier: 'serious', club: follower.club, source: 'interest' };
  if (window && rand() < 0.35) {
    const others = (s.table || []).filter((r) => !r.mine && r.pos <= 6 && !recent.has(r.team)).map((r) => r.team);
    if (others.length) return { tier: 'unverified', club: others[Math.floor(rand() * others.length)], source: 'none' };
  }
  return null;
}

// Créneau du plan Kop pour cette rumeur : le compte de son niveau, et ce qu'il peut dire.
function rumorSlot(rumor, { known = false } = {}) {
  const who = INSIDERS[rumor.tier];
  const angle = {
    reliable: `a transfer scoop about him: ${rumor.club} has made him an offer (true; never give the salary or the contract figures). Present it as exclusive information, without exclamation marks`,
    serious: `a serious lead about him: ${rumor.club} is following him closely (true: scouts watch him). Say it is a lead, not an offer and not a done deal`,
    unverified: `an unverified transfer rumour: ${rumor.club} might be interested in him. It is pure speculation and the post says so; no figures, no "done deal"`,
  }[rumor.tier];
  return { handle: who.handle, name: who.name, type: 'journalist', ...(known ? {} : { new: true, bio_hint: who.bio }), angle, rumor };
}

// Rumeurs tranchées par cette synchro : confirmées s'il signe (ou s'engage) dans le club, démenties quand le mercato ferme
// sans ce transfert. Met à jour les posts (étiquette) et rend ce que l'édition peut raconter.
function settleRumors(state, { changes, gameDate }) {
  const to = changes.transfer?.to || changes.plannedMove?.club || null;
  const closed = changes.window?.event === 'close';
  const settled = [];
  for (const r of state.rumors || []) {
    if (r.outcome) continue;
    if (to && r.club === to) r.outcome = 'confirmed';
    else if (closed && r.gameDate >= changes.window.open && r.gameDate <= changes.window.close) r.outcome = 'denied';
    else continue;
    r.settledOn = gameDate;
    const post = (state.feed || []).find((p) => p.id === r.postId);
    if (post?.rumor) post.rumor.outcome = r.outcome;
    settled.push({ insider: `@${INSIDERS[r.tier].handle}`, club: r.club, tier: r.tier, outcome: r.outcome });
  }
  return settled;
}

// Le post publié par l'insider : étiquette de fiabilité, et la rumeur retenue pour plus tard.
function noteRumorPost(state, rumor, post, gameDate) {
  if (!post) return;
  post.rumor = { tier: rumor.tier, club: rumor.club };
  state.rumors = [...(state.rumors || []), { postId: post.id, club: rumor.club, tier: rumor.tier, source: rumor.source, gameDate, outcome: null }].slice(-100);
}

module.exports = { pickRumor, rumorSlot, settleRumors, noteRumorPost, INSIDERS };

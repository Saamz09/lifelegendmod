'use strict';
// Messages privés sur Kop : avec ses coéquipiers et les supporters, pas avec la presse ni les comptes officiels.
// L'IA ne répond que lorsqu'il écrit (comme Mails), jamais à la synchro. Ce qui arrive tout seul après un match vient
// du code, sans IA : un message tous les 14 jours au plus. Ce qui se dit ici reste privé : rien n'en part vers l'édition.

const { mentionDirectory } = require('./mentions');
const { postTexts } = require('./postTexts');

const FAN_TYPES = new Set(['fan', 'rival']);
const INBOUND_EVERY_DAYS = 14;
const MAX_MESSAGES = 200, MAX_CONTEXT = 24;
const days = (a, b) => (Date.parse(b) - Date.parse(a)) / 864e5;
const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

// Ceux à qui il peut écrire : ses coéquipiers du moment et les supporters vus sur Kop.
function dmContacts(state) {
  const out = new Map();
  const add = (e) => { const k = e.handle.toLowerCase(); if (!out.has(k)) out.set(k, e); };
  for (const e of mentionDirectory(state)) {
    if (e.kind === 'player' && e.side === 'teammate') add({ handle: e.handle, name: e.name, type: 'player', kind: 'teammate', verified: true });
  }
  const fan = (a) => {
    if (a?.handle && !a.isMe && FAN_TYPES.has(a.type) && !same(a.handle, state.profile?.handle)) add({ handle: a.handle, name: a.name || a.handle, type: a.type, kind: 'fan' });
  };
  for (const p of state.feed || []) for (const x of [p, ...(p.replies || [])]) fan(x.author);
  for (const [handle, a] of Object.entries(state.accounts || {})) fan({ handle, name: a.name, type: a.type });
  return [...out.values()];
}

const findDm = (state, handle) => (state.dms || []).find((t) => same(t.handle, handle)) || null;

// Sa conversation avec ce compte, créée au premier message s'il peut lui écrire.
function dmThread(state, handle, newId) {
  const known = findDm(state, handle);
  if (known) return known;
  const c = dmContacts(state).find((x) => same(x.handle, handle));
  if (!c) throw new Error('Ce compte ne reçoit pas de messages privés.');
  const thread = { id: newId(), ...c, unread: false, closed: false, messages: [] };
  state.dms = [...(state.dms || []), thread];
  return thread;
}

function addDmMessage(thread, who, text, gameDate) {
  thread.messages.push({ who, text, gameDate, at: Date.now() });
  thread.messages = thread.messages.slice(-MAX_MESSAGES);
  if (who === 'them') thread.unread = true;
}

// Après un match, sans IA : un coéquipier ou un supporter lui écrit quand il a marqué ou fait une passe décisive, un
// supporter déçu après une défaite où il a été mauvais. Pas de relance à qui attend déjà sa réponse.
function dmInbound(state, snapshot, changes, { language = 'fr', newId }) {
  const f = (changes.newResults || []).filter((r) => r.me?.minutes > 0).at(-1);
  if (!f?.score || changes.firstSync) return null;
  if (state.dmInboundOn && days(state.dmInboundOn, snapshot.gameDate) < INBOUND_EVERY_DAYS) return null;
  const [scored, conceded] = f.venue === 'domicile' ? f.score : [f.score[1], f.score[0]];
  const good = f.me.goals > 0 || f.me.assists > 0;
  const bad = scored < conceded && (f.me.rating ?? 6) <= 5;
  if (!good && !bad) return null;
  const free = (c) => { const t = findDm(state, c.handle); return !t || (!t.closed && t.messages.at(-1)?.who !== 'them'); };
  const contacts = dmContacts(state).filter(free);
  const played = new Set((f.clubLineup || []).map((l) => l.name));
  const mates = contacts.filter((c) => c.kind === 'teammate' && played.has(c.name));
  const fans = contacts.filter((c) => c.type === 'fan');
  const n = state.dmInboundCount || 0;
  const pickFrom = (list) => list[n % list.length];
  const L = postTexts(language).dmInbound;
  const opp = f.venue === 'domicile' ? f.away : f.home;
  let to = null, text = null;
  if (good && mates.length && (n % 2 === 0 || !fans.length)) { to = pickFrom(mates); text = f.me.goals > 0 ? L.teammateGoal(opp) : L.teammateAssist(opp); }
  else if (good && fans.length) { to = pickFrom(fans); text = L.fanGood(opp); }
  else if (bad && fans.length) { to = pickFrom(fans); text = L.fanAngry(opp); }
  if (!to) return null;
  const thread = dmThread(state, to.handle, newId);
  addDmMessage(thread, 'them', text, snapshot.gameDate);
  state.dmInboundOn = snapshot.gameDate;
  state.dmInboundCount = n + 1;
  return thread;
}

// Ce que l'IA reçoit de la conversation : qui écrit, ce qu'il a dit en public sur Kop, les derniers messages.
function dmContext(state, thread) {
  const said = [];
  for (const p of state.feed || []) {
    for (const x of [p, ...(p.replies || [])]) {
      if (!x.author?.isMe && same(x.author?.handle, thread.handle)) said.push({ date: x.gameDate || p.gameDate, text: String(x.text || '').slice(0, 200) });
    }
  }
  const key = Object.keys(state.accounts || {}).find((k) => same(k, thread.handle));
  const former = thread.kind === 'teammate' && !dmContacts(state).some((c) => c.kind === 'teammate' && same(c.handle, thread.handle));
  return {
    with: { name: thread.name, handle: thread.handle, kind: thread.kind, type: thread.type, bio: key ? state.accounts[key].bio || undefined : undefined, former_teammate: former || undefined },
    their_public_posts: said.slice(-6),
    messages: thread.messages.slice(-MAX_CONTEXT).map((m) => ({ who: m.who, text: m.text, date: m.gameDate })),
  };
}

module.exports = { dmContacts, findDm, dmThread, addDmMessage, dmInbound, dmContext };

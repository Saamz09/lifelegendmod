'use strict';
// Synchro complète avec une IA simulée, sur des COPIES d'une vraie carrière (rien n'est envoyé à une IA, rien n'est
// écrit hors d'un dossier temporaire). Les copies ne sont pas dans le dépôt (données personnelles) : voir tests/README.md.
// Sans elles, ces tests sont sautés.
//   LIFELEGEND_FIXTURES=<dossier contenant state.json, clubs.json, BL00000000 et key.bin>  (défaut : tests/fixtures)
// Les attentes nommées (AS Nancy Lorraine, Oswald Tanchot, Lucas Vermeulen…) sont celles de la carrière de référence I. Morel.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FIX = process.env.LIFELEGEND_FIXTURES || path.join(__dirname, 'fixtures');
const STATE = path.join(FIX, 'state.json'), CLUBS = path.join(FIX, 'clubs.json'), SAVE = path.join(FIX, 'BL00000000'), KEY = path.join(FIX, 'key.bin');
const ready = [STATE, CLUBS, SAVE, KEY].every((f) => fs.existsSync(f));
const skip = ready ? false : `copies de carrière absentes (${FIX})`;
// Football Life 2027 chiffre ses sauvegardes avec sa propre clé.
if (ready) require(path.join(ROOT, 'src/save/pesCrypt.js')).setSaveKeys([fs.readFileSync(KEY)]);

// ---- IA simulée ----
const asked = [];
let emailsReply = [];
let dmReply = { messages: ['Salut !', 'Bien joué.'], final: false };
let huddleEdition = [];
let huddleReply = { messages: [] };
// Un test peut regarder chaque requête avant sa réponse (requêtes simultanées, modèle léger) : world.js garde la
// première IA simulée installée, ce crochet passe par elle.
let aiHook = null;
const words = (n) => Array.from({ length: n }, (_, i) => `mot${i}${i % 12 === 11 ? '.' : ''}`).join(' ');
function mockAi() {
  const providers = require(path.join(ROOT, 'src/ai/providers.js'));
  providers.complete = async (settings, key, opts) => {
    const { system, user } = opts;
    if (aiHook) await aiHook(opts);
    asked.push({ system, user, light: Boolean(opts.light) });
    if (/^You answer emails on "Mails"/.test(system)) return JSON.stringify({ body: 'Réponse d’essai.', final: false });
    if (/^You answer private messages on "Kop"/.test(system)) return JSON.stringify(dmReply);
    if (/^You write the group chat of his team on "Vestiaire"/.test(system)) return JSON.stringify(huddleReply);
    const articles = /^PLAN: (\[.*\])$/m.exec(user);
    if (articles) return JSON.stringify({ national: JSON.parse(articles[1]).map((a, i) => ({ headline: `Titre d’essai ${i + 1}`, dek: 'Chapeau d’essai.', body: words(a.size === 'long' ? 900 : a.size === 'medium' ? 500 : 250) })) });
    const m = /KOP_PLAN[^\n]*\n(\[.*\])\n/.exec(user);
    if (m) {
      const plan = JSON.parse(m[1]);
      return JSON.stringify({ posts: plan.map((s, i) => ({ handle: s.handle, name: s.name, type: s.type, text: `Message d'essai n°${i + 1}.`, bio: s.new ? 'Compte d’essai.' : null })), local: [], national: [], emails: emailsReply, huddle: huddleEdition,
        pantheon: /PANTHÉON:/.test(system) ? { title: 'Chapitre d’essai', text: 'Texte d’essai du chapitre.' } : undefined });
    }
    if (/NEW_VOICES/.test(user)) return JSON.stringify({ threads: [], quotes: [] });
    return '{}';
  };
}

function freshStore(mutate) {
  const { Store } = require(path.join(ROOT, 'src/store.js'));
  class TestStore extends Store { getKey() { return 'cle-factice'; } }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lifelegend-test-'));
  const state = JSON.parse(fs.readFileSync(STATE, 'utf8'));
  // Le dernier match joué de son club redevient « nouveau » : la synchro publie une édition d'après-match.
  const lastPlayed = state.snapshot.fixtures.filter((f) => f.played).at(-1);
  state.snapshot.fixtures = state.snapshot.fixtures.filter((f) => f !== lastPlayed);
  state.snapshot.gameDate = lastPlayed.date;
  mutate?.(state);
  fs.mkdirSync(path.join(dir, 'careers', state.careerId), { recursive: true });
  fs.writeFileSync(path.join(dir, 'careers', state.careerId, 'state.json'), JSON.stringify(state));
  fs.copyFileSync(CLUBS, path.join(dir, 'careers', state.careerId, 'clubs.json'));
  const store = new TestStore(dir, { isEncryptionAvailable: () => false });
  store.setActiveCareer(state.careerId);
  return { store, before: state };
}
const settings = (o = {}) => ({ savePath: SAVE, provider: 'google', model: 'x', language: 'fr', factCheck: false, tribuneThreads: false, ...o });
const EMAILS = [
  { from: 'Lucas Vermeulen', role: 'agent', subject: 'Dijon se renseigne', body: 'Premier mail de l’agent.' },
  { from: 'Lucas Vermeulen', role: 'agent', subject: 'Encore moi', body: 'Second mail de l’agent, même édition.' },
  { from: 'Oswald Tanchot', role: 'coach', subject: 'Avant Dunkerque', body: 'Mail du coach.' },
];

test('synchro : un seul mail de l’agent quand son point est dû, objets récents en mémoire', { skip }, async () => {
  mockAi();
  const world = require(path.join(ROOT, 'src/world/world.js'));
  emailsReply = EMAILS;
  asked.length = 0;
  const s = freshStore((st) => { st.agent.reported = null; st.agent.lastReportOn = null; });
  const out = await world.sync({ store: s.store, settings: settings(), log: () => {}, progress: () => {} });
  assert.ok(out.lastSync?.published, 'édition publiée');
  assert.deepStrictEqual([out.snapshot.player.name, out.snapshot.club.name], ['Ilan Morel', 'AS Nancy Lorraine'], 'la sauvegarde de référence, lue avec sa clé');
  const added = out.mail.slice(s.before.mail.length);
  assert.deepStrictEqual(added.filter((m) => m.role === 'agent').map((m) => m.subject), ['Dijon se renseigne']);
  assert.strictEqual(added.find((m) => m.role === 'coach')?.club, out.snapshot.club.name);
  const ed = asked.find((a) => /KOP_PLAN/.test(a.user));
  assert.match(ed.system, /never one of MEMORY\.recent_mail_subjects/);
  const mem = JSON.parse(/MEMORY \(this world's continuity\):\n(\{.*\})/.exec(ed.user)[1]);
  assert.ok(mem.recent_mail_subjects.includes('Point mercato et situation actuelle'));
});

test('synchro en anglais : posts automatiques du club en anglais', { skip }, async () => {
  mockAi();
  const world = require(path.join(ROOT, 'src/world/world.js'));
  emailsReply = [];
  const s = freshStore();
  const out = await world.sync({ store: s.store, settings: settings({ language: 'en' }), log: () => {}, progress: () => {} });
  // Le fil est plafonné : les nouveaux posts se reconnaissent à leur identifiant.
  const known = new Set(s.before.feed.map((p) => p.id));
  const fresh = out.feed.filter((p) => !known.has(p.id) && (p.author?.type === 'club' || p.author?.type === 'competition'));
  assert.ok(fresh.length, 'posts officiels publiés');
  assert.ok(fresh.some((p) => /FULL TIME|Matchday|MATCHDAY/.test(p.text)), fresh.map((p) => p.text).join('\n---\n'));
  assert.ok(!fresh.some((p) => /C’EST TERMINÉ|journée|Résultats de la/.test(p.text)), 'pas de français');
});

test('réponses dans les fils d’avant le transfert : l’ancien club est donné à l’IA', { skip }, async () => {
  mockAi();
  const world = require(path.join(ROOT, 'src/world/world.js'));
  // Morel n'a pas encore changé de club : une saison d'avant, avec son journal local et les fils de l'époque.
  const REF = 999, CLUB = 'Ancien FC', PAPER = 'L’Écho de l’Ancien FC', DAY = '2025-09-02';
  const old = (id, from, role, extra = {}) => ({ id, from, role, subject: 'Essai', unread: false, closed: false, messages: [{ who: 'them', body: 'Bonjour.', gameDate: DAY }], ...extra });
  const s = freshStore((st) => {
    st.editions.unshift({ gameDate: '2025-09-01', national: [], local: [], paper: { name: PAPER } });
    st.pastPapers = [{ name: PAPER, clubRef: REF }];
    st.seasons[`2025-2026|${REF}`] = { ...Object.values(st.seasons)[0], club: CLUB, season: '2025-2026' };
    st.mail.push(old('t1', 'Ancien Coach', 'coach'), old('t2', 'Coach Noté', 'coach', { club: 'Autre FC' }), old('t3', 'Ancien Journaliste', 'journalist'), old('t4', 'Marc Lhermitte', 'journalist'));
  });
  const askThread = async (from) => {
    const th = s.before.mail.filter((m) => m.from === from).at(-1);
    asked.length = 0;
    await world.replyMail({ store: s.store, settings: settings(), threadId: th.id, text: 'Merci pour tout.', progress: () => {} });
    const q = asked.find((a) => /^You answer emails on "Mails"/.test(a.system));
    return { thread: JSON.parse(/THREAD \(oldest first\): (\{.*\})\n/.exec(q.user)[1]), system: q.system };
  };
  let r = await askThread('Ancien Coach');
  assert.deepStrictEqual([r.thread.former_club?.club, r.thread.former_club?.player_now_at], [CLUB, 'AS Nancy Lorraine'], 'club retrouvé par le journal du jour');
  assert.match(r.system, /THREAD\.former_club, when set/);
  r = await askThread('Coach Noté');
  assert.strictEqual(r.thread.former_club?.club, 'Autre FC', 'club noté sur le fil');
  r = await askThread('Ancien Journaliste');
  assert.strictEqual(r.thread.former_club?.local_paper, PAPER);
  r = await askThread('Marc Lhermitte');
  assert.strictEqual(r.thread.former_club, undefined, 'la presse nationale le suit toujours');
  r = await askThread('Oswald Tanchot');
  assert.strictEqual(r.thread.former_club, undefined, 'son entraîneur actuel');
  r = await askThread('Lucas Vermeulen');
  assert.strictEqual(r.thread.former_club, undefined, 'son agent');
});

test('messages privés : une requête au modèle léger quand il écrit, aucune à la synchro, pas de dossier de l’agent', { skip }, async (t) => {
  mockAi();
  const world = require(path.join(ROOT, 'src/world/world.js'));
  emailsReply = [];
  asked.length = 0;
  const s = freshStore();
  const isDm = (a) => /^You answer private messages on "Kop"/.test(a.system);
  const out = await world.sync({ store: s.store, settings: settings(), log: () => {}, progress: () => {} });
  assert.strictEqual(asked.filter(isDm).length, 0, 'la synchro ne demande rien pour les messages privés');
  // L'effectif nommé dépend de la base de noms du jeu installé : un coéquipier d'essai, avec ou sans elle.
  const mate = 'Jean Essai', handle = 'JeanEssai', known = 0;
  const career = s.store.activeCareer();
  career.snapshot.rosters = { ...career.snapshot.rosters, mine: [out.snapshot.player.name, mate] };
  s.store.saveCareer(career);

  asked.length = 0;
  let state = await world.sendDm({ store: s.store, settings: settings(), handle, text: 'Salut, bien joué !', progress: () => {} });
  const q = asked.filter(isDm);
  assert.strictEqual(q.length, 1);
  assert.strictEqual(q[0].light, true);
  assert.match(q[0].user, /Salut, bien joué/);
  const facts = JSON.parse(/^FACTS: (\{.*\})$/m.exec(q[0].user)[1]);
  assert.ok(facts.player && !('agent' in facts), 'ni offres ni négociations pour celui qui répond');
  for (const heavy of ['league_last_round', 'league_next_round', 'club_recent_results', 'club_accounts']) assert.ok(!(heavy in facts), `réponse légère : pas de ${heavy}`);
  assert.ok(facts.league_table.length && facts.club_squad && 'last_match' in facts && 'next_match' in facts, 'son club et le classement restent');
  let th = state.dms.find((d) => d.name === mate);
  assert.deepStrictEqual(th.messages.slice(known).map((m) => [m.who, m.text]), [['me', 'Salut, bien joué !'], ['them', 'Salut !'], ['them', 'Bien joué.']]);
  await assert.rejects(world.sendDm({ store: s.store, settings: settings(), handle, text: '   ', progress: () => {} }), /Ton message est vide/);
  await assert.rejects(world.sendDm({ store: s.store, settings: settings(), handle: 'CompteInconnu', text: 'Salut', progress: () => {} }), /ne reçoit pas de messages privés/);

  // L'IA échoue : son message reste, et un envoi sans texte redemande la réponse sans le dupliquer.
  aiHook = async (opts) => { if (/private messages/.test(opts.system)) throw new Error('Quota'); };
  t.after(() => { aiHook = null; });
  await assert.rejects(world.sendDm({ store: s.store, settings: settings(), handle, text: 'Tu es là ?', progress: () => {} }), /Quota/);
  aiHook = null;
  state = await world.sendDm({ store: s.store, settings: settings(), handle, text: '', progress: () => {} });
  th = state.dms.find((d) => d.name === mate);
  assert.deepStrictEqual(th.messages.slice(known + 3).map((m) => [m.who, m.text]), [['me', 'Tu es là ?'], ['them', 'Salut !'], ['them', 'Bien joué.']]);

  // Il insulte : l'autre coupe, le fil est fermé.
  dmReply = { messages: ['Je ne te réponds plus.'], final: true };
  t.after(() => { dmReply = { messages: ['Salut !', 'Bien joué.'], final: false }; });
  state = await world.sendDm({ store: s.store, settings: settings(), handle, text: 'Dernier message', progress: () => {} });
  assert.strictEqual(state.dms.find((d) => d.name === mate).closed, true);
  await assert.rejects(world.sendDm({ store: s.store, settings: settings(), handle, text: 'Encore', progress: () => {} }), /ne répond plus/);
});

test('Huddle : le groupe vit dans l’édition, sans requête à part, et répond quand il écrit', { skip }, async (t) => {
  mockAi();
  const world = require(path.join(ROOT, 'src/world/world.js'));
  const { staffFor } = require(path.join(ROOT, 'src/world/huddle.js'));
  emailsReply = [];
  asked.length = 0;
  const s = freshStore();
  const staff = staffFor(s.before.snapshot.club.ref);
  const isHuddle = (a) => /^You write the group chat/.test(a.system);
  huddleEdition = [{ from: staff[0].name, text: 'Récup demain matin.' }, { from: 'Ilan Morel', text: 'à sa place' }, { from: 'Inconnu', text: 'hors du groupe' }];
  t.after(() => { huddleEdition = []; huddleReply = { messages: [] }; aiHook = null; });

  const out = await world.sync({ store: s.store, settings: settings(), log: () => {}, progress: () => {} });
  assert.strictEqual(asked.filter(isHuddle).length, 0, 'aucune requête à part à la synchro');
  const edition = asked.find((a) => /KOP_PLAN/.test(a.user));
  assert.match(edition.system, /HUDDLE: here GROUP is MEMORY\.huddle/);
  const memory = JSON.parse(/^MEMORY \(this world's continuity\):\n(.*)$/m.exec(edition.user)[1]);
  assert.strictEqual(memory.huddle.group, 'AS Nancy Lorraine');
  assert.deepStrictEqual(memory.huddle.staff.map((p) => p.name), staff.map((p) => p.name));
  for (const other of asked.filter((a) => /^PLAN: /m.test(a.user))) assert.ok(!/"huddle"/.test(other.user), 'La Transversale ne voit pas le groupe');
  assert.strictEqual(out.huddles.length, 1);
  const said = () => s.store.activeCareer().huddles[0].messages.filter((m) => m.who !== 'system').map((m) => [m.who, m.text]);
  assert.ok(said().some(([, text]) => text === 'Récup demain matin.'), 'le message du staff');
  assert.ok(!said().some(([, text]) => /à sa place|hors du groupe/.test(text)), 'ni lui, ni quelqu’un hors du groupe');
  assert.ok(!(out.editions.at(-1).national.concat(out.editions.at(-1).local)).some((a) => /Récup demain/.test(a.body)));

  // Il écrit : une requête au modèle léger, sans les négociations de l'agent, et il n'a rien à relire.
  asked.length = 0;
  huddleReply = { messages: [{ from: staff[1].name, text: 'Séance à 10h.' }, { from: 'Inconnu', text: 'non' }] };
  let state = await world.sendHuddle({ store: s.store, settings: settings(), text: 'On s’entraîne à quelle heure ?', progress: () => {} });
  const q = asked.filter(isHuddle);
  assert.strictEqual(q.length, 1);
  assert.strictEqual(q[0].light, true);
  assert.match(q[0].user, /"from":"THE PLAYER"[^}]*On s’entraîne à quelle heure/);
  const groupFacts = JSON.parse(/^FACTS: (\{.*\})$/m.exec(q[0].user)[1]);
  assert.ok(!('agent' in groupFacts) && !('league_last_round' in groupFacts), 'ni offres ni négociations, et une réponse légère');
  assert.deepStrictEqual(said().slice(-2), [['me', 'On s’entraîne à quelle heure ?'], ['them', 'Séance à 10h.']]);
  assert.strictEqual(state.huddles[0].unread, 0);
  await assert.rejects(world.sendHuddle({ store: s.store, settings: settings(), text: '   ', progress: () => {} }), /Ton message est vide/);

  // L'IA échoue : son message reste, un envoi sans texte redemande la réponse sans le dupliquer.
  aiHook = async (opts) => { if (/group chat of his team/.test(opts.system)) throw new Error('Quota'); };
  await assert.rejects(world.sendHuddle({ store: s.store, settings: settings(), text: 'Il y a quelqu’un ?', progress: () => {} }), /Quota/);
  aiHook = null;
  huddleReply = { messages: [{ from: staff[2].name, text: 'Oui.' }] };
  await world.sendHuddle({ store: s.store, settings: settings(), text: '', progress: () => {} });
  assert.deepStrictEqual(said().slice(-2), [['me', 'Il y a quelqu’un ?'], ['them', 'Oui.']]);

  // Une réponse sans membre du groupe ne passe pas pour une réponse.
  huddleReply = { messages: [{ from: 'Inconnu', text: 'non' }] };
  await assert.rejects(world.sendHuddle({ store: s.store, settings: settings(), text: 'Encore ?', progress: () => {} }), /Pas de réponse/);

  // Le groupe de la sélection : on y écrit en le désignant, et plus du tout une fois sorti de la liste.
  const { syncHuddle } = require(path.join(ROOT, 'src/world/huddle.js'));
  const withNt = s.store.activeCareer();
  syncHuddle(withNt, { ...withNt.snapshot, nationalTeam: { ref: 777, name: 'Maroc', coach: 'Coach Essai', inSquad: true, squad: ['Jean Essai'], next: null } }, { newId: () => 'nt-group' });
  s.store.saveCareer(withNt);
  huddleReply = { messages: [{ from: 'Jean Essai', text: 'Bienvenue !' }] };
  let nt = (await world.sendHuddle({ store: s.store, settings: settings(), text: 'Salut le groupe', groupId: 'nt-group', progress: () => {} })).huddles.find((g) => g.id === 'nt-group');
  assert.deepStrictEqual(nt.messages.filter((m) => m.who !== 'system').map((m) => m.text), ['Salut le groupe', 'Bienvenue !']);
  const leftNt = s.store.activeCareer();
  syncHuddle(leftNt, { ...leftNt.snapshot, nationalTeam: { ref: 777, name: 'Maroc', coach: 'Coach Essai', inSquad: false, squad: [], next: null } }, { newId: () => 'inutile' });
  s.store.saveCareer(leftNt);
  await assert.rejects(world.sendHuddle({ store: s.store, settings: settings(), text: 'Encore ?', groupId: 'nt-group', progress: () => {} }), /Tu as quitté ce groupe/);
  assert.strictEqual(world.readHuddle({ store: s.store, settings: settings(), groupId: 'nt-group' }).huddles.find((g) => g.id === 'nt-group').unread, 0);

  // Ouvrir la page : messages lus ; une carrière d'avant Huddle a son groupe sans attendre la synchro.
  const career = s.store.activeCareer();
  career.huddles[0].unread = 3;
  s.store.saveCareer(career);
  assert.strictEqual(world.readHuddle({ store: s.store, settings: settings() }).huddles[0].unread, 0);
  const old = s.store.activeCareer();
  delete old.huddles;
  s.store.saveCareer(old);
  assert.strictEqual(world.readHuddle({ store: s.store, settings: settings() }).huddles[0].club, 'AS Nancy Lorraine');
});

test('biographie : écrite avant la première synchro, elle nourrit la première édition et le premier chapitre de Panthéon', { skip }, async (t) => {
  mockAi();
  const world = require(path.join(ROOT, 'src/world/world.js'));
  const { Store } = require(path.join(ROOT, 'src/store.js'));
  class TestStore extends Store { getKey() { return 'cle-factice'; } }
  const store = new TestStore(fs.mkdtempSync(path.join(os.tmpdir(), 'lifelegend-test-')), { isEncryptionAvailable: () => false });
  const BIO = 'Né à Oujda, formé au Mouloudia, il arrive en France à seize ans avec un seul rêve.';
  emailsReply = [];
  store.saveSettings({ savePath: SAVE, pendingBio: { savePath: SAVE, text: BIO, kind: 'created' } });
  const conf = () => settings({ pendingBio: store.getSettings().pendingBio });
  assert.deepStrictEqual(world.newCareerInfo({ store, settings: conf() }), { player: 'Ilan Morel', club: 'AS Nancy Lorraine' }, 'carrière encore jamais synchronisée');

  // La synchro échoue : rien de perdu, la biographie repart à la tentative suivante.
  aiHook = async () => { throw new Error('Quota'); };
  t.after(() => { aiHook = null; });
  await assert.rejects(world.sync({ store, settings: conf(), log: () => {}, progress: () => {} }));
  aiHook = null;
  assert.strictEqual(store.getSettings().pendingBio?.text, BIO);
  assert.ok(world.newCareerInfo({ store, settings: conf() }), 'toujours pas de carrière');

  asked.length = 0;
  const out = await world.sync({ store, settings: conf(), log: () => {}, progress: () => {} });
  const ed = asked.find((a) => /KOP_PLAN/.test(a.user));
  const facts = JSON.parse(/^FACTS[^\n]*\n(\{.*\})$/m.exec(ed.user)[1]);
  assert.strictEqual(facts.biography, BIO, 'l’édition la reçoit dans ses faits');
  assert.deepStrictEqual([out.playerKind, facts.player.created_player, facts.player.real_player], ['created', true, undefined]);
  assert.match(ed.system, /FACTS\.biography, when set, is the story of this fictional player/);
  assert.match(ed.user, /FIRST EDITION.*FACTS\.biography is how the press and the fans discover who he is/);
  assert.ok(JSON.parse(/CHANGES SINCE LAST EDITION:\n(\{.*\})/.exec(ed.user)[1]).pantheon_events.some((e) => e.kind === 'origins' && e.biography));
  const lead = asked.find((a) => a !== ed && /^PLAN: /m.test(a.user));
  assert.ok(JSON.parse(/^PLAN: (\[.*\])$/m.exec(lead.user)[1]).some((a) => a.kind === 'portrait'), 'La Transversale fait son portrait');
  assert.deepStrictEqual(out.bio, { text: BIO, chapter: true });
  assert.deepStrictEqual(out.pantheon.chapters.map((c) => [c.title, c.bio]), [['Chapitre d’essai', true]]);
  assert.strictEqual(store.getSettings().pendingBio, null, 'servie une fois');
  assert.strictEqual(world.newCareerInfo({ store, settings: settings() }), null, 'la carrière existe');

  // Une biographie laissée pour une autre sauvegarde ne se colle pas à cette carrière.
  const other = new TestStore(fs.mkdtempSync(path.join(os.tmpdir(), 'lifelegend-test-')), { isEncryptionAvailable: () => false });
  const again = await world.sync({ store: other, settings: settings({ pendingBio: { savePath: 'ailleurs', text: BIO } }), log: () => {}, progress: () => {} });
  assert.ok(!again.bio && !again.playerKind);

  // Joueur réel : pas de biographie, et l'IA sait qu'elle ne doit rien ajouter de sa vraie vie.
  const real = new TestStore(fs.mkdtempSync(path.join(os.tmpdir(), 'lifelegend-test-')), { isEncryptionAvailable: () => false });
  asked.length = 0;
  const pro = await world.sync({ store: real, settings: settings({ pendingBio: { savePath: SAVE, text: '', kind: 'real' } }), log: () => {}, progress: () => {} });
  const edReal = asked.find((a) => /KOP_PLAN/.test(a.user));
  const factsReal = JSON.parse(/^FACTS[^\n]*\n(\{.*\})$/m.exec(edReal.user)[1]);
  assert.deepStrictEqual([pro.playerKind, pro.bio ?? null, factsReal.player.real_player, factsReal.biography], ['real', null, true, undefined]);
  assert.match(edReal.system, /FACTS\.player\.real_player means the user plays as an existing footballer/);
  assert.ok(!JSON.parse(/^PLAN: (\[.*\])$/m.exec(asked.find((a) => a !== edReal && /^PLAN: /m.test(a.user)).user)[1]).some((a) => a.kind === 'portrait'), 'pas de portrait tiré d’une biographie');
});

test('synchro : une sauvegarde qui n’est plus là donne un message clair, pas l’erreur brute de Windows', async () => {
  const world = require(path.join(ROOT, 'src/world/world.js'));
  const missing = path.join(os.tmpdir(), 'lifelegend-absente', 'BL00000000');
  await assert.rejects(world.sync({ store: null, settings: settings({ savePath: missing }), log: () => {}, progress: () => {} }),
    (err) => err.message === `Sauvegarde introuvable : ${missing}` && err.code === 'ENOENT');
});

test('synchro allégée : La Transversale et l’édition écrites en même temps, discussions au modèle léger', { skip }, async (t) => {
  mockAi();
  const world = require(path.join(ROOT, 'src/world/world.js'));
  emailsReply = [];
  asked.length = 0;
  let active = 0, peak = 0;
  aiHook = async () => { active++; peak = Math.max(peak, active); await new Promise((r) => setTimeout(r, 40)); active--; };
  t.after(() => { aiHook = null; });
  const s = freshStore();
  const out = await world.sync({ store: s.store, settings: settings({ tribuneThreads: true }), log: () => {}, progress: () => {} });
  assert.strictEqual(peak, 2, 'deux requêtes en même temps');
  assert.ok(out.editions.at(-1).national.length, 'La Transversale publiée');
  const ed = asked.find((a) => /KOP_PLAN/.test(a.user));
  const mem = JSON.parse(/MEMORY \(this world's continuity\):\n(\{.*\})/.exec(ed.user)[1]);
  assert.ok(mem.transversale_today.length && mem.transversale_today.every((a) => a.author && a.kind && a.subject && !a.headline), 'l’édition connaît le plan, pas les titres');
  assert.match(ed.system, /being written at the same time/);
  const talk = asked.filter((a) => /NEW_VOICES/.test(a.user));
  assert.ok(talk.length && talk.every((a) => a.light), 'discussions au modèle léger');
  assert.ok(asked.filter((a) => a !== ed && /^PLAN: /m.test(a.user)).every((a) => !a.light), 'La Transversale au modèle choisi');
  assert.match(out.lastSync.durations, / ∥ .*\(en parallèle : /);
  // Kop et le football mondial : le résumé court dans la même requête, des places dans le plan, aucune requête de plus.
  const facts = JSON.parse(/FACTS \(from the save, authoritative\):\n(\{.*\})/.exec(ed.user)[1]);
  const plan = JSON.parse(/KOP_PLAN[^\n]*\n(\[.*\])\n/.exec(ed.user)[1]);
  const elsewhere = plan.filter((p) => /^football elsewhere/.test(p.angle));
  if (facts.football_elsewhere) {
    const comps = facts.football_elsewhere.competitions.length;
    assert.ok(elsewhere.length >= (comps ? 2 : 1), 'des posts sur le football mondial (le joueur du mois seul : une voix neutre)');
    const fan = elsewhere.find((p) => p.supports);
    if (comps) assert.strictEqual(out.accounts[fan.handle]?.supports, fan.supports, 'retenu comme supporter de ce club');
    assert.deepStrictEqual(out.footballElsewhere, facts.football_elsewhere, 'gardé pour les réponses à ses posts');
    const papers = asked.filter((a) => /^PLAN: /m.test(a.user));
    assert.ok(papers.every((a) => !/"football_elsewhere"/.test(a.user)), 'le journal a déjà le résumé complet');
  } else {
    assert.strictEqual(elsewhere.length, 0, 'sans football mondial, pas de place pour lui');
  }
});

test('Panthéon : la première page demande le chapitre de ses débuts à l’édition, qui l’enregistre', { skip }, async () => {
  mockAi();
  const world = require(path.join(ROOT, 'src/world/world.js'));
  emailsReply = [];
  asked.length = 0;
  const s = freshStore((st) => { delete st.pantheon; });
  const out = await world.sync({ store: s.store, settings: settings(), log: () => {}, progress: () => {} });
  const ed = asked.find((a) => /KOP_PLAN/.test(a.user));
  assert.match(ed.system, /PANTHÉON:/);
  assert.ok(JSON.parse(/CHANGES SINCE LAST EDITION:\n(\{.*\})/.exec(ed.user)[1]).pantheon_events.some((e) => e.kind === 'origins'));
  assert.deepStrictEqual(out.pantheon.chapters.map((c) => [c.title, c.text, c.gameDate]), [['Chapitre d’essai', 'Texte d’essai du chapitre.', out.snapshot.gameDate]]);
});

test('synchro : une marque propose un contrat, sans requête d’IA de plus, et les rédactions apprennent la signature', { skip }, async () => {
  mockAi();
  const world = require(path.join(ROOT, 'src/world/world.js'));
  const boots = require(path.join(ROOT, 'src/save/boots.js'));
  const { answerSponsor } = require(path.join(ROOT, 'src/world/sponsors.js'));
  const real = { bootCatalog: boots.bootCatalog, ensureBootImages: boots.ensureBootImages };
  emailsReply = [];
  try {
    // Sans catalogue (pas de jeu) : rien, et la synchro de référence pour compter les requêtes.
    boots.bootCatalog = () => [];
    asked.length = 0;
    const plain = freshStore();
    const none = await world.sync({ store: plain.store, settings: settings(), log: () => {}, progress: () => {} });
    const baseline = asked.length;
    assert.ok(!none.mail.some((m) => m.sponsorOffer), 'sans catalogue, pas d’offre');
    // Avec les crampons du jeu : une offre, et autant de requêtes.
    boots.bootCatalog = () => [{ id: 5010, brand: 'Marque E' }, { id: 5011, brand: 'Marque F' }, { id: 1010, brand: 'Marque A' }, { id: 1011, brand: 'Marque A' }, { id: 2010, brand: 'Marque B' }, { id: 2011, brand: 'Marque B' }];
    boots.ensureBootImages = () => ({ photo: 'k5010_t.png', logo: 'k5010_l.png' });
    asked.length = 0;
    const s = freshStore();
    const out = await world.sync({ store: s.store, settings: settings(), log: () => {}, progress: () => {} });
    assert.strictEqual(asked.length, baseline, 'aucune requête d’IA de plus');
    const mail = out.mail.find((m) => m.sponsorOffer);
    assert.ok(mail, 'le mail de la marque est dans Mails');
    assert.strictEqual(out.sponsor.offer.id, mail.sponsorOffer);
    assert.strictEqual(out.sponsor.offer.photo, 'k5010_t.png');
    // Il signe : la prochaine édition le sait, puis la nouvelle ne se répète pas.
    answerSponsor(out, 'accept', { language: 'fr', gameDate: out.snapshot.gameDate });
    s.store.saveCareer(out);
    const lastPlayed = out.snapshot.fixtures.filter((f) => f.played).at(-1);
    out.snapshot.fixtures = out.snapshot.fixtures.filter((f) => f !== lastPlayed);
    out.snapshot.gameDate = lastPlayed.date;
    s.store.saveCareer(out);
    asked.length = 0;
    const next = await world.sync({ store: s.store, settings: settings(), log: () => {}, progress: () => {} });
    const ed = asked.find((a) => /KOP_PLAN/.test(a.user));
    assert.ok(ed, 'une édition a été écrite');
    assert.match(ed.user, /"equipment_deal"/);
    assert.match(ed.user, /"sponsor_news"/);
    assert.strictEqual(next.sponsor.news, null, 'la nouvelle n’est donnée qu’une fois');
  } finally {
    Object.assign(boots, real);
  }
});

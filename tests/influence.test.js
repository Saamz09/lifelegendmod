'use strict';
// Influence : noms des formations, demandes et décisions (jauge, mercato), sort des décisions à la synchro, et écriture
// dans une copie de la sauvegarde (formation, transfert) quand les fichiers de référence sont là (voir tests/README.md).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { gameName, commonName, readPhase, describe } = require(path.join(ROOT, 'src/save/formations.js'));
const { assess, decide, syncInfluence, ensureInfluence } = require(path.join(ROOT, 'src/world/influence.js'));
const world = require(path.join(ROOT, 'src/world/world.js'));
const FIXTURES = process.env.LIFELEGEND_FIXTURES || path.join(__dirname, 'fixtures');
const SAVE = path.join(FIXTURES, 'BL00000000'), KEY = path.join(FIXTURES, 'key.bin');

// 4-4-2 de la base du jeu (tactique 6949) et 4-3-3 d'Heerenveen, 1re phase : [rôles][x, y].
const P442 = Buffer.from([0, 1, 1, 3, 2, 5, 5, 7, 6, 12, 12, 3, 52, 11, 64, 11, 40, 13, 88, 13, 16, 25, 64, 25, 40, 25, 88, 25, 16, 43, 64, 43, 40]);
const P433 = Buffer.from([0, 1, 1, 3, 2, 5, 5, 5, 10, 9, 12, 3, 52, 11, 64, 11, 40, 13, 88, 13, 16, 25, 52, 25, 72, 25, 32, 39, 84, 39, 20, 43, 52]);

test('formations : le nom affiché par le jeu et le nom courant', () => {
  const a = readPhase(P442), b = readPhase(P433);
  assert.strictEqual(gameName(a.roles), '4-2-2-2', 'vu dans le plan de jeu du 26/10/2026');
  assert.strictEqual(commonName(a.roles, a.xy), '4-4-2');
  assert.deepStrictEqual([describe(b).gameName, describe(b).name], ['4-3-3', '4-3-3']);
  assert.strictEqual(readPhase(Buffer.alloc(33, 0xff)), null, 'pas une formation');
});

// Carrière minimale : Heerenveen, mercato d'été à venir.
function career(o = {}) {
  const s = {
    gameDate: '2021-02-28', season: '2020-2021', club: { ref: 100, name: 'Heerenveen', coach: 'J. Jansen' }, league: { name: 'Eredivisie' },
    player: { id: 1, name: 'M. Abline', contractUntil: '2023-06-30', history: { joinedClub: '2020-08-01' }, profile: { teamRole: 'Leader', formArrowLevel: 2 } },
    stats: { total: { apps: 10, starts: 10, goals: 4, assists: 3, avgRating: 6.8 } },
    fixtures: Array.from({ length: 10 }, (_, i) => ({ played: true, date: `2021-01-${String(i + 10).padStart(2, '0')}`, competition: 'Eredivisie', venue: 'domicile', score: [1, 1], me: { starter: true } })),
    windows: [{ kind: 'hiver', open: '2021-01-01', close: '2021-01-31' }, { kind: 'été', open: '2021-07-01', close: '2021-08-31' }],
    ...o,
  };
  const state = { careerId: 'test', seasons: {}, fanMood: { level: 0 } };
  const aux = {
    clubRef: 100, squadSize: 30,
    formations: [{ key: '4-2-2-2', name: '4-4-2', gameName: '4-2-2-2', roles: [], phases: [] }, { key: '4-3-3', name: '4-3-3', gameName: '4-3-3', roles: [], phases: ['aa', 'bb', 'cc'] }],
    squad: [{ id: 7, name: 'R. Kongolo', share: 84 }, { id: 8, name: 'J. Van Hecke', share: 10 }],
    clubs: { 100: { name: 'Heerenveen', prestige: 0.5 }, 200: { name: 'PEC Zwolle', prestige: 0.45 }, 300: { name: 'Real Madrid', prestige: 0.98 } },
    saleTargets: [{ ref: 200, name: 'PEC Zwolle' }],
    players: [[50, 'J. Westerman', 200, 4], [60, 'K. Benzema', 300, 90], [1, 'M. Abline', 100, 90]],
  };
  ensureInfluence(state);
  syncInfluence(state, s, { formation: { name: '4-4-2', gameName: '4-2-2-2' }, clubs: { 50: 200, 60: 300, 7: 100, 8: 100 }, previousClubs: null });
  return { state, s, aux };
}

test('demandes : impossibles quand elles n’ont pas de sens, chances sinon', () => {
  const ctx = career();
  assert.ok(ctx.state.influence.scoreInfo.score >= 60, `titulaire en forme, leader : ${ctx.state.influence.scoreInfo.score}`);
  // La page montre le score part par part : les points affichés doivent bien le faire (à l'arrondi près).
  const { score, parts } = ctx.state.influence.scoreInfo;
  const shown = parts.points.starts + parts.points.form + parts.points.role + parts.points.seniority + parts.track + parts.fans;
  assert.ok(Math.abs(shown - score) <= 2, `points ${shown}, score ${score}`);
  assert.strictEqual(assess('formation', { key: '4-2-2-2' }, ctx).blocked, 'same');
  assert.ok(assess('formation', { key: '4-3-3' }, ctx).chance > 40);
  assert.strictEqual(assess('signing', { playerId: 60 }, ctx).blocked, 'out_of_reach');
  assert.strictEqual(assess('signing', { playerId: 1 }, ctx).blocked, 'is_me');
  assert.ok(assess('signing', { playerId: 50 }, ctx).chance > 50, 'joueur peu utilisé d’un club plus modeste');
  assert.ok(assess('sale', { playerId: 7, toRef: 200 }, ctx).chance < assess('sale', { playerId: 8, toRef: 200 }, ctx).chance, 'un titulaire est plus dur à vendre');
  assert.strictEqual(assess('signing', { playerId: 50 }, { ...ctx, aux: { ...ctx.aux, squadSize: 40 } }).blocked, 'squad_full');
  // Poste à renforcer : un poste où le club manque de monde aide, un poste déjà fourni freine.
  const withPos = (depth) => ({ ...ctx, aux: { ...ctx.aux, depth, players: [[50, 'J. Westerman', 200, 4, 10]] } });
  const thin = assess('signing', { playerId: 50, pos: 10 }, withPos({ 10: 1 })), deep = assess('signing', { playerId: 50, pos: 10 }, withPos({ 10: 5 }));
  assert.ok(thin.reasons.includes('thin_position') && deep.reasons.includes('deep_position') && thin.difficulty < deep.difficulty);
  assert.strictEqual(assess('signing', { playerId: 50 }, withPos({ 10: 1 })).pos, 10, 'sans poste choisi : celui du joueur');
  assert.ok(!assess('signing', { playerId: 50, pos: 10 }, { ...ctx, aux: { ...ctx.aux, players: [[50, 'J. Westerman', 200, 4, 10]] } }).reasons.some((r) => r.endsWith('_position')), 'données sans postes');
});

test('recrues : en début de saison, le temps de jeu ne compte pas encore et la recherche par poste propose quand même', () => {
  const ctx = career();
  const games = (aux, ref, n) => ({ ...aux, clubs: { ...aux.clubs, [ref]: { ...aux.clubs[ref], games: n } } });
  assert.ok(assess('signing', { playerId: 50 }, { ...ctx, aux: games(ctx.aux, 200, 10) }).reasons.includes('fringe'));
  assert.ok(!assess('signing', { playerId: 50 }, { ...ctx, aux: games(ctx.aux, 200, 2) }).reasons.includes('fringe'), 'deux matchs joués : son temps de jeu ne dit rien');
  assert.ok(!assess('sale', { playerId: 7, toRef: 200 }, { ...ctx, aux: games(ctx.aux, 100, 0) }).reasons.includes('key_player'), 'pareil pour ses coéquipiers');
  // Par poste : un joueur à 0 % d'un club qui n'a pas encore joué est proposé, temps de jeu inconnu (null).
  const aux = { ...games(ctx.aux, 200, 0), players: [[50, 'J. Westerman', 200, 0, 10], [70, 'T. Lam', 200, 0, 10]] };
  const search = (state, a) => world.influenceSearch({ store: { activeCareer: () => ({ ...state, snapshot: ctx.s }), loadAux: () => a }, query: '', pos: 10 });
  assert.deepStrictEqual(search(ctx.state, aux).map((h) => [h.id, h.share]), [[50, null], [70, null]]);
  assert.strictEqual(search(ctx.state, games(aux, 200, 10)).length, 0, 'en cours de saison : 0 % de temps de jeu, pas proposé');
  // Influence faible : aucune chance à 15 %, les meilleures quand même plutôt qu'une liste vide.
  const low = career();
  low.state.influence.scoreInfo = { ...low.state.influence.scoreInfo, score: 0 };
  const hits = search(low.state, aux);
  assert.ok(hits.length === 2 && hits.every((h) => h.assess.chance < 15), hits.map((h) => h.assess.chance).join());
});

test('décisions : mercato fermé → en attente de son ouverture, puis prête, puis expirée', () => {
  const ctx = career();
  const a = { ...assess('signing', { playerId: 50 }, ctx), chance: 100 };
  const { request, effect } = decide(ctx.state, ctx.s, 'signing', { playerId: 50 }, a, ctx.aux);
  assert.ok(request.accepted);
  assert.deepStrictEqual([effect.status, effect.opens, effect.fromRef, effect.toRef], ['waiting', '2021-07-01', 200, 100]);
  assert.strictEqual(assess('signing', { playerId: 50 }, ctx).blocked, 'pending', 'une seule recrue à la fois');
  const clubs = { 50: 200, 7: 100, 8: 100 };
  syncInfluence(ctx.state, { ...ctx.s, gameDate: '2021-07-02' }, { formation: null, clubs });
  assert.strictEqual(effect.status, 'ready');
  syncInfluence(ctx.state, { ...ctx.s, gameDate: '2021-09-02' }, { formation: null, clubs });
  assert.strictEqual(effect.status, 'expired');
});

test('décisions : formation écrite puis gardée par le jeu, recrue partie ailleurs, coéquipier retenu', () => {
  const ctx = career();
  const { effect } = decide(ctx.state, ctx.s, 'formation', { key: '4-3-3' }, { ...assess('formation', { key: '4-3-3' }, ctx), chance: 100 }, ctx.aux);
  assert.strictEqual(effect.status, 'ready', 'la formation n’attend pas de mercato');
  Object.assign(effect, { status: 'applied', appliedOn: '2021-02-28' });
  syncInfluence(ctx.state, ctx.s, { formation: { name: '4-3-3', gameName: '4-3-3' }, clubs: {} });
  assert.strictEqual(effect.status, 'applied', 'même jour : le jeu n’a pas encore sauvegardé');
  const news = syncInfluence(ctx.state, { ...ctx.s, gameDate: '2021-03-06' }, { formation: { name: '4-3-3', gameName: '4-3-3' }, clubs: {} });
  assert.strictEqual(effect.status, 'confirmed');
  assert.strictEqual(news[0].kind, 'formation');

  const c2 = career();
  const { effect: sign } = decide(c2.state, c2.s, 'signing', { playerId: 50 }, { ...assess('signing', { playerId: 50 }, c2), chance: 100 }, c2.aux);
  syncInfluence(c2.state, c2.s, { formation: null, clubs: { 50: 300 } });
  assert.strictEqual(sign.status, 'cancelled', 'il a signé ailleurs');

  const c3 = career();
  decide(c3.state, c3.s, 'keep', { playerId: 7 }, { ...assess('keep', { playerId: 7 }, c3), chance: 100 }, c3.aux);
  const july = { ...c3.s, gameDate: '2021-07-15' };
  syncInfluence(c3.state, july, { formation: null, clubs: { 7: 200 }, previousClubs: { 7: 100 } });
  const undo = c3.state.influence.effects.find((e) => e.kind === 'undo');
  assert.deepStrictEqual([undo.status, undo.fromRef, undo.toRef], ['ready', 200, 100], 'vendu par le jeu : la vente est à défaire');
});

test('influence : rien n’est écrit tant que le réglage n’est pas activé', () => {
  const store = { activeCareer: () => { throw new Error('la carrière ne doit pas être lue'); } };
  assert.throws(() => world.influenceApply({ store, settings: {}, effectId: 'x' }), /désactivés/);
});

test('messages du jeu : un message non lu ajouté à sa date, rien si la liste est pleine', () => {
  const { messagesAt, addMessage, ARRIVAL } = require(path.join(ROOT, 'src/save/influenceWrite.js'));
  const EMPTY = Buffer.from('ff000000ffff000000000000ff0000000000000000000000ffffffffffff0000ffffffffffff000000000000'
    + 'ffff000000000000ffff000000000000ffffffffffffff7fff00ffffffff0000ffffff00', 'hex');
  const list = (dates) => {
    const d = Buffer.concat([Buffer.alloc(0x40, 0xaa), ...Array.from({ length: 128 }, () => Buffer.from(EMPTY)), Buffer.alloc(0x40, 0xaa)]);
    dates.forEach((date, r) => { const o = 0x40 + r * 0x50; d.writeUInt32LE(45 + r, o); d.writeUInt16LE(2020, o + 4); d[o + 6] = 8; d[o + 7] = date; });
    return d;
  };
  const d = list([21, 21, 25]);
  assert.strictEqual(messagesAt(d), 0x40);
  assert.ok(addMessage(d, { type: ARRIVAL, date: '2020-08-21', clubRef: 6881581, slot: 0x6ebc240f, playerId: 110691 }));
  const row = (r) => d.subarray(0x40 + r * 0x50, 0x40 + (r + 1) * 0x50);
  assert.deepStrictEqual([0, 1, 2, 3, 4].map((r) => row(r).readUInt32LE(0)), [45, 46, ARRIVAL, 47, 0xff], 'après les messages du même jour');
  assert.deepStrictEqual([row(2)[0x10], row(2).readUInt32LE(0x18), row(2).readUInt32LE(0x24), row(2).readUInt32LE(0x28), row(2)[7]], [1, 6881581, 0x6ebc240f, 110691, 21]);
  assert.ok(!addMessage(list(Array.from({ length: 128 }, () => 1)), { type: ARRIVAL, date: '2020-08-21', clubRef: 1, slot: 1, playerId: 1 }), 'liste pleine');
});

test('écriture : formation et transfert dans une copie de la sauvegarde', { skip: !(fs.existsSync(SAVE) && fs.existsSync(KEY)) && 'fichiers de référence absents' }, (ctx) => {
  const { decryptSave, setSaveKeys } = require(path.join(ROOT, 'src/save/pesCrypt.js'));
  ctx.after(() => setSaveKeys([]));
  setSaveKeys([fs.readFileSync(KEY)]);
  const { formationInData, transferInData, rosterAt, teamOffset, messagesAt, ARRIVAL, DEPARTURE } = require(path.join(ROOT, 'src/save/influenceWrite.js'));
  const { readCareer } = require(path.join(ROOT, 'src/save/blReader.js'));
  const d = decryptSave(fs.readFileSync(SAVE)).data;
  const c = readCareer(SAVE);
  const club = c.club.ref;
  const f = formationInData(d, { clubRef: club, phases: [P433, P433, P433] });
  const o = teamOffset(f.data, club);
  assert.strictEqual(gameName(readPhase(f.data, o + 0x4B0).roles), '4-3-3');
  assert.strictEqual(gameName(readPhase(f.data, o + 0x550).roles), '4-3-3');
  // Un joueur d'un autre club du championnat rejoint le club : effectifs, maillots et compteurs cohérents.
  const other = [...c.teams.values()].find((t) => t.ref !== club && t.roster.length > 20 && t.index < 300 && c.matches.some((m) => m.home.ref === t.ref && m.away.ref === club));
  const pid = other.roster.at(-1);
  const news = { clubRef: club, date: c.save.date };
  const t = transferInData(d, { playerId: pid, fromRef: other.ref, toRef: club, news });
  const a = rosterAt(t.data, teamOffset(t.data, other.ref)), b = rosterAt(t.data, teamOffset(t.data, club));
  assert.ok(!a.some((p) => p.id === pid) && b.at(-1).id === pid);
  assert.strictEqual(t.data[teamOffset(t.data, club) + 0x476], b.length);
  assert.strictEqual(new Set(b.map((p) => p.shirt)).size, b.length, 'numéros de maillot uniques');
  assert.throws(() => transferInData(t.data, { playerId: pid, fromRef: other.ref, toRef: club }), /n’est plus dans ce club/);
  // Le message du jeu : « Arrivée d'un nouveau » pour une recrue, « Départ d'un joueur » pour un coéquipier qui part.
  const told = (data, type, id) => { const s = messagesAt(data); return Array.from({ length: 128 }, (_, r) => s + r * 0x50).find((o) => data.readUInt32LE(o) === type && data.readUInt32LE(o + 0x28) === id); };
  assert.strictEqual(t.message, ARRIVAL);
  assert.ok(t.changes.includes('message') && told(t.data, ARRIVAL, pid) !== undefined && !told(d, ARRIVAL, pid));
  const mate = rosterAt(d, teamOffset(d, club)).find((p) => p.id !== c.player.id).id;
  const roomy = [...c.teams.values()].find((x) => x.ref !== club && x.roster.length < 38 && x.index < 300);
  const s = transferInData(d, { playerId: mate, fromRef: club, toRef: roomy.ref, news });
  assert.ok(s.message === DEPARTURE && told(s.data, DEPARTURE, mate) !== undefined);
  assert.strictEqual(transferInData(d, { playerId: pid, fromRef: other.ref, toRef: club }).message, null, 'sans club du joueur : pas de message');
});

test('jeu ouvert : Football Life aussi, pour ne jamais écrire dans une sauvegarde pendant qu’il tourne', () => {
  const { gameInTaskList } = require(path.join(__dirname, '..', 'src/save/offerRedirect.js'));
  const line = (exe) => `"${exe}","1234","Console","1","1 000 000 K"`;
  for (const exe of ['FL_2027.exe', 'fl_2026.EXE', 'FL2027.exe', 'PES2021.exe']) assert.ok(gameInTaskList(['"System","4","Services","0","24 K"', line(exe), line('explorer.exe')].join('\r\n')), exe);
  for (const exe of ['explorer.exe', 'FLauncher.exe', 'notFL_2027.exe', 'LifeLegend.exe']) assert.ok(!gameInTaskList(line(exe)), exe);
  assert.ok(!gameInTaskList(''));
});

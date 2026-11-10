'use strict';
// Le footballeur de l'année, la récompense du jeu (Football Life 2027, 2026-11-09 : Mbappé, 828 points) : lu dans la
// sauvegarde, annoncé une fois par le journal (en une, sauf quand le joueur fait l'actualité), débattu sur Kop, et gardé
// pour la page Récompenses.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { readPlayerOfYear } = require(path.join(ROOT, 'src/save/blReader.js'));
const { worldFootball, worldBrief } = require(path.join(ROOT, 'src/world/worldFootball.js'));
const world = require(path.join(ROOT, 'src/world/world.js'));
const prompts = require(path.join(ROOT, 'src/ai/prompts.js'));

const TABLE = 0xBEE290, STRIDE = 0x17D8;
// Une sauvegarde déchiffrée minimale : six emplacements numérotés, les années et podiums donnés.
function save(slots) {
  const d = Buffer.alloc(TABLE + 6 * STRIDE + 16, 0xFF);
  for (let k = 0; k < 6; k++) {
    const o = TABLE + k * STRIDE;
    d.writeUInt32LE(k, o);
    d.writeUInt32LE(0, o + 4);
    const s = slots[k];
    if (!s) continue;
    d.writeUInt32LE(s.year, o + 4);
    s.podium.forEach(([id, ref, pts], i) => { for (const base of [o + 8, o + 8 + 48]) { const r = base + i * 16; d.writeUInt32LE(1774061146, r); d.writeUInt32LE(id, r + 4); d.writeUInt32LE(ref, r + 8); d.writeUInt32LE(pts, r + 12); } });
  }
  return d;
}

test('footballeur de l’année : lu dans la sauvegarde, le plus récent d’abord', () => {
  const d = save({ 0: { year: 2026, podium: [[110718, 1785906, 828], [133543, 2834446, 552], [117047, 1785906, 364]] }, 1: { year: 2025, podium: [[110718, 1785906, 441], [133543, 2834446, 144], [110815, 1769514, 104]] } });
  assert.deepStrictEqual(readPlayerOfYear(d), [
    { year: 2026, podium: [{ id: 110718, teamRef: 1785906, points: 828 }, { id: 133543, teamRef: 2834446, points: 552 }, { id: 117047, teamRef: 1785906, points: 364 }] },
    { year: 2025, podium: [{ id: 110718, teamRef: 1785906, points: 441 }, { id: 133543, teamRef: 2834446, points: 144 }, { id: 110815, teamRef: 1769514, points: 104 }] },
  ]);
  assert.deepStrictEqual(readPlayerOfYear(save({ 1: { year: 2025, podium: [[110718, 1785906, 441]] } })).map((y) => y.year), [2025], 'l’année pas encore décernée est ignorée');
  const broken = save({});
  broken.writeUInt32LE(7, TABLE);
  assert.deepStrictEqual(readPlayerOfYear(broken), [], 'une autre sauvegarde (emplacements non numérotés) ne donne rien');
  assert.deepStrictEqual(readPlayerOfYear(Buffer.alloc(64)), [], 'une sauvegarde trop courte non plus');
});

const scores = {
  comps: [{ name: 'Ligue 2 BKT', kind: 'league', mine: true }], matches: [],
  teams: { 1785906: ['Real Madrid CF'], 2834446: ['Manchester City'], 1769514: ['FC Barcelona'] },
  poty: [{ year: 2026, podium: [['Kylian Mbappé', 1785906, 828, 0], ['Erling Haaland', 2834446, 552, 0], ['Vinícius Júnior', 1785906, 364, 0]] }, { year: 2025, podium: [['Kylian Mbappé', 1785906, 441, 0]] }],
};

test('footballeur de l’année : annoncé une fois, jamais un vieux palmarès', () => {
  const w = worldFootball(scores, { since: '2026-11-21', today: '2026-12-02' });
  assert.deepStrictEqual(w.awards.player_of_the_year, {
    year: 2026,
    ranking: [{ rank: 1, player: 'Kylian Mbappé', team: 'Real Madrid CF', points: 828 }, { rank: 2, player: 'Erling Haaland', team: 'Manchester City', points: 552 }, { rank: 3, player: 'Vinícius Júnior', team: 'Real Madrid CF', points: 364 }],
    previous: { year: 2025, winner: 'Kylian Mbappé', team: 'Real Madrid CF' },
  });
  assert.strictEqual(w.marks.poty, 2026);
  assert.strictEqual(worldFootball(scores, { since: '2026-11-21', today: '2026-12-02', seen: w.marks }), null, 'déjà annoncé');
  assert.ok(!worldFootball({ ...scores, poty: scores.poty.slice(1) }, { since: '2026-11-21', today: '2027-12-02' }), 'le palmarès d’avant la carrière n’est pas une nouvelle');
  assert.match(worldBrief(w).player_of_the_year, /« footballeur de l'année » 2026: 1\. Kylian Mbappé \(Real Madrid CF\) 828 points, 2\. Erling Haaland/);
});

test('footballeur de l’année : à la une du journal, sauf quand le joueur fait l’actualité', () => {
  const w = worldFootball(scores, { since: '2026-11-21', today: '2026-12-02' });
  const desk = world.transversaleDesk({ writers: {} });
  const angles = { world: { stories: [{ competition: 'Premier League', kind: 'league', matches: 10, totw: false, teams: ['Sunderland AFC', 'Liverpool FC'], story: 'x', weight: 50 }], debate: null, awards: w.awards } };
  const plan = world.transversalePlan(desk, {}, 'MATCH DAY', 3, angles);
  assert.strictEqual(plan[0].kind, 'les récompenses', 'en une');
  assert.match(plan[0].subject, /player of the year 2026 \(« footballeur de l'année »/);
  assert.match(plan[0].subject, /previous winner \(2025\)/);
  assert.strictEqual(plan[0].lead, 'the player of the year, his club and his points');
  const after = world.transversalePlan(desk, { after: { match: 'Nancy – Pau', competition: 'Ligue 2 BKT', date: '2026-11-28' } }, 'MATCH DAY', 3, { ...angles, big: true });
  assert.strictEqual(after[0].kind, 'récit du match', 'son actualité d’abord');
  assert.ok(after.some((p) => p.kind === 'les récompenses'));
  // Sans grand match mais avec le footballeur de l'année : le journal mondial en parle quand même.
  const alone = world.transversalePlan(desk, {}, 'MATCH DAY', 3, { world: { stories: [], debate: null, awards: w.awards } });
  assert.strictEqual(alone[0].kind, 'les récompenses');
  assert.match(prompts.transversaleSystem({ language: 'fr' }), /never the name of a real award \(Ballon d'Or, The Best\)/);
  assert.match(prompts.editionSystem({ language: 'fr' }, { transversale: true }), /« footballeur de l'année », never the name of a real award/);
});

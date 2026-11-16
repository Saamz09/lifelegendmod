'use strict';
// Sa blessure (2026-11-16, retour d'un joueur sur Discord : blessé, ni le staff ni les journalistes n'en parlaient). Le
// jeu donne seulement des jours d'indisponibilité ; quand ils tombent avec un match, l'édition est celle du match et
// rien ne la portait. Maintenant : un article de La Transversale, la consigne au staff, au Vestiaire, à Kop et au blog.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const world = require(path.join(__dirname, '..', 'src/world/world.js'));
const prompts = require(path.join(__dirname, '..', 'src/ai/prompts.js'));

const desk = ['Marc', 'Sofiane', 'Hélène', 'Bruno', 'Laura', 'Paul'].map((name, i) => ({ name, role: `r${i}` }));
const after = { match: 'SC Freiburg 2-1 Nottingham Forest', competition: 'UEFA Europa League', date: '2026-10-14' };
const POST_MATCH = 'POST-MATCH: cover the new results in CHANGES.newResults.';

test('blessure avec un match : un article de La Transversale lui est consacré', () => {
  const without = world.transversalePlan(desk, { after, before: null }, POST_MATCH, 3, {});
  const withIt = world.transversalePlan(desk, { after, before: null }, POST_MATCH, 3, { injury: { days: 12 } });
  assert.ok(!without.some((p) => /his injury/.test(p.subject)));
  const piece = withIt.find((p) => /his injury/.test(p.subject));
  assert.ok(piece, 'l’article sur la blessure');
  assert.match(piece.subject, /about 12 days/);
  assert.match(piece.subject, /never name the injury/);
});

test('blessure sans match : l’édition entière s’ouvre dessus, sans article en double', () => {
  const kind = 'INJURY: the player is now unavailable for about 12 days (CHANGES.injury). Lead with it.';
  const plan = world.transversalePlan(desk, { after: null, before: null }, kind, 3, { injury: { days: 12 } });
  assert.ok(plan.some((p) => p.focus === 'lead'));
  assert.ok(!plan.some((p) => /his injury/.test(p.subject)));
});

test('blessure : la consigne de l’édition (staff, Vestiaire, Kop, blog) et aucun diagnostic inventé', () => {
  const sys = prompts.editionSystem({ language: 'en' }, { transversale: true, huddle: true });
  assert.match(sys, /INJURY: CHANGES\.injury means he has just been injured/);
  assert.match(sys, /never name a body part/);
  assert.match(sys, /group chat/);
});

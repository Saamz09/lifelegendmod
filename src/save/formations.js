'use strict';
// Formations : 11 places [rôle] + [x, y] par phase de jeu, trois phases par tactique. Dans la sauvegarde, une phase est
// un bloc de 33 octets [11 rôles][11 × (x, y)] ; dans la base du jeu (TacticsFormation.bin), des lignes de 12 octets
// [u32 tactique][u32 rôle][x][y][place][0], places 0-10, 16-26 et 32-42 pour les trois phases.
// x = profondeur (3 pour le gardien, 43 pour l'attaque), y = largeur (16 à 88).

const { loadDbTable } = require('./gameDb');

const ROLES = ['GB', 'DC', 'DG', 'DD', 'MDC', 'MC', 'MG', 'MD', 'MOC', 'AG', 'AD', 'SA', 'AC'];
const PHASE = 33;

// Nom affiché par le jeu dans le plan de jeu : une ligne par famille de rôles (défenseurs, milieux défensifs, milieux
// centraux, milieux excentrés et offensifs, attaquants). Vérifié le 26/10/2026 : le 4-4-2 de la base (tactique 6949)
// s'affiche « 4-2-2-2 », le 4-3-3 d'Heerenveen « 4-3-3 ».
const GAME_LINE = [null, 0, 0, 0, 1, 2, 3, 3, 3, 4, 4, 4, 4];
function gameName(roles) {
  const lines = [0, 0, 0, 0, 0];
  for (const r of roles) if (r) lines[GAME_LINE[r]]++;
  return lines.filter(Boolean).join('-');
}

// Nom courant, celui des journalistes : les joueurs de champ rangés par profondeur, une nouvelle ligne à 5 d'écart.
function commonName(roles, xy) {
  const xs = roles.map((r, i) => (r ? xy[2 * i] : null)).filter((x) => x !== null).sort((a, b) => a - b);
  const lines = [];
  xs.forEach((x, i) => { if (i && x - xs[i - 1] < 5) lines[lines.length - 1]++; else lines.push(1); });
  return lines.join('-');
}

// Phase lue dans un bloc de 33 octets (ou null si ce n'est pas une formation).
function readPhase(buf, o = 0) {
  if (o + PHASE > buf.length) return null;
  const roles = [...buf.subarray(o, o + 11)];
  const xy = [...buf.subarray(o + 11, o + PHASE)];
  if (roles[0] !== 0 || roles.some((r) => r > 12) || roles.filter((r) => r === 0).length !== 1) return null;
  return { roles, xy };
}
const phaseBytes = (p) => Buffer.from([...p.roles, ...p.xy]);
const describe = (p) => ({ name: commonName(p.roles, p.xy), gameName: gameName(p.roles), roles: p.roles.map((r) => ROLES[r]) });

// Formations de la base du jeu : Map id de tactique → [3 phases], ou null si la base est introuvable.
function loadTemplates(gameDir) {
  const file = loadDbTable(gameDir, 'TacticsFormation.bin');
  if (!file) return null;
  const d = file.data, rows = new Map();
  for (let o = 0; o + 12 <= d.length; o += 12) {
    const id = d.readUInt32LE(o);
    if (!rows.has(id)) rows.set(id, []);
    rows.get(id).push({ role: d.readUInt32LE(o + 4), x: d[o + 8], y: d[o + 9], slot: d[o + 10] });
  }
  const out = new Map();
  for (const [id, r] of rows) {
    const phases = [0, 1, 2].map((p) => {
      const xi = r.filter((x) => x.slot >= 16 * p && x.slot < 16 * p + 11).sort((a, b) => a.slot - b.slot);
      return xi.length === 11 ? readPhase(Buffer.from([...xi.map((x) => x.role), ...xi.flatMap((x) => [x.x, x.y])])) : null;
    });
    if (phases.every(Boolean)) out.set(id, phases);
  }
  return out;
}

// Formations proposées à l'entraîneur : les plus courantes de la base, une par nom affiché dans le jeu, chacune
// représentée par sa variante la plus fréquente (mêmes rôles), au plus près de la moyenne (pas une variante exotique).
function formationOptions(templates, max = 12) {
  if (!templates) return [];
  const groups = new Map();
  for (const [id, phases] of templates) {
    const g = gameName(phases[0].roles);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push({ id, phases, roles: phases[0].roles.join() });
  }
  const options = [];
  for (const [g, items] of groups) {
    if (items.length < 6) continue;
    const byRoles = new Map();
    for (const it of items) byRoles.set(it.roles, [...(byRoles.get(it.roles) || []), it]);
    const common = [...byRoles.values()].sort((a, b) => b.length - a.length)[0];
    const mean = common[0].phases[0].xy.map((_, k) => common.reduce((s, it) => s + it.phases[0].xy[k], 0) / common.length);
    const dist = (it) => it.phases[0].xy.reduce((s, v, k) => s + (v - mean[k]) ** 2, 0);
    const best = common.reduce((a, b) => (dist(b) < dist(a) ? b : a));
    const d = describe(best.phases[0]);
    options.push({ key: g, name: d.name, gameName: g, roles: d.roles, count: items.length, template: best.id, phases: best.phases.map((p) => phaseBytes(p).toString('hex')) });
  }
  return options.sort((a, b) => b.count - a.count).slice(0, max);
}

module.exports = { ROLES, PHASE, gameName, commonName, readPhase, phaseBytes, describe, loadTemplates, formationOptions };

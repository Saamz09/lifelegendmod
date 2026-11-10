'use strict';
// Vérifie la lecture d'une sauvegarde sans lancer l'appli ni appeler l'IA.
// Usage : npm run check-save -- "C:\...\save\BL00000000"

const { readCareer } = require('../src/save/blReader');
const { buildSnapshot } = require('../src/world/snapshot');

const file = process.argv[2];
if (!file) {
  console.error('Usage : npm run check-save -- "<chemin vers BL00000000>"');
  process.exit(1);
}
const t0 = Date.now();
const career = readCareer(file);
const s = buildSnapshot(career);
console.log(`Lu en ${Date.now() - t0} ms · ${career.game}`);
console.log(`${s.player.name} (id ${s.player.id}) · ${s.club.name} (coach : ${s.club.coach}) · ${s.league.name} · ${s.gameDate} · saison ${s.season}`);
console.log(`Équipes : ${career.teams.size} · compétitions : ${career.competitions.size} · matchs : ${career.matches.length}`);
console.log('Stats saison :', s.stats.total);
console.log('Dernier match :', s.last && `${s.last.date} ${s.last.home} ${s.last.score.join('-')} ${s.last.away}`, s.last?.me || '');
console.log('Prochain match :', s.next && `${s.next.date} ${s.next.home} - ${s.next.away}`, s.next?.odds || '');
console.log('Classement :', s.table.slice(0, 5).map((r) => `${r.pos}. ${r.team} ${r.pts}`).join(' | '));
console.log('Autres championnats :', s.otherLeagues.map((l) => `${l.competition}: ${l.top[0]?.team}`).join(' | '));

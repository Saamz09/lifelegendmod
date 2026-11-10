'use strict';
// Humeur des supporters, calculée sur les faits de la sauvegarde (score, note, série, classement, promesses) :
// 0 calme, 1 grogne, 2 colère, 3 furieux. Elle dit aussi qui est visé : lui, l'équipe, ou les deux.
// L'IA règle la virulence des supporters là-dessus (règle 27 des consignes).

const opponent = (r) => (r.venue === 'domicile' ? r.away : r.home);

function fanMood({ changes, snapshot, settled = [], previous = null }) {
  let team = 0, player = 0;
  const reasons = [];
  for (const r of changes.newResults || []) {
    if (!r.played || !r.score) continue;
    const mine = r.venue === 'domicile' ? 0 : 1;
    const gf = r.score[mine], ga = r.score[1 - mine];
    if (gf < ga) { team += 1; reasons.push(`défaite ${gf}-${ga} contre ${opponent(r)}`); }
    if (ga - gf >= 3) { team += 2; reasons.push(`humiliation (${gf}-${ga})`); }
    if (gf > ga) team -= 1;
    const me = r.me;
    if (me && me.minutes >= 30 && me.rating != null) {
      if (me.rating < 5) { player += 3; reasons.push(`sa note : ${me.rating} (catastrophique)`); }
      else if (me.rating < 5.5) { player += 2; reasons.push(`sa note : ${me.rating} (${me.ratingWord})`); }
      else if (me.rating >= 7) player -= 2;
      if (me.goals) player -= me.goals;
    }
  }
  // Série et classement du club.
  const row = (snapshot.table || []).find((x) => x.mine);
  if (row) {
    let losses = 0;
    for (const f of [...(row.form || [])].reverse()) { if (f !== 'D') break; losses++; }
    if (losses >= 3) { team += losses >= 5 ? 2 : 1; reasons.push(`${losses} défaites de suite`); }
    const n = snapshot.table.length;
    if (n >= 10 && row.pos > n - 3 && row.p >= 8) { team += 1; reasons.push(`zone rouge (${row.pos}e)`); }
  }
  // Ses promesses non tenues : c'est lui qu'on vise.
  const broken = settled.filter((p) => p.status === 'broken');
  if (broken.length) { player += Math.min(2, broken.length * 2); reasons.push(`promesse non tenue : « ${broken[0].label} »`); }

  team = Math.max(0, team); player = Math.max(0, player);
  const score = team + player;
  const level = score >= 5 ? 3 : score >= 3 ? 2 : score >= 1 ? 1 : 0;
  const target = level === 0 ? null : player >= 2 && team >= 2 ? 'both' : player >= 2 ? 'player' : 'team';
  // Retournement : il sortait d'une crise (colère ou fureur) et tout le monde est content.
  const rebound = Boolean(previous && previous.level >= 2 && level === 0);
  return { level, target, reasons: reasons.slice(0, 5), since: snapshot.gameDate, previous_level: previous?.level ?? null, rebound };
}

module.exports = { fanMood };

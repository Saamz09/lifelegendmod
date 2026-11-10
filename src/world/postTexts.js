'use strict';
// Textes écrits par l'app sans IA, dans la langue choisie (réglage « Langue ») : posts des comptes officiels des
// clubs et des compétitions, ralentis et vidéos, réponses types des joueurs mentionnés, promesses, brief du matin.
// Une table par langue, avec la grammaire de chacune (élision, ordinaux, genre) ; le français est la référence.

const LOCALES = { fr: 'fr-FR', en: 'en-GB', es: 'es-ES', it: 'it-IT', pt: 'pt-BR', de: 'de-DE' };
const langOf = (l) => (LOCALES[l] ? l : 'fr');
const dateOf = (iso) => { const [y, m, d] = String(iso).split('-').map(Number); return new Date(y, m - 1, d); };
const hh = (h) => `${String(h).padStart(2, '0')}:00`;
const plural = (n, one, many) => (n > 1 ? many : one);
// « de » élidé devant une voyelle : « la 20e journée d’Eredivisie », pas « de Eredivisie ».
const deName = (n) => (/^[aeiouyhéèêàâîïôû]/i.test(String(n)) ? `d’${n}` : `de ${n}`);
// « de » devant une personne ou un club : élidé devant une voyelle (« d’Ilan Morel »), avec l'article des clubs qui
// s'écrivent avec leur sigle (« de l’AS Nancy Lorraine », « du FC Metz »). Pas devant un h ni un y : « de Hazard », « de Yanis ».
const deWho = (n) => {
  const s = String(n);
  if (/^(AS|US|USL|AC|AJ|EA|ES|OGC|Olympique|Athletic|Atlético|Inter)\b/.test(s)) return `de l’${s}`;
  if (/^(FC|RC|SC|SM|RB|Stade|Real|Racing|Red Star|Paris (FC|Saint|SG))\b/.test(s)) return `du ${s}`;
  return /^([aeiouéèêàâîïôû]|yv)/i.test(s) ? `d’${s}` : `de ${s}`;
};
// Italien : « del Twente », « dell’Heerenveen », « dello Sparta ».
const itArt = (prep, n) => {
  const s = String(n);
  const v = /^h?[aeiouàèéìòù]/i.test(s), lo = !v && /^(s[^aeiou]|z|gn|ps|x|y)/i.test(s);
  const forms = { '': ['l’', 'lo ', 'il '], di: ['dell’', 'dello ', 'del '], a: ['all’', 'allo ', 'al '], da: ['dall’', 'dallo ', 'dal '], con: ['con l’', 'con lo ', 'con il '], contro: ['contro l’', 'contro lo ', 'contro il '] }[prep];
  return `${forms[v ? 0 : lo ? 1 : 2]}${s}`;
};
const enOrd = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th')}`;

const T = {
  fr: {
    win: '✅ VICTOIRE !', draw: '🤝 Match nul.', loss: '❌ Défaite.', fullTime: 'C’EST TERMINÉ',
    feat: { hat: 'TRIPLÉ', brace: 'DOUBLÉ', goal: 'BUT', assist: 'PASSE DÉCISIVE' },
    featLine: (what, who, both, opp) => `${what} ${deWho(who)}${both} face à ${opp} !`,
    alsoAssists: (a) => (a > 1 ? ` et ${a} passes décisives` : ' et une passe décisive'),
    seasonGoal: (n) => `Son ${n === 1 ? '1er' : `${n}e`} but de la saison.`,
    motm: (who, r) => `⭐ Homme du match : ${who}${r ? `, noté ${r}` : ''}.`,
    joins: (name, club, from) => `✍️ OFFICIEL | ${name} rejoint ${club}${from ? `, en provenance ${deWho(from)}` : ''}. Bienvenue !`,
    leavesFor: (name, from, to) => `👋 ${name} quitte ${from} pour rejoindre ${to}. Merci et bonne continuation !`,
    leaves: (name, club, to) => `👋 ${name} quitte ${club}${to ? ` pour rejoindre ${to}` : ''}. Merci et bonne continuation !`,
    extends: (who, club, date) => `✍️ OFFICIEL | ${who} prolonge son contrat avec ${club} jusqu’au ${date} !`,
    ended: 'TERMINÉ',
    round: (n) => `${n === 1 ? '1re' : `${n}e`} journée`,
    resultsRound: (round) => `Résultats de la ${round}`,
    resultsDay: (acc, day) => `${acc} · résultats du ${day}`,
    more: (n) => `… et ${n} ${plural(n, 'autre match', 'autres matchs')}`,
    tableAfter: (round) => `Le classement après la ${round}`,
    pts: (n) => `${n} pts`,
    scorers: (acc) => `Meilleurs buteurs ${deName(acc)}`,
    ntList: (team, match) => `${team} : la liste${match ? ` pour ${match}` : ''}`,
    huddle: {
      nextMatch: (opp, day, hour, place) => `Prochain match : ${opp}, ${day}${hour != null ? ` à ${hour}h` : ''}${place ? `, ${place}` : ''}. Merci d’être à l’heure.`,
    },
    conduct: {
      warningSubject: () => 'Un mot sur ton comportement',
      warning: ({ quote, target }) => `Ce que tu as dit ${{ press: 'en conférence de presse', kop: 'sur Kop', huddle: 'dans le groupe' }[quote.source]} : « ${quote.quote} ». ${{ coach: 'Tu as le droit de ne pas être d’accord avec mes choix, pas de me manquer de respect.', teammates: 'On ne s’en prend pas à ses coéquipiers.', club: 'On ne parle pas comme ça du club qui te fait jouer.' }[target]} Je règle ça avec toi une fois, entre nous. La prochaine fois, le club prendra des mesures.`,
      leftOutSubject: (n) => (n > 1 ? 'Décision disciplinaire : écarté pour deux matchs' : 'Décision disciplinaire : écarté pour un match'),
      leftOut: ({ quote, labels }) => `Après tes propos ${{ press: 'en conférence de presse', kop: 'sur Kop', huddle: 'dans le groupe' }[quote.source]} (« ${quote.quote} »), et malgré les avertissements, le club a décidé de t’écarter du groupe pour ${labels.length > 1 ? `les deux prochains matchs : ${labels.join(' et ')}` : `le prochain match : ${labels[0]}`}. Cette décision ne se discute pas, quel que soit l’enjeu. On fera le point ensuite.`,
    },
    objectives: {
      item: (it, set) => {
        const n = it.target, x = ((v) => String(v).replace('.', ','))(it.target);
        if (it.kind === 'apps') return set.window ? `Jouer au moins ${n} de tes ${set.window} prochains matchs` : `Jouer au moins ${n} matchs de championnat`;
        if (it.kind === 'goals') return `Marquer ${n} ${n > 1 ? 'buts' : 'but'} en championnat`;
        if (it.kind === 'ga') return `Être décisif ${n} fois en championnat (buts et passes décisives)`;
        if (it.kind === 'clean') return `${n} ${n > 1 ? 'matchs' : 'match'} de championnat sans encaisser de but quand tu joues`;
        return set.window ? `Une note moyenne d’au moins ${x} sur ces matchs` : `Une note moyenne d’au moins ${x} en championnat`;
      },
      value: (it) => (it.kind === 'rating' ? (it.value == null ? '–' : ((v) => String(v).replace('.', ','))(it.value)) : String(it.value ?? 0)),
      setSubject: (kind) => ({ season: 'Tes objectifs pour la saison', second_half: 'Tes objectifs pour la fin de saison', comeback: 'Tes objectifs pour ton retour' }[kind]),
      setBody: ({ kind, lines }) => `${{ season: 'Voici ce que j’attends de toi cette saison :', second_half: 'Pour la fin de saison, voici ce que j’attends de toi :', comeback: 'Content de te revoir. Pour ton retour, voici ce que j’attends :' }[kind]}\n\n${lines.map((l) => `• ${l}`).join('\n')}\n\n${kind === 'comeback' ? 'Reviens à ton rythme, mais reviens fort. On en reparle après ces matchs.' : 'C’est à ta portée. On fera le point à la fin du championnat.'}`,
      reviewSubject: (kind) => (kind === 'comeback' ? 'Le bilan de ton retour' : 'Le bilan de tes objectifs'),
      review: ({ lines, verdict }) => `Le point sur tes objectifs :\n\n${lines.map((l) => `${l.met ? '✓' : '✗'} ${l.text} (${l.value})`).join('\n')}\n\n${{ all: 'Tout est rempli : c’est exactement ce que j’attendais de toi.', most: 'Une bonne partie est faite. Continue comme ça.', some: 'C’est un début, mais ce n’est pas assez.', none: 'On est loin du compte. J’attends une réaction.' }[verdict]}`,
    },
    dmInbound: {
      teammateGoal: (opp) => `Joli but contre ${opp}. Continue comme ça, on a besoin de toi.`,
      teammateAssist: (opp) => `Belle passe décisive contre ${opp}. Continue à nous servir comme ça.`,
      fanGood: (opp) => `Quel match contre ${opp} ! Merci pour ce que tu donnes au club.`,
      fanAngry: (opp) => `Franchement, contre ${opp}, ça n’allait pas du tout. On attend beaucoup mieux de toi.`,
    },
    coachAdvice: {
      subject: (area) => `Entraînement : ${{ shooting: 'la finition', stamina: 'l’endurance', passing: 'les passes', defending: 'le travail défensif', dribbling: 'le dribble', goalkeeping: 'le travail de gardien' }[area]}`,
      body: ({ area, reason: r }) => (r.form != null ? `Ta forme baisse en ce moment, et ça se voit sur le terrain. Renforce l’endurance dans ton programme d’entraînement pour retrouver du jus.` : r.rating != null ? `${String(r.rating).replace('.', ',')} de moyenne sur tes ${r.matches} derniers matchs : tes notes ne sont pas au niveau que j’attends. Mets plus de points sur ce domaine dans ton programme d’entraînement, ça doit revenir vite.` : {
        shooting: `Tu te crées des situations, mais ${r.goals} ${plural(r.goals, 'but', 'buts')} sur tes ${r.matches} derniers matchs, ce n’est pas assez pour un attaquant. Je veux te voir travailler la finition : mets plus de points sur les tirs dans ton programme d’entraînement. On en reparle dans quelques semaines.`,
        stamina: `Quand tu commences, tu sors en moyenne vers la ${r.minutes}e minute. J’ai besoin d’un joueur qui tient 90 minutes : renforce l’endurance dans ton programme d’entraînement.`,
        passing: `Aucune passe décisive sur tes ${r.matches} derniers matchs. Au milieu, on attend que tu fasses jouer les autres : travaille les passes à l’entraînement.`,
        defending: `On a encaissé ${r.conceded} buts sur nos ${r.matches} derniers matchs, et ça commence par le travail de chacun. Mets l’accent sur la défense dans ton programme d’entraînement.`,
      }[area]),
      replyFollow: 'Bien reçu, coach. Je change mon programme dès cette semaine.',
      replyIgnore: 'Merci pour le conseil, coach, mais je préfère garder mon programme pour l’instant.',
    },
    teamOfRound: (round) => `L’équipe type de la ${round}`,
    playerOfRound: (name, club, rating) => `Joueur de la journée : ${name} (${club}) · ${rating}`,
    lines: { gk: 'GB', def: 'DÉF', mid: 'MIL', att: 'ATT' },
    awards: (acc, season) => `Les trophées ${deName(acc)} ${season}`,
    awardNames: { bestPlayer: 'Meilleur joueur', topScorer: 'Meilleur buteur', topAssists: 'Meilleur passeur', bestKeeper: 'Meilleur gardien', xi: 'Équipe type de la saison' },
    matchday: 'JOUR DE MATCH', tomorrowCaps: 'DEMAIN',
    preview: (round, acc) => `La ${round} ${deName(acc)}`,
    today: 'Aujourd’hui', tomorrow: 'Demain', hour: (h) => `${h}h`,
    replayPlain: (m) => `🎥 Le ralenti du match ${m}.`,
    replay: [
      (min, who, m) => `🎥 ${min}e minute : ${who} fait trembler les filets ! ${m}`,
      (min, who, m) => `⚽ À revoir : le but ${deWho(who)} (${min}e) lors du match ${m}.`,
      (min, who, m) => `🔁 Ralenti : ${who} frappe à la ${min}e minute. ${m}`,
    ],
    clip: (who, min, m) => `📹 La vidéo : le but ${deWho(who)} (${min}e), ${m}.`,
    clipPlain: (m) => `📹 Les images du match ${m}.`,
    canned: {
      teammate: {
        praise: ['Merci frérot 🙏', 'Ensemble 💪', 'On continue comme ça !', '❤️', 'Toujours derrière toi 🤝', 'Le travail paie 👊'],
        neutral: ['👊', '🙌', 'On bosse 💪'],
        question: ['On verra bien 😉', 'Concentré sur le prochain match.', 'Tout le monde est prêt 💪'],
        trash: [],
      },
      opponent: {
        praise: ['Respect 🤝', 'Merci, bonne continuation.', '🙏'],
        neutral: ['👊', 'Rendez-vous sur le terrain.'],
        question: ['On verra sur le terrain.', 'Le match répondra.'],
        trash: ['On en reparle sur le terrain.', '😂😂', 'Rendez-vous au coup d’envoi.', 'Parle moins, joue plus.', '🥱'],
      },
    },
    promise: {
      goal: (c, opp) => `marquer ${c > 1 ? `${c} buts ` : ''}contre ${opp}`,
      assist: (c, opp) => `faire ${c > 1 ? `${c} passes décisives` : 'une passe décisive'} contre ${opp}`,
      goal_or_assist: (c, opp) => `être décisif contre ${opp}`,
      win: (c, opp) => `battre ${opp}`,
      unbeaten: (c, opp) => `ne pas perdre contre ${opp}`,
      clean_sheet: (c, opp) => `ne pas encaisser de but contre ${opp}`,
      season_goals: (c) => `marquer ${c} buts cette saison`,
      season_assists: (c) => `faire ${c} passes décisives cette saison`,
      title: (c, opp, league) => `remporter ${league || 'le championnat'}`,
    },
    judge: {
      otherClub: 'il ne jouait plus pour ce club', didNotPlay: 'il n’a pas joué ce match', notTracked: 'saison non suivie', noMatch: 'match introuvable',
      goals: (n) => `${n} ${plural(n, 'but', 'buts')}`, assists: (n) => `${n} ${plural(n, 'passe décisive', 'passes décisives')}`,
      either: (n) => `${n} but(s) ou passe(s)`, season: (n) => `${n} cette saison`, champion: 'champion',
      finalPos: (p) => `${p}e au classement final`, endOfSeason: (n) => `${n} en fin de saison`,
    },
    brief: {
      subject: (d) => `Le brief du matin · ${d}`,
      hello: 'Bonjour,',
      intro: (d) => `Voici l’essentiel de La Transversale du ${d}.`,
      last: (m, comp) => `Le dernier match : ${m}${comp ? ` (${comp})` : ''}.`,
      table: (club, pos, league, pts) => `Le classement : ${club} est ${pos === 1 ? '1er' : `${pos}e`} ${league ? deName(league) : 'de son championnat'} avec ${pts} ${plural(pts, 'point', 'points')}.`,
      next: (m, day, h) => `Le prochain rendez-vous : ${m}, ${day}${h != null ? ` à ${h}h` : ''}.`,
      heads: (list) => `À la une :\n${list}`,
      signoff: 'Bonne lecture,\nLa rédaction de La Transversale',
      footer: 'Tu reçois ce brief grâce à ton abonnement sur latransversale.foot. Pour l’arrêter : « Se désabonner », en bas de la une.',
      yourClub: 'ton club',
    },
    agentSubject: { offer: 'Offre reçue', open: 'Le mercato est ouvert', eve: 'Dernier jour du mercato' },
  },

  en: {
    win: '✅ WIN!', draw: '🤝 Draw.', loss: '❌ Defeat.', fullTime: 'FULL TIME',
    feat: { hat: 'HAT-TRICK', brace: 'BRACE', goal: 'GOAL', assist: 'ASSIST' },
    featLine: (what, who, both, opp) => `${what} for ${who}${both} against ${opp}!`,
    alsoAssists: (a) => (a > 1 ? ` and ${a} assists` : ' and an assist'),
    seasonGoal: (n) => `His ${enOrd(n)} goal of the season.`,
    motm: (who, r) => `⭐ Man of the match: ${who}${r ? `, rated ${r}` : ''}.`,
    joins: (name, club, from) => `✍️ OFFICIAL | ${name} joins ${club}${from ? ` from ${from}` : ''}. Welcome!`,
    leavesFor: (name, from, to) => `👋 ${name} leaves ${from} to join ${to}. Thank you and good luck!`,
    leaves: (name, club, to) => `👋 ${name} leaves ${club}${to ? ` to join ${to}` : ''}. Thank you and good luck!`,
    extends: (who, club, date) => `✍️ OFFICIAL | ${who} extends his contract with ${club} until ${date}!`,
    ended: 'FULL TIME',
    round: (n) => `Matchday ${n}`,
    resultsRound: (round) => `${round} results`,
    resultsDay: (acc, day) => `${acc} · results for ${day}`,
    more: (n) => `… and ${n} ${plural(n, 'other match', 'other matches')}`,
    tableAfter: (round) => `The table after ${round}`,
    pts: (n) => `${n} pts`,
    scorers: (acc) => `Top scorers · ${acc}`,
    ntList: (team, match) => `${team} squad${match ? ` for ${match}` : ''}`,
    huddle: {
      nextMatch: (opp, day, hour, place) => `Next match: ${opp}, ${day}${hour != null ? ` at ${hour}:00` : ''}${place ? `, ${place}` : ''}. Please be on time.`,
    },
    conduct: {
      warningSubject: () => 'A word about your behaviour',
      warning: ({ quote, target }) => `What you said ${{ press: 'at the press conference', kop: 'on Kop', huddle: 'in the group chat' }[quote.source]}: “${quote.quote}”. ${{ coach: 'You can disagree with my choices, but you don’t disrespect me.', teammates: 'We don’t go after our own teammates.', club: 'You don’t talk like that about the club that plays you.' }[target]} I’m dealing with this once, between us. Next time, the club will take action.`,
      leftOutSubject: (n) => (n > 1 ? 'Disciplinary decision: left out for two matches' : 'Disciplinary decision: left out for one match'),
      leftOut: ({ quote, labels }) => `After your words ${{ press: 'at the press conference', kop: 'on Kop', huddle: 'in the group chat' }[quote.source]} (“${quote.quote}”), and despite the warnings, the club has decided to leave you out of the squad for ${labels.length > 1 ? `the next two matches: ${labels.join(' and ')}` : `the next match: ${labels[0]}`}. This decision is final, whatever is at stake. We’ll talk again after that.`,
    },
    objectives: {
      item: (it, set) => {
        const n = it.target, x = ((v) => String(v))(it.target);
        if (it.kind === 'apps') return set.window ? `Play at least ${n} of your next ${set.window} matches` : `Play at least ${n} league matches`;
        if (it.kind === 'goals') return `Score ${n} league ${n > 1 ? 'goals' : 'goal'}`;
        if (it.kind === 'ga') return `Be decisive ${n} times in the league (goals and assists)`;
        if (it.kind === 'clean') return `${n} league ${n > 1 ? 'matches' : 'match'} without conceding when you play`;
        return set.window ? `An average rating of at least ${x} in those matches` : `An average rating of at least ${x} in the league`;
      },
      value: (it) => (it.kind === 'rating' ? (it.value == null ? '–' : ((v) => String(v))(it.value)) : String(it.value ?? 0)),
      setSubject: (kind) => ({ season: 'Your objectives for the season', second_half: 'Your objectives for the rest of the season', comeback: 'Your objectives for your comeback' }[kind]),
      setBody: ({ kind, lines }) => `${{ season: 'Here is what I expect from you this season:', second_half: 'For the rest of the season, here is what I expect from you:', comeback: 'Good to have you back. For your comeback, here is what I expect:' }[kind]}\n\n${lines.map((l) => `• ${l}`).join('\n')}\n\n${kind === 'comeback' ? 'Come back at your own pace, but come back strong. We will talk again after those matches.' : 'It is within your reach. We will review it at the end of the league season.'}`,
      reviewSubject: (kind) => (kind === 'comeback' ? 'Your comeback: the review' : 'Your objectives: the review'),
      review: ({ lines, verdict }) => `Where you stand on your objectives:\n\n${lines.map((l) => `${l.met ? '✓' : '✗'} ${l.text} (${l.value})`).join('\n')}\n\n${{ all: 'Everything is done: exactly what I expected from you.', most: 'A good part of it is done. Keep it up.', some: 'It is a start, but it is not enough.', none: 'We are far from it. I expect a reaction.' }[verdict]}`,
    },
    dmInbound: {
      teammateGoal: (opp) => `Nice goal against ${opp}. Keep it up, we need you.`,
      teammateAssist: (opp) => `Great assist against ${opp}. Keep feeding us like that.`,
      fanGood: (opp) => `What a game against ${opp}! Thanks for everything you give the club.`,
      fanAngry: (opp) => `Honestly, that wasn’t good enough against ${opp}. We expect a lot more from you.`,
    },
    coachAdvice: {
      subject: (area) => `Training: ${{ shooting: 'finishing', stamina: 'stamina', passing: 'passing', defending: 'defensive work', dribbling: 'dribbling', goalkeeping: 'goalkeeping' }[area]}`,
      body: ({ area, reason: r }) => (r.form != null ? `Your form is dipping at the moment, and it shows on the pitch. Build up your stamina in your training plan to get your legs back.` : r.rating != null ? `A ${r.rating} average over your last ${r.matches} matches: your ratings aren’t at the level I expect. Put more points into this area in your training plan, it should come back quickly.` : {
        shooting: `You get into good positions, but ${r.goals} ${(r.goals === 1 ? 'goal' : 'goals')} in your last ${r.matches} matches is not enough for a forward. I want to see you work on your finishing: put more points into shooting in your training plan. We’ll talk again in a few weeks.`,
        stamina: `When you start, you come off around the ${r.minutes}th minute on average. I need a player who lasts 90 minutes: build up your stamina in your training plan.`,
        passing: `No assists in your last ${r.matches} matches. In midfield we need you to bring the others into the game: work on your passing in training.`,
        defending: `We have conceded ${r.conceded} goals in our last ${r.matches} matches, and it starts with everyone’s work. Put the emphasis on defending in your training plan.`,
      }[area]),
      replyFollow: 'Understood, coach. I’m changing my plan this week.',
      replyIgnore: 'Thanks for the advice, coach, but I’d rather keep my plan for now.',
    },
    teamOfRound: (round) => `Team of ${round}`,
    playerOfRound: (name, club, rating) => `Player of the matchday: ${name} (${club}) · ${rating}`,
    lines: { gk: 'GK', def: 'DEF', mid: 'MID', att: 'FWD' },
    awards: (acc, season) => `${acc} ${season} awards`,
    awardNames: { bestPlayer: 'Player of the season', topScorer: 'Top scorer', topAssists: 'Most assists', bestKeeper: 'Goalkeeper of the season', xi: 'Team of the season' },
    matchday: 'MATCHDAY', tomorrowCaps: 'TOMORROW',
    preview: (round, acc) => `${acc} · ${round}`,
    today: 'Today', tomorrow: 'Tomorrow', hour: hh,
    replayPlain: (m) => `🎥 Replay: ${m}.`,
    replay: [
      (min, who, m) => `🎥 ${min}' — ${who} finds the net! ${m}`,
      (min, who, m) => `⚽ Watch it again: ${who}'s goal (${min}') in ${m}.`,
    ],
    clip: (who, min, m) => `📹 The video: ${who}'s goal (${min}'), ${m}.`,
    clipPlain: (m) => `📹 Footage from ${m}.`,
    canned: {
      teammate: { praise: ['Thanks bro 🙏', 'Together 💪', 'Keep it going!', '❤️', 'Always behind you 🤝', 'Hard work pays off 👊'], neutral: ['👊', '🙌', 'Back to work 💪'], question: ['We’ll see 😉', 'Focused on the next one.', 'Everyone’s ready 💪'], trash: [] },
      opponent: { praise: ['Respect 🤝', 'Thanks, all the best.', '🙏'], neutral: ['👊', 'See you on the pitch.'], question: ['The pitch will answer.', 'The match will decide.'], trash: ['Talk on the pitch.', '😂😂', 'See you at kick-off.', 'Talk less, play more.', '🥱'] },
    },
    promise: {
      goal: (c, opp) => `score ${c > 1 ? `${c} goals ` : ''}against ${opp}`,
      assist: (c, opp) => `make ${c > 1 ? `${c} assists` : 'an assist'} against ${opp}`,
      goal_or_assist: (c, opp) => `be decisive against ${opp}`,
      win: (c, opp) => `beat ${opp}`,
      unbeaten: (c, opp) => `not lose to ${opp}`,
      clean_sheet: (c, opp) => `keep a clean sheet against ${opp}`,
      season_goals: (c) => `score ${c} goals this season`,
      season_assists: (c) => `make ${c} assists this season`,
      title: (c, opp, league) => `win ${league || 'the league'}`,
    },
    judge: {
      otherClub: 'he no longer played for this club', didNotPlay: 'he didn’t play this match', notTracked: 'season not tracked', noMatch: 'match not found',
      goals: (n) => `${n} ${plural(n, 'goal', 'goals')}`, assists: (n) => `${n} ${plural(n, 'assist', 'assists')}`,
      either: (n) => `${n} goal(s) or assist(s)`, season: (n) => `${n} this season`, champion: 'champions',
      finalPos: (p) => `${enOrd(p)} in the final table`, endOfSeason: (n) => `${n} at the end of the season`,
    },
    brief: {
      subject: (d) => `The morning brief · ${d}`,
      hello: 'Hello,',
      intro: (d) => `Here are the essentials from La Transversale for ${d}.`,
      last: (m, comp) => `The last match: ${m}${comp ? ` (${comp})` : ''}.`,
      table: (club, pos, league, pts) => `The table: ${club} are ${enOrd(pos)} ${league ? `in ${league}` : 'in their league'} with ${pts} ${plural(pts, 'point', 'points')}.`,
      next: (m, day, h) => `Next up: ${m}, ${day}${h != null ? ` at ${hh(h)}` : ''}.`,
      heads: (list) => `Top stories:\n${list}`,
      signoff: 'Enjoy the read,\nThe La Transversale newsroom',
      footer: 'You get this brief because you subscribed on latransversale.foot. To stop it: “Unsubscribe”, at the bottom of the front page.',
      yourClub: 'your club',
    },
    agentSubject: { offer: 'Offer received', open: 'The transfer window is open', eve: 'Last day of the transfer window' },
  },

  es: {
    win: '✅ ¡VICTORIA!', draw: '🤝 Empate.', loss: '❌ Derrota.', fullTime: 'FINAL DEL PARTIDO',
    feat: { hat: 'HAT-TRICK', brace: 'DOBLETE', goal: 'GOL', assist: 'ASISTENCIA' },
    featLine: (what, who, both, opp) => `¡${what} de ${who}${both} ante ${opp}!`,
    alsoAssists: (a) => (a > 1 ? ` y ${a} asistencias` : ' y una asistencia'),
    seasonGoal: (n) => `Su ${n}.º gol de la temporada.`,
    motm: (who, r) => `⭐ Jugador del partido: ${who}${r ? `, con un ${r}` : ''}.`,
    joins: (name, club, from) => `✍️ OFICIAL | ${name} se une al ${club}${from ? `, procedente del ${from}` : ''}. ¡Bienvenido!`,
    leavesFor: (name, from, to) => `👋 ${name} deja el ${from} para unirse al ${to}. ¡Gracias y mucha suerte!`,
    leaves: (name, club, to) => `👋 ${name} deja el ${club}${to ? ` para unirse al ${to}` : ''}. ¡Gracias y mucha suerte!`,
    extends: (who, club, date) => `✍️ OFICIAL | ${who} renueva su contrato con el ${club} hasta el ${date}.`,
    ended: 'FINAL',
    round: (n) => `Jornada ${n}`,
    resultsRound: (round) => `Resultados de la ${round}`,
    resultsDay: (acc, day) => `${acc} · resultados del ${day}`,
    more: (n) => `… y ${n} ${plural(n, 'partido más', 'partidos más')}`,
    tableAfter: (round) => `La clasificación tras la ${round}`,
    pts: (n) => `${n} pts`,
    scorers: (acc) => `Máximos goleadores · ${acc}`,
    ntList: (team, match) => `${team}: la convocatoria${match ? ` para el ${match}` : ''}`,
    huddle: {
      nextMatch: (opp, day, hour, place) => `Próximo partido: ${opp}, ${day}${hour != null ? ` a las ${hour}:00` : ''}${place ? `, ${place}` : ''}. Sed puntuales, por favor.`,
    },
    conduct: {
      warningSubject: () => 'Unas palabras sobre tu comportamiento',
      warning: ({ quote, target }) => `Lo que dijiste ${{ press: 'en la rueda de prensa', kop: 'en Kop', huddle: 'en el grupo' }[quote.source]}: «${quote.quote}». ${{ coach: 'Puedes no estar de acuerdo con mis decisiones, pero no faltarme al respeto.', teammates: 'A los compañeros no se les ataca.', club: 'No se habla así del club que te da minutos.' }[target]} Esto lo arreglo contigo una vez, entre nosotros. La próxima vez, el club tomará medidas.`,
      leftOutSubject: (n) => (n > 1 ? 'Decisión disciplinaria: fuera de la convocatoria dos partidos' : 'Decisión disciplinaria: fuera de la convocatoria un partido'),
      leftOut: ({ quote, labels }) => `Tras tus palabras ${{ press: 'en la rueda de prensa', kop: 'en Kop', huddle: 'en el grupo' }[quote.source]} («${quote.quote}») y a pesar de las advertencias, el club ha decidido dejarte fuera de la convocatoria ${labels.length > 1 ? `los dos próximos partidos: ${labels.join(' y ')}` : `el próximo partido: ${labels[0]}`}. La decisión es firme, sea cual sea lo que está en juego. Hablaremos después.`,
    },
    objectives: {
      item: (it, set) => {
        const n = it.target, x = ((v) => String(v).replace('.', ','))(it.target);
        if (it.kind === 'apps') return set.window ? `Jugar al menos ${n} de tus ${set.window} próximos partidos` : `Jugar al menos ${n} partidos de liga`;
        if (it.kind === 'goals') return `Marcar ${n} ${n > 1 ? 'goles' : 'gol'} en liga`;
        if (it.kind === 'ga') return `Ser decisivo ${n} veces en liga (goles y asistencias)`;
        if (it.kind === 'clean') return `${n} ${n > 1 ? 'partidos' : 'partido'} de liga sin encajar cuando juegas`;
        return set.window ? `Una nota media de al menos ${x} en esos partidos` : `Una nota media de al menos ${x} en liga`;
      },
      value: (it) => (it.kind === 'rating' ? (it.value == null ? '–' : ((v) => String(v).replace('.', ','))(it.value)) : String(it.value ?? 0)),
      setSubject: (kind) => ({ season: 'Tus objetivos para la temporada', second_half: 'Tus objetivos para el final de temporada', comeback: 'Tus objetivos para tu vuelta' }[kind]),
      setBody: ({ kind, lines }) => `${{ season: 'Esto es lo que espero de ti esta temporada:', second_half: 'Para el final de temporada, esto es lo que espero de ti:', comeback: 'Me alegra tenerte de vuelta. Para tu regreso, esto es lo que espero:' }[kind]}\n\n${lines.map((l) => `• ${l}`).join('\n')}\n\n${kind === 'comeback' ? 'Vuelve a tu ritmo, pero vuelve fuerte. Lo hablamos después de esos partidos.' : 'Está a tu alcance. Haremos balance al final de la liga.'}`,
      reviewSubject: (kind) => (kind === 'comeback' ? 'El balance de tu vuelta' : 'El balance de tus objetivos'),
      review: ({ lines, verdict }) => `Así van tus objetivos:\n\n${lines.map((l) => `${l.met ? '✓' : '✗'} ${l.text} (${l.value})`).join('\n')}\n\n${{ all: 'Todo cumplido: es exactamente lo que esperaba de ti.', most: 'Buena parte está hecha. Sigue así.', some: 'Es un comienzo, pero no es suficiente.', none: 'Estamos lejos. Espero una reacción.' }[verdict]}`,
    },
    dmInbound: {
      teammateGoal: (opp) => `Buen gol contra ${opp}. Sigue así, te necesitamos.`,
      teammateAssist: (opp) => `Gran asistencia contra ${opp}. Sigue dándonos balones así.`,
      fanGood: (opp) => `¡Qué partido contra ${opp}! Gracias por todo lo que le das al club.`,
      fanAngry: (opp) => `Sinceramente, contra ${opp} no estuviste nada bien. Esperamos mucho más de ti.`,
    },
    coachAdvice: {
      subject: (area) => `Entrenamiento: ${{ shooting: 'la definición', stamina: 'la resistencia', passing: 'el pase', defending: 'el trabajo defensivo', dribbling: 'el regate', goalkeeping: 'el trabajo de portero' }[area]}`,
      body: ({ area, reason: r }) => (r.form != null ? `Tu forma está bajando ahora mismo, y se nota en el campo. Refuerza la resistencia en tu plan de entrenamiento para recuperar piernas.` : r.rating != null ? `${String(r.rating).replace('.', ',')} de media en tus últimos ${r.matches} partidos: tus notas no están al nivel que espero. Pon más puntos en este aspecto en tu plan de entrenamiento, debería volver pronto.` : {
        shooting: `Te generas ocasiones, pero ${r.goals} ${(r.goals === 1 ? 'gol' : 'goles')} en tus últimos ${r.matches} partidos no es suficiente para un delantero. Quiero verte trabajar la definición: pon más puntos en el tiro en tu plan de entrenamiento. Lo hablamos en unas semanas.`,
        stamina: `Cuando eres titular, sales de media hacia el minuto ${r.minutes}. Necesito un jugador que aguante 90 minutos: refuerza la resistencia en tu plan de entrenamiento.`,
        passing: `Ninguna asistencia en tus últimos ${r.matches} partidos. En el medio esperamos que hagas jugar a los demás: trabaja el pase en los entrenamientos.`,
        defending: `Hemos encajado ${r.conceded} goles en los últimos ${r.matches} partidos, y empieza por el trabajo de cada uno. Pon el acento en la defensa en tu plan de entrenamiento.`,
      }[area]),
      replyFollow: 'Entendido, míster. Cambio mi plan esta misma semana.',
      replyIgnore: 'Gracias por el consejo, míster, pero prefiero mantener mi plan por ahora.',
    },
    teamOfRound: (round) => `El once ideal de la ${round}`,
    playerOfRound: (name, club, rating) => `Jugador de la jornada: ${name} (${club}) · ${rating}`,
    lines: { gk: 'POR', def: 'DEF', mid: 'MED', att: 'DEL' },
    awards: (acc, season) => `Los premios de ${acc} ${season}`,
    awardNames: { bestPlayer: 'Mejor jugador', topScorer: 'Máximo goleador', topAssists: 'Máximo asistente', bestKeeper: 'Mejor portero', xi: 'Once ideal de la temporada' },
    matchday: 'DÍA DE PARTIDO', tomorrowCaps: 'MAÑANA',
    preview: (round, acc) => `${acc} · ${round}`,
    today: 'Hoy', tomorrow: 'Mañana', hour: hh,
    replayPlain: (m) => `🎥 Repetición: ${m}.`,
    replay: [
      (min, who, m) => `🎥 Minuto ${min}: ¡${who} hace temblar la red! ${m}`,
      (min, who, m) => `⚽ Para volver a verlo: el gol de ${who} (${min}') en ${m}.`,
      (min, who, m) => `🔁 Repetición: ${who} remata en el minuto ${min}. ${m}`,
    ],
    clip: (who, min, m) => `📹 El vídeo: el gol de ${who} (${min}'), ${m}.`,
    clipPlain: (m) => `📹 Imágenes: ${m}.`,
    canned: {
      teammate: { praise: ['Gracias, hermano 🙏', 'Juntos 💪', '¡Seguimos así!', '❤️', 'Siempre contigo 🤝', 'El trabajo da sus frutos 👊'], neutral: ['👊', '🙌', 'A currar 💪'], question: ['Ya veremos 😉', 'Centrados en el próximo partido.', 'Todos listos 💪'], trash: [] },
      opponent: { praise: ['Respeto 🤝', 'Gracias, mucha suerte.', '🙏'], neutral: ['👊', 'Nos vemos en el campo.'], question: ['Ya hablará el campo.', 'El partido dará la respuesta.'], trash: ['Hablamos en el campo.', '😂😂', 'Nos vemos en el pitido inicial.', 'Menos hablar y más jugar.', '🥱'] },
    },
    promise: {
      goal: (c, opp) => `marcar ${c > 1 ? `${c} goles ` : ''}ante ${opp}`,
      assist: (c, opp) => `dar ${c > 1 ? `${c} asistencias` : 'una asistencia'} ante ${opp}`,
      goal_or_assist: (c, opp) => `ser decisivo ante ${opp}`,
      win: (c, opp) => `ganar a ${opp}`,
      unbeaten: (c, opp) => `no perder ante ${opp}`,
      clean_sheet: (c, opp) => `no encajar goles ante ${opp}`,
      season_goals: (c) => `marcar ${c} goles esta temporada`,
      season_assists: (c) => `dar ${c} asistencias esta temporada`,
      title: (c, opp, league) => `ganar ${league || 'la liga'}`,
    },
    judge: {
      otherClub: 'ya no jugaba en este club', didNotPlay: 'no jugó este partido', notTracked: 'temporada no seguida', noMatch: 'partido no encontrado',
      goals: (n) => `${n} ${plural(n, 'gol', 'goles')}`, assists: (n) => `${n} ${plural(n, 'asistencia', 'asistencias')}`,
      either: (n) => `${n} gol(es) o asistencia(s)`, season: (n) => `${n} esta temporada`, champion: 'campeón',
      finalPos: (p) => `${p}.º en la clasificación final`, endOfSeason: (n) => `${n} al final de la temporada`,
    },
    brief: {
      subject: (d) => `El resumen matinal · ${d}`,
      hello: 'Hola:',
      intro: (d) => `Esto es lo esencial de La Transversale del ${d}.`,
      last: (m, comp) => `El último partido: ${m}${comp ? ` (${comp})` : ''}.`,
      table: (club, pos, league, pts) => `La clasificación: el ${club} es ${pos}.º ${league ? `de ${league}` : 'de su liga'} con ${pts} ${plural(pts, 'punto', 'puntos')}.`,
      next: (m, day, h) => `La próxima cita: ${m}, ${day}${h != null ? ` a las ${hh(h)}` : ''}.`,
      heads: (list) => `En portada:\n${list}`,
      signoff: 'Buena lectura,\nLa redacción de La Transversale',
      footer: 'Recibes este resumen porque te suscribiste en latransversale.foot. Para detenerlo: «Darse de baja», al pie de la portada.',
      yourClub: 'tu club',
    },
    agentSubject: { offer: 'Oferta recibida', open: 'El mercado está abierto', eve: 'Último día del mercado' },
  },

  it: {
    win: '✅ VITTORIA!', draw: '🤝 Pareggio.', loss: '❌ Sconfitta.', fullTime: 'FINALE',
    feat: { hat: 'TRIPLETTA', brace: 'DOPPIETTA', goal: 'GOL', assist: 'ASSIST' },
    featLine: (what, who, both, opp) => `${what} di ${who}${both} ${itArt('contro', opp)}!`,
    alsoAssists: (a) => (a > 1 ? ` e ${a} assist` : ' e un assist'),
    seasonGoal: (n) => `Il suo ${n}º gol stagionale.`,
    motm: (who, r) => `⭐ Uomo partita: ${who}${r ? `, voto ${r}` : ''}.`,
    joins: (name, club, from) => `✍️ UFFICIALE | ${name} è un nuovo giocatore ${itArt('di', club)}${from ? `, arriva ${itArt('da', from)}` : ''}. Benvenuto!`,
    leavesFor: (name, from, to) => `👋 ${name} lascia ${itArt('', from)} per trasferirsi ${itArt('a', to)}. Grazie e in bocca al lupo!`,
    leaves: (name, club, to) => `👋 ${name} lascia ${itArt('', club)}${to ? ` per trasferirsi ${itArt('a', to)}` : ''}. Grazie e in bocca al lupo!`,
    extends: (who, club, date) => `✍️ UFFICIALE | ${who} rinnova ${itArt('con', club)} fino al ${date}!`,
    ended: 'FINALE',
    round: (n) => `${n}ª giornata`,
    resultsRound: (round) => `Risultati della ${round}`,
    resultsDay: (acc, day) => `${acc} · risultati del ${day}`,
    more: (n) => `… e ${plural(n, 'un’altra partita', `altre ${n} partite`)}`,
    tableAfter: (round) => `La classifica dopo la ${round}`,
    pts: (n) => `${n} pt`,
    scorers: (acc) => `Classifica marcatori · ${acc}`,
    ntList: (team, match) => `${team}: i convocati${match ? ` per ${match}` : ''}`,
    huddle: {
      nextMatch: (opp, day, hour, place) => `Prossima partita: ${opp}, ${day}${hour != null ? ` alle ${hour}:00` : ''}${place ? `, ${place}` : ''}. Siate puntuali.`,
    },
    conduct: {
      warningSubject: () => 'Una parola sul tuo comportamento',
      warning: ({ quote, target }) => `Quello che hai detto ${{ press: 'in conferenza stampa', kop: 'su Kop', huddle: 'nel gruppo' }[quote.source]}: «${quote.quote}». ${{ coach: 'Puoi non essere d’accordo con le mie scelte, ma non mancarmi di rispetto.', teammates: 'Non ci si scaglia contro i propri compagni.', club: 'Non si parla così del club che ti fa giocare.' }[target]} La risolvo con te una volta, tra noi. La prossima volta il club prenderà provvedimenti.`,
      leftOutSubject: (n) => (n > 1 ? 'Provvedimento disciplinare: escluso per due partite' : 'Provvedimento disciplinare: escluso per una partita'),
      leftOut: ({ quote, labels }) => `Dopo le tue parole ${{ press: 'in conferenza stampa', kop: 'su Kop', huddle: 'nel gruppo' }[quote.source]} («${quote.quote}») e nonostante i richiami, la società ha deciso di escluderti dai convocati per ${labels.length > 1 ? `le prossime due partite: ${labels.join(' e ')}` : `la prossima partita: ${labels[0]}`}. La decisione non si discute, qualunque sia la posta in gioco. Ne riparleremo dopo.`,
    },
    objectives: {
      item: (it, set) => {
        const n = it.target, x = ((v) => String(v).replace('.', ','))(it.target);
        if (it.kind === 'apps') return set.window ? `Giocare almeno ${n} delle tue prossime ${set.window} partite` : `Giocare almeno ${n} partite di campionato`;
        if (it.kind === 'goals') return `Segnare ${n} ${n > 1 ? 'gol' : 'gol'} in campionato`;
        if (it.kind === 'ga') return `Essere decisivo ${n} volte in campionato (gol e assist)`;
        if (it.kind === 'clean') return `${n} ${n > 1 ? 'partite' : 'partita'} di campionato senza subire gol quando giochi`;
        return set.window ? `Un voto medio di almeno ${x} in quelle partite` : `Un voto medio di almeno ${x} in campionato`;
      },
      value: (it) => (it.kind === 'rating' ? (it.value == null ? '–' : ((v) => String(v).replace('.', ','))(it.value)) : String(it.value ?? 0)),
      setSubject: (kind) => ({ season: 'I tuoi obiettivi per la stagione', second_half: 'I tuoi obiettivi per il finale di stagione', comeback: 'I tuoi obiettivi per il rientro' }[kind]),
      setBody: ({ kind, lines }) => `${{ season: 'Ecco cosa mi aspetto da te in questa stagione:', second_half: 'Per il finale di stagione, ecco cosa mi aspetto da te:', comeback: 'Bentornato. Per il tuo rientro, ecco cosa mi aspetto:' }[kind]}\n\n${lines.map((l) => `• ${l}`).join('\n')}\n\n${kind === 'comeback' ? 'Rientra con calma, ma rientra forte. Ne riparliamo dopo queste partite.' : 'È alla tua portata. Faremo il punto a fine campionato.'}`,
      reviewSubject: (kind) => (kind === 'comeback' ? 'Il bilancio del tuo rientro' : 'Il bilancio dei tuoi obiettivi'),
      review: ({ lines, verdict }) => `Il punto sui tuoi obiettivi:\n\n${lines.map((l) => `${l.met ? '✓' : '✗'} ${l.text} (${l.value})`).join('\n')}\n\n${{ all: 'Tutto fatto: è esattamente quello che mi aspettavo da te.', most: 'Buona parte è fatta. Continua così.', some: 'È un inizio, ma non basta.', none: 'Siamo lontani. Mi aspetto una reazione.' }[verdict]}`,
    },
    dmInbound: {
      teammateGoal: (opp) => `Bel gol contro ${opp}. Continua così, abbiamo bisogno di te.`,
      teammateAssist: (opp) => `Grande assist contro ${opp}. Continua a servirci così.`,
      fanGood: (opp) => `Che partita contro ${opp}! Grazie per tutto quello che dai al club.`,
      fanAngry: (opp) => `Sinceramente, contro ${opp} non ci siamo proprio. Ci aspettiamo molto di più da te.`,
    },
    coachAdvice: {
      subject: (area) => `Allenamento: ${{ shooting: 'la finalizzazione', stamina: 'la resistenza', passing: 'i passaggi', defending: 'il lavoro difensivo', dribbling: 'il dribbling', goalkeeping: 'il lavoro da portiere' }[area]}`,
      body: ({ area, reason: r }) => (r.form != null ? `La tua forma sta calando in questo periodo, e in campo si vede. Rafforza la resistenza nel tuo programma di allenamento per ritrovare gamba.` : r.rating != null ? `${String(r.rating).replace('.', ',')} di media nelle ultime ${r.matches} partite: i tuoi voti non sono al livello che mi aspetto. Metti più punti su questo aspetto nel tuo programma di allenamento, deve tornare presto.` : {
        shooting: `Ti crei le occasioni, ma ${r.goals} ${'gol'} nelle ultime ${r.matches} partite non bastano per un attaccante. Voglio vederti lavorare sulla finalizzazione: metti più punti sul tiro nel tuo programma di allenamento. Ne riparliamo tra qualche settimana.`,
        stamina: `Quando parti titolare, esci in media intorno al ${r.minutes}° minuto. Mi serve un giocatore che regga 90 minuti: rinforza la resistenza nel tuo programma di allenamento.`,
        passing: `Nessun assist nelle ultime ${r.matches} partite. A centrocampo ci aspettiamo che tu faccia giocare gli altri: lavora sui passaggi in allenamento.`,
        defending: `Abbiamo subito ${r.conceded} gol nelle ultime ${r.matches} partite, e si parte dal lavoro di ognuno. Metti l’accento sulla difesa nel tuo programma di allenamento.`,
      }[area]),
      replyFollow: 'Ricevuto, mister. Cambio il programma già questa settimana.',
      replyIgnore: 'Grazie del consiglio, mister, ma per ora preferisco tenere il mio programma.',
    },
    teamOfRound: (round) => `La top 11 della ${round}`,
    playerOfRound: (name, club, rating) => `Giocatore della giornata: ${name} (${club}) · ${rating}`,
    lines: { gk: 'POR', def: 'DIF', mid: 'CEN', att: 'ATT' },
    awards: (acc, season) => `I premi della ${acc} ${season}`,
    awardNames: { bestPlayer: 'Miglior giocatore', topScorer: 'Capocannoniere', topAssists: 'Miglior assistman', bestKeeper: 'Miglior portiere', xi: 'Top 11 della stagione' },
    matchday: 'GIORNO DI PARTITA', tomorrowCaps: 'DOMANI',
    preview: (round, acc) => `${acc} · ${round}`,
    today: 'Oggi', tomorrow: 'Domani', hour: hh,
    replayPlain: (m) => `🎥 Il replay: ${m}.`,
    replay: [
      (min, who, m) => `🎥 ${min}º minuto: ${who} gonfia la rete! ${m}`,
      (min, who, m) => `⚽ Da rivedere: il gol di ${who} (${min}') in ${m}.`,
      (min, who, m) => `🔁 Replay: ${who} calcia al ${min}º minuto. ${m}`,
    ],
    clip: (who, min, m) => `📹 Il video: il gol di ${who} (${min}'), ${m}.`,
    clipPlain: (m) => `📹 Le immagini: ${m}.`,
    canned: {
      teammate: { praise: ['Grazie fratello 🙏', 'Insieme 💪', 'Avanti così!', '❤️', 'Sempre con te 🤝', 'Il lavoro paga 👊'], neutral: ['👊', '🙌', 'Testa al lavoro 💪'], question: ['Vedremo 😉', 'Concentrati sulla prossima.', 'Siamo tutti pronti 💪'], trash: [] },
      opponent: { praise: ['Rispetto 🤝', 'Grazie, in bocca al lupo.', '🙏'], neutral: ['👊', 'Ci vediamo in campo.'], question: ['Parlerà il campo.', 'Risponderà la partita.'], trash: ['Ne riparliamo in campo.', '😂😂', 'Ci vediamo al fischio d’inizio.', 'Parla meno, gioca di più.', '🥱'] },
    },
    promise: {
      goal: (c, opp) => `segnare ${c > 1 ? `${c} gol ` : ''}${itArt('contro', opp)}`,
      assist: (c, opp) => `fare ${c > 1 ? `${c} assist` : 'un assist'} ${itArt('contro', opp)}`,
      goal_or_assist: (c, opp) => `essere decisivo ${itArt('contro', opp)}`,
      win: (c, opp) => `battere ${itArt('', opp)}`,
      unbeaten: (c, opp) => `non perdere ${itArt('contro', opp)}`,
      clean_sheet: (c, opp) => `non subire gol ${itArt('contro', opp)}`,
      season_goals: (c) => `segnare ${c} gol in questa stagione`,
      season_assists: (c) => `fare ${c} assist in questa stagione`,
      title: (c, opp, league) => `vincere ${league || 'il campionato'}`,
    },
    judge: {
      otherClub: 'non giocava più per questo club', didNotPlay: 'non ha giocato questa partita', notTracked: 'stagione non seguita', noMatch: 'partita non trovata',
      goals: (n) => `${n} gol`, assists: (n) => `${n} assist`,
      either: (n) => `${n} tra gol e assist`, season: (n) => `${n} in questa stagione`, champion: 'campione',
      finalPos: (p) => `${p}º nella classifica finale`, endOfSeason: (n) => `${n} a fine stagione`,
    },
    brief: {
      subject: (d) => `Il brief del mattino · ${d}`,
      hello: 'Buongiorno,',
      intro: (d) => `Ecco l’essenziale de La Transversale di ${d}.`,
      last: (m, comp) => `L’ultima partita: ${m}${comp ? ` (${comp})` : ''}.`,
      table: (club, pos, league, pts) => `La classifica: ${itArt('', club).replace(/^./, (c) => c.toUpperCase())} è ${pos}º ${league ? `in ${league}` : 'nel suo campionato'} con ${pts} ${plural(pts, 'punto', 'punti')}.`,
      next: (m, day, h) => `Il prossimo appuntamento: ${m}, ${day}${h != null ? ` alle ${hh(h)}` : ''}.`,
      heads: (list) => `In prima pagina:\n${list}`,
      signoff: 'Buona lettura,\nLa redazione de La Transversale',
      footer: 'Ricevi questo brief perché ti sei iscritto su latransversale.foot. Per fermarlo: «Annulla iscrizione», in fondo alla prima pagina.',
      yourClub: 'il tuo club',
    },
    agentSubject: { offer: 'Offerta ricevuta', open: 'Il mercato è aperto', eve: 'Ultimo giorno di mercato' },
  },

  pt: {
    win: '✅ VITÓRIA!', draw: '🤝 Empate.', loss: '❌ Derrota.', fullTime: 'FIM DE JOGO',
    feat: { hat: 'HAT-TRICK', brace: 'DOIS GOLS', goal: 'GOL', assist: 'ASSISTÊNCIA' },
    featLine: (what, who, both, opp) => `${what} de ${who}${both} contra o ${opp}!`,
    alsoAssists: (a) => (a > 1 ? ` e ${a} assistências` : ' e uma assistência'),
    seasonGoal: (n) => `É o ${n}º gol dele na temporada.`,
    motm: (who, r) => `⭐ Craque do jogo: ${who}${r ? `, nota ${r}` : ''}.`,
    joins: (name, club, from) => `✍️ OFICIAL | ${name} é o novo reforço do ${club}${from ? `, vindo do ${from}` : ''}. Seja bem-vindo!`,
    leavesFor: (name, from, to) => `👋 ${name} deixa o ${from} para defender o ${to}. Obrigado e boa sorte!`,
    leaves: (name, club, to) => `👋 ${name} deixa o ${club}${to ? ` para defender o ${to}` : ''}. Obrigado e boa sorte!`,
    extends: (who, club, date) => `✍️ OFICIAL | ${who} renova com o ${club} até ${date}!`,
    ended: 'FIM DE JOGO',
    round: (n) => `${n}ª rodada`,
    resultsRound: (round) => `Resultados da ${round}`,
    resultsDay: (acc, day) => `${acc} · resultados de ${day}`,
    more: (n) => `… e mais ${n} ${plural(n, 'jogo', 'jogos')}`,
    tableAfter: (round) => `A classificação após a ${round}`,
    pts: (n) => `${n} pts`,
    scorers: (acc) => `Artilharia · ${acc}`,
    ntList: (team, match) => `${team}: os convocados${match ? ` para ${match}` : ''}`,
    huddle: {
      nextMatch: (opp, day, hour, place) => `Próximo jogo: ${opp}, ${day}${hour != null ? ` às ${hour}:00` : ''}${place ? `, ${place}` : ''}. Sejam pontuais.`,
    },
    conduct: {
      warningSubject: () => 'Uma palavra sobre o seu comportamento',
      warning: ({ quote, target }) => `O que você disse ${{ press: 'na coletiva de imprensa', kop: 'no Kop', huddle: 'no grupo' }[quote.source]}: “${quote.quote}”. ${{ coach: 'Você pode não concordar com as minhas escolhas, mas não pode me faltar com o respeito.', teammates: 'Não se ataca os próprios companheiros.', club: 'Não se fala assim do clube que te dá oportunidades.' }[target]} Vou resolver isso com você uma vez, entre nós. Na próxima, o clube vai tomar medidas.`,
      leftOutSubject: (n) => (n > 1 ? 'Decisão disciplinar: fora de dois jogos' : 'Decisão disciplinar: fora de um jogo'),
      leftOut: ({ quote, labels }) => `Depois das suas palavras ${{ press: 'na coletiva de imprensa', kop: 'no Kop', huddle: 'no grupo' }[quote.source]} (“${quote.quote}”) e apesar dos avisos, o clube decidiu deixar você fora dos relacionados ${labels.length > 1 ? `nos dois próximos jogos: ${labels.join(' e ')}` : `no próximo jogo: ${labels[0]}`}. A decisão é definitiva, seja o que for que esteja em jogo. Conversamos depois.`,
    },
    objectives: {
      item: (it, set) => {
        const n = it.target, x = ((v) => String(v).replace('.', ','))(it.target);
        if (it.kind === 'apps') return set.window ? `Jogar pelo menos ${n} dos seus ${set.window} próximos jogos` : `Jogar pelo menos ${n} jogos do campeonato`;
        if (it.kind === 'goals') return `Marcar ${n} ${n > 1 ? 'gols' : 'gol'} no campeonato`;
        if (it.kind === 'ga') return `Ser decisivo ${n} vezes no campeonato (gols e assistências)`;
        if (it.kind === 'clean') return `${n} ${n > 1 ? 'jogos' : 'jogo'} do campeonato sem sofrer gol quando você joga`;
        return set.window ? `Uma nota média de pelo menos ${x} nesses jogos` : `Uma nota média de pelo menos ${x} no campeonato`;
      },
      value: (it) => (it.kind === 'rating' ? (it.value == null ? '–' : ((v) => String(v).replace('.', ','))(it.value)) : String(it.value ?? 0)),
      setSubject: (kind) => ({ season: 'Seus objetivos para a temporada', second_half: 'Seus objetivos para o fim da temporada', comeback: 'Seus objetivos para a volta' }[kind]),
      setBody: ({ kind, lines }) => `${{ season: 'Isto é o que eu espero de você nesta temporada:', second_half: 'Para o fim da temporada, isto é o que eu espero de você:', comeback: 'Que bom ter você de volta. Para o seu retorno, isto é o que eu espero:' }[kind]}\n\n${lines.map((l) => `• ${l}`).join('\n')}\n\n${kind === 'comeback' ? 'Volte no seu ritmo, mas volte forte. Conversamos depois desses jogos.' : 'Está ao seu alcance. Faremos o balanço no fim do campeonato.'}`,
      reviewSubject: (kind) => (kind === 'comeback' ? 'O balanço da sua volta' : 'O balanço dos seus objetivos'),
      review: ({ lines, verdict }) => `Como estão os seus objetivos:\n\n${lines.map((l) => `${l.met ? '✓' : '✗'} ${l.text} (${l.value})`).join('\n')}\n\n${{ all: 'Tudo cumprido: é exatamente o que eu esperava de você.', most: 'Boa parte está feita. Continue assim.', some: 'É um começo, mas não é suficiente.', none: 'Estamos longe. Espero uma reação.' }[verdict]}`,
    },
    dmInbound: {
      teammateGoal: (opp) => `Belo gol contra ${opp}. Continue assim, precisamos de você.`,
      teammateAssist: (opp) => `Grande assistência contra ${opp}. Continue servindo a gente assim.`,
      fanGood: (opp) => `Que jogo contra ${opp}! Obrigado por tudo o que você dá ao clube.`,
      fanAngry: (opp) => `Sinceramente, contra ${opp} não deu. Esperamos muito mais de você.`,
    },
    coachAdvice: {
      subject: (area) => `Treino: ${{ shooting: 'a finalização', stamina: 'o fôlego', passing: 'o passe', defending: 'o trabalho defensivo', dribbling: 'o drible', goalkeeping: 'o trabalho de goleiro' }[area]}`,
      body: ({ area, reason: r }) => (r.form != null ? `Sua forma está caindo neste momento, e isso se vê em campo. Reforce o fôlego no seu plano de treino para recuperar as pernas.` : r.rating != null ? `${String(r.rating).replace('.', ',')} de média nos últimos ${r.matches} jogos: suas notas não estão no nível que eu espero. Coloque mais pontos neste aspecto no seu plano de treino, isso tem que voltar logo.` : {
        shooting: `Você cria as chances, mas ${r.goals} ${(r.goals === 1 ? 'gol' : 'gols')} nos últimos ${r.matches} jogos não é suficiente para um atacante. Quero ver você treinar a finalização: coloque mais pontos em chute no seu plano de treino. Conversamos de novo daqui a algumas semanas.`,
        stamina: `Quando você começa jogando, sai em média por volta dos ${r.minutes} minutos. Preciso de um jogador que aguente 90 minutos: reforce o fôlego no seu plano de treino.`,
        passing: `Nenhuma assistência nos últimos ${r.matches} jogos. No meio-campo, esperamos que você faça os outros jogarem: treine o passe.`,
        defending: `Sofremos ${r.conceded} gols nos últimos ${r.matches} jogos, e isso começa pelo trabalho de cada um. Dê ênfase à defesa no seu plano de treino.`,
      }[area]),
      replyFollow: 'Entendido, professor. Mudo meu plano já nesta semana.',
      replyIgnore: 'Obrigado pelo conselho, professor, mas prefiro manter meu plano por enquanto.',
    },
    teamOfRound: (round) => `A seleção da ${round}`,
    playerOfRound: (name, club, rating) => `Craque da rodada: ${name} (${club}) · ${rating}`,
    lines: { gk: 'GOL', def: 'DEF', mid: 'MEI', att: 'ATA' },
    awards: (acc, season) => `Os prêmios do ${acc} ${season}`,
    awardNames: { bestPlayer: 'Craque da temporada', topScorer: 'Artilheiro', topAssists: 'Líder de assistências', bestKeeper: 'Melhor goleiro', xi: 'Seleção da temporada' },
    matchday: 'DIA DE JOGO', tomorrowCaps: 'AMANHÃ',
    preview: (round, acc) => `${acc} · ${round}`,
    today: 'Hoje', tomorrow: 'Amanhã', hour: hh,
    replayPlain: (m) => `🎥 O replay: ${m}.`,
    replay: [
      (min, who, m) => `🎥 Aos ${min} minutos: ${who} balança a rede! ${m}`,
      (min, who, m) => `⚽ Para rever: o gol de ${who} (${min}') em ${m}.`,
      (min, who, m) => `🔁 Replay: ${who} finaliza aos ${min} minutos. ${m}`,
    ],
    clip: (who, min, m) => `📹 O vídeo: o gol de ${who} (${min}'), ${m}.`,
    clipPlain: (m) => `📹 As imagens: ${m}.`,
    canned: {
      teammate: { praise: ['Valeu, irmão 🙏', 'Juntos 💪', 'Vamos seguir assim!', '❤️', 'Sempre com você 🤝', 'O trabalho dá resultado 👊'], neutral: ['👊', '🙌', 'Bora trabalhar 💪'], question: ['Vamos ver 😉', 'Foco no próximo jogo.', 'Todo mundo pronto 💪'], trash: [] },
      opponent: { praise: ['Respeito 🤝', 'Valeu, boa sorte.', '🙏'], neutral: ['👊', 'Nos vemos em campo.'], question: ['O campo vai responder.', 'O jogo vai responder.'], trash: ['A gente conversa em campo.', '😂😂', 'Até o apito inicial.', 'Fala menos, joga mais.', '🥱'] },
    },
    promise: {
      goal: (c, opp) => `marcar ${c > 1 ? `${c} gols ` : ''}contra o ${opp}`,
      assist: (c, opp) => `dar ${c > 1 ? `${c} assistências` : 'uma assistência'} contra o ${opp}`,
      goal_or_assist: (c, opp) => `ser decisivo contra o ${opp}`,
      win: (c, opp) => `vencer o ${opp}`,
      unbeaten: (c, opp) => `não perder para o ${opp}`,
      clean_sheet: (c, opp) => `não sofrer gols contra o ${opp}`,
      season_goals: (c) => `marcar ${c} gols nesta temporada`,
      season_assists: (c) => `dar ${c} assistências nesta temporada`,
      title: (c, opp, league) => `ser campeão${league ? ` (${league})` : ''}`,
    },
    judge: {
      otherClub: 'ele não jogava mais por este clube', didNotPlay: 'ele não jogou esta partida', notTracked: 'temporada não acompanhada', noMatch: 'jogo não encontrado',
      goals: (n) => `${n} ${plural(n, 'gol', 'gols')}`, assists: (n) => `${n} ${plural(n, 'assistência', 'assistências')}`,
      either: (n) => `${n} gol(s) ou assistência(s)`, season: (n) => `${n} nesta temporada`, champion: 'campeão',
      finalPos: (p) => `${p}º na classificação final`, endOfSeason: (n) => `${n} no fim da temporada`,
    },
    brief: {
      subject: (d) => `O resumo da manhã · ${d}`,
      hello: 'Olá,',
      intro: (d) => `Aqui está o essencial do La Transversale de ${d}.`,
      last: (m, comp) => `O último jogo: ${m}${comp ? ` (${comp})` : ''}.`,
      table: (club, pos, league, pts) => `A classificação: o ${club} está em ${pos}º lugar${league ? ` (${league})` : ''}, com ${pts} ${plural(pts, 'ponto', 'pontos')}.`,
      next: (m, day, h) => `O próximo compromisso: ${m}, ${day}${h != null ? ` às ${hh(h)}` : ''}.`,
      heads: (list) => `Destaques:\n${list}`,
      signoff: 'Boa leitura,\nA redação do La Transversale',
      footer: 'Você recebe este resumo porque se inscreveu em latransversale.foot. Para parar: “Cancelar inscrição”, no rodapé da capa.',
      yourClub: 'seu clube',
    },
    agentSubject: { offer: 'Proposta recebida', open: 'A janela de transferências abriu', eve: 'Último dia da janela de transferências' },
  },

  de: {
    win: '✅ SIEG!', draw: '🤝 Unentschieden.', loss: '❌ Niederlage.', fullTime: 'ABPFIFF',
    feat: { hat: 'DREIERPACK', brace: 'DOPPELPACK', goal: 'TOR', assist: 'VORLAGE' },
    featLine: (what, who, both, opp) => `${what} von ${who}${both} gegen ${opp}!`,
    alsoAssists: (a) => (a > 1 ? ` und ${a} Vorlagen` : ' und eine Vorlage'),
    seasonGoal: (n) => `Sein ${n}. Saisontor.`,
    motm: (who, r) => `⭐ Spieler des Spiels: ${who}${r ? `, Note ${r}` : ''}.`,
    joins: (name, club, from) => `✍️ OFFIZIELL | ${name} wechselt${from ? ` von ${from}` : ''} zu ${club}. Willkommen!`,
    leavesFor: (name, from, to) => `👋 ${name} verlässt ${from} und wechselt zu ${to}. Danke und alles Gute!`,
    leaves: (name, club, to) => `👋 ${name} verlässt ${club}${to ? ` und wechselt zu ${to}` : ''}. Danke und alles Gute!`,
    extends: (who, club, date) => `✍️ OFFIZIELL | ${who} verlängert seinen Vertrag bei ${club} bis zum ${date}!`,
    ended: 'ABPFIFF',
    round: (n) => `${n}. Spieltag`,
    resultsRound: (round) => `Ergebnisse vom ${round}`,
    resultsDay: (acc, day) => `${acc} · Ergebnisse vom ${day}`,
    more: (n) => `… und ${n} ${plural(n, 'weiteres Spiel', 'weitere Spiele')}`,
    tableAfter: (round) => `Die Tabelle nach dem ${round}`,
    pts: (n) => `${n} Pkt.`,
    scorers: (acc) => `Torjägerliste · ${acc}`,
    ntList: (team, match) => `${team}: der Kader${match ? ` für ${match}` : ''}`,
    huddle: {
      nextMatch: (opp, day, hour, place) => `Nächstes Spiel: ${opp}, ${day}${hour != null ? ` um ${hour}:00 Uhr` : ''}${place ? `, ${place}` : ''}. Bitte pünktlich sein.`,
    },
    conduct: {
      warningSubject: () => 'Ein Wort zu deinem Verhalten',
      warning: ({ quote, target }) => `Was du ${{ press: 'auf der Pressekonferenz', kop: 'auf Kop', huddle: 'in der Gruppe' }[quote.source]} gesagt hast: „${quote.quote}“. ${{ coach: 'Du musst mit meinen Entscheidungen nicht einverstanden sein, aber du zeigst Respekt.', teammates: 'Man geht nicht auf die eigenen Mitspieler los.', club: 'So spricht man nicht über den Verein, für den du spielst.' }[target]} Das kläre ich einmal mit dir, unter uns. Beim nächsten Mal wird der Verein Maßnahmen ergreifen.`,
      leftOutSubject: (n) => (n > 1 ? 'Disziplinarische Entscheidung: zwei Spiele nicht im Kader' : 'Disziplinarische Entscheidung: ein Spiel nicht im Kader'),
      leftOut: ({ quote, labels }) => `Nach deinen Worten ${{ press: 'auf der Pressekonferenz', kop: 'auf Kop', huddle: 'in der Gruppe' }[quote.source]} („${quote.quote}“) und trotz der Warnungen hat der Verein entschieden, dich ${labels.length > 1 ? `für die nächsten zwei Spiele nicht in den Kader zu nehmen: ${labels.join(' und ')}` : `für das nächste Spiel nicht in den Kader zu nehmen: ${labels[0]}`}. Die Entscheidung steht, egal worum es geht. Danach reden wir weiter.`,
    },
    objectives: {
      item: (it, set) => {
        const n = it.target, x = ((v) => String(v).replace('.', ','))(it.target);
        if (it.kind === 'apps') return set.window ? `Mindestens ${n} deiner nächsten ${set.window} Spiele bestreiten` : `Mindestens ${n} Ligaspiele bestreiten`;
        if (it.kind === 'goals') return `${n} ${n > 1 ? 'Ligatore' : 'Ligator'} erzielen`;
        if (it.kind === 'ga') return `${n}-mal in der Liga entscheidend sein (Tore und Vorlagen)`;
        if (it.kind === 'clean') return `${n} ${n > 1 ? 'Ligaspiele' : 'Ligaspiel'} ohne Gegentor, wenn du spielst`;
        return set.window ? `Eine Durchschnittsnote von mindestens ${x} in diesen Spielen` : `Eine Durchschnittsnote von mindestens ${x} in der Liga`;
      },
      value: (it) => (it.kind === 'rating' ? (it.value == null ? '–' : ((v) => String(v).replace('.', ','))(it.value)) : String(it.value ?? 0)),
      setSubject: (kind) => ({ season: 'Deine Ziele für die Saison', second_half: 'Deine Ziele für den Rest der Saison', comeback: 'Deine Ziele für dein Comeback' }[kind]),
      setBody: ({ kind, lines }) => `${{ season: 'Das erwarte ich in dieser Saison von dir:', second_half: 'Für den Rest der Saison erwarte ich Folgendes von dir:', comeback: 'Schön, dass du zurück bist. Für dein Comeback erwarte ich Folgendes:' }[kind]}\n\n${lines.map((l) => `• ${l}`).join('\n')}\n\n${kind === 'comeback' ? 'Komm in deinem Tempo zurück, aber komm stark zurück. Nach diesen Spielen reden wir.' : 'Das ist für dich machbar. Am Ende der Ligasaison ziehen wir Bilanz.'}`,
      reviewSubject: (kind) => (kind === 'comeback' ? 'Die Bilanz deines Comebacks' : 'Die Bilanz deiner Ziele'),
      review: ({ lines, verdict }) => `So stehst du bei deinen Zielen:\n\n${lines.map((l) => `${l.met ? '✓' : '✗'} ${l.text} (${l.value})`).join('\n')}\n\n${{ all: 'Alles erfüllt: genau das habe ich von dir erwartet.', most: 'Ein guter Teil ist geschafft. Weiter so.', some: 'Das ist ein Anfang, aber es reicht nicht.', none: 'Davon sind wir weit entfernt. Ich erwarte eine Reaktion.' }[verdict]}`,
    },
    dmInbound: {
      teammateGoal: (opp) => `Schönes Tor gegen ${opp}. Mach weiter so, wir brauchen dich.`,
      teammateAssist: (opp) => `Starke Vorlage gegen ${opp}. Füttere uns weiter so.`,
      fanGood: (opp) => `Was für ein Spiel gegen ${opp}! Danke für alles, was du dem Verein gibst.`,
      fanAngry: (opp) => `Ganz ehrlich, gegen ${opp} war das gar nichts. Wir erwarten viel mehr von dir.`,
    },
    coachAdvice: {
      subject: (area) => `Training: ${{ shooting: 'Abschluss', stamina: 'Ausdauer', passing: 'Passspiel', defending: 'Defensivarbeit', dribbling: 'Dribbling', goalkeeping: 'Torwarttraining' }[area]}`,
      body: ({ area, reason: r }) => (r.form != null ? `Deine Form lässt gerade nach, und man sieht es auf dem Platz. Stärke im Trainingsplan deine Ausdauer, um wieder Kraft zu finden.` : r.rating != null ? `${String(r.rating).replace('.', ',')} im Schnitt in deinen letzten ${r.matches} Spielen: Deine Noten sind nicht auf dem Niveau, das ich erwarte. Setz im Trainingsplan mehr Punkte auf diesen Bereich, das muss schnell wiederkommen.` : {
        shooting: `Du kommst in gute Positionen, aber ${r.goals} ${(r.goals === 1 ? 'Tor' : 'Tore')} in deinen letzten ${r.matches} Spielen sind zu wenig für einen Stürmer. Ich will, dass du am Abschluss arbeitest: Setz in deinem Trainingsplan mehr Punkte auf Schüsse. Wir sprechen in ein paar Wochen wieder darüber.`,
        stamina: `Wenn du in der Startelf stehst, wirst du im Schnitt um die ${r.minutes}. Minute ausgewechselt. Ich brauche einen Spieler, der 90 Minuten durchhält: Stärke deine Ausdauer im Trainingsplan.`,
        passing: `Keine Vorlage in deinen letzten ${r.matches} Spielen. Im Mittelfeld erwarten wir, dass du die anderen einsetzt: Arbeite im Training an deinem Passspiel.`,
        defending: `Wir haben in den letzten ${r.matches} Spielen ${r.conceded} Tore kassiert, und das fängt bei jedem Einzelnen an. Leg in deinem Trainingsplan den Schwerpunkt auf die Defensive.`,
      }[area]),
      replyFollow: 'Verstanden, Trainer. Ich ändere meinen Plan noch diese Woche.',
      replyIgnore: 'Danke für den Rat, Trainer, aber ich bleibe vorerst bei meinem Plan.',
    },
    teamOfRound: (round) => `Elf des Spieltags · ${round}`,
    playerOfRound: (name, club, rating) => `Spieler des Spieltags: ${name} (${club}) · ${rating}`,
    lines: { gk: 'TW', def: 'ABW', mid: 'MF', att: 'ST' },
    awards: (acc, season) => `Die Auszeichnungen · ${acc} ${season}`,
    awardNames: { bestPlayer: 'Spieler der Saison', topScorer: 'Torschützenkönig', topAssists: 'Bester Vorlagengeber', bestKeeper: 'Torhüter der Saison', xi: 'Elf der Saison' },
    matchday: 'SPIELTAG', tomorrowCaps: 'MORGEN',
    preview: (round, acc) => `${acc} · ${round}`,
    today: 'Heute', tomorrow: 'Morgen', hour: hh,
    replayPlain: (m) => `🎥 Die Wiederholung: ${m}.`,
    replay: [
      (min, who, m) => `🎥 ${min}. Minute: ${who} lässt das Netz zappeln! ${m}`,
      (min, who, m) => `⚽ Noch einmal ansehen: das Tor von ${who} (${min}.) bei ${m}.`,
      (min, who, m) => `🔁 Wiederholung: ${who} zieht in der ${min}. Minute ab. ${m}`,
    ],
    clip: (who, min, m) => `📹 Das Video: das Tor von ${who} (${min}.), ${m}.`,
    clipPlain: (m) => `📹 Die Bilder: ${m}.`,
    canned: {
      teammate: { praise: ['Danke, Bruder 🙏', 'Zusammen 💪', 'Weiter so!', '❤️', 'Immer hinter dir 🤝', 'Arbeit zahlt sich aus 👊'], neutral: ['👊', '🙌', 'Weiterarbeiten 💪'], question: ['Wir werden sehen 😉', 'Voller Fokus aufs nächste Spiel.', 'Alle sind bereit 💪'], trash: [] },
      opponent: { praise: ['Respekt 🤝', 'Danke, alles Gute.', '🙏'], neutral: ['👊', 'Wir sehen uns auf dem Platz.'], question: ['Der Platz wird antworten.', 'Das Spiel wird es zeigen.'], trash: ['Wir reden auf dem Platz.', '😂😂', 'Bis zum Anpfiff.', 'Weniger reden, mehr spielen.', '🥱'] },
    },
    promise: {
      goal: (c, opp) => `${c > 1 ? `${c} Tore` : 'ein Tor'} gegen ${opp} schießen`,
      assist: (c, opp) => `${c > 1 ? `${c} Vorlagen` : 'eine Vorlage'} gegen ${opp} geben`,
      goal_or_assist: (c, opp) => `gegen ${opp} entscheidend sein`,
      win: (c, opp) => `${opp} schlagen`,
      unbeaten: (c, opp) => `gegen ${opp} nicht verlieren`,
      clean_sheet: (c, opp) => `gegen ${opp} zu null spielen`,
      season_goals: (c) => `${c} Tore in dieser Saison schießen`,
      season_assists: (c) => `${c} Vorlagen in dieser Saison geben`,
      title: (c, opp, league) => `${league || 'die Meisterschaft'} gewinnen`,
    },
    judge: {
      otherClub: 'er spielte nicht mehr für diesen Verein', didNotPlay: 'er hat dieses Spiel nicht gespielt', notTracked: 'Saison nicht verfolgt', noMatch: 'Spiel nicht gefunden',
      goals: (n) => `${n} ${plural(n, 'Tor', 'Tore')}`, assists: (n) => `${n} ${plural(n, 'Vorlage', 'Vorlagen')}`,
      either: (n) => `${n} Tor(e) oder Vorlage(n)`, season: (n) => `${n} in dieser Saison`, champion: 'Meister',
      finalPos: (p) => `${p}. in der Abschlusstabelle`, endOfSeason: (n) => `${n} am Saisonende`,
    },
    brief: {
      subject: (d) => `Das Morgen-Briefing · ${d}`,
      hello: 'Guten Morgen,',
      intro: (d) => `Hier das Wichtigste aus La Transversale vom ${d}.`,
      last: (m, comp) => `Das letzte Spiel: ${m}${comp ? ` (${comp})` : ''}.`,
      table: (club, pos, league, pts) => `Die Tabelle: ${club} ist ${pos}. ${league ? `in der ${league}` : 'in der Liga'} mit ${pts} ${plural(pts, 'Punkt', 'Punkten')}.`,
      next: (m, day, h) => `Der nächste Termin: ${m}, ${day}${h != null ? ` um ${hh(h)}` : ''}.`,
      heads: (list) => `Die Schlagzeilen:\n${list}`,
      signoff: 'Viel Spaß beim Lesen,\nDie Redaktion von La Transversale',
      footer: 'Du bekommst dieses Briefing, weil du es auf latransversale.foot abonniert hast. Zum Beenden: „Abbestellen“, unten auf der Titelseite.',
      yourClub: 'dein Verein',
    },
    agentSubject: { offer: 'Angebot erhalten', open: 'Das Transferfenster ist offen', eve: 'Letzter Tag des Transferfensters' },
  },
};

// Textes d'une langue, avec les dates et les nombres à sa manière.
function postTexts(language) {
  const l = langOf(language);
  const loc = LOCALES[l];
  const t = T[l];
  return {
    ...t,
    lang: l,
    locale: loc,
    // « 24 janvier 2021 », « 24 janvier », « dimanche 24 janvier » selon la langue.
    date: (iso, opts = { day: 'numeric', month: 'long', year: 'numeric' }) => dateOf(iso).toLocaleDateString(loc, opts),
    rating: (x) => Number(x).toLocaleString(loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    dayLabel(iso, today, tomorrow) {
      if (iso === today) return t.today;
      if (iso === tomorrow) return t.tomorrow;
      const s = dateOf(iso).toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' });
      return s.charAt(0).toUpperCase() + s.slice(1);
    },
  };
}

module.exports = { postTexts, deName, deWho, LOCALES };

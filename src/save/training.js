'use strict';
// Réglages de l'écran « Entraînement » de Become a Legend, tels que le jeu les garde dans la sauvegarde.
// Trouvés en comparant des sauvegardes avant / après un changement (Bozok, 28/10/2026) ; même endroit chez Abline.
// Les jours restants affichés par le jeu (« 67 jour(s) restant(s) ») ne sont pas dans la sauvegarde.

const TRAINING = 0xC7DCEC;      // 8 barres (0-6), points compétence, points poste, points restants, total, puis codes u8 à +0xC et +0x10
const NONE = 108;               // « Aucun(e) » pour le geste comme pour le poste
const BAR_MAX = 6;
// Le code du geste est aussi le numéro de son bit « acquis » compté depuis l'octet 28 de la fiche du joueur :
// Abline entraînait le geste 94, puis le bit 94 s'est allumé et l'entraînement est passé au geste suivant (20/10/2026).
const SKILL_BITS_FROM = 28;
const SKILL_CODES = [67, NONE]; // les 41 gestes du jeu, 67 à 107

// Libellés français de l'écran du jeu.
const BARS = [['shooting', 'Tirs'], ['passing', 'Passes'], ['dribbling', 'Dribble'], ['defending', 'Défense'],
  ['speed', 'Vitesse'], ['strength', 'Force'], ['stamina', 'Endurance'], ['goalkeeping', 'Talent de GB']];
// Gestes du jeu : [nom français, nom anglais] tels que le jeu les affiche (textes du jeu, fra/eng string/all.str).
// Numéros d'après la fiche du joueur du « PES21 BAL Ultimate Editor » d'AlexDelPiero23 (lu sans l'exécuter) ;
// 106 = Frappes de loin vérifié sur l'écran du jeu. Les autres langues sont dans les dictionnaires de l'interface.
const SKILLS = {
  67: ['Feinte de ciseaux', 'Scissors Feint'], 68: ['Virgule', 'Flip Flap'], 69: ['Roulette', 'Marseille Turn'],
  70: ['Coup du sombrero', 'Sombrero'], 71: ['Crochet arrière demi-tour', 'Cut Behind & Turn'],
  72: ['Rebond intérieur', 'Scotch Move'], 73: ['Tête', 'Heading'], 74: ['Tir lointain', 'Long Range Drive'],
  75: ['Frappe du cou-de-pied', 'Knuckle Shot'], 76: ['Tirs acrobatiques', 'Acrobatic Finishing'],
  77: ['Talonnade', 'Heel Trick'], 78: ['Tirs 1re intention', 'First-time Shot'],
  79: ['Passes en une touche', 'One-touch Pass'], 80: ['Passes dosées', 'Weighted Pass'],
  81: ['Centres millimétrés', 'Pinpoint Crossing'], 82: ['Effet extérieur', 'Outside Curler'],
  83: ['Coup du foulard', 'Rabona'], 84: ['Passe lobée basse', 'Low Lofted Pass'],
  85: ['GB Dégagement bas', 'GK Low Punt'], 86: ['Touche longue', 'Long Throw'],
  87: ['Long dégagement', 'GK Long Throw'], 88: ['Roublardise', 'Gamesmanship'], 89: ['Marquage', 'Man Marking'],
  90: ['Poursuivant', 'Track Back'], 91: ['Dégagement acrobatique', 'Acrobatic Clear'], 92: ['Capitaine', 'Captaincy'],
  93: ['Joker', 'Super-sub'], 94: ['Combativité', 'Fighting Spirit'], 95: ['Passe aveugle', 'No Look Pass'],
  96: ['Spécialiste penalties', 'Penalty Specialist'], 97: ['GB Arrêt penalties', 'GK Penalty Saver'],
  98: ['Contrôle des tirs lobés', 'Chip Shot Control'], 99: ['Blocages de balle', 'Step On Ball Control'],
  100: ['Tirs plongeants', 'Dipping Shot'], 101: ['Tirs montants', 'Rising Shots'],
  102: ['GB Dégagement haut', 'GK High Punt'], 103: ['Interception', 'Interception'],
  104: ['Double contact', 'Double Touch'], 105: ['Changement d’aile', 'Cross Over Turn'],
  106: ['Frappes de loin', 'Long Range Shooting'], 107: ['Passe en profondeur', 'Through Passing'],
};
const SKILL_NAMES = Object.fromEntries(Object.entries(SKILLS).map(([code, [fr]]) => [code, fr]));
// Postes : le code est le rang du poste (à partir de 1) dans l'ordre où la fiche du joueur range ses niveaux de poste
// (octets 31 à 34, 2 bits par poste, table du « PES21 BAL Ultimate Editor ») : 1 Avant-centre … 13 Gardien.
// Vérifié en jeu : 2 = Second attaquant (Bozok, 28/10/2026), 5 = Milieu offensif (Morel, Football Life 2027, 01/11/2026).
const POSITION_NAMES = {
  1: 'Avant-centre', 2: 'Second attaquant', 3: 'Ailier gauche', 4: 'Ailier droit', 5: 'Milieu offensif',
  6: 'Milieu défensif', 7: 'Milieu central', 8: 'Milieu gauche', 9: 'Milieu droit', 10: 'Défenseur central',
  11: 'Arrière gauche', 12: 'Arrière droit', 13: 'Gardien',
};

const owns = (d, profileAt, code) => Boolean(d[profileAt + SKILL_BITS_FROM + (code >> 3)] & (1 << (code & 7)));

// profileAt : début de la fiche du joueur (48 octets avant son id). Renvoie null si la zone n'a pas la bonne forme.
function readTraining(d, profileAt) {
  if (TRAINING + 0x11 > d.length) return null;
  const v = [...d.subarray(TRAINING, TRAINING + 0x11)];
  const [skillPoints, positionPoints, remaining, total] = v.slice(8, 12);
  const skillCode = v[12], positionCode = v[16];
  const bars = v.slice(0, 8);
  const sum = bars.reduce((a, b) => a + b, 0) + skillPoints + positionPoints + remaining;
  const plausible = total > 0 && total <= 99 && sum === total && [...bars, skillPoints, positionPoints].every((x) => x <= BAR_MAX)
    && skillCode <= NONE && positionCode <= NONE;
  if (!plausible) return null;
  const skillsOwned = [];
  if (profileAt >= 0) for (let c = SKILL_CODES[0]; c < SKILL_CODES[1]; c++) if (owns(d, profileAt, c)) skillsOwned.push(c);
  return {
    focus: Object.fromEntries(BARS.map(([key], i) => [key, bars[i]])),
    skill: skillCode === NONE ? null : { code: skillCode, name: SKILL_NAMES[skillCode] || null, points: skillPoints },
    position: positionCode === NONE ? null : { code: positionCode, name: POSITION_NAMES[positionCode] || null, points: positionPoints },
    remaining,
    total,
    skillsOwned,
  };
}

const barLabel = (key) => BARS.find(([k]) => k === key)?.[1] || key;
const skillName = (code) => SKILL_NAMES[code] || null;
// Pour l'IA : le nom français du jeu suivi du nom anglais du jeu, pour qu'elle sache de quel geste il s'agit.
const skillForAi = (code) => (SKILLS[code] ? `${SKILLS[code][0]} (${SKILLS[code][1]})` : null);

module.exports = { readTraining, barLabel, skillName, skillForAi, BARS, SKILLS, SKILL_NAMES, POSITION_NAMES, BAR_MAX };

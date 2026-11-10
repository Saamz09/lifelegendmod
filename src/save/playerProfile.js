'use strict';
// Fiche complète du joueur Become a Legend, telle que le jeu la garde dans la sauvegarde :
// structure du joueur de PES 2021, 48 octets avant l'id du joueur. Champs établis d'après
// le « PES21 BAL Ultimate Editor » d'AlexDelPiero23 (lu sans l'exécuter), vérifiés sur
// les carrières Depay (vanilla) et Kasaï (Football Life).

const PROFILE_BEFORE_ID = 48;

// [clé, libellé, octet, premier bit] ; toutes les capacités tiennent sur 7 bits.
const ABILITIES = [
  ['offensiveAwareness', 'Instinct offensif', 3, 0], ['ballControl', 'Contrôle de balle', 6, 5], ['dribbling', 'Dribble', 5, 6],
  ['tightPossession', 'Tenue de balle', 8, 0], ['lowPass', 'Passe à terre', 9, 6], ['loftedPass', 'Passe lobée', 10, 5],
  ['finishing', 'Finition', 8, 7], ['heading', 'Jeu de tête', 12, 0], ['placeKicking', 'Coups de pied arrêtés', 14, 5],
  ['curl', 'Effet', 16, 0], ['speed', 'Vitesse', 20, 7], ['acceleration', 'Accélération', 24, 7],
  ['kickingPower', 'Puissance de frappe', 24, 0], ['jump', 'Détente', 25, 6], ['physicalContact', 'Contact physique', 21, 6],
  ['balance', 'Équilibre', 22, 5], ['stamina', 'Endurance', 26, 5], ['defensiveAwareness', 'Instinct défensif', 4, 0],
  ['ballWinning', 'Récupération du ballon', 12, 7], ['aggression', 'Agressivité', 13, 6],
  ['gkAwareness', 'Vigilance (gardien)', 4, 7], ['gkCatching', 'Arrêt du gardien', 16, 7], ['gkClearing', 'Dégagement du gardien', 17, 6],
  ['gkReflexes', 'Réflexes du gardien', 18, 5], ['gkReach', 'Portée du gardien', 20, 0],
];
const POSITIONS = ['GB', 'DC', 'DG', 'DD', 'MDC', 'MC', 'MG', 'MD', 'MOC', 'AG', 'AD', 'SA', 'AC'];
// Styles de jeu : libellés du jeu en français quand ils sont sûrs, sinon le nom anglais du jeu.
const STYLES = [null, 'Goal Poacher', 'Dummy Runner', 'Renard des surfaces', 'Ailier prolifique', 'Classic No.10', 'Hole Player',
  'Trois poumons', 'Anchor Man', 'Le destructeur', 'Extra Frontman', 'Latéral offensif', 'Latéral défensif', 'Pivot',
  'Meneur créatif', 'Construction', 'Gardien offensif', 'Gardien défensif', 'Roaming Flank', 'Spécialiste des centres',
  'Orchestrateur', 'Latéral buteur'];
const TEAM_ROLES = [null, 'Jeune espoir', 'Protégé', 'Pur coéquipier', 'Meneur', 'Joueur star', 'Leader', 'Général', 'Créateur',
  'Maestro', 'Bourreau de travail', 'Joueur malin', 'Lutteur', 'Joueur clé', 'Superstar', 'Héros', 'Virtuose',
  'Chef d’orchestre', 'Symbole', 'Légende', 'Étoile montante', 'Mauvais garçon', 'Casse-cou'];
const FORM_ARROWS = ['Très mauvaise', 'Mauvaise', 'Normale', 'Bonne', 'Excellente'];

function bits(d, off, bit, len) {
  const v = d[off] | (d[off + 1] << 8) | (d[off + 2] << 16) | (d[off + 3] << 24);
  return (v >>> bit) & ((1 << len) - 1);
}

// Renvoie null si la zone ne ressemble pas à une fiche de joueur (autre version du jeu, sauvegarde abîmée).
function readPlayerProfile(d, playerIdOffset) {
  const o = playerIdOffset - PROFILE_BEFORE_ID;
  if (o < 0 || o + 376 > d.length) return null;
  const at = (n) => d[o + n];
  const abilities = {};
  for (const [key, , off, bit] of ABILITIES) abilities[key] = bits(d, o + off, bit, 7);
  const field = ABILITIES.filter(([k]) => !k.startsWith('gk')).map(([k]) => abilities[k]);
  const height = at(0), weight = at(1), age = bits(d, o + 28, 0, 6);
  const plausible = height >= 140 && height <= 215 && weight >= 45 && weight <= 130 && age >= 15 && age <= 45
    && field.every((v) => v >= 25 && v <= 99);
  if (!plausible) return null;
  const position = bits(d, o + 7, 4, 4), style = bits(d, o + 29, 3, 5), role = bits(d, o + 336, 0, 5), arrow = bits(d, o + 327, 0, 3);
  const marketValue = d.readInt32LE(o + 372);
  return {
    height,
    weight,
    age,
    strongFoot: bits(d, o + 3, 7, 1) ? 'gauche' : 'droit',
    position: POSITIONS[position] || null,
    playingStyle: STYLES[style] || null,
    abilities,
    formArrow: FORM_ARROWS[arrow] ?? null,
    formArrowLevel: arrow,
    unavailableDays: at(328),
    affection: at(318),
    teamRole: TEAM_ROLES[role] || null,
    transferListed: Boolean(bits(d, o + 330, 1, 1)),
    loanListed: Boolean(bits(d, o + 330, 2, 1)),
    marketValue: marketValue > 0 ? marketValue * 100 : null,
  };
}

const abilityLabel = (key) => ABILITIES.find(([k]) => k === key)?.[1] || key;
const isGoalkeeper = (profile) => profile?.position === 'GB';

module.exports = { readPlayerProfile, ABILITIES, abilityLabel, isGoalkeeper, FORM_ARROWS };

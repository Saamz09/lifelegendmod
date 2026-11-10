'use strict';
// Déchiffrement des sauvegardes eFootball PES 2021 (portage de libpesXcrypter,
// domaine public : https://github.com/the4chancup/pesXdecrypter).

const MASTER_KEY_PES21 = Buffer.from([
  0x90, 0x61, 0xD8, 0x66, 0x43, 0x77, 0x24, 0xF8, 0x92, 0xBA, 0xB8, 0x71, 0x21, 0xC7, 0x60, 0x63,
  0xF0, 0x91, 0x9A, 0x7D, 0xED, 0x47, 0x80, 0xDE, 0x51, 0xF5, 0xDD, 0xD1, 0x08, 0xFE, 0x32, 0x84,
  0xF5, 0x09, 0x92, 0x00, 0xB2, 0x3E, 0x88, 0x9F, 0xEB, 0x24, 0x43, 0x05, 0x58, 0x76, 0x00, 0x22,
  0x9B, 0xFE, 0xEC, 0xF6, 0x50, 0x00, 0x29, 0xD3, 0x42, 0x75, 0x50, 0xB9, 0xEC, 0xD2, 0xF6, 0x75,
]);

const ENCRYPTION_HEADER_SIZE = 320;
const FILE_HEADER_SIZE = 208;

// Mersenne Twister MT19937 seedé par init_by_array, renvoie `count` sorties 32 bits.
function mersenne(keyWords, count) {
  const mt = new Uint32Array(624);
  mt[0] = 19650218;
  for (let i = 1; i < 624; i++) mt[i] = (Math.imul(1812433253, mt[i - 1] ^ (mt[i - 1] >>> 30)) + i) >>> 0;
  let i = 1, j = 0;
  for (let k = Math.max(624, keyWords.length); k > 0; k--) {
    mt[i] = ((mt[i] ^ Math.imul(mt[i - 1] ^ (mt[i - 1] >>> 30), 1664525)) + keyWords[j] + j) >>> 0;
    i++; j++;
    if (i >= 624) { mt[0] = mt[623]; i = 1; }
    if (j >= keyWords.length) j = 0;
  }
  for (let k = 623; k > 0; k--) {
    mt[i] = ((mt[i] ^ Math.imul(mt[i - 1] ^ (mt[i - 1] >>> 30), 1566083941)) - i) >>> 0;
    i++;
    if (i >= 624) { mt[0] = mt[623]; i = 1; }
  }
  mt[0] = 0x80000000;

  const out = new Uint32Array(count);
  let idx = 624;
  for (let c = 0; c < count; c++) {
    if (idx >= 624) {
      for (let k = 0; k < 624; k++) {
        const y = (mt[k] & 0x80000000) | (mt[(k + 1) % 624] & 0x7FFFFFFF);
        mt[k] = mt[(k + 397) % 624] ^ (y >>> 1) ^ ((y & 1) ? 0x9908B0DF : 0);
      }
      idx = 0;
    }
    let y = mt[idx++];
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9D2C5680;
    y ^= (y << 15) & 0xEFC60000;
    y ^= y >>> 18;
    out[c] = y >>> 0;
  }
  return out;
}

const rol = (a, s) => ((a << s) | (a >>> (32 - s))) >>> 0;
const ror = (a, s) => ((a >>> s) | (a << (32 - s))) >>> 0;

function cryptStream(key, input) {
  const words = [];
  for (let i = 0; i < 16; i++) words.push(key.readUInt32LE(i * 4));
  const n = input.length >>> 2;
  const rem = input.length & 3;
  const g = mersenne(words, n + 4 + (rem ? 1 : 0));
  let c0 = g[0], c1 = g[1], c2 = g[2], c3 = g[3];
  const out = Buffer.alloc(input.length);
  for (let i = 0; i < n; i++) {
    const c4 = g[i + 4];
    out.writeUInt32LE((c4 ^ c3 ^ c2 ^ c1 ^ c0 ^ input.readUInt32LE(i * 4)) >>> 0, i * 4);
    c0 = ror(c1, 15); c1 = rol(c2, 11); c2 = rol(c3, 7); c3 = ror(c4, 13);
  }
  if (rem) {
    const tail = Buffer.alloc(4);
    input.copy(tail, 0, n * 4);
    const v = (tail.readUInt32LE(0) ^ g[n + 4] ^ c3 ^ c2 ^ c1 ^ c0) >>> 0;
    tail.writeUInt32LE(v, 0);
    tail.copy(out, n * 4, 0, rem);
  }
  return out;
}

function xorRepeating(target, input) {
  const out = Buffer.from(target);
  for (let i = 0; i < input.length; i++) out[i & 63] ^= input[i];
  return out;
}

// XOR de chaque mot 64 bits par un petit entier (< 2^32 : seule la moitié basse change).
function xorWithLong(key, param) {
  const out = Buffer.from(key);
  for (let i = 0; i < 8; i++) out.writeUInt32LE((out.readUInt32LE(i * 8) ^ param) >>> 0, i * 8);
  return out;
}

function reverseLongs(key) {
  const out = Buffer.alloc(64);
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) out[i * 8 + j] = key[i * 8 + 7 - j];
  return out;
}

// Clés des patchs qui chiffrent leurs sauvegardes autrement que PES 2021 (Football Life 2027 a la sienne). LifeLegend
// n'en fournit aucune : le joueur ajoute la sienne dans les Réglages (main.js les charge ici).
let extraKeys = [];
function setSaveKeys(keys) {
  extraKeys = keys.filter((k) => Buffer.isBuffer(k) && k.length === 64 && !k.equals(MASTER_KEY_PES21));
}

// En-tête de fichier déchiffré avec cette clé, ou null si la clé ne donne pas une sauvegarde de cette taille.
function fileHeader(buf, masterKey) {
  const headerKey = xorRepeating(buf.subarray(256, 320), reverseLongs(masterKey));
  const encHeader = cryptStream(headerKey, buf.subarray(0, ENCRYPTION_HEADER_SIZE));
  buf.copy(encHeader, 256, 256, 320);
  const rolling = xorRepeating(encHeader.subarray(0, 64), encHeader.subarray(64, 320));
  const fh = cryptStream(xorWithLong(rolling, FILE_HEADER_SIZE), buf.subarray(ENCRYPTION_HEADER_SIZE, ENCRYPTION_HEADER_SIZE + FILE_HEADER_SIZE));
  const sizes = { data: fh.readUInt32LE(64), logo: fh.readUInt32LE(68), desc: fh.readUInt32LE(72), serial: fh.readUInt32LE(76) * 2 };
  const total = ENCRYPTION_HEADER_SIZE + FILE_HEADER_SIZE + sizes.desc + sizes.logo + sizes.data + sizes.serial;
  return total === buf.length ? { rolling, fh, sizes } : null;
}

// L'en-tête et la clé qui ouvrent ce fichier : la clé demandée, sinon celle de PES 2021 puis celles du joueur.
function openSave(buf, masterKey) {
  if (buf.length < ENCRYPTION_HEADER_SIZE + FILE_HEADER_SIZE) throw new Error('Fichier trop petit pour être une sauvegarde du jeu.');
  for (const key of masterKey ? [masterKey] : [MASTER_KEY_PES21, ...extraKeys]) {
    const head = fileHeader(buf, key);
    if (head) return { ...head, key };
  }
  const locked = new Error('Sauvegarde verrouillée : elle est chiffrée avec une clé que LifeLegend n’a pas (Football Life 2027 : ajoute sa clé dans Réglages › Sauvegarde), ou ce n’est pas une sauvegarde du jeu.');
  locked.code = 'SAVE_KEY';
  throw locked;
}

// descriptionOnly : ne déchiffre que l'en-tête et la description (rapide, pour lister les sauvegardes).
function decryptSave(buf, { descriptionOnly = false, masterKey = null } = {}) {
  const { rolling, fh, sizes } = openSave(buf, masterKey);
  const { data: dataSize, logo: logoSize, desc: descSize } = sizes;
  let p = ENCRYPTION_HEADER_SIZE + FILE_HEADER_SIZE;

  const part = (param, size) => {
    const out = cryptStream(xorWithLong(rolling, param), buf.subarray(p, p + size));
    p += size;
    return out;
  };
  const description = part(0, descSize);
  const cstr = (b) => b.toString('latin1').split('\0')[0];
  const result = { fileType: cstr(fh.subarray(144, 176)), gameVersion: cstr(fh.subarray(176, 208)), description, data: null };
  if (descriptionOnly) return result;
  part(1, logoSize);
  result.data = part(2, dataSize);
  return result;
}

// Découpe une sauvegarde en sections déchiffrées, pour la réécrire avec joinSave (même taille de données). La clé qui
// l'a ouverte suit les sections : la sauvegarde réécrite garde le chiffrement de son jeu.
function splitSave(buf, masterKey = null) {
  const { rolling, fh, sizes, key } = openSave(buf, masterKey);
  let p = ENCRYPTION_HEADER_SIZE + FILE_HEADER_SIZE;
  const parts = { tail: Buffer.from(buf.subarray(256, 320)), fh, key };
  ['desc', 'logo', 'data', 'serial'].forEach((k, i) => {
    parts[k] = cryptStream(xorWithLong(rolling, i), buf.subarray(p, p + sizes[k]));
    p += sizes[k];
  });
  return parts;
}

// Rechiffre : l'en-tête de chiffrement contient les empreintes SHA-512 des quatre sections, d'où la clé dérivée.
// Vérifié : split puis join redonne le fichier à l'octet près, et le jeu charge les sauvegardes réécrites.
function joinSave(parts, masterKey = parts.key || MASTER_KEY_PES21) {
  const crypto = require('crypto');
  const keys = ['desc', 'logo', 'data', 'serial'];
  const header = Buffer.concat([...keys.map((k) => crypto.createHash('sha512').update(parts[k]).digest()), parts.tail]);
  const headerKey = xorRepeating(parts.tail, reverseLongs(masterKey));
  const encHeader = Buffer.concat([cryptStream(headerKey, header).subarray(0, 256), parts.tail]);
  const rolling = xorRepeating(header.subarray(0, 64), header.subarray(64, 320));
  return Buffer.concat([encHeader, cryptStream(xorWithLong(rolling, FILE_HEADER_SIZE), parts.fh),
    ...keys.map((k, i) => cryptStream(xorWithLong(rolling, i), parts[k]))]);
}

module.exports = { decryptSave, splitSave, joinSave, setSaveKeys };

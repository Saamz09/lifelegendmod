'use strict';
// Icône d'un .exe Windows (PE) : lecture des ressources RT_ICON / RT_GROUP_ICON, et remplacement EN PLACE de leurs
// images (chaque nouvelle image doit tenir dans la place d'une ancienne : pas de section à reconstruire).
//   node tools/exe-icon.js <fichier.exe>                -> liste les icônes
//   setExeIcon(exePath, images)                         -> images : [{ size, data (Buffer : DIB ou PNG), bpp }]

const fs = require('fs');

function parse(buf) {
  if (buf.readUInt16LE(0) !== 0x5a4d) throw new Error('pas un exécutable Windows (MZ)');
  const pe = buf.readUInt32LE(0x3c);
  if (buf.readUInt32LE(pe) !== 0x4550) throw new Error('en-tête PE absent');
  const nSections = buf.readUInt16LE(pe + 6), optSize = buf.readUInt16LE(pe + 20);
  const opt = pe + 24, magic = buf.readUInt16LE(opt);
  const dataDirs = opt + (magic === 0x20b ? 112 : 96);
  const rsrcRva = buf.readUInt32LE(dataDirs + 2 * 8);
  const sections = [];
  for (let i = 0; i < nSections; i++) {
    const s = opt + optSize + i * 40;
    sections.push({ va: buf.readUInt32LE(s + 12), vsize: buf.readUInt32LE(s + 8), raw: buf.readUInt32LE(s + 20), rawSize: buf.readUInt32LE(s + 16) });
  }
  const off = (rva) => { const s = sections.find((x) => rva >= x.va && rva < x.va + Math.max(x.vsize, x.rawSize)); if (!s) throw new Error(`RVA hors sections : ${rva}`); return rva - s.va + s.raw; };
  const base = off(rsrcRva);
  // Arbre des ressources : type -> nom/numéro -> langue -> données.
  const dir = (o) => {
    const named = buf.readUInt16LE(o + 12), ids = buf.readUInt16LE(o + 14);
    return Array.from({ length: named + ids }, (_, k) => {
      const e = o + 16 + k * 8, name = buf.readUInt32LE(e), to = buf.readUInt32LE(e + 4);
      return { id: name & 0x80000000 ? null : name, sub: to & 0x80000000 ? base + (to & 0x7fffffff) : null, data: to & 0x80000000 ? null : base + to };
    });
  };
  const leaves = (typeId) => {
    const t = dir(base).find((e) => e.id === typeId);
    if (!t) return [];
    return dir(t.sub).flatMap((n) => dir(n.sub).map((l) => ({ id: n.id, entry: l.data, offset: off(buf.readUInt32LE(l.data)), size: buf.readUInt32LE(l.data + 4) })));
  };
  return { icons: leaves(3), groups: leaves(14) };
}

function describe(buf) {
  const { icons, groups } = parse(buf);
  return groups.map((g) => {
    const n = buf.readUInt16LE(g.offset + 4);
    return { group: g.id, entries: Array.from({ length: n }, (_, k) => {
      const e = g.offset + 6 + k * 14, id = buf.readUInt16LE(e + 12);
      return { size: buf[e] || 256, bpp: buf.readUInt16LE(e + 6), bytes: buf.readUInt32LE(e + 8), id, slot: icons.find((i) => i.id === id)?.size };
    }) };
  });
}

// Remplace les images du premier groupe d'icônes : chaque image va dans l'emplacement le plus petit qui la contient.
function setExeIcon(exePath, images) {
  const buf = fs.readFileSync(exePath);
  const { icons, groups } = parse(buf);
  const g = groups[0];
  if (!g) throw new Error('aucune icône dans cet exécutable');
  const free = [...icons].sort((a, b) => a.size - b.size);
  const placed = [];
  for (const img of [...images].sort((a, b) => b.data.length - a.data.length)) {
    const i = free.findIndex((s) => s.size >= img.data.length);
    if (i < 0) throw new Error(`pas de place pour l’image ${img.size} px (${img.data.length} octets)`);
    const slot = free.splice(i, 1)[0];
    buf.fill(0, slot.offset, slot.offset + slot.size);
    img.data.copy(buf, slot.offset);
    buf.writeUInt32LE(img.data.length, slot.entry + 4);
    placed.push({ ...img, id: slot.id });
  }
  // Groupe réécrit (plus court ou égal : il tient dans sa place) ; les emplacements restants ne sont plus utilisés.
  const oldCount = buf.readUInt16LE(g.offset + 4);
  if (placed.length > oldCount) throw new Error('plus d’images que d’emplacements dans le groupe');
  placed.sort((a, b) => b.size - a.size);
  buf.writeUInt16LE(placed.length, g.offset + 4);
  placed.forEach((img, k) => {
    const e = g.offset + 6 + k * 14;
    buf[e] = img.size >= 256 ? 0 : img.size; buf[e + 1] = img.size >= 256 ? 0 : img.size; buf[e + 2] = 0; buf[e + 3] = 0;
    buf.writeUInt16LE(1, e + 4); buf.writeUInt16LE(img.bpp || 32, e + 6); buf.writeUInt32LE(img.data.length, e + 8); buf.writeUInt16LE(img.id, e + 12);
  });
  buf.fill(0, g.offset + 6 + placed.length * 14, g.offset + g.size);
  buf.writeUInt32LE(6 + placed.length * 14, g.entry + 4);
  fs.writeFileSync(exePath, buf);
  return describe(buf);
}

module.exports = { setExeIcon, describe: (p) => describe(fs.readFileSync(p)) };

if (require.main === module) console.log(JSON.stringify(module.exports.describe(process.argv[2]), null, 1));

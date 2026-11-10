'use strict';
// Lecture des archives CRI CPK de PES 2021 (seulement ce qu'il faut pour en extraire des fichiers).

const fs = require('fs');
const zlib = require('zlib');

// Les tables @UTF de PES sont masquées par un XOR pseudo-aléatoire connu.
function utfDecrypt(b) {
  if (b.toString('latin1', 0, 4) === '@UTF') return b;
  const out = Buffer.alloc(b.length);
  let m = 0x655F;
  for (let i = 0; i < b.length; i++) {
    out[i] = b[i] ^ (m & 0xFF);
    m = Math.imul(m, 0x4115) >>> 0;
  }
  return out;
}

function parseUtf(raw) {
  const b = utfDecrypt(raw);
  if (b.toString('latin1', 0, 4) !== '@UTF') throw new Error('Table CPK illisible.');
  const rowsOff = b.readUInt32BE(8), strOff = b.readUInt32BE(12), dataOff = b.readUInt32BE(16);
  const ncol = b.readUInt16BE(24), rowLen = b.readUInt16BE(26), nrows = b.readUInt32BE(28);
  const base = 8;
  const str = (o) => { const s = base + strOff + o; return b.toString('utf8', s, b.indexOf(0, s)); };
  const read = (p, type) => {
    switch (type) {
      case 0: return [b.readUInt8(p), 1];
      case 1: return [b.readInt8(p), 1];
      case 2: return [b.readUInt16BE(p), 2];
      case 3: return [b.readInt16BE(p), 2];
      case 4: return [b.readUInt32BE(p), 4];
      case 5: return [b.readInt32BE(p), 4];
      case 6: return [Number(b.readBigUInt64BE(p)), 8];
      case 7: return [Number(b.readBigInt64BE(p)), 8];
      case 8: return [b.readFloatBE(p), 4];
      case 0xA: return [str(b.readUInt32BE(p)), 4];
      case 0xB: { const o = base + dataOff + b.readUInt32BE(p); return [b.subarray(o, o + b.readUInt32BE(p + 4)), 8]; }
      default: throw new Error(`Type de colonne CPK inconnu : ${type}`);
    }
  };
  const cols = [];
  let p = 32;
  for (let c = 0; c < ncol; c++) {
    const flags = b[p];
    const col = { name: str(b.readUInt32BE(p + 1)), storage: flags & 0xF0, type: flags & 0x0F, value: null };
    p += 5;
    if (col.storage === 0x30) { const [v, n] = read(p, col.type); col.value = v; p += n; }
    cols.push(col);
  }
  const rows = [];
  for (let r = 0; r < nrows; r++) {
    let q = base + rowsOff + r * rowLen;
    const row = {};
    for (const col of cols) {
      if (col.storage === 0x50) { const [v, n] = read(q, col.type); row[col.name] = v; q += n; } else row[col.name] = col.value;
    }
    rows.push(row);
  }
  return rows;
}

function readAt(fd, offset, length) {
  const buf = Buffer.alloc(length);
  fs.readSync(fd, buf, 0, length, offset);
  return buf;
}

function tableAt(fd, offset) {
  const head = readAt(fd, offset, 16);
  return parseUtf(readAt(fd, offset + 16, Number(head.readBigUInt64LE(8))));
}

// Liste des fichiers d'une archive : { name, offset, size }.
function listCpk(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const header = tableAt(fd, 0)[0];
    if (!header.TocOffset) return [];
    const toc = tableAt(fd, header.TocOffset);
    const base = header.ContentOffset ? Math.min(header.TocOffset, header.ContentOffset) : header.TocOffset;
    return toc.map((r) => ({
      name: `${r.DirName ? `${r.DirName}/` : ''}${r.FileName}`,
      offset: base + r.FileOffset,
      size: r.FileSize,
    }));
  } finally {
    fs.closeSync(fd);
  }
}

function readCpkEntry(file, entry) {
  const fd = fs.openSync(file, 'r');
  try { return readAt(fd, entry.offset, entry.size); } finally { fs.closeSync(fd); }
}

// Les fichiers de Konami sont souvent emballés en « WESYS » (en-tête + zlib).
function unwrapWesys(buf) {
  if (buf.length < 16 || buf.toString('latin1', 3, 8) !== 'WESYS') return buf;
  const compressed = buf.readUInt32LE(8);
  return zlib.inflateSync(buf.subarray(16, 16 + compressed));
}

module.exports = { listCpk, readCpkEntry, unwrapWesys };

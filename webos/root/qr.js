/*
 * A QR code for the hand-off page's address (launcher.js): byte mode, level M, versions 1 to 10, the mask with the
 * lowest penalty. Ported from Foyer's app/src/io/foyertv/Qr.java, which follows Project Nayuki's QR Code generator
 * library (https://www.nayuki.io/page/qr-code-generator-library).
 *
 * Copyright (c) Project Nayuki. (MIT License)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 * documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
 * persons to whom the Software is furnished to do so, subject to the following conditions:
 * - The above copyright notice and this permission notice shall be included in all copies or substantial portions of
 *   the Software.
 * - The Software is provided "as is", without warranty of any kind, express or implied, including but not limited to
 *   the warranties of merchantability, fitness for a particular purpose and noninfringement. In no event shall the
 *   authors or copyright holders be liable for any claim, damages or other liability, whether in an action of
 *   contract, tort or otherwise, arising from, out of or in connection with the Software or the use or other dealings
 *   in the Software.
 * Plain ES5: webOS 6 ships Node 8.
 */
var ECC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
var BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];

function grid(n) { var g = []; for (var i = 0; i < n; i++) { g.push([]); for (var j = 0; j < n; j++) g[i].push(false); } return g; }

function rawModules(v) {
  var n = (16 * v + 128) * v + 64;
  if (v >= 2) { var a = Math.floor(v / 7) + 2; n -= (25 * a - 10) * a - 55; if (v >= 7) n -= 36; }
  return n;
}
function dataCodewords(v) { return Math.floor(rawModules(v) / 8) - ECC_PER_BLOCK[v] * BLOCKS[v]; }
function capacity(v) { return dataCodewords(v) - (v < 10 ? 2 : 3); }

function set(m, f, x, y, dark) { m[y][x] = dark; f[y][x] = true; }

function drawFinder(m, f, x, y) {
  var size = m.length;
  for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
    var xx = x + dx, yy = y + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
    if (xx >= 0 && xx < size && yy >= 0 && yy < size) set(m, f, xx, yy, d !== 2 && d !== 4);
  }
}

function alignmentPositions(v) {
  if (v === 1) return [];
  var n = Math.floor(v / 7) + 2, step = Math.floor((v * 4 + n * 2 + 1) / (n * 2 - 2)) * 2, out = [6];
  for (var i = 1; i < n; i++) out.push(0);
  for (var k = n - 1, pos = v * 4 + 10; k >= 1; k--, pos -= step) out[k] = pos;
  return out;
}

function bit(value, i) { return ((value >>> i) & 1) !== 0; }

function drawFormat(mask, m, f) {
  var data = mask, rem = data;
  for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  var bits = (data << 10 | rem) ^ 0x5412, size = m.length;
  for (i = 0; i <= 5; i++) set(m, f, 8, i, bit(bits, i));
  set(m, f, 8, 7, bit(bits, 6));
  set(m, f, 8, 8, bit(bits, 7));
  set(m, f, 7, 8, bit(bits, 8));
  for (i = 9; i < 15; i++) set(m, f, 14 - i, 8, bit(bits, i));
  for (i = 0; i < 8; i++) set(m, f, size - 1 - i, 8, bit(bits, i));
  for (i = 8; i < 15; i++) set(m, f, 8, size - 15 + i, bit(bits, i));
  set(m, f, 8, size - 8, true);
}

function drawFunctions(v, m, f) {
  var size = m.length, i, j;
  for (i = 0; i < size; i++) { set(m, f, 6, i, i % 2 === 0); set(m, f, i, 6, i % 2 === 0); }
  drawFinder(m, f, 3, 3); drawFinder(m, f, size - 4, 3); drawFinder(m, f, 3, size - 4);
  var al = alignmentPositions(v), n = al.length;
  for (i = 0; i < n; i++) for (j = 0; j < n; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
    for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) {
      set(m, f, al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
  drawFormat(0, m, f);
  if (v >= 7) {
    var rem = v;
    for (i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
    var bits = v << 12 | rem;
    for (i = 0; i < 18; i++) {
      var dark = ((bits >>> i) & 1) !== 0, a = size - 11 + i % 3, b = Math.floor(i / 3);
      set(m, f, a, b, dark); set(m, f, b, a, dark);
    }
  }
}

function codewords(v, data) {
  var out = [], n = dataCodewords(v), at = 0, i;
  for (i = 0; i < n; i++) out.push(0);
  function append(value, bits) {
    for (var k = bits - 1; k >= 0; k--, at++) if (((value >>> k) & 1) !== 0) out[at >>> 3] |= 0x80 >>> (at & 7);
  }
  append(4, 4);
  append(data.length, v < 10 ? 8 : 16);
  for (i = 0; i < data.length; i++) append(data[i], 8);
  var cap = n * 8;
  append(0, Math.min(4, cap - at));
  append(0, (8 - at % 8) % 8);
  for (var pad = 0xEC; at < cap; pad ^= 0xEC ^ 0x11) append(pad, 8);
  return out;
}

function gfMultiply(x, y) {
  var z = 0;
  for (var i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; }
  return z & 0xFF;
}

function rsDivisor(degree) {
  var out = [], root = 1, i, j;
  for (i = 0; i < degree; i++) out.push(0);
  out[degree - 1] = 1;
  for (i = 0; i < degree; i++) {
    for (j = 0; j < degree; j++) { out[j] = gfMultiply(out[j], root); if (j + 1 < degree) out[j] ^= out[j + 1]; }
    root = gfMultiply(root, 2);
  }
  return out;
}

function rsRemainder(data, from, len, divisor) {
  var out = [], i, j;
  for (i = 0; i < divisor.length; i++) out.push(0);
  for (i = from; i < from + len; i++) {
    var factor = (data[i] ^ out[0]) & 0xFF;
    out.shift(); out.push(0);
    for (j = 0; j < out.length; j++) out[j] ^= gfMultiply(divisor[j], factor);
  }
  return out;
}

function interleave(v, data) {
  var blocks = BLOCKS[v], ecc = ECC_PER_BLOCK[v], raw = Math.floor(rawModules(v) / 8);
  var shortBlocks = blocks - raw % blocks, shortLen = Math.floor(raw / blocks), divisor = rsDivisor(ecc), all = [], i, j, k = 0;
  for (i = 0; i < blocks; i++) {
    var len = shortLen - ecc + (i < shortBlocks ? 0 : 1), block = [];
    for (j = 0; j < shortLen + 1; j++) block.push(0);
    for (j = 0; j < len; j++) block[j] = data[k + j];
    var rem = rsRemainder(data, k, len, divisor);
    for (j = 0; j < ecc; j++) block[block.length - ecc + j] = rem[j];
    k += len;
    all.push(block);
  }
  var out = [];
  for (i = 0; i < shortLen + 1; i++) for (j = 0; j < blocks; j++) if (i !== shortLen - ecc || j >= shortBlocks) out.push(all[j][i]);
  return out;
}

function drawCodewords(data, m, f) {
  var size = m.length, i = 0;
  for (var right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (var vert = 0; vert < size; vert++) for (var j = 0; j < 2; j++) {
      var x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
      if (!f[y][x] && i < data.length * 8) { m[y][x] = ((data[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0; i++; }
    }
  }
}

function applyMask(mask, m, f) {
  var size = m.length;
  for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
    var inv;
    switch (mask) {
      case 0: inv = (x + y) % 2 === 0; break;
      case 1: inv = y % 2 === 0; break;
      case 2: inv = x % 3 === 0; break;
      case 3: inv = (x + y) % 3 === 0; break;
      case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
      case 5: inv = x * y % 2 + x * y % 3 === 0; break;
      case 6: inv = (x * y % 2 + x * y % 3) % 2 === 0; break;
      default: inv = ((x + y) % 2 + x * y % 3) % 2 === 0;
    }
    if (inv && !f[y][x]) m[y][x] = !m[y][x];
  }
}

var FINDER = [true, false, true, true, true, false, true, false, false, false, false];
function at(m, pass, a, b) { return pass === 0 ? m[a][b] : m[b][a]; }
function finderLike(m, pass, a, b, rev) {
  for (var i = 0; i < 11; i++) if (at(m, pass, a, b + i) !== FINDER[rev ? 10 - i : i]) return false;
  return true;
}

function penalty(m) {
  var size = m.length, score = 0, dark = 0, pass, a, b, x, y;
  for (pass = 0; pass < 2; pass++) for (a = 0; a < size; a++) {
    var run = 1;
    for (b = 1; b <= size; b++) {
      if (b < size && at(m, pass, a, b) === at(m, pass, a, b - 1)) run++;
      else { if (run >= 5) score += 3 + run - 5; run = 1; }
    }
    for (b = 0; b + 11 <= size; b++) if (finderLike(m, pass, a, b, false) || finderLike(m, pass, a, b, true)) score += 40;
  }
  for (y = 0; y < size; y++) for (x = 0; x < size; x++) {
    if (m[y][x]) dark++;
    if (x + 1 < size && y + 1 < size && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) score += 3;
  }
  var total = size * size;
  score += (Math.floor((Math.abs(dark * 20 - total * 10) + total - 1) / total) - 1) * 10;
  return score;
}

/** The modules, [y][x], true = dark, without the quiet zone. */
function encode(text) {
  var data = Array.prototype.slice.call(Buffer.from(text, 'utf8')), v = 1;
  while (data.length > capacity(v)) if (++v > 10) throw new Error('too long for a QR code');
  var size = v * 4 + 17, m = grid(size), f = grid(size);
  drawFunctions(v, m, f);
  drawCodewords(interleave(v, codewords(v, data)), m, f);
  var best = Infinity, mask = 0;
  for (var k = 0; k < 8; k++) {
    applyMask(k, m, f); drawFormat(k, m, f);
    var s = penalty(m);
    if (s < best) { best = s; mask = k; }
    applyMask(k, m, f);
  }
  applyMask(mask, m, f); drawFormat(mask, m, f);
  return m;
}

/** An SVG of the code, with its quiet zone, black on white. */
function svg(text) {
  var m = encode(text), n = m.length + 8, d = '';
  for (var y = 0; y < m.length; y++) for (var x = 0; x < m.length; x++) if (m[y][x]) d += 'M' + (x + 4) + ' ' + (y + 4) + 'h1v1h-1z';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n + ' ' + n + '" width="' + n * 8 + '" height="' + n * 8
    + '" shape-rendering="crispEdges"><rect width="' + n + '" height="' + n + '" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
}

module.exports = {encode: encode, svg: svg};

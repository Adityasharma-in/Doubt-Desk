'use strict';

/**
 * Text cleaning and normalization helpers.
 *
 * Cleaning is for display + model input. Normalization is deliberately
 * lossy: it folds homoglyphs and leetspeak so the deterministic tripwire
 * sees through cosmetic obfuscation. It never mutates the stored doubt.
 */

// Cyrillic / Greek / fullwidth lookalikes that are commonly used to hide
// Latin keywords. NFKC already folds fullwidth forms.
const HOMOGLYPHS = new Map(Object.entries({
  '\u0430': 'a', '\u0435': 'e', '\u043E': 'o', '\u0440': 'p', '\u0441': 'c',
  '\u0445': 'x', '\u0443': 'y', '\u0456': 'i', '\u0455': 's', '\u0501': 'd',
  '\u04BB': 'h', '\u04CF': 'l', '\u03B1': 'a', '\u03BF': 'o', '\u03B5': 'e',
  '\u03B9': 'i', '\u03BA': 'k', '\u03BD': 'v', '\u03C1': 'p', '\u03C4': 't',
  '\u03C5': 'u', '\u03C7': 'x',
}));

const LEET = new Map(Object.entries({
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '6': 'g',
  '7': 't', '8': 'b', '9': 'g', '@': 'a', '$': 's', '!': 'i', '|': 'l',
}));

const INVISIBLE_RE = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF\u00AD]/g;
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

function stripInvisible(value) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .normalize('NFKC')
    .replace(INVISIBLE_RE, '')
    .replace(CONTROL_RE, '')
    .normalize('NFKC');
}

/** Clean text before it is stored / sent to the model. */
function cleanForModel(value) {
  return stripInvisible(value)
    .replace(/\t+/g, ' ')
    .replace(/[ \u00A0]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Names are display-only, but they should not carry invisible junk. */
function cleanName(value) {
  return stripInvisible(value)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
}

/** Teacher scope is interpolated into prompts, so quote-breakout is removed. */
function sanitizeScope(value, max) {
  return cleanForModel(value)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/['"`\\<>{}[\]]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, max);
}

/** Lowercase, homoglyph-folded, punctuation-separated view for regexes. */
function scanNormalize(value) {
  let s = stripInvisible(value).toLowerCase();
  let out = '';
  for (const ch of s) out += HOMOGLYPHS.get(ch) || ch;
  return out
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .replace(/'+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Fold leetspeak. Applied to a scan view, never to stored text. */
function leetFold(value) {
  let out = '';
  for (const ch of String(value || '').toLowerCase()) out += LEET.get(ch) || ch;
  return out;
}

function compact(value) {
  return String(value || '').replace(/[^\p{L}\p{N}]+/gu, '');
}

/** Remove separators that are used to spell words one letter at a time. */
function despace(value) {
  return String(value || '').replace(/[\s._\-*~|·•]+/gu, '');
}

function tokensOf(value) {
  const s = scanNormalize(value);
  return s ? s.split(' ').filter(Boolean) : [];
}

/**
 * Clause split for academic-context windows. We split on sentence / comma
 * boundaries, explicit "also" connectors, and Hinglish copulas ("... hai
 * partnership samjha do" is two clauses), but NOT on the dot inside question
 * numbers such as "2.3".
 */
function splitClauses(value) {
  const raw = stripInvisible(value).toLowerCase();
  if (!raw) return [];
  return raw
    .split(/\n+|[,;!?]+|\.(?=\s|$)|\s+(?:also|plus|btw|waise|by\s+the\s+way)\s+|\s+aur\s+|\s+(?:hai|hain|tha|thi|hoga|hogi|honge)\s+/i)
    .map((s) => scanNormalize(s))
    .filter(Boolean)
    .map((text) => ({ text, tokens: text.split(' ').filter(Boolean) }));
}

function printableRatio(text) {
  if (!text) return 0;
  let ok = 0;
  let total = 0;
  for (const ch of text) {
    total++;
    if (/[\p{L}\p{N}\p{P}\p{Z}\n\t]/u.test(ch)) ok++;
  }
  return total ? ok / total : 0;
}

function decodeBase64Variants(scan) {
  const out = [];
  const re = /[A-Za-z0-9+/_-]{16,}={0,2}/g;
  let m;
  while ((m = re.exec(scan)) && out.length < 3) {
    const token = m[0];
    try {
      const buf = Buffer.from(token.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
      if (buf.length < 6) continue;
      const text = buf.toString('utf8');
      if (text.includes('\uFFFD')) continue;
      if (printableRatio(text) < 0.85) continue;
      if (!/[a-z]{3,}/i.test(text)) continue;
      out.push({ kind: 'base64', text });
    } catch { /* not base64 */ }
  }
  return out;
}

function decodeHexVariants(scan) {
  const out = [];
  const re = /(?:[0-9a-f]{2}[\s:,-]*){8,}/gi;
  let m;
  while ((m = re.exec(scan)) && out.length < 2) {
    const hex = m[0].replace(/[^0-9a-f]/gi, '');
    if (hex.length % 2 !== 0 || hex.length < 16) continue;
    try {
      const buf = Buffer.from(hex, 'hex');
      const text = buf.toString('utf8');
      if (text.includes('\uFFFD')) continue;
      if (printableRatio(text) < 0.85) continue;
      if (!/[a-z]{3,}/i.test(text)) continue;
      out.push({ kind: 'hex', text });
    } catch { /* not hex */ }
  }
  return out;
}

function rot13(value) {
  return value.replace(/[a-z]/gi, (ch) => {
    const base = ch <= 'Z' ? 65 : 97;
    return String.fromCharCode(((ch.charCodeAt(0) - base + 13) % 26) + base);
  });
}

/**
 * Cheap, bounded decoding of common evasion wrappers. We only use the
 * decoded views as evidence; they can never raise a score or accept a doubt.
 */
function decodeVariants(value) {
  const raw = stripInvisible(value);
  const scan = scanNormalize(raw);
  const out = [];
  if (!scan) return out;

  // Base64/hex/percent need original case and punctuation, so decode from raw.
  out.push(...decodeBase64Variants(raw));
  out.push(...decodeHexVariants(raw));

  if (/%[0-9a-f]{2}/i.test(raw)) {
    try {
      const text = decodeURIComponent(raw);
      if (text !== raw && printableRatio(text) >= 0.85) out.push({ kind: 'percent', text });
    } catch { /* malformed escape */ }
  }

  const rot = rot13(scan);
  if (rot !== scan) out.push({ kind: 'rot13', text: rot });

  const rev = [...scan].reverse().join('');
  if (rev !== scan) out.push({ kind: 'reverse', text: rev });

  // De-duplicate and cap the work.
  const seen = new Set();
  return out.filter((v) => {
    const norm = scanNormalize(v.text);
    if (!norm || seen.has(norm)) return false;
    seen.add(norm);
    return true;
  }).slice(0, 8);
}

module.exports = {
  stripInvisible,
  cleanForModel,
  cleanName,
  sanitizeScope,
  scanNormalize,
  leetFold,
  compact,
  despace,
  tokensOf,
  splitClauses,
  decodeVariants,
  printableRatio,
  rot13,
};

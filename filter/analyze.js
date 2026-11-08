'use strict';

const {
  scanNormalize,
  leetFold,
  compact,
  despace,
  splitClauses,
  decodeVariants,
  stripInvisible,
} = require('./text');
const P = require('./patterns');

const SUBJECT_SET = P.ACADEMIC_SUBJECT_SET;
const REQUEST_SET = P.ACADEMIC_REQUEST_SET;
const EXEMPT_SET = P.ACADEMIC_EXEMPT_SET;
const STRONG_SET = P.ACADEMIC_STRONG_SET;

const QUESTION_WORDS = new Set([
  'why', 'what', 'how', 'when', 'where', 'which', 'who', 'kya', 'kaise',
  'kyu', 'kyun', 'kaun', 'kon', 'kab', 'kahan',
]);

const ACADEMIC_LINK_FRAME = /\b(?:case\s*study|example|reference|source|article|report|project|data|statistics|survey|study|research|news|official\s*website|website\s*of|explain|analysis|review|topic|question|chapter|textbook|syllabus)\b/;

// A word/meaning question can legitimately quote a social or abusive term.
const WORD_FRAME = /\b(?:meaning|definition|define|translate|translation|matlab|arth|synonym|antonym|etymology|pronounce|pronunciation|spelling|word|shabd)\b/;
// "who are you in the story" is literary analysis, not a classifier probe.
const NARRATIVE_FRAME = /\b(?:story|poem|poetry|novel|play|character|chapter|lesson|text|passage|book|movie|film|literature|history|example)\b/;
const INSULT_TARGET = /\b(?:you|u|tum|tu|tujhe|tumhe|aap|tera|teri|tumhara|tumhari)\b/;

/**
 * Look for academic subject/request/exempt words in a token range.
 * Phrases that overlap [excludeStart, excludeEnd] are ignored, so a social
 * keyword cannot use itself as its own academic alibi. An optional mask also
 * removes every other social keyword in the clause.
 */
function scanAcademic(tokens, from, to, excludeStart = 0, excludeEnd = -1, mask = null) {
  const res = { subject: false, request: false, exempt: false, strongSubject: false };
  const start = Math.max(0, from);
  const end = Math.min(tokens.length - 1, to);
  for (let i = start; i <= end; i++) {
    for (let len = 1; len <= 3 && i + len - 1 <= end; len++) {
      const phraseEnd = i + len - 1;
      if (phraseEnd >= excludeStart && i <= excludeEnd) continue;
      if (mask) {
        let masked = false;
        for (let k = i; k <= phraseEnd; k++) {
          if (mask[k]) { masked = true; break; }
        }
        if (masked) continue;
      }
      const phrase = tokens.slice(i, i + len).join(' ');
      if (SUBJECT_SET.has(phrase)) res.subject = true;
      if (REQUEST_SET.has(phrase)) res.request = true;
      if (EXEMPT_SET.has(phrase)) res.exempt = true;
      if (STRONG_SET.has(phrase)) res.strongSubject = true;
    }
  }
  return res;
}

function clauseInfo(tokens) {
  const a = scanAcademic(tokens, 0, tokens.length - 1);
  return {
    subject: a.subject,
    request: a.request,
    strong: a.subject && a.request,
  };
}

/** Convert a regex match in a space-separated clause into token indices. */
function matchSpan(clauseText, match) {
  const before = clauseText.slice(0, match.index);
  const start = before.trim() ? before.trim().split(/\s+/).length : 0;
  const matched = String(match[0] || '').trim();
  const len = matched ? matched.split(/\s+/).length : 1;
  return { start, end: start + Math.max(0, len - 1) };
}

/** Mark every token that is part of a social keyword match. */
function socialTokenMask(clause) {
  const mask = new Array(clause.tokens.length).fill(false);
  for (const p of P.SOCIAL_PATTERNS) {
    const re = new RegExp(p.re.source, p.re.flags.includes('g') ? p.re.flags : p.re.flags + 'g');
    let m;
    while ((m = re.exec(clause.text))) {
      const span = matchSpan(clause.text, m);
      for (let i = Math.max(0, span.start); i <= span.end && i < mask.length; i++) mask[i] = true;
      if (m[0].length === 0) re.lastIndex += 1;
    }
  }
  return mask;
}

function localText(tokens, span, before, after) {
  return tokens
    .slice(Math.max(0, span.start - before), Math.min(tokens.length, span.end + after + 1))
    .join(' ');
}

function exemptPersonal(tokens, span, mask) {
  const near = scanAcademic(tokens, span.start - 3, span.end + 3, span.start, span.end, mask);
  return Boolean(WORD_FRAME.test(localText(tokens, span, 3, 3)) || near.strongSubject);
}

function exemptTopic(tokens, span, mask) {
  const near = scanAcademic(tokens, span.start - 4, span.end + 4, span.start, span.end, mask);
  return Boolean(
    WORD_FRAME.test(localText(tokens, span, 3, 3)) ||
    near.subject || near.strongSubject || near.request
  );
}

function exemptAbuse(tokens, span) {
  const near = scanAcademic(tokens, span.start - 4, span.end + 4, span.start, span.end);
  const local = localText(tokens, span, 4, 4);
  if (WORD_FRAME.test(local) && !INSULT_TARGET.test(local)) return true;
  return Boolean(near.exempt);
}

function exemptProbe(tokens, span) {
  const near = scanAcademic(tokens, span.start - 3, span.end + 3, span.start, span.end);
  return Boolean(near.exempt || NARRATIVE_FRAME.test(localText(tokens, span, 4, 4)));
}

function hitFlag(list, label) {
  if (!list.includes(label)) list.push(label);
  return list;
}

function looksGibberish(scan, hasStudyRequest) {
  if (!scan) return false;
  if (hasStudyRequest) return false;
  if (P.SHORT_REF.test(scan)) return false;
  if (P.GREETING_ONLY.test(scan)) return false;

  const tokens = scan.split(' ').filter(Boolean);
  if (!tokens.length) return false;
  const alnum = scan.replace(/[^\p{L}\p{N}]/gu, '');
  const uniqRatio = alnum.length ? new Set(alnum).size / alnum.length : 1;
  const allMash = tokens.every((w) => P.MASH_WORDS.has(w));
  const nonAscii = /[^\x00-\x7F]/.test(scan);

  return Boolean(
    allMash ||
    /^(?:asdf|qwerty|test+|hehe+|haha+|ok+|okay+|hmm+|zzz+)$/.test(scan) ||
    (alnum.length >= 8 && uniqRatio < 0.35) ||
    /(.)\1{4,}/.test(scan) ||
    (!nonAscii && scan.length >= 9 && !/[aeiou0-9]/.test(scan))
  );
}

function hasQuestionFrame(tokens) {
  return tokens.some((t) => QUESTION_WORDS.has(t));
}

/** Run the safety patterns over an arbitrary (possibly decoded) view. */
function scanSafetyView(text) {
  const s = scanNormalize(text);
  if (!s) return { injection: false, probe: false, abuse: false, promo: false, labels: [] };
  const variants = [s, despace(s), compact(leetFold(s))];
  const labels = [];
  let injection = false;
  let probe = false;
  let abuse = false;
  let promo = false;

  for (const v of variants) {
    for (const p of P.INJECTION_PATTERNS) {
      if (p.re.test(v)) {
        if (p.cat === 'hard') injection = true;
        else probe = true;
        hitFlag(labels, p.label);
      }
    }
    for (const p of P.ABUSE_STRONG) {
      if (p.re.test(v)) { abuse = true; hitFlag(labels, p.label); }
    }
  }

  // URLs / domains need punctuation preserved.
  const raw = stripInvisible(text).toLowerCase();
  for (const p of P.PROMO_PATTERNS) {
    if (p.cat !== 'contact') continue;
    if (p.re.test(raw) || p.re.test(s)) { promo = true; hitFlag(labels, p.label); }
  }
  for (const p of P.PROMO_PATTERNS) {
    if (p.cat !== 'solicit') continue;
    if (p.re.test(s) || p.re.test(compact(s))) { promo = true; hitFlag(labels, p.label); }
  }

  return { injection, probe, abuse, promo, labels };
}

function analyzeText(value) {
  const normalized = String(value ?? '');
  const scan = scanNormalize(normalized);
  const clauses = splitClauses(normalized).map((c) => ({ ...c, info: clauseInfo(c.tokens) }));
  const hits = [];

  let socialPersonal = false;
  let socialTopic = false;
  let mildAbuse = false;
  let abuse = false;
  let promo = false;
  let injection = false;
  let probe = false;
  let encoded = false;

  const add = (kind, label, cat, clause) => hits.push({ kind, label, cat, clause });

  // ---- social / piggyback content ----
  for (const c of clauses) {
    const socialMask = socialTokenMask(c);
    for (const p of P.SOCIAL_PATTERNS) {
      const m = p.re.exec(c.text);
      if (!m) continue;
      if (p.exclude && p.exclude.test(c.text)) continue;
      const span = matchSpan(c.text, m);
      if (p.cat === 'personal') {
        if (exemptPersonal(c.tokens, span, socialMask)) continue;
        socialPersonal = true;
        add('social', p.label, 'personal', c.text.slice(0, 80));
      } else {
        if (exemptTopic(c.tokens, span, socialMask)) continue;
        socialTopic = true;
        add('social', p.label, 'topic', c.text.slice(0, 80));
      }
    }
  }

  // ---- abuse ----
  for (const c of clauses) {
    for (const p of P.ABUSE_STRONG) {
      const m = p.re.exec(c.text);
      if (!m) continue;
      const span = matchSpan(c.text, m);
      if (exemptAbuse(c.tokens, span)) continue;
      abuse = true;
      add('abuse', p.label, 'strong', c.text.slice(0, 80));
    }
    for (const p of P.ABUSE_MILD) {
      const m = p.re.exec(c.text);
      if (!m) continue;
      if (hasQuestionFrame(c.tokens)) continue;
      const span = matchSpan(c.text, m);
      if (exemptAbuse(c.tokens, span)) continue;
      mildAbuse = true;
      add('abuse', p.label, 'mild', c.text.slice(0, 80));
    }
  }

  // ---- promo ----
  const raw = stripInvisible(normalized).toLowerCase();
  for (const p of P.PROMO_PATTERNS) {
    if (p.cat !== 'contact') continue;
    if (!p.re.test(raw)) continue;
    // A URL/domain/number is academic only when it sits inside an explicit
    // academic frame such as "case study" or "reference".
    const m = p.re.exec(raw);
    const around = raw.slice(Math.max(0, m.index - 60), Math.min(raw.length, m.index + m[0].length + 60));
    if (ACADEMIC_LINK_FRAME.test(around)) continue;
    promo = true;
    add('promo', p.label, 'contact', around.slice(0, 80));
  }
  for (const c of clauses) {
    for (const p of P.PROMO_PATTERNS) {
      if (p.cat !== 'solicit') continue;
      const m = p.re.exec(c.text);
      if (!m) continue;
      if (p.exclude && p.exclude.test(c.text)) continue;
      promo = true;
      add('promo', p.label, 'solicit', c.text.slice(0, 80));
    }
  }

  // ---- injection / probes ----
  // Role tags need punctuation, which scanNormalize removes, so check the
  // cleaned original as well. "operating system:" is not a role tag.
  const rawLower = stripInvisible(normalized).toLowerCase();
  if (/(?<![a-z]\s)(?:^|\n|#+\s*)(?:system|developer|admin|administrator|moderator|root)\s*:/im.test(rawLower)) {
    injection = true;
    add('manipulation', 'system role tag', 'injection', rawLower.slice(0, 80));
  }
  for (const c of clauses) {
    for (const p of P.INJECTION_PATTERNS) {
      const m = p.re.exec(c.text);
      if (!m) continue;
      const span = matchSpan(c.text, m);
      if (p.cat === 'soft') {
        if (exemptProbe(c.tokens, span)) continue;
        probe = true;
        add('manipulation', p.label, 'probe', c.text.slice(0, 80));
      } else {
        injection = true;
        add('manipulation', p.label, 'injection', c.text.slice(0, 80));
      }
    }
  }

  // Obfuscated / de-spaced / leet views.
  const obfuscatedViews = [
    despace(scan),
    compact(scan),
    compact(leetFold(scan)),
  ].filter(Boolean);
  for (const v of obfuscatedViews) {
    for (const p of P.INJECTION_PATTERNS) {
      if (!p.re.test(v)) continue;
      if (p.cat === 'hard') injection = true;
      else probe = true;
      add('manipulation', p.label, 'obfuscated', v.slice(0, 80));
    }
    for (const p of P.ABUSE_STRONG) {
      if (p.re.test(v)) {
        abuse = true;
        add('abuse', p.label, 'obfuscated', v.slice(0, 80));
      }
    }
    for (const p of P.PROMO_PATTERNS) {
      if (p.cat === 'solicit' && p.re.test(v)) {
        promo = true;
        add('promo', p.label, 'obfuscated', v.slice(0, 80));
      }
    }
  }

  // ---- decoded payloads ----
  const decoded = decodeVariants(normalized);
  for (const d of decoded) {
    const safety = scanSafetyView(d.text);
    // Reverse / ROT13 are weak transformations: ordinary text often looks
    // like a soft probe when reversed. Only hard signals count for them.
    const weak = d.kind === 'reverse' || d.kind === 'rot13';
    const probeHit = safety.probe && !weak;
    const hasSignal = safety.injection || probeHit || safety.abuse || safety.promo;
    // Social content hidden in an encoding is also a signal.
    const social = P.SOCIAL_PATTERNS.some((p) => p.re.test(scanNormalize(d.text)));
    if (!hasSignal && !social) continue;
    encoded = true;
    if (safety.injection) injection = true;
    if (probeHit) probe = true;
    if (safety.abuse) abuse = true;
    if (safety.promo) promo = true;
    if (social) socialTopic = true;
    add('encoded', d.kind, 'decoded', d.text.slice(0, 80));
    for (const label of safety.labels) add('encoded', label, d.kind, d.text.slice(0, 80));
  }

  const hasStudyRequest = Boolean(
    P.SHORT_REF.test(scan) ||
    clauses.some((c) => c.info.strong)
  );
  const hasAcademic = clauses.some((c) => c.info.subject);
  const greetingOnly = Boolean(
    !hasStudyRequest &&
    !/\?/.test(normalized) &&
    !/\d/.test(scan) &&
    clauses.length <= 1 &&
    P.GREETING_ONLY.test(scan)
  );
  const gibberish = looksGibberish(scan, hasStudyRequest);

  const flags = {
    social: socialPersonal || socialTopic,
    socialPersonal,
    socialTopic,
    abuse,
    mildAbuse,
    promo,
    injection,
    probe,
    manipulation: injection || probe,
    encoded,
    gibberish,
    greetingOnly,
    hasStudyRequest,
    hasAcademic,
  };

  const active = Object.entries(flags).filter(([, v]) => v === true).map(([k]) => k);

  return {
    normalized,
    scan,
    clauses: clauses.map((c) => ({ text: c.text, academic: c.info })),
    flags,
    active,
    hits: hits.slice(0, 16),
  };
}

module.exports = { analyzeText, scanAcademic, scanSafetyView, looksGibberish };

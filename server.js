/**
 * DoubtDesk (MVP)
 * ----------------
 * Teacher starts a doubt session -> gets a unique student link (/s/CODE)
 * to share. Students open the link and submit doubts. Each doubt is
 * classified by the JEV AI decision model (TypeSafe AI) so only genuine
 * study doubts reach the teacher; junk / off-topic / abusive messages
 * are auto-filtered into a separate queue.
 *
 * Each session has a filter mode picked by the teacher:
 *   'subject' — only doubts about the session subject are accepted
 *   'chapter' — strict: only doubts about the named chapter/topic
 *   'both'    — any genuine study doubt (subject/chapter fit is shown, never flags)
 * Borderline cases always go to human review (fail-open: no doubt is ever
 * silently dropped; if the AI is unreachable a deterministic fallback runs).
 * A message whose dominant purpose is not study — a study question piggybacked
 * on social chat, promotion, abuse, or a classifier override — is flagged
 * instead of accepted.
 *
 * Storage is in-memory for the MVP (sessions vanish on restart).
 * Swap the Maps below for a real DB when going beyond MVP.
 */
require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const {
  FILTER_VERSION,
  buildJevQuestions,
  cleanForModel,
  cleanName,
  sanitizeScope,
  analyzeText,
  decideStatus,
  effectiveThresholds,
} = require('./filter');

const app = express();
const PORT = process.env.PORT || 3000;

// ---- JEV config (key stays server-side, never sent to the browser) ----
const JEV_API_KEY = (process.env.JEV_API_KEY || '').trim();
const JEV_URL = process.env.JEV_URL || 'https://api.typesafe.ai/v1/systemone';
const JEV_MODEL = process.env.JEV_MODEL || 'jev-1.13.0';

app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------------- in-memory store ----------------
const sessionsByCode = new Map();   // code -> session
const codeByTeacherToken = new Map(); // teacherToken -> code
const streamsByCode = new Map();    // code -> Set<SSE res>

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no confusing chars
function makeCode(n = 6) {
  let s = '';
  for (let i = 0; i < n; i++) s += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return s;
}
function makeToken() { return crypto.randomBytes(18).toString('hex'); }
function makeId() { return crypto.randomUUID().slice(0, 8); }

// ---------------- prompt-injection hardening ----------------
// Student text is UNTRUSTED DATA. It is interpolated only into `state.doubt`
// (a data field) and never into instruction text. Every question carries the
// shared security preamble from filter/prompts.js. Teacher-configured scope is
// sanitized so it cannot break out of its quoting.
//
// Defense in depth: filter/analyze.js also runs a deterministic tripwire
// (Unicode/zero-width cleanup, homoglyph + leetspeak folding, compact matching,
// base64/hex/ROT13/reverse decoding, social/promo/abuse/injection detection)
// before any model verdict is trusted.

// ---------------- JEV classification ----------------
// One round-trip per doubt. Questions is_study + verdict are always sent;
// subject_fit / chapter_fit are added only when the session has that scope
// and the mode needs it. Returns normalized signals for the router.
async function classifyWithJev(text, ctx) {
  const { subject = '', chapter = '', mode = 'both' } = ctx || {};
  const safeSubject = sanitizeScope(subject, 60);
  const safeChapter = sanitizeScope(chapter, 80);
  if (!JEV_API_KEY) return { engine: 'none' };
  const started = Date.now();

  const questions = buildJevQuestions({ subject: safeSubject, chapter: safeChapter, mode });
  const body = JSON.stringify({
    model: JEV_MODEL,
    state: { doubt: text, session_subject: safeSubject, session_chapter: safeChapter, filter_mode: mode },
    questions,
  });

  // One fetch attempt with an 8s timeout.
  async function jevAttempt() {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(JEV_URL, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { Authorization: `Bearer ${JEV_API_KEY}`, 'Content-Type': 'application/json' },
        body,
      });
      return res;
    } finally {
      clearTimeout(timer);
    }
  }

  try {
    let res;
    try {
      res = await jevAttempt();
    } catch (err) {
      if (err?.name !== 'AbortError') throw err;
      return { engine: 'jev', failed: true, detail: 'JEV request timed out', latencyMs: Date.now() - started };
    }
    if (!res.ok && res.status === 503) {
      await new Promise((r) => setTimeout(r, 1200)); // single retry on transient 503
      try {
        res = await jevAttempt();
      } catch (err) {
        return { engine: 'jev', failed: true, detail: 'JEV request timed out', latencyMs: Date.now() - started };
      }
    }
    if (!res.ok) return { engine: 'jev', failed: true, detail: `JEV responded ${res.status}`, latencyMs: Date.now() - started };
    const data = await res.json();
    const numOrNull = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
    const S = numOrNull(data?.answers?.is_study?.noul);
    const v = data?.answers?.verdict || {};
    const probs = v.probabilities && typeof v.probabilities === 'object' ? v.probabilities : null;
    let C = typeof v.confidence === 'number' ? v.confidence : null;
    if (C === null && probs) {
      const vals = Object.values(probs).filter((x) => typeof x === 'number');
      if (vals.length) C = Math.max(...vals);
    }
    if (C === null) C = 0.5;
    let M = null;
    if (probs) {
      const vals = Object.values(probs).filter((x) => typeof x === 'number').sort((a, b) => b - a);
      if (vals.length >= 2) M = vals[0] - vals[1];
      else if (vals.length === 1) M = vals[0];
    }
    if (M === null) M = C >= 0.8 ? 1.0 : 0.0;
    const SF = numOrNull(data?.answers?.subject_fit?.noul);
    const CF = numOrNull(data?.answers?.chapter_fit?.noul);
    return {
      engine: 'jev',
      model: JEV_MODEL,
      latencyMs: Date.now() - started,
      isStudy: S,
      verdict: v.choice || null,
      verdictConfidence: C,
      verdictProbs: probs,
      margin: M,
      subjectFit: SF,
      chapterFit: CF,
      offTopicPart: numOrNull(data?.answers?.off_topic_part?.noul),
      abuseSignal: numOrNull(data?.answers?.abuse_signal?.noul),
      spamSignal: numOrNull(data?.answers?.spam_signal?.noul),
      manipulationSignal: numOrNull(data?.answers?.manipulation_signal?.noul),
      asksStudyHelp: numOrNull(data?.answers?.asks_study_help?.noul),
    };
  } catch (err) {
    return { engine: 'jev', failed: true, detail: String(err?.message || err), latencyMs: Date.now() - started };
  }
}

// Resolve the mode actually applied to a doubt (empty scope falls back to 'both').
function appliedMode(session) {
  const m = session.mode || 'subject';
  if (m === 'chapter' && !(session.chapter || '').trim()) return 'both';
  if (m === 'subject' && !(session.subject || '').trim()) return 'both';
  return m;
}

function broadcast(code, event, payload) {
  const clients = streamsByCode.get(code);
  if (!clients) return;
  const msg = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) {
    try { res.write(msg); } catch { /* drop dead clients on next heartbeat */ }
  }
}

// Simple per-IP rate limit for doubt submissions: 10 / minute.
const submissionsByIp = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const arr = (submissionsByIp.get(ip) || []).filter((t) => now - t < 60_000);
  if (arr.length >= 10) return true;
  arr.push(now);
  submissionsByIp.set(ip, arr);
  return false;
}

// ---------------- API ----------------

// Teacher creates a session
app.post('/api/sessions', (req, res) => {
  const title = String(req.body?.title || '').trim().slice(0, 80) || 'Doubt Session';
  const subject = String(req.body?.subject || '').trim().slice(0, 60);
  const mode = ['subject', 'chapter', 'both'].includes(req.body?.mode) ? req.body.mode : 'both';
  const chapter = String(req.body?.chapter || '').trim().slice(0, 80);
  if (mode === 'chapter' && !chapter) {
    return res.status(400).json({ error: 'Strict chapter mode needs a chapter name.' });
  }
  if (mode === 'subject' && !subject) {
    return res.status(400).json({ error: 'Subject-only mode needs a subject — or pick "All study doubts".' });
  }
  let code = makeCode();
  while (sessionsByCode.has(code)) code = makeCode();
  const teacherToken = makeToken();
  const session = {
    code,
    teacherToken,
    title,
    subject,
    mode,
    chapter,
    createdAt: new Date().toISOString(),
    doubts: [],
  };
  sessionsByCode.set(code, session);
  codeByTeacherToken.set(teacherToken, code);
  const base = `${req.protocol}://${req.get('host')}`;
  res.status(201).json({
    code,
    title,
    subject,
    mode,
    chapter,
    studentUrl: `${base}/s/${code}`,
    teacherUrl: `${base}/t/${teacherToken}`,
  });
});

// Teacher dashboard data (private — needs teacher token)
app.get('/api/teacher/:token', (req, res) => {
  const code = codeByTeacherToken.get(req.params.token);
  const session = code && sessionsByCode.get(code);
  if (!session) return res.status(404).json({ error: 'Session not found.' });
  const counts = { accepted: 0, review: 0, flagged: 0, solved: 0 };
  for (const d of session.doubts) if (counts[d.status] !== undefined) counts[d.status]++;
  const base = `${req.protocol}://${req.get('host')}`;
  res.json({
    code: session.code,
    title: session.title,
    subject: session.subject,
    mode: session.mode || 'subject',
    chapter: session.chapter || '',
    createdAt: session.createdAt,
    studentUrl: `${base}/s/${session.code}`,
    counts,
    total: session.doubts.length,
    doubts: [...session.doubts].reverse(), // newest first
  });
});

// Teacher changes the filter mode / chapter mid-session
app.post('/api/teacher/:token/settings', (req, res) => {
  const code = codeByTeacherToken.get(req.params.token);
  const session = code && sessionsByCode.get(code);
  if (!session) return res.status(404).json({ error: 'Session not found.' });
  const mode = req.body?.mode;
  if (mode !== undefined) {
    if (!['subject', 'chapter', 'both'].includes(mode)) {
      return res.status(400).json({ error: 'Invalid mode.' });
    }
    const nextSubject = req.body?.subject !== undefined
      ? String(req.body.subject || '').trim().slice(0, 60)
      : session.subject;
    const nextChapter = req.body?.chapter !== undefined
      ? String(req.body.chapter || '').trim().slice(0, 80)
      : session.chapter;
    if (mode === 'chapter' && !nextChapter) {
      return res.status(400).json({ error: 'Strict chapter mode needs a chapter name.' });
    }
    if (mode === 'subject' && !nextSubject) {
      return res.status(400).json({ error: 'Subject-only mode needs a subject.' });
    }
    session.mode = mode;
  }
  if (req.body?.chapter !== undefined) {
    session.chapter = String(req.body.chapter || '').trim().slice(0, 80);
  }
  if (req.body?.subject !== undefined) {
    session.subject = String(req.body.subject || '').trim().slice(0, 60);
  }
  broadcast(code, 'settings', { mode: session.mode, chapter: session.chapter, subject: session.subject });
  res.json({ ok: true, mode: session.mode, chapter: session.chapter, subject: session.subject });
});

// Live updates for the teacher dashboard (Server-Sent Events)
app.get('/api/teacher/:token/stream', (req, res) => {
  const code = codeByTeacherToken.get(req.params.token);
  const session = code && sessionsByCode.get(code);
  if (!session) return res.status(404).end();
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(': connected\n\n');
  if (!streamsByCode.has(code)) streamsByCode.set(code, new Set());
  streamsByCode.get(code).add(res);
  const heartbeat = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 25000);
  req.on('close', () => {
    clearInterval(heartbeat);
    streamsByCode.get(code)?.delete(res);
  });
});

// Public session info for students (solved Q&A only — open doubts stay private)
app.get('/api/session/:code/public', (req, res) => {
  const session = sessionsByCode.get(String(req.params.code || '').toUpperCase());
  if (!session) return res.status(404).json({ error: 'Session not found. Check the link.' });
  res.json({
    title: session.title,
    subject: session.subject,
    mode: session.mode || 'subject',
    chapter: session.chapter || '',
    solved: session.doubts
      .filter((d) => d.status === 'solved')
      .map((d) => ({ id: d.id, text: d.text, answer: d.answer || '', createdAt: d.createdAt })),
  });
});

// Student submits a doubt -> classified by JEV -> queued
app.post('/api/session/:code/doubts', async (req, res) => {
  const session = sessionsByCode.get(String(req.params.code || '').toUpperCase());
  if (!session) return res.status(404).json({ error: 'Session not found. Check the link.' });
  if (rateLimited(req.ip)) return res.status(429).json({ error: 'Too many doubts — wait a minute and try again.' });

  const name = cleanName(req.body?.name) || 'Anonymous';
  const text = cleanForModel(req.body?.text);
  if (text.length < 2) return res.status(400).json({ error: 'Please write your doubt (min 2 characters).' });
  if (text.length > 500) return res.status(400).json({ error: 'Keep your doubt under 500 characters.' });

  const det = analyzeText(text);
  const ctx = {
    text,
    subject: (session.subject || '').trim(),
    chapter: (session.chapter || '').trim(),
    mode: session.mode || 'subject',
    appliedMode: appliedMode(session),
    det,
  };
  const result = await classifyWithJev(text, ctx);
  const { status, reason, gate } = decideStatus(result, ctx);

  const numOrNull = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
  const usedJev = result.engine === 'jev' && !result.failed;
  const doubt = {
    id: makeId(),
    name,
    text,
    status,
    reason,
    filterMode: ctx.appliedMode,
    filterVersion: FILTER_VERSION,
    filterGate: gate || null,
    sessionSubject: ctx.subject,
    sessionChapter: ctx.chapter,
    aiEngine: usedJev ? 'jev' : 'deterministic',
    aiModel: usedJev ? (result.model || JEV_MODEL) : 'deterministic',
    aiLatencyMs: typeof result.latencyMs === 'number' ? result.latencyMs : null,
    verdict: result.verdict || null,
    isStudy: numOrNull(result.isStudy),
    score: numOrNull(result.isStudy), // legacy alias
    confidence: numOrNull(result.verdictConfidence),
    verdictProbs: result.verdictProbs || null,
    margin: numOrNull(result.margin),
    subjectFit: numOrNull(result.subjectFit),
    chapterFit: numOrNull(result.chapterFit),
    offTopicPart: numOrNull(result.offTopicPart),
    abuseSignal: numOrNull(result.abuseSignal),
    spamSignal: numOrNull(result.spamSignal),
    manipulationSignal: numOrNull(result.manipulationSignal),
    asksStudyHelp: numOrNull(result.asksStudyHelp),
    detFlags: det.active,
    thresholds: effectiveThresholds(),
    answer: '',
    createdAt: new Date().toISOString(),
    solvedAt: null,
  };
  session.doubts.push(doubt);
  broadcast(session.code, 'doubt', { id: doubt.id, status });

  const messages = {
    accepted: 'Doubt received! The teacher will solve it here.',
    review: 'Doubt received! It is in the queue for review.',
    flagged: 'That message wasn’t accepted as a study-only doubt. Please send just your subject question — extra chat, ads, abuse or links get filtered.',
  };
  res.status(201).json({ id: doubt.id, status, message: messages[status] });
});

// Teacher marks a doubt solved (optionally with an answer students can see)
app.post('/api/teacher/:token/solve', (req, res) => {
  const code = codeByTeacherToken.get(req.params.token);
  const session = code && sessionsByCode.get(code);
  if (!session) return res.status(404).json({ error: 'Session not found.' });
  const doubt = session.doubts.find((d) => d.id === req.body?.id);
  if (!doubt) return res.status(404).json({ error: 'Doubt not found.' });
  doubt.status = 'solved';
  doubt.answer = String(req.body?.answer || '').trim().slice(0, 2000);
  doubt.reason = '';
  doubt.solvedAt = new Date().toISOString();
  broadcast(code, 'doubt', { id: doubt.id, status: 'solved' });
  res.json({ ok: true });
});

// Teacher manually overrides the AI queue (move between accepted / flagged)
app.post('/api/teacher/:token/override', (req, res) => {
  const code = codeByTeacherToken.get(req.params.token);
  const session = code && sessionsByCode.get(code);
  if (!session) return res.status(404).json({ error: 'Session not found.' });
  const doubt = session.doubts.find((d) => d.id === req.body?.id);
  const to = req.body?.to;
  if (!doubt || !['accepted', 'flagged'].includes(to)) {
    return res.status(400).json({ error: 'Invalid doubt or target queue.' });
  }
  doubt.status = to;
  doubt.reason = to === 'accepted' ? 'Approved by teacher.' : 'Rejected by teacher.';
  broadcast(code, 'doubt', { id: doubt.id, status: to });
  res.json({ ok: true });
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    jevConfigured: Boolean(JEV_API_KEY),
    model: JEV_MODEL,
    filterVersion: FILTER_VERSION,
    studyThreshold: effectiveThresholds().studyAccept,
  });
});

// ---------------- pages ----------------
app.get('/s/:code', (req, res) => res.sendFile(path.join(__dirname, 'public', 'join.html')));
app.get('/t/:token', (req, res) => res.sendFile(path.join(__dirname, 'public', 'teacher.html')));

app.listen(PORT, () => {
  console.log(`DoubtDesk MVP running at http://localhost:${PORT}`);
  if (!JEV_API_KEY) console.log('WARNING: JEV_API_KEY is not set — doubts will go to manual review.');
});

'use strict';

const { T, STUDY_THRESHOLD } = require('./config');
const { analyzeText } = require('./analyze');
const { SHORT_REF } = require('./patterns');

const STUDY_GATE = Math.max(T.studyAccept, STUDY_THRESHOLD);

function num(x) {
  return typeof x === 'number' && Number.isFinite(x) ? x : null;
}

function pct1(x) {
  return (x === null || x === undefined || Number.isNaN(x)) ? '—' : `${Math.round(x * 100)}%`;
}

function effectiveThresholds() {
  return { ...T, studyAccept: STUDY_GATE, studyThreshold: STUDY_THRESHOLD };
}

function detLabel(det) {
  const labels = [...new Set((det.hits || []).map((h) => h.label))].slice(0, 3);
  return labels.length ? ` (${labels.join(', ')})` : '';
}

function hasStudySignal(result, det) {
  const S = num(result?.isStudy);
  const ASK = num(result?.asksStudyHelp);
  return Boolean(
    (S !== null && S >= 0.5) ||
    (ASK !== null && ASK >= 0.5) ||
    det.flags.hasStudyRequest
  );
}

/**
 * Deterministic safety gates. These run before any model verdict and can
 * only block acceptance — they never accept, and never raise a score.
 */
function safetyDecision(det, result) {
  const study = hasStudySignal(result, det);

  if (det.flags.abuse) {
    return {
      status: 'flagged',
      reason: `Flagged as abusive or threatening content${detLabel(det)} — not a study doubt.`,
      gate: 'deterministic',
    };
  }
  if (det.flags.mildAbuse) {
    return study
      ? { status: 'review', reason: 'Possible insult mixed with a study question — please check.', gate: 'deterministic' }
      : { status: 'flagged', reason: 'Flagged as disrespectful / abusive content — not a study doubt.', gate: 'deterministic' };
  }
  if (det.flags.promo) {
    return {
      status: 'flagged',
      reason: `Flagged as spam, promotion, or contact-seeking${detLabel(det)} — not a study doubt.`,
      gate: 'deterministic',
    };
  }
  if (det.flags.injection) {
    return study
      ? { status: 'review', reason: 'Study question wrapped in a classifier override attempt — please check.', gate: 'deterministic' }
      : { status: 'flagged', reason: 'Flagged as a classifier probe or prompt injection — not a study doubt.', gate: 'deterministic' };
  }
  if (det.flags.probe) {
    return study
      ? { status: 'review', reason: 'Study question mixed with a classifier probe — please check.', gate: 'deterministic' }
      : { status: 'flagged', reason: 'Flagged as a classifier probe, not a study doubt.', gate: 'deterministic' };
  }
  if (det.flags.encoded) {
    return {
      status: 'review',
      reason: `Encoded / obfuscated content detected${detLabel(det)} — please check.`,
      gate: 'deterministic',
    };
  }
  if (det.flags.socialPersonal) {
    return study
      ? {
          status: 'flagged',
          reason: `Flagged: study question mixed with personal / social content${detLabel(det)} — not a study-only doubt.`,
          gate: 'deterministic',
        }
      : {
          status: 'flagged',
          reason: `Flagged as personal / social chat${detLabel(det)} — not a study doubt.`,
          gate: 'deterministic',
        };
  }
  if (det.flags.socialTopic) {
    return study
      ? {
          status: 'review',
          reason: `Social / entertainment topic mixed with a study question${detLabel(det)} — please check.`,
          gate: 'deterministic',
        }
      : {
          status: 'flagged',
          reason: `Flagged as off-topic social / entertainment chat${detLabel(det)} — not a study doubt.`,
          gate: 'deterministic',
        };
  }
  if (det.flags.gibberish) {
    return {
      status: 'flagged',
      reason: 'Flagged as gibberish, keyboard mashing, or a test message.',
      gate: 'deterministic',
    };
  }
  if (det.flags.greetingOnly) {
    return {
      status: 'flagged',
      reason: 'Flagged as a greeting / chit-chat with no study question.',
      gate: 'deterministic',
    };
  }
  return null;
}

function mixedDecision(off, S, C, V) {
  const strong = off >= T.mixedFlagOTStrong ||
    (off >= T.mixedFlagOT && (S <= T.mixedFlagS || C >= T.mixedFlagC));
  if (strong) {
    return {
      status: 'flagged',
      reason: `Flagged: study question mixed with a substantial non-study part (off-topic part ${pct1(off)}, study ${pct1(S)}).`,
      gate: 'mixed',
    };
  }
  return {
    status: 'review',
    reason: `Mixed message — study question plus a separate non-study part (off-topic part ${pct1(off)}) — please check.`,
    gate: 'mixed',
  };
}

/**
 * Deterministic fallback used only when JEV is unavailable. Never accepts;
 * high-precision junk is flagged, everything else goes to human review.
 */
function fallbackClassify(text, ctx, detArg) {
  const det = detArg || analyzeText(text);
  const safety = safetyDecision(det, null);
  if (safety) {
    return {
      status: safety.status,
      reason: `${safety.reason} AI check unavailable.`,
      gate: 'fallback',
    };
  }
  if (det.flags.hasStudyRequest) {
    return {
      status: 'review',
      reason: 'AI check unavailable — genuine-looking study request queued for teacher.',
      gate: 'fallback',
    };
  }
  return {
    status: 'review',
    reason: 'AI check unavailable — queued for teacher.',
    gate: 'fallback',
  };
}

/**
 * Final routing. Order matters:
 *   1. deterministic safety (abuse/promo/injection/encoded/social/gibberish)
 *   2. fallback when the model is unavailable
 *   3. independent safety signals (can override study_doubt)
 *   4. verdict-level classification
 *   5. study gate + absent-request guard
 *   6. subject/chapter fit
 *
 * Only step 6 can return "accepted", and only when every earlier gate is clean.
 */
function decideStatus(result, ctx) {
  const det = ctx.det || analyzeText(ctx.text);
  const safety = safetyDecision(det, result);
  if (safety) return safety;

  const failed = !result || result.engine !== 'jev' || result.failed ||
    num(result.isStudy) === null || !result.verdict;
  if (failed) return fallbackClassify(ctx.text, ctx, det);

  const S = num(result.isStudy);
  const V = result.verdict;
  const C = num(result.verdictConfidence);
  const M = num(result.margin);
  const SF = num(result.subjectFit);
  const CF = num(result.chapterFit);
  const OT = num(result.offTopicPart);
  const AB = num(result.abuseSignal);
  const SP = num(result.spamSignal);
  const MAN = num(result.manipulationSignal);
  const ASK = num(result.asksStudyHelp);
  const study = hasStudySignal(result, det);
  const mode = ctx.appliedMode || ctx.mode || 'both';

  // Independent per-question safety signals. A high signal blocks acceptance
  // even when the verdict says study_doubt; a mid signal is enough to review.
  if (AB !== null && AB >= T.signalFlag) {
    if (AB >= T.signalStrong || det.flags.abuse) {
      return { status: 'flagged', reason: `Flagged: abuse signal ${pct1(AB)} — not a study doubt.`, gate: 'signal' };
    }
    return { status: 'review', reason: `Possible abuse (${pct1(AB)}) — please check.`, gate: 'signal' };
  }
  if (SP !== null && SP >= T.signalFlag) {
    if (SP >= T.signalStrong || det.flags.promo) {
      return { status: 'flagged', reason: `Flagged: spam / promotion signal ${pct1(SP)} — not a study doubt.`, gate: 'signal' };
    }
    return { status: 'review', reason: `Possible spam / promotion (${pct1(SP)}) — please check.`, gate: 'signal' };
  }
  if (MAN !== null && MAN >= T.signalFlag) {
    if (MAN >= T.signalStrong && !study) {
      return { status: 'flagged', reason: `Flagged: classifier manipulation signal ${pct1(MAN)} — not a study doubt.`, gate: 'signal' };
    }
    return { status: 'review', reason: `Possible classifier manipulation (${pct1(MAN)}) — please check.`, gate: 'signal' };
  }
  if (AB !== null && AB >= T.signalReview && V === 'study_doubt' && S < 0.95) {
    return { status: 'review', reason: `Possible abuse signal (${pct1(AB)}) — please check.`, gate: 'signal' };
  }
  if (SP !== null && SP >= T.signalReview && V === 'study_doubt' && S < 0.95) {
    return { status: 'review', reason: `Possible spam signal (${pct1(SP)}) — please check.`, gate: 'signal' };
  }
  if (MAN !== null && MAN >= T.signalReview && V === 'study_doubt' && S < 0.95) {
    return { status: 'review', reason: `Possible classifier manipulation (${pct1(MAN)}) — please check.`, gate: 'signal' };
  }

  if (V === 'abusive') {
    if (C >= T.abuseFlagC) {
      return { status: 'flagged', reason: `Flagged as inappropriate (abuse ${pct1(C)}).`, gate: 'verdict' };
    }
    return { status: 'review', reason: `Possible abuse, low confidence (${pct1(C)}) — please check.`, gate: 'verdict' };
  }

  if (V === 'spam_or_junk') {
    if (C >= T.spamFlagC && S <= T.spamFlagS) {
      return { status: 'flagged', reason: `Flagged as spam / junk (study ${pct1(S)}).`, gate: 'verdict' };
    }
    return { status: 'review', reason: 'Possible spam / junk — please check.', gate: 'verdict' };
  }

  if (V === 'off_topic') {
    if ((C >= T.offTopicFlagC && S <= T.offTopicFlagS) || (C >= T.offTopicFlagC && S <= 1 - STUDY_GATE)) {
      return { status: 'flagged', reason: `Flagged as off-topic, not a study doubt (study ${pct1(S)}).`, gate: 'verdict' };
    }
    return { status: 'review', reason: `Borderline off-topic (study ${pct1(S)}) — please check.`, gate: 'verdict' };
  }

  if (V === 'mixed') {
    const off = OT !== null ? OT : 0.8;
    return mixedDecision(off, S, C, V);
  }

  if (V !== 'study_doubt') {
    return { status: 'review', reason: `Unknown verdict (${String(V)}) — please check.`, gate: 'verdict' };
  }

  // ---- study_doubt path ----
  if (S < STUDY_GATE || C < T.confAccept || M < T.marginClear) {
    return {
      status: 'review',
      reason: `Uncertain (study ${pct1(S)}, confidence ${pct1(C)}) — please check.`,
      gate: 'study',
    };
  }

  if (OT !== null && OT >= T.mixedReviewOT) {
    return mixedDecision(OT, S, C, V);
  }

  const clearAsk = det.flags.hasStudyRequest || SHORT_REF.test(det.scan) ||
    (ASK !== null && ASK >= T.asksHelpStrong);
  if (ASK !== null && ASK < T.asksHelpLow && S < 0.9 && !clearAsk) {
    return { status: 'review', reason: `No clear study request (asks for help ${pct1(ASK)}) — please check.`, gate: 'study' };
  }
  if (!clearAsk && S < 0.9) {
    return { status: 'review', reason: 'No clear study request — please check.', gate: 'study' };
  }

  // Defensive checks: deterministic safety should already have caught these.
  if (det.flags.injection || det.flags.probe || det.flags.encoded) {
    return { status: 'review', reason: 'Override / probe content around a study question — please check.', gate: 'safety' };
  }
  if (det.flags.promo || det.flags.abuse) {
    return { status: 'flagged', reason: 'Study question mixed with a safety violation — not a study-only doubt.', gate: 'safety' };
  }
  if (det.flags.socialPersonal || det.flags.socialTopic) {
    return { status: 'review', reason: 'Study question mixed with social / non-study content — please check.', gate: 'safety' };
  }

  // ---- relevance gate per mode ----
  const fitLine = [
    SF !== null ? `subject fit ${pct1(SF)}` : null,
    CF !== null ? `chapter fit ${pct1(CF)}` : null,
  ].filter(Boolean).join(', ');

  if (mode === 'chapter') {
    if (CF === null) {
      return { status: 'review', reason: 'Chapter relevance unknown — please check.', gate: 'fit' };
    }
    if (CF >= T.chapterAccept) {
      return { status: 'accepted', reason: fitLine ? `Accepted (${fitLine}).` : '', gate: 'fit' };
    }
    if (S >= 1 - T.fitFlag && C >= T.offTopicFlagC && CF <= T.fitFlag) {
      return { status: 'flagged', reason: `Not for this chapter (${ctx.chapter || 'configured chapter'}).`, gate: 'fit' };
    }
    return { status: 'review', reason: `Chapter relevance uncertain (${fitLine || 'no fit signal'}) — please check.`, gate: 'fit' };
  }

  if (mode === 'subject') {
    if (SF === null) {
      return { status: 'review', reason: 'Subject relevance unknown — please check.', gate: 'fit' };
    }
    if (SF >= T.fitAccept) {
      return { status: 'accepted', reason: fitLine ? `Accepted (${fitLine}).` : '', gate: 'fit' };
    }
    if (S >= 1 - T.fitFlag && C >= T.offTopicFlagC && SF <= T.fitFlag) {
      return { status: 'flagged', reason: `Not for this subject (${ctx.subject || 'configured subject'}).`, gate: 'fit' };
    }
    return { status: 'review', reason: `Subject relevance uncertain (${fitLine || 'no fit signal'}) — please check.`, gate: 'fit' };
  }

  // 'both' — fit is display-only, never flags.
  const note = fitLine && ((SF !== null && SF <= T.fitFlag) || (CF !== null && CF <= T.fitFlag))
    ? ' Outside session topic, kept as a genuine study doubt.'
    : '';
  return { status: 'accepted', reason: `Accepted (study ${pct1(S)}).${note}`, gate: 'fit' };
}

module.exports = {
  decideStatus,
  fallbackClassify,
  safetyDecision,
  effectiveThresholds,
  pct1,
  STUDY_GATE,
};

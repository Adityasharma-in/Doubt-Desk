'use strict';

/**
 * Central filter configuration.
 *
 * STUDY_THRESHOLD is teacher-tunable, but it is clamped to a safe band:
 * below 0.70 the gate is too easy to slip through, above 0.95 almost every
 * genuine doubt would need manual review. The env var used to be read and
 * then ignored; it is now the effective minimum for every acceptance path.
 */
const RAW_STUDY_THRESHOLD = Number(process.env.STUDY_THRESHOLD);
const STUDY_THRESHOLD = Number.isFinite(RAW_STUDY_THRESHOLD)
  ? Math.min(0.95, Math.max(0.70, RAW_STUDY_THRESHOLD))
  : 0.70;

// Routing thresholds (fixed; see README for the table).
const T = Object.freeze({
  studyAccept: 0.70,
  confAccept: 0.55,
  marginClear: 0.15,
  fitAccept: 0.60,
  chapterAccept: 0.65,
  fitFlag: 0.40,

  // Verdict-level safety gates.
  abuseFlagC: 0.60,
  spamFlagC: 0.60,
  spamFlagS: 0.50,
  offTopicFlagC: 0.65,
  offTopicFlagS: 0.45,

  // Independent per-question signals. A high signal can block acceptance
  // even when the verdict says study_doubt.
  signalReview: 0.50,
  signalFlag: 0.72,
  signalStrong: 0.85,

  // Mixed-message routing.
  mixedReviewOT: 0.60,
  mixedFlagOT: 0.75,
  mixedFlagOTStrong: 0.82,
  mixedFlagS: 0.78,
  mixedFlagC: 0.65,

  // A study verdict with no actual study request is suspicious.
  asksHelpLow: 0.40,
  asksHelpStrong: 0.60,
});

const FILTER_VERSION = '2.0.0';

module.exports = {
  T,
  STUDY_THRESHOLD,
  RAW_STUDY_THRESHOLD,
  FILTER_VERSION,
};

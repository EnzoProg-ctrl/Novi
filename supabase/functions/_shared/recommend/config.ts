/**
 * Every tunable number in the recommender, in one place.
 *
 * The ranking is a transparent weighted sum, set by hand: there is not yet
 * enough interaction data to train a ranking model, and these weights are a
 * starting point to adjust against recommendation_events and
 * private.recommendation_metrics(). Knowledge-tracing parameters live in the
 * database (private.kt_params), where mastery is computed; FORGETTING below
 * must match them.
 */

export const MODEL_VERSION = "hybrid-1";

/** Must match private.kt_params(). */
export const FORGETTING = { prior: 0.3, halfLifeDays: 30 };

export const KNOWLEDGE = {
  /** confidence = evidence / (evidence + k): 3 answers' worth of evidence gives 0.5. */
  confidenceK: 3,
  /** Below this a topic is weak, below `developing` it still needs work. */
  weak: 0.5,
  developing: 0.75,
  /** Treated as mastered (practice suppressed) at or above this, with enough evidence. */
  mastered: 0.85,
  masteredMinEvidence: 2,
  /** Mistakes fade with this half-life when weighting how recent they are. */
  mistakeHalfLifeDays: 7,
  /** "Recent" performance is the last this-many answers on the topic. */
  recentWindow: 5,
};

export const RETRIEVAL = {
  /** At most this many weak topics are looked up per run. */
  maxTopics: 5,
  /** Semantic matches below this cosine similarity are ignored. */
  minSimilarity: 0.55,
  /** Similarity mapped to 0-1 relevance between these two values. */
  similarityFloor: 0.55,
  similarityCeiling: 0.8,
  perTopic: 3,
  /**
   * Relevance given to links found without embeddings. A pack with questions
   * on the topic is good evidence its material covers it, but a strong
   * semantic match (relevance above this) is better for revision.
   */
  questionLink: 0.8,
  conceptLink: 0.7,
};

export const CONTEXT = {
  /** How far back answers are read, and at most how many. */
  attemptDays: 60,
  attemptLimit: 400,
  /** Planned sessions within this many days count as upcoming. */
  planHorizonDays: 7,
  /** Recommendation history read for repetition control. */
  historyDays: 7,
};

export const CANDIDATES = {
  /** A topic needs at least this many questions in a pack to practise it there. */
  minTopicQuestions: 2,
  /** Review a topic once it has gone this long without practice (and is due). */
  reviewAfterDays: 3,
  /** At most this many open sessions are offered. */
  maxOpenSessions: 3,
};

/**
 * Weight per signal, per kind. Signals are 0-1 (see rank.ts features); a
 * candidate's score is base + the weighted sum. Negative weights are
 * penalties.
 */
export const WEIGHTS: Record<string, Record<string, number>> = {
  continue_session: { base: 0.4, progress: 0.2, urgency: 0.25, weakness: 0.1, repeated: -0.15 },
  practice_more: { base: 0.3, weakness: 0.35, mistakes: 0.2, decline: 0.1, urgency: 0.25, staleness: 0.05, repeated: -0.25 },
  revisit_material: { base: 0.22, weakness: 0.3, mistakes: 0.15, relevance: 0.2, urgency: 0.2, repeated: -0.25 },
  review_topic: { base: 0.18, staleness: 0.3, due: 0.15, weakness: 0.1, urgency: 0.25, repeated: -0.25 },
  start_pack: { base: 0.25, novelty: 0.1, freshness: 0.15, urgency: 0.3, repeated: -0.25 },
  new_material: { base: 0.5 },
};

export const RERANK = {
  limit: 6,
  maxPerTopic: 1,
  maxPerPack: 2,
  /** Subtracted per already-chosen recommendation sharing the pack or kind. */
  samePackPenalty: 0.12,
  sameKindPenalty: 0.08,
  /** Shown this many times in recent batches without being opened: penalised. */
  repeatedAfter: 3,
  /** Dismissed recommendations stay away this long. */
  dismissedDays: 3,
};

/** How long a computed batch is reused when nothing has changed. */
export const CACHE_HOURS = 6;

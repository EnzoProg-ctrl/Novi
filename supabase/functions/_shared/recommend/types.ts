/**
 * Shapes shared by the recommender's modules. Everything here is plain data
 * loaded from the student's own records (context.ts); nothing is invented.
 */

export type Kind =
  | "continue_session" // finish a practice session already started
  | "practice_more" // targeted practice on a weak topic
  | "revisit_material" // re-read the material that covers a weak topic
  | "review_topic" // spaced review of a topic that is due
  | "start_pack" // a pack with questions never tried
  | "new_material"; // nothing to study yet: add material

/** A topic the student has answered questions on, with its stored knowledge-tracing state. */
export type TopicState = {
  id: string;
  name: string;
  description: string | null;
  /** Stored BKT estimate (topic_mastery.mastery_score), 0-1. */
  mastery: number;
  /** Effective number of answers behind it (repeats count less). */
  evidence: number;
  attempts: number;
  correct: number;
  lastPracticedAt: Date | null;
  nextReviewAt: Date | null;
  lastIncorrectAt: Date | null;
  /** Whether topics.embedding has been made. */
  embedded: boolean;
};

/** One answer, newest first in Context.attempts. topicId is the question's topic. */
export type Attempt = {
  questionId: string;
  topicId: string | null;
  packId: string | null;
  correct: boolean;
  at: Date;
};

export type Pack = {
  id: string;
  title: string;
  materialId: string | null;
  createdAt: Date;
  totalQuestions: number;
  /** Questions answered right at least once (progress_pack_completion). */
  correctQuestions: number;
  /** Null when no question in the pack has ever been answered. */
  lastPracticedAt: Date | null;
  /** How many of the pack's questions belong to each topic. */
  topicQuestions: Record<string, number>;
};

export type OpenSession = {
  id: string;
  packId: string;
  focusTopicId: string | null;
  answered: number;
  /** The length the student chose; null means the whole pack. */
  target: number | null;
  startedAt: Date;
};

/** A planned study session from the Calendar (the only deadline data Novi has). */
export type Plan = {
  id: string;
  title: string;
  packId: string | null;
  startsAt: Date;
  type: string;
};

/** Recommendations from recent batches, for repetition and dismissal controls. */
export type PastRecommendation = {
  key: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

export type Context = {
  now: Date;
  topics: TopicState[];
  attempts: Attempt[];
  packs: Pack[];
  openSessions: OpenSession[];
  plans: Plan[];
  history: PastRecommendation[];
  /** Topic -> packs whose key concepts are tagged with it. */
  conceptLinks: Record<string, string[]>;
  materialCount: number;
};

/** A link between a topic and a pack that teaches it, and how it was found. */
export type Link = {
  topicId: string;
  packId: string;
  /** 0-1, comparable across sources. */
  relevance: number;
  source: "questions" | "concepts" | "semantic" | "text";
};

export type RetrievalMode = "semantic" | "fallback" | "none";

/** Finds packs whose material is about the given topics. */
export interface Retriever {
  related(topics: TopicState[], ctx: Context): Promise<Link[]>;
}

export type Action =
  | { type: "link"; path: string }
  | { type: "upload" };

/** Facts stored with a recommendation; undefined ones are simply absent. */
export type Facts = Record<string, string | number | boolean | null | undefined>;

export type Candidate = {
  key: string;
  kind: Kind;
  topicId: string | null;
  packId: string | null;
  sessionId: string | null;
  action: Action;
  /** Normalised 0-1 signals, named as in config.weights. */
  features: Record<string, number>;
  /** Stored facts behind the features, used for the explanation and kept as evidence. */
  facts: Facts;
};

export type Scored = Candidate & { score: number };

export type Recommendation = {
  key: string;
  kind: Kind;
  title: string;
  reason: string;
  topicId: string | null;
  packId: string | null;
  action: Action;
  score: number;
  /** 1-5 for the recommendations.priority column. */
  priority: number;
  rank: number;
  evidence: Facts;
};

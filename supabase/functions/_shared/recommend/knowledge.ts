/**
 * Component A, read side: what the student knows, from stored evidence.
 *
 * The estimate itself is Bayesian Knowledge Tracing, updated in the database
 * on every answer (private.kt_apply_attempt), so nothing here replays a
 * student's history. This module only reads it: it fades the estimate for
 * time since practice (the same forgetting the database applies at the next
 * answer), turns evidence into a confidence, and summarises recent mistakes.
 */

import { FORGETTING, KNOWLEDGE } from "./config.ts";
import type { Attempt, Context, TopicState } from "./types.ts";

const DAY = 86_400_000;
export const daysBetween = (a: Date, b: Date) => Math.max(0, (b.getTime() - a.getTime()) / DAY);
export const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));

/** The stored estimate, faded toward the prior for the time since it was last practised. */
export function currentMastery(topic: TopicState, now: Date): number {
  const { prior, halfLifeDays } = FORGETTING;
  if (!topic.lastPracticedAt || topic.mastery <= prior) return clamp01(topic.mastery);
  const days = daysBetween(topic.lastPracticedAt, now);
  return clamp01(prior + (topic.mastery - prior) * 0.5 ** (days / halfLifeDays));
}

/** How much to trust the estimate, 0-1: little evidence, little confidence. */
export const confidence = (evidence: number) => clamp01(evidence / (evidence + KNOWLEDGE.confidenceK));

export type TopicNeed = {
  topic: TopicState;
  mastery: number;
  confidence: number;
  /** Lack of mastery, discounted when the estimate rests on little evidence. */
  weakness: number;
  level: "weak" | "developing" | "strong";
  mastered: boolean;
  /** Mistakes weighted by recency (a mistake today counts 1, a week ago 0.5). */
  recentMistakes: number;
  /** Of the last KNOWLEDGE.recentWindow answers on the topic. */
  recentWrong: number;
  recentTotal: number;
  /** Overall accuracy minus recent accuracy, when recent is worse; else 0. */
  decline: number;
  daysSincePractice: number | null;
  due: boolean;
};

/** Every practised topic, with what the evidence says it needs. */
export function assessTopics(ctx: Context): TopicNeed[] {
  const byTopic = new Map<string, Attempt[]>();
  for (const a of ctx.attempts) {
    if (!a.topicId) continue; // no topic: nothing to say about any topic
    const list = byTopic.get(a.topicId) ?? [];
    list.push(a);
    byTopic.set(a.topicId, list);
  }

  return ctx.topics.map((topic) => {
    const mastery = currentMastery(topic, ctx.now);
    const conf = confidence(topic.evidence);
    // With little evidence the weakness shrinks toward neutral rather than
    // claiming the student is weak (or strong) on one answer.
    const weakness = clamp01(0.5 + (1 - mastery - 0.5) * (0.4 + 0.6 * conf));

    const attempts = byTopic.get(topic.id) ?? []; // newest first
    const recent = attempts.slice(0, KNOWLEDGE.recentWindow);
    const recentWrong = recent.filter((a) => !a.correct).length;
    const recentMistakes = attempts
      .filter((a) => !a.correct)
      .reduce((sum, a) => sum + 0.5 ** (daysBetween(a.at, ctx.now) / KNOWLEDGE.mistakeHalfLifeDays), 0);

    const overall = topic.attempts > 0 ? topic.correct / topic.attempts : null;
    const recentAccuracy = recent.length > 0 ? (recent.length - recentWrong) / recent.length : null;
    const decline = overall !== null && recentAccuracy !== null && topic.attempts > recent.length
      ? clamp01(overall - recentAccuracy)
      : 0;

    const mastered = mastery >= KNOWLEDGE.mastered && topic.evidence >= KNOWLEDGE.masteredMinEvidence;
    return {
      topic,
      mastery,
      confidence: conf,
      weakness,
      level: mastery < KNOWLEDGE.weak ? "weak" : mastery < KNOWLEDGE.developing ? "developing" : "strong",
      mastered,
      recentMistakes,
      recentWrong,
      recentTotal: recent.length,
      decline,
      daysSincePractice: topic.lastPracticedAt ? daysBetween(topic.lastPracticedAt, ctx.now) : null,
      due: topic.nextReviewAt !== null && topic.nextReviewAt <= ctx.now,
    };
  });
}

/**
 * Topics worth looking up material for: not mastered, and weak or recently
 * missed. Strongest need first, at most `limit`.
 */
export function focusTopics(needs: TopicNeed[], limit: number): TopicNeed[] {
  return needs
    .filter((n) => !n.mastered && (n.level !== "strong" || n.recentMistakes >= 1))
    .sort((a, b) => b.weakness + b.recentMistakes * 0.2 - (a.weakness + a.recentMistakes * 0.2) || a.topic.id.localeCompare(b.topic.id))
    .slice(0, limit);
}

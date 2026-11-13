/**
 * Candidate generation: every recommendation Novi could make right now, each
 * tied to real records (a session, a topic with answers, a pack with
 * questions). Nothing is suggested that doesn't exist.
 */

import { CANDIDATES } from "./config.ts";
import { clamp01, daysBetween, type TopicNeed } from "./knowledge.ts";
import type { Candidate, Context, Link, Pack, Plan } from "./types.ts";

export const keyOf = (kind: string, topicId: string | null, packId: string | null) =>
  `${kind}|${topicId ?? ""}|${packId ?? ""}`;

const practicePath = (packId: string, topicId: string | null) =>
  topicId ? `/pack/${packId}/practice?topic=${topicId}` : `/pack/${packId}/practice`;

/** The nearest upcoming planned session linked to this pack, if any. */
export function planFor(ctx: Context, packId: string | null): Plan | null {
  if (!packId) return null;
  return ctx.plans
    .filter((p) => p.packId === packId && p.startsAt >= ctx.now)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0] ?? null;
}

/** 1 when the plan is now, falling to 0 a week out. */
export function urgencyOf(plan: Plan | null, now: Date): number {
  if (!plan) return 0;
  return clamp01(1 - daysBetween(now, plan.startsAt) / 7);
}

const planFacts = (plan: Plan | null) =>
  plan ? { plan_title: plan.title, plan_at: plan.startsAt.toISOString() } : {};

/** The pack with the most questions on the topic (ties: most recent). */
function bestPracticePack(ctx: Context, topicId: string): Pack | null {
  return ctx.packs
    .filter((p) => (p.topicQuestions[topicId] ?? 0) >= CANDIDATES.minTopicQuestions)
    .sort((a, b) =>
      (b.topicQuestions[topicId] ?? 0) - (a.topicQuestions[topicId] ?? 0) ||
      b.createdAt.getTime() - a.createdAt.getTime()
    )[0] ?? null;
}

const topicFacts = (need: TopicNeed) => ({
  topic: need.topic.name,
  mastery: Number(need.mastery.toFixed(3)),
  evidence: need.topic.evidence,
  recent_wrong: need.recentWrong,
  recent_total: need.recentTotal,
  days_since_practice: need.daysSincePractice === null ? null : Math.round(need.daysSincePractice),
});

export function buildCandidates(ctx: Context, needs: TopicNeed[], links: Link[]): Candidate[] {
  const out: Candidate[] = [];
  const packById = new Map(ctx.packs.map((p) => [p.id, p]));
  const needById = new Map(needs.map((n) => [n.topic.id, n]));

  // ── Unfinished sessions ─────────────────────────────────────────
  for (const s of ctx.openSessions.slice(0, CANDIDATES.maxOpenSessions)) {
    const pack = packById.get(s.packId);
    if (!pack || pack.totalQuestions === 0) continue;
    const total = s.target ?? pack.totalQuestions;
    if (s.answered >= total) continue; // finished in all but name
    const focus = s.focusTopicId ? needById.get(s.focusTopicId) : undefined;
    const plan = planFor(ctx, pack.id);
    out.push({
      key: keyOf("continue_session", s.focusTopicId, pack.id),
      kind: "continue_session",
      topicId: s.focusTopicId,
      packId: pack.id,
      sessionId: s.id,
      action: { type: "link", path: practicePath(pack.id, s.focusTopicId) },
      features: {
        progress: clamp01(s.answered / Math.max(1, total)),
        urgency: urgencyOf(plan, ctx.now),
        weakness: focus?.weakness ?? 0,
      },
      facts: { pack: pack.title, answered: s.answered, total, ...(focus ? { topic: focus.topic.name } : {}), ...planFacts(plan) },
    });
  }

  // ── Topics that need work ───────────────────────────────────────
  for (const need of needs) {
    if (need.mastered) continue;
    const struggling = need.level !== "strong" || need.recentMistakes >= 1 || need.decline > 0.2;
    if (!struggling) continue;

    const pack = bestPracticePack(ctx, need.topic.id);
    if (pack) {
      const plan = planFor(ctx, pack.id);
      out.push({
        key: keyOf("practice_more", need.topic.id, pack.id),
        kind: "practice_more",
        topicId: need.topic.id,
        packId: pack.id,
        sessionId: null,
        action: { type: "link", path: practicePath(pack.id, need.topic.id) },
        features: {
          weakness: need.weakness,
          mistakes: clamp01(need.recentMistakes / 2),
          decline: need.decline,
          urgency: urgencyOf(plan, ctx.now),
          staleness: clamp01((need.daysSincePractice ?? 0) / 14),
        },
        facts: { ...topicFacts(need), pack: pack.title, topic_questions: pack.topicQuestions[need.topic.id] ?? 0, ...planFacts(plan) },
      });
    }

    // Material that covers the topic, for revision before more practice.
    // Only for clearly weak topics: a developing one is better served by practice.
    if (need.level === "weak" || need.recentWrong >= 2) {
      const material = links
        .filter((l) => l.topicId === need.topic.id && packById.has(l.packId))
        .sort((a, b) => b.relevance - a.relevance || a.packId.localeCompare(b.packId))[0];
      if (material) {
        const target = packById.get(material.packId)!;
        const plan = planFor(ctx, target.id);
        out.push({
          key: keyOf("revisit_material", need.topic.id, target.id),
          kind: "revisit_material",
          topicId: need.topic.id,
          packId: target.id,
          sessionId: null,
          action: { type: "link", path: `/pack/${target.id}` },
          features: {
            weakness: need.weakness,
            mistakes: clamp01(need.recentMistakes / 2),
            relevance: material.relevance,
            urgency: urgencyOf(plan, ctx.now),
          },
          facts: { ...topicFacts(need), pack: target.title, link: material.source, relevance: Number(material.relevance.toFixed(3)), ...planFacts(plan) },
        });
      }
    }
  }

  // ── Spaced review of topics that are holding up but due ─────────
  for (const need of needs) {
    if (!need.due || need.recentMistakes >= 1) continue; // mistakes are handled above
    if ((need.daysSincePractice ?? 0) < CANDIDATES.reviewAfterDays) continue;
    if (need.level === "weak") continue; // weak topics get practice, not review
    const pack = bestPracticePack(ctx, need.topic.id);
    if (!pack) continue;
    const plan = planFor(ctx, pack.id);
    out.push({
      key: keyOf("review_topic", need.topic.id, pack.id),
      kind: "review_topic",
      topicId: need.topic.id,
      packId: pack.id,
      sessionId: null,
      action: { type: "link", path: practicePath(pack.id, need.topic.id) },
      features: {
        staleness: clamp01((need.daysSincePractice ?? 0) / 21),
        due: 1,
        weakness: need.weakness,
        urgency: urgencyOf(plan, ctx.now),
      },
      facts: { ...topicFacts(need), pack: pack.title, ...planFacts(plan) },
    });
  }

  // ── Packs never started ─────────────────────────────────────────
  const inSession = new Set(ctx.openSessions.map((s) => s.packId));
  for (const pack of ctx.packs) {
    if (pack.totalQuestions === 0 || pack.lastPracticedAt || inSession.has(pack.id)) continue;
    const plan = planFor(ctx, pack.id);
    out.push({
      key: keyOf("start_pack", null, pack.id),
      kind: "start_pack",
      topicId: null,
      packId: pack.id,
      sessionId: null,
      action: { type: "link", path: practicePath(pack.id, null) },
      features: {
        novelty: 1,
        // New uploads first: 1 today, 0 after two weeks.
        freshness: clamp01(1 - daysBetween(pack.createdAt, ctx.now) / 14),
        urgency: urgencyOf(plan, ctx.now),
      },
      facts: { pack: pack.title, questions: pack.totalQuestions, created_at: pack.createdAt.toISOString(), ...planFacts(plan) },
    });
  }

  // ── Nothing to study yet ────────────────────────────────────────
  if (ctx.packs.length === 0 && ctx.materialCount === 0) {
    out.push({
      key: keyOf("new_material", null, null),
      kind: "new_material",
      topicId: null,
      packId: null,
      sessionId: null,
      action: { type: "upload" },
      features: {},
      facts: {},
    });
  }

  return out;
}

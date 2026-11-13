/**
 * Component C: score the candidates, then pick a varied, non-repetitive list.
 *
 * Scoring is a transparent weighted sum of normalised signals (config.WEIGHTS),
 * not a trained model: there is no labelled data to train one yet. The
 * recommendation_events table collects what a learned ranker would need.
 */

import { RERANK, WEIGHTS } from "./config.ts";
import { daysBetween } from "./knowledge.ts";
import type { Candidate, Context, Recommendation, Scored } from "./types.ts";

/** base + Σ weight × signal, per config.WEIGHTS for the candidate's kind. */
export function scoreCandidate(c: Candidate): number {
  const weights = WEIGHTS[c.kind] ?? {};
  let score = weights.base ?? 0;
  for (const [name, value] of Object.entries(c.features)) score += (weights[name] ?? 0) * value;
  return score;
}

/**
 * Applies the student's recommendation history: recommendations dismissed
 * recently are dropped, and ones shown again and again without being opened
 * get the `repeated` penalty.
 */
export function applyHistory(candidates: Candidate[], ctx: Context): Candidate[] {
  const dismissed = new Set(
    ctx.history
      .filter((h) => h.status === "dismissed" && daysBetween(h.updatedAt, ctx.now) < RERANK.dismissedDays)
      .map((h) => h.key),
  );
  const ignoredCount = new Map<string, number>();
  for (const h of ctx.history) {
    if (h.status === "pending" || h.status === "expired") {
      ignoredCount.set(h.key, (ignoredCount.get(h.key) ?? 0) + 1);
    }
  }
  return candidates
    .filter((c) => !dismissed.has(c.key))
    .map((c) => {
      const shown = ignoredCount.get(c.key) ?? 0;
      return shown >= RERANK.repeatedAfter ? { ...c, features: { ...c.features, repeated: 1 } } : c;
    });
}

/** One candidate per key (the best-scoring), then scored, best first; ties by key. */
export function scoreAll(candidates: Candidate[]): Scored[] {
  const best = new Map<string, Scored>();
  for (const c of candidates) {
    const scored = { ...c, score: scoreCandidate(c) };
    const current = best.get(c.key);
    if (!current || scored.score > current.score) best.set(c.key, scored);
  }
  return [...best.values()].sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
}

/**
 * Greedy diversity re-rank: at most RERANK.maxPerTopic per topic and
 * maxPerPack per pack, and each pick makes later ones sharing its pack or
 * kind a little less attractive, so one topic or one kind of activity can't
 * fill the list.
 */
export function rerank(scored: Scored[], limit = RERANK.limit): Scored[] {
  const chosen: Scored[] = [];
  const pool = [...scored];
  while (chosen.length < limit && pool.length > 0) {
    let bestIndex = -1;
    let bestValue = -Infinity;
    pool.forEach((c, i) => {
      if (c.topicId && chosen.filter((x) => x.topicId === c.topicId).length >= RERANK.maxPerTopic) return;
      if (c.packId && chosen.filter((x) => x.packId === c.packId).length >= RERANK.maxPerPack) return;
      const value = c.score -
        RERANK.samePackPenalty * chosen.filter((x) => c.packId && x.packId === c.packId).length -
        RERANK.sameKindPenalty * chosen.filter((x) => x.kind === c.kind).length;
      if (value > bestValue || (value === bestValue && bestIndex >= 0 && c.key < pool[bestIndex].key)) {
        bestValue = value;
        bestIndex = i;
      }
    });
    if (bestIndex < 0) break;
    chosen.push(pool.splice(bestIndex, 1)[0]);
  }
  return chosen;
}

// ── Explanations ────────────────────────────────────────────────────

const quote = (s: unknown) => `“${String(s)}”`;

/** The calendar date of `d` in the student's time zone, as YYYY-MM-DD. */
export const localDay = (d: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** "today", "tomorrow", "on Thursday", "in 9 days", in the student's time zone. */
export function whenFrom(iso: string, now: Date, timeZone = "UTC"): string {
  const at = new Date(iso);
  const days = Math.round((Date.parse(localDay(at, timeZone)) - Date.parse(localDay(now, timeZone))) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 7) return `on ${at.toLocaleDateString("en-US", { weekday: "long", timeZone })}`;
  return `in ${days} days`;
}

const planSentence = (facts: Scored["facts"], now: Date, timeZone: string) =>
  facts.plan_title && facts.plan_at
    ? ` You planned ${quote(facts.plan_title)} for ${whenFrom(String(facts.plan_at), now, timeZone)}.`
    : "";

/**
 * Title and reason, built only from the facts stored on the candidate:
 * every claim ("you missed 3 of your last 4") is a count from the student's
 * own answers. No scores or probabilities are shown.
 */
export function explain(c: Scored, now: Date, timeZone = "UTC"): { title: string; reason: string } {
  const f = c.facts;
  const plan = planSentence(f, now, timeZone);
  switch (c.kind) {
    case "continue_session": {
      const what = f.topic ? `${f.topic} in ${quote(f.pack)}` : quote(f.pack);
      return {
        title: `Continue ${what}`,
        reason: `Pick up where you left off: ${f.answered} of ${f.total} questions done.${plan}`,
      };
    }
    case "practice_more": {
      const wrong = Number(f.recent_wrong ?? 0);
      const total = Number(f.recent_total ?? 0);
      let reason: string;
      if (wrong >= 2) reason = `You missed ${wrong} of your last ${total} questions on ${f.topic}.`;
      else if (wrong === 1) reason = `You missed a question on ${f.topic} recently.`;
      else reason = `${f.topic} isn't solid yet. A few more questions will help it stick.`;
      return { title: `Practice ${f.topic}`, reason: `${reason}${plan}` };
    }
    case "revisit_material": {
      const missed = Number(f.recent_wrong ?? 0) >= 2
        ? `You've been missing questions on ${f.topic}. `
        : "";
      return {
        title: `Review ${f.topic}`,
        reason: `${missed}${quote(f.pack)} covers it. Read it again before practising.${plan}`,
      };
    }
    case "review_topic":
      return {
        title: `Refresh ${f.topic}`,
        reason: `You haven't practised ${f.topic} in ${f.days_since_practice} days. A quick review keeps it fresh.${plan}`,
      };
    case "start_pack":
      return {
        title: `Start ${quote(f.pack)}`,
        reason: plan
          ? `You haven't tried its ${f.questions} questions yet.${plan}`
          : `You haven't tried any of its ${f.questions} questions yet.`,
      };
    case "new_material":
      return {
        title: "Add something to study",
        reason: "Upload notes, slides or a PDF and Novi will build practice questions from it.",
      };
  }
}

/** Score to the 1-5 recommendations.priority column. */
export const priorityOf = (score: number) => Math.min(5, Math.max(1, Math.round(score * 5)));

export function finalise(chosen: Scored[], now: Date, timeZone = "UTC"): Recommendation[] {
  return chosen.map((c, i) => {
    const { title, reason } = explain(c, now, timeZone);
    return {
      key: c.key,
      kind: c.kind,
      title,
      reason,
      topicId: c.topicId,
      packId: c.packId,
      action: c.action,
      score: Number(c.score.toFixed(4)),
      priority: priorityOf(c.score),
      rank: i + 1,
      evidence: { ...c.facts, ...Object.fromEntries(Object.entries(c.features).map(([k, v]) => [`f_${k}`, Number(v.toFixed(3))])) },
    };
  });
}

/**
 * The recommendation pipeline, end to end, over data already loaded:
 *
 *   1. knowledge  what each practised topic needs (knowledge.ts)
 *   2. retrieval  which packs teach the topics that need work (retrieval.ts)
 *   3. candidates everything actionable, from real records (candidates.ts)
 *   4. ranking    score, apply history, diversify, explain (rank.ts)
 *
 * Pure apart from the retriever, so it is tested without a database
 * (recommend_test.ts) and the Edge Function only adds loading and saving.
 */

import { assessTopics, focusTopics } from "./knowledge.ts";
import { bestLinks, findLinks } from "./retrieval.ts";
import { buildCandidates } from "./candidates.ts";
import { applyHistory, finalise, rerank, scoreAll } from "./rank.ts";
import { RERANK, RETRIEVAL } from "./config.ts";
import type { Context, Recommendation, RetrievalMode, Retriever } from "./types.ts";

export type PipelineResult = {
  recommendations: Recommendation[];
  retrieval: RetrievalMode;
  /** Counts for logs and diagnostics; no student content. */
  stats: { topics: number; focusTopics: number; candidates: number; links: number };
};

export async function runPipeline(
  ctx: Context,
  {
    retriever = null,
    limit = RERANK.limit,
    timeZone = "UTC",
    log = () => {},
  }: {
    retriever?: Retriever | null;
    limit?: number;
    timeZone?: string;
    log?: (event: Record<string, unknown>) => void;
  } = {},
): Promise<PipelineResult> {
  const needs = assessTopics(ctx);
  const focus = focusTopics(needs, RETRIEVAL.maxTopics);
  const { links, mode } = await findLinks(ctx, focus.map((n) => n.topic), retriever, log);
  const candidates = applyHistory(buildCandidates(ctx, needs, bestLinks(links)), ctx);
  const chosen = rerank(scoreAll(candidates), limit);
  return {
    recommendations: finalise(chosen, ctx.now, timeZone),
    retrieval: mode,
    stats: { topics: needs.length, focusTopics: focus.length, candidates: candidates.length, links: links.length },
  };
}

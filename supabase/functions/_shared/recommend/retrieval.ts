/**
 * Component B: which of the student's packs teach a topic they need.
 *
 * Three sources, strongest evidence first:
 *   questions  the pack has questions tagged with the topic (always available)
 *   concepts   the pack's key concepts are tagged with the topic (always available)
 *   semantic   the pack's material passages are close to the topic's embedding
 *              (needs embeddings; finds material in packs the topic's
 *              questions don't come from)
 * When semantic retrieval is unavailable, word overlap between the topic and
 * pack titles stands in for it.
 */

import { RETRIEVAL } from "./config.ts";
import { clamp01 } from "./knowledge.ts";
import type { Context, Link, RetrievalMode, Retriever, TopicState } from "./types.ts";

/** Links found from tags alone: no AI needed. */
export function structuralLinks(ctx: Context, topicIds: Set<string>): Link[] {
  const links: Link[] = [];
  for (const pack of ctx.packs) {
    for (const [topicId, count] of Object.entries(pack.topicQuestions)) {
      if (topicIds.has(topicId) && count > 0) {
        links.push({ topicId, packId: pack.id, relevance: RETRIEVAL.questionLink, source: "questions" });
      }
    }
  }
  const known = new Set(ctx.packs.map((p) => p.id));
  for (const topicId of topicIds) {
    for (const packId of ctx.conceptLinks[topicId] ?? []) {
      if (known.has(packId)) links.push({ topicId, packId, relevance: RETRIEVAL.conceptLink, source: "concepts" });
    }
  }
  return links;
}

const STOP = new Set(["the", "and", "of", "in", "to", "a", "an", "for", "on", "with", "its", "their", "basics", "introduction", "intro"]);
const words = (text: string) =>
  new Set(
    text.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
      .map((w) => w.replace(/(ies|es|s)$/, "")),
  );

/** Fallback when embeddings are unavailable: shared words between topic and pack title. */
export function textLinks(ctx: Context, topics: TopicState[]): Link[] {
  const links: Link[] = [];
  for (const topic of topics) {
    const t = words(`${topic.name} ${topic.description ?? ""}`);
    if (t.size === 0) continue;
    for (const pack of ctx.packs) {
      const p = words(pack.title);
      const shared = [...t].filter((w) => p.has(w)).length;
      if (shared === 0) continue;
      // Overlap relative to the topic's words, scaled down: titles are short
      // and word overlap is weaker evidence than tags or embeddings.
      const relevance = clamp01((shared / t.size) * 0.6);
      if (relevance >= 0.2) links.push({ topicId: topic.id, packId: pack.id, relevance, source: "text" });
    }
  }
  return links;
}

/** Cosine similarity mapped to 0-1 relevance (RETRIEVAL.similarityFloor..Ceiling). */
export const similarityToRelevance = (similarity: number) =>
  Number(clamp01((similarity - RETRIEVAL.similarityFloor) / (RETRIEVAL.similarityCeiling - RETRIEVAL.similarityFloor)).toFixed(3));

/**
 * All links for `topics`: tags, plus semantic matches when the retriever
 * works, or word overlap when it doesn't (or there is none).
 */
export async function findLinks(
  ctx: Context,
  topics: TopicState[],
  retriever: Retriever | null,
  log: (event: Record<string, unknown>) => void = () => {},
): Promise<{ links: Link[]; mode: RetrievalMode }> {
  if (topics.length === 0) return { links: [], mode: "none" };
  const links = structuralLinks(ctx, new Set(topics.map((t) => t.id)));
  if (retriever) {
    try {
      links.push(...await retriever.related(topics, ctx));
      return { links, mode: "semantic" };
    } catch (err) {
      log({ retrieval_fallback: err instanceof Error ? err.message.slice(0, 200) : String(err) });
    }
  }
  links.push(...textLinks(ctx, topics));
  return { links, mode: "fallback" };
}

/** The strongest link per topic and pack. */
export function bestLinks(links: Link[]): Link[] {
  const best = new Map<string, Link>();
  for (const link of links) {
    const key = `${link.topicId}|${link.packId}`;
    const current = best.get(key);
    if (!current || link.relevance > current.relevance) best.set(key, link);
  }
  return [...best.values()];
}

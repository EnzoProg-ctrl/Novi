/**
 * Recommender tests: deterministic, synthetic fixtures, no network.
 *
 *   npx --yes deno@2.5.4 test supabase/functions/_shared/recommend
 *
 * Data isolation (one student can't read or write another's mastery,
 * recommendations or events) is enforced by RLS and tested in
 * supabase/tests/recommendation_db_test.sql.
 */

import { assert, assertEquals, assertExists, assertMatch, assertNotMatch, assertRejects } from "jsr:@std/assert@1";
import { runPipeline } from "./pipeline.ts";
import { assessTopics, confidence, currentMastery } from "./knowledge.ts";
import { rerank, scoreAll, whenFrom } from "./rank.ts";
import { bestLinks, findLinks, textLinks } from "./retrieval.ts";
import { buildCandidates } from "./candidates.ts";
import { loadContext, semanticRetriever } from "./context.ts";
import type { Candidate, Context, Link, Pack, Retriever, TopicState } from "./types.ts";

// ── Fixture builders ──────────────────────────────────────────────────

const NOW = new Date("2026-10-28T09:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const inDays = (d: number) => new Date(NOW.getTime() + d * 86_400_000);

function topic(id: string, name: string, over: Partial<TopicState> = {}): TopicState {
  return {
    id, name, description: null, mastery: 0.3, evidence: 0, attempts: 0, correct: 0,
    lastPracticedAt: daysAgo(1), nextReviewAt: null, lastIncorrectAt: null, embedded: false, ...over,
  };
}

function pack(id: string, title: string, over: Partial<Pack> = {}): Pack {
  return {
    id, title, materialId: `mat-${id}`, createdAt: daysAgo(10), totalQuestions: 10, correctQuestions: 0,
    lastPracticedAt: daysAgo(1), topicQuestions: {}, ...over,
  };
}

function ctx(over: Partial<Context> = {}): Context {
  return {
    now: NOW, topics: [], attempts: [], packs: [], openSessions: [], plans: [], history: [],
    conceptLinks: {}, materialCount: 0, ...over,
  };
}

/** `wrong` misses then `right` correct answers on a topic, newest first, one a day. */
function answers(topicId: string, packId: string, wrong: number, right: number) {
  const list = [];
  for (let i = 0; i < wrong + right; i++) {
    list.push({ questionId: `${topicId}-q${i}`, topicId, packId, correct: i >= wrong, at: daysAgo(i * 0.5) });
  }
  return list;
}

/** A biology student: weak on cell division, strong on genetics. */
function biology(over: Partial<Context> = {}): Context {
  return ctx({
    topics: [
      topic("cell", "Cell division", { mastery: 0.14, evidence: 3, attempts: 3, correct: 0, lastIncorrectAt: daysAgo(0) }),
      topic("gen", "Genetics", { mastery: 0.97, evidence: 5, attempts: 5, correct: 5, nextReviewAt: inDays(10) }),
    ],
    attempts: [...answers("cell", "bio", 3, 0), ...answers("gen", "bio", 0, 5)],
    packs: [pack("bio", "Biology 101", { topicQuestions: { cell: 6, gen: 6 }, correctQuestions: 5 })],
    materialCount: 1,
    ...over,
  });
}

// ── Knowledge ─────────────────────────────────────────────────────────

Deno.test("forgetting fades an estimate toward the prior, never below it", () => {
  const t = topic("t", "T", { mastery: 0.9, lastPracticedAt: daysAgo(30) });
  assertEquals(Number(currentMastery(t, NOW).toFixed(3)), 0.6); // halfway back to 0.3 after one half-life
  const weak = topic("w", "W", { mastery: 0.1, lastPracticedAt: daysAgo(90) });
  assertEquals(currentMastery(weak, NOW), 0.1);
});

Deno.test("little evidence means little confidence, and weakness stays near neutral", () => {
  assert(confidence(0) === 0 && confidence(3) === 0.5 && confidence(30) > 0.9);
  const [one, many] = assessTopics(ctx({
    topics: [
      topic("one", "One miss", { mastery: 0.17, evidence: 1, attempts: 1 }),
      topic("many", "Many misses", { mastery: 0.17, evidence: 6, attempts: 6 }),
    ],
  }));
  assert(many.weakness > one.weakness, "more evidence of weakness should weigh more");
  assert(one.weakness < 0.75, "one wrong answer shouldn't read as certain weakness");
});

Deno.test("a recent slump shows as decline", () => {
  const [need] = assessTopics(ctx({
    topics: [topic("t", "T", { mastery: 0.6, evidence: 10, attempts: 10, correct: 7 })],
    attempts: answers("t", "p", 4, 6), // last 5: 4 wrong, 1 right
  }));
  assert(need.decline > 0.4);
  assertEquals(need.recentWrong, 4);
});

// ── 1. New students ───────────────────────────────────────────────────

Deno.test("1. a new student with nothing yet is pointed at adding material", async () => {
  const { recommendations } = await runPipeline(ctx());
  assertEquals(recommendations.map((r) => r.kind), ["new_material"]);
  assertEquals(recommendations[0].action, { type: "upload" });
});

Deno.test("1b. a new student with packs but no answers gets their packs, newest first", async () => {
  const { recommendations } = await runPipeline(ctx({
    packs: [
      pack("old", "Old notes", { lastPracticedAt: null, createdAt: daysAgo(12) }),
      pack("new", "New slides", { lastPracticedAt: null, createdAt: daysAgo(0) }),
    ],
    materialCount: 2,
  }));
  assertEquals(recommendations.map((r) => r.packId), ["new", "old"]);
  assert(recommendations.every((r) => r.kind === "start_pack"));
  assertMatch(recommendations[0].reason, /haven't tried any of its 10 questions/);
});

// ── 2 & 3. Weak and strong topics ─────────────────────────────────────

Deno.test("2/3. repeated mistakes outrank a mastered topic, which gets no practice at all", async () => {
  const { recommendations } = await runPipeline(biology());
  assertEquals(recommendations[0].kind, "practice_more");
  assertEquals(recommendations[0].topicId, "cell");
  assertEquals(recommendations[0].action, { type: "link", path: "/pack/bio/practice?topic=cell" });
  assertMatch(recommendations[0].reason, /missed 3 of your last 3 questions on Cell division/);
  assert(!recommendations.some((r) => r.topicId === "gen"), "mastered genetics shouldn't be recommended");
});

Deno.test("2b. a strong topic that has slipped recently comes back", async () => {
  const c = biology();
  c.topics[1] = { ...c.topics[1], mastery: 0.8, evidence: 8, attempts: 9, correct: 7 };
  c.attempts = [...answers("cell", "bio", 3, 0), ...answers("gen", "bio", 2, 7)];
  const { recommendations } = await runPipeline(c);
  // Practice or a review of the material, depending on what else is on the list.
  assert(recommendations.some((r) => r.topicId === "gen" && ["practice_more", "revisit_material"].includes(r.kind)));
});

// ── 4. Deadlines ──────────────────────────────────────────────────────

function twoPacks(plans: Context["plans"] = []): Context {
  return ctx({
    topics: [
      topic("a", "Acids", { mastery: 0.35, evidence: 3, attempts: 3, correct: 1 }),
      topic("b", "Bonds", { mastery: 0.35, evidence: 3, attempts: 3, correct: 1 }),
    ],
    attempts: [...answers("a", "chem1", 2, 1), ...answers("b", "chem2", 2, 1)],
    packs: [pack("chem1", "Chemistry 1", { topicQuestions: { a: 5 } }), pack("chem2", "Chemistry 2", { topicQuestions: { b: 5 } })],
    materialCount: 2,
    plans,
  });
}

Deno.test("4. an upcoming planned session lifts its pack, and says so", async () => {
  const before = await runPipeline(twoPacks());
  const after = await runPipeline(twoPacks([{ id: "p", title: "Chemistry exam", packId: "chem2", startsAt: inDays(1), type: "revision" }]));
  assertEquals(before.recommendations[0].topicId, "a"); // tie broken by key without a plan
  assertEquals(after.recommendations[0].topicId, "b");
  assertMatch(after.recommendations[0].reason, /You planned “Chemistry exam” for tomorrow\./);
});

Deno.test("4b. without plan data, deadlines change nothing", async () => {
  const a = await runPipeline(twoPacks());
  const b = await runPipeline(twoPacks([{ id: "p", title: "Unrelated", packId: null, startsAt: inDays(1), type: "focus" }]));
  assertEquals(a.recommendations.map((r) => [r.key, r.score]), b.recommendations.map((r) => [r.key, r.score]));
});

Deno.test("4c. plan dates use the student's time zone", () => {
  // 09:00 UTC on the 28th is 17:00 in Manila; 20:00 UTC is 04:00 on the 29th there.
  assertEquals(whenFrom("2026-10-28T20:00:00Z", NOW, "UTC"), "today");
  assertEquals(whenFrom("2026-10-28T20:00:00Z", NOW, "Asia/Manila"), "tomorrow");
});

// ── 5. Completed, in-progress and unstarted packs ────────────────────

Deno.test("5. in progress is continued, unstarted is offered, completed and mastered is left alone", async () => {
  const { recommendations } = await runPipeline(ctx({
    topics: [topic("done", "Done topic", { mastery: 0.95, evidence: 6, attempts: 6, correct: 6, nextReviewAt: inDays(5) })],
    attempts: answers("done", "finished", 0, 6),
    packs: [
      pack("finished", "Finished pack", { correctQuestions: 10, topicQuestions: { done: 10 } }),
      pack("half", "Half-done pack"),
      pack("fresh", "Fresh pack", { lastPracticedAt: null }),
    ],
    openSessions: [{ id: "s1", packId: "half", focusTopicId: null, answered: 4, target: 10, startedAt: daysAgo(1) }],
    materialCount: 3,
  }));
  const kinds = Object.fromEntries(recommendations.map((r) => [r.packId, r.kind]));
  assertEquals(kinds, { half: "continue_session", fresh: "start_pack" });
  assertEquals(recommendations[0].kind, "continue_session");
  assertMatch(recommendations[0].reason, /4 of 10 questions done/);
});

Deno.test("5b. a topic due for review comes back once it has gone stale", async () => {
  const { recommendations } = await runPipeline(ctx({
    topics: [topic("t", "Photosynthesis", { mastery: 0.8, evidence: 4, attempts: 4, correct: 4, lastPracticedAt: daysAgo(9), nextReviewAt: daysAgo(2) })],
    packs: [pack("p", "Plants", { topicQuestions: { t: 4 } })],
    materialCount: 1,
  }));
  assertEquals(recommendations[0].kind, "review_topic");
  assertMatch(recommendations[0].reason, /haven't practised Photosynthesis in 9 days/);
});

// ── 6. Retrieval with and without embeddings ─────────────────────────

const failing: Retriever = { related: () => Promise.reject(new Error("embedding service unavailable")) };

Deno.test("6. embeddings unavailable: falls back and still recommends", async () => {
  const logs: Record<string, unknown>[] = [];
  const result = await runPipeline(biology(), { retriever: failing, log: (e) => logs.push(e) });
  assertEquals(result.retrieval, "fallback");
  assert(result.recommendations.length > 0);
  assertMatch(String(logs[0]?.retrieval_fallback), /unavailable/);
  assertEquals((await runPipeline(biology(), { retriever: null })).retrieval, "fallback");
});

Deno.test("6b. semantic retrieval can point revision at material in another pack", async () => {
  const c = biology({ packs: [...biology().packs, pack("notes", "Mitosis lecture notes")] });
  const semantic: Retriever = {
    related: () => Promise.resolve<Link[]>([{ topicId: "cell", packId: "notes", relevance: 0.9, source: "semantic" }]),
  };
  assertEquals((await runPipeline(c, { retriever: semantic })).retrieval, "semantic");
  const { links } = await findLinks(c, [c.topics[0]], semantic);
  const revisit = buildCandidates(c, assessTopics(c), bestLinks(links)).find((x) => x.kind === "revisit_material");
  assertEquals(revisit?.packId, "notes");
  assertEquals(revisit?.facts.link, "semantic");
  // Practice and revision for one topic compete for one slot: the stronger stays.
  const { recommendations } = await runPipeline(c, { retriever: semantic, limit: 10 });
  assertEquals(recommendations.filter((r) => r.topicId === "cell").length, 1);
});

Deno.test("6c. word-overlap fallback links topics to matching pack titles only", () => {
  const links = textLinks(ctx({ packs: [pack("m", "Mitosis and Meiosis"), pack("x", "World History")] }), [topic("t", "Meiosis")]);
  assertEquals(links.map((l) => l.packId), ["m"]);
});

// ── 7. Messy metadata ─────────────────────────────────────────────────

Deno.test("7. answers without topics and topics without questions don't break anything", async () => {
  const { recommendations } = await runPipeline(ctx({
    topics: [topic("orphan", "Orphan topic", { mastery: 0.1, evidence: 4, attempts: 4 })],
    attempts: [{ questionId: "q", topicId: null, packId: "p", correct: false, at: daysAgo(0) }],
    packs: [pack("p", "Untagged pack")],
    materialCount: 1,
  }));
  // No pack has questions on the orphan topic, so no practice for it, and
  // nothing is invented; the pack itself has been practised, so nothing to start.
  assertEquals(recommendations, []);
});

Deno.test("7b. a concept tag is enough to find material for a weak topic", async () => {
  // The questions that were missed no longer carry the topic tag, so only the
  // concept tag connects the topic to any material.
  const { recommendations } = await runPipeline(ctx({
    topics: [topic("t", "Enzymes", { mastery: 0.12, evidence: 3, attempts: 3 })],
    attempts: answers("t", "quiz", 3, 0),
    packs: [pack("quiz", "Enzyme quiz"), pack("notes", "Enzyme notes")],
    conceptLinks: { t: ["notes"] },
    materialCount: 2,
  }));
  assertEquals(recommendations[0].kind, "revisit_material");
  assertEquals(recommendations[0].packId, "notes");
});

// ── 8. Nothing worth recommending ────────────────────────────────────

Deno.test("8. no candidates gives an empty list, not filler", async () => {
  const { recommendations } = await runPipeline(ctx({
    topics: [topic("t", "Known", { mastery: 0.96, evidence: 6, attempts: 6, correct: 6, nextReviewAt: inDays(7) })],
    packs: [pack("p", "Done", { topicQuestions: { t: 6 }, correctQuestions: 10 })],
    materialCount: 1,
  }));
  assertEquals(recommendations, []);
});

// ── 9. Duplicates, ties, diversity, history ──────────────────────────

const cand = (key: string, kind: Candidate["kind"], topicId: string | null, packId: string | null, base = 0): Candidate => ({
  key, kind, topicId, packId, sessionId: null, action: { type: "link", path: "/" }, features: { weakness: base }, facts: {},
});

Deno.test("9. duplicates collapse, ties break the same way every time", () => {
  const scored = scoreAll([
    cand("k2", "practice_more", "t2", "p2", 0.5),
    cand("k1", "practice_more", "t1", "p1", 0.5),
    cand("k1", "practice_more", "t1", "p1", 0.2),
  ]);
  assertEquals(scored.map((s) => s.key), ["k1", "k2"]);
  assertEquals(scored[0].score, scored[1].score);
});

Deno.test("9b. one topic can't fill the list, and kinds and packs are spread", () => {
  const picked = rerank(scoreAll([
    cand("a1", "practice_more", "t1", "p1", 1),
    cand("a2", "revisit_material", "t1", "p2", 1),
    cand("b1", "practice_more", "t2", "p1", 0.9),
    cand("c1", "practice_more", "t3", "p1", 0.9),
    cand("d1", "start_pack", null, "p3", 0),
  ]), 4);
  const topics = picked.map((p) => p.topicId).filter(Boolean);
  assertEquals(new Set(topics).size, topics.length);
  assert(picked.filter((p) => p.packId === "p1").length <= 2);
});

Deno.test("9c. dismissed recommendations stay away; ignored ones sink", async () => {
  const base = biology();
  const key = "practice_more|cell|bio";
  const dismissed = await runPipeline({ ...base, history: [{ key, status: "dismissed", createdAt: daysAgo(1), updatedAt: daysAgo(1) }] });
  assert(!dismissed.recommendations.some((r) => r.key === key));
  const ignored = await runPipeline({
    ...base,
    history: [1, 2, 3].map((d) => ({ key, status: "expired", createdAt: daysAgo(d), updatedAt: daysAgo(d) })),
  });
  const plain = await runPipeline(base);
  const score = (r: Awaited<ReturnType<typeof runPipeline>>) => r.recommendations.find((x) => x.key === key)?.score ?? 0;
  assert(score(ignored) < score(plain));
});

// ── Explanations ──────────────────────────────────────────────────────

Deno.test("explanations state counts from the record and never expose scores", async () => {
  const { recommendations } = await runPipeline(biology());
  for (const r of recommendations) {
    assertNotMatch(r.reason, /0\.\d|%|probab|mastery|confiden/i);
    assert(r.priority >= 1 && r.priority <= 5);
    assertExists(r.evidence.f_weakness ?? r.evidence.f_novelty ?? r.evidence.f_progress);
  }
});

// ── 11. Database and provider failures ───────────────────────────────

type Res = { data: unknown; error: unknown; count?: number };
function fakeDb(responses: Record<string, Res>, calls: string[] = []) {
  const chain = (name: string): unknown => {
    const proxy: unknown = new Proxy(() => {}, {
      get(_t, prop) {
        if (prop === "then") {
          const res = responses[name] ?? { data: [], error: null, count: 0 };
          return (ok: (v: Res) => unknown, fail: (e: unknown) => unknown) => Promise.resolve(res).then(ok, fail);
        }
        return (...args: unknown[]) => {
          calls.push(`${name}.${String(prop)}(${JSON.stringify(args).slice(0, 60)})`);
          return proxy;
        };
      },
    });
    return proxy;
  };
  // deno-lint-ignore no-explicit-any
  return { from: (t: string) => chain(t), rpc: (fn: string) => chain(`rpc:${fn}`) } as any;
}

Deno.test("11. a failed query surfaces as an error (the function then serves its last batch)", async () => {
  await assertRejects(
    () => loadContext(fakeDb({ question_attempts: { data: null, error: { message: "timeout" } } }), "u", NOW, "UTC"),
    Error,
    "Loading answers failed: timeout",
  );
});

Deno.test("11b. loads real-shaped rows and fingerprints them; a new answer changes the fingerprint", async () => {
  const rows = (latest: string): Record<string, Res> => ({
    topic_mastery: { data: [{ topic_id: "t", mastery_score: "0.42", evidence: "2.6", attempts_total: 3, attempts_correct: 1, last_practiced_at: "2026-10-27T00:00:00Z", next_review_at: null, last_incorrect_at: null, updated_at: latest, topics: { name: "Cells", description: null, embedded_at: null } }], error: null },
    question_attempts: { data: [{ question_id: "q", is_correct: false, created_at: latest, questions: { topic_id: "t", study_set_id: "p" } }], error: null },
    "rpc:progress_pack_completion": { data: [{ study_set_id: "p", total_questions: 4, correct_questions: 1, last_practiced_at: latest }], error: null },
    study_sets: { data: [{ id: "p", title: "Cells", material_id: "m", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" }], error: null },
    questions: { data: [{ study_set_id: "p", topic_id: "t" }, { study_set_id: "p", topic_id: "t" }], error: null },
    materials: { data: null, error: null, count: 1 },
  });
  const a = await loadContext(fakeDb(rows("2026-10-27T10:00:00Z")), "u", NOW, "UTC");
  const b = await loadContext(fakeDb(rows("2026-10-27T10:00:00Z")), "u", NOW, "UTC");
  const c = await loadContext(fakeDb(rows("2026-10-28T08:00:00Z")), "u", NOW, "UTC");
  assertEquals(a.ctx.topics[0].mastery, 0.42);
  assertEquals(a.ctx.packs[0].topicQuestions, { t: 2 });
  assertEquals(a.ctx.attempts[0].topicId, "t");
  assertEquals(a.signature, b.signature);
  assert(a.signature !== c.signature);
});

Deno.test("11c. the semantic retriever throws when the AI provider or the match fails", async () => {
  const c = biology();
  const embedDown = semanticRetriever(fakeDb({}), () => Promise.reject(new Error("429 quota")));
  await assertRejects(() => embedDown.related(c.topics, c), Error, "429 quota");
  const matchDown = semanticRetriever(
    fakeDb({ "rpc:match_topic_material": { data: null, error: { message: "boom" } } }),
    (texts) => Promise.resolve(texts.map(() => [0.1])),
  );
  await assertRejects(() => matchDown.related(c.topics, c), Error, "Matching material failed: boom");
});

Deno.test("11d. semantic matches map materials to their packs, embedding only topics without one", async () => {
  const c = biology();
  c.topics[0] = { ...c.topics[0], embedded: true };
  const embedded: string[][] = [];
  const calls: string[] = [];
  const retriever = semanticRetriever(
    fakeDb({ "rpc:match_topic_material": { data: [{ topic_id: "cell", material_id: "mat-bio", similarity: 0.72 }], error: null } }, calls),
    (texts) => {
      embedded.push(texts);
      return Promise.resolve(texts.map(() => [0.1]));
    },
  );
  const links = await retriever.related(c.topics, c);
  assertEquals(embedded, [["Genetics. Studied in: Biology 101"]]);
  assertEquals(links, [{ topicId: "cell", packId: "bio", relevance: 0.68, source: "semantic" }]);
  assert(calls.some((x) => x.startsWith("topics.update")));
});

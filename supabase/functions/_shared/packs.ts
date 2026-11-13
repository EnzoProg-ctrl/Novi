/**
 * Study pack content shared by process-material (packs from uploads) and chat
 * (quizzes made in AI Chat): the schema the models fill in, and the helpers
 * that validate and save it. Keeping one copy means a pack made either way
 * has exactly the same shape.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

/** The rule every generated multiple-choice question must follow. */
export const QUESTION_RULES =
  "Every multiple_choice question must include exactly 4 choices, and correct_answer must match one of them exactly.";

const QUESTION_ITEM = {
  type: "OBJECT",
  properties: {
    type: {
      type: "STRING",
      enum: ["multiple_choice", "true_false", "short_answer", "fill_blank", "flashcard"],
    },
    prompt: { type: "STRING" },
    choices: { type: "ARRAY", items: { type: "STRING" } },
    correct_answer: { type: "STRING" },
    explanation: { type: "STRING" },
    difficulty: { type: "INTEGER" },
    topic: { type: "STRING" },
  },
  required: ["type", "prompt", "correct_answer", "difficulty"],
};

const TOPIC_ITEM = {
  type: "OBJECT",
  properties: {
    name: { type: "STRING" },
    description: { type: "STRING" },
  },
  required: ["name"],
};

export const PACK_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    summary: { type: "STRING" },
    // Topics are the unit mastery is tracked against, so questions and concepts
    // both carry a topic name that must match one of these.
    topics: { type: "ARRAY", items: TOPIC_ITEM },
    key_concepts: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          term: { type: "STRING" },
          definition: { type: "STRING" },
          importance: { type: "INTEGER" },
          topic: { type: "STRING" },
        },
        required: ["term", "definition"],
      },
    },
    questions: { type: "ARRAY", items: QUESTION_ITEM },
  },
  required: ["title", "summary", "topics", "key_concepts", "questions"],
};

/** Just new questions, for adding to a pack that already exists. */
export const QUIZ_SCHEMA = {
  type: "OBJECT",
  properties: {
    topics: { type: "ARRAY", items: TOPIC_ITEM },
    questions: { type: "ARRAY", items: QUESTION_ITEM },
  },
  required: ["topics", "questions"],
};

/** Every question type Novi can write; matches the CHECK constraints in the database. */
export const QUESTION_TYPES = ["multiple_choice", "true_false", "short_answer", "fill_blank", "flashcard"];

export type QuestionSchemas = {
  pack: Record<string, unknown>;
  quiz: Record<string, unknown>;
  /** A prompt line naming the allowed types; empty when all are allowed. */
  rule: string;
};

/**
 * The pack and quiz schemas restricted to the question types a student allows
 * (Settings -> Study Preferences). The restriction is in the schema's enum, so
 * the model cannot return other types, not just asked not to.
 */
export function schemasFor(types?: string[] | null): QuestionSchemas {
  const allowed = (types ?? []).filter((t) => QUESTION_TYPES.includes(t));
  const list = allowed.length ? allowed : QUESTION_TYPES;
  const item = { ...QUESTION_ITEM, properties: { ...QUESTION_ITEM.properties, type: { type: "STRING", enum: list } } };
  const questions = { type: "ARRAY", items: item };
  return {
    pack: { ...PACK_SCHEMA, properties: { ...PACK_SCHEMA.properties, questions } },
    quiz: { ...QUIZ_SCHEMA, properties: { ...QUIZ_SCHEMA.properties, questions } },
    rule: list.length === QUESTION_TYPES.length
      ? ""
      : `Only write these question types, as the student chose: ${list.join(", ")}.`,
  };
}

export type GeneratedQuestion = {
  type: string;
  prompt: string;
  choices?: string[];
  correct_answer: string;
  explanation?: string;
  difficulty: number;
  topic?: string;
};

export type Pack = {
  title: string;
  summary: string;
  topics: { name: string; description?: string }[];
  key_concepts: { term: string; definition: string; importance?: number; topic?: string }[];
  questions: GeneratedQuestion[];
};

export type Quiz = { topics: { name: string; description?: string }[]; questions: GeneratedQuestion[] };

export const clamp = (n: unknown, lo: number, hi: number, fallback: number) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
};

/** Matches the unique index on topics: (user_id, subject_id, lower(btrim(name))). */
export const topicKey = (name: string) => name.trim().toLowerCase();

/**
 * Resolves topic names to ids, reusing the student's existing topics.
 *
 * Topics are deliberately shared across packs: two uploads about binary trees
 * should accumulate mastery against one topic, not two. The unique index is on
 * an expression, so it cannot be targeted by an upsert's onConflict - existing
 * rows are read and matched in code instead.
 */
export async function resolveTopics(
  db: SupabaseClient,
  userId: string,
  subjectId: string | null,
  names: string[],
): Promise<Map<string, string>> {
  const wanted = [...new Map(
    names
      .map((n) => (n ?? "").trim())
      .filter((n) => n.length > 0 && n.length <= 120)
      .map((n) => [topicKey(n), n]),
  ).values()];

  const map = new Map<string, string>();
  if (wanted.length === 0) return map;

  const base = db.from("topics").select("id, name").eq("user_id", userId);
  const { data: existing } = subjectId
    ? await base.eq("subject_id", subjectId)
    : await base.is("subject_id", null);

  for (const row of existing ?? []) {
    map.set(topicKey(row.name as string), row.id as string);
  }

  const missing = wanted.filter((n) => !map.has(topicKey(n)));
  if (missing.length > 0) {
    const { data: inserted, error } = await db
      .from("topics")
      .insert(missing.map((name) => ({ user_id: userId, subject_id: subjectId, name })))
      .select("id, name");

    if (error) {
      // A concurrent run may have created the same topic; re-read rather than fail
      // the whole pipeline over a naming collision.
      const retry = db.from("topics").select("id, name").eq("user_id", userId);
      const { data: after } = subjectId
        ? await retry.eq("subject_id", subjectId)
        : await retry.is("subject_id", null);
      for (const row of after ?? []) {
        map.set(topicKey(row.name as string), row.id as string);
      }
    } else {
      for (const row of inserted ?? []) {
        map.set(topicKey(row.name as string), row.id as string);
      }
    }
  }

  return map;
}

/**
 * Validated rows for the questions table. Checked here rather than trusting
 * the schema: a multiple_choice row without choices violates
 * questions_choices_required and would abort the whole insert.
 */
export function questionRows(
  questions: GeneratedQuestion[] | undefined,
  { setId, userId, topicIdFor, startPosition = 0 }: {
    setId: string;
    userId: string;
    topicIdFor: (name?: string) => string | null;
    startPosition?: number;
  },
) {
  return (questions ?? [])
    .filter((q) => q?.prompt?.trim() && q?.correct_answer?.trim())
    .filter((q) => q.type !== "multiple_choice" || Array.isArray(q.choices))
    .map((q, i) => ({
      study_set_id: setId,
      user_id: userId,
      topic_id: topicIdFor(q.topic),
      type: q.type,
      prompt: q.prompt.trim(),
      choices: q.type === "multiple_choice" ? q.choices : null,
      correct_answer: q.correct_answer.trim(),
      explanation: q.explanation ?? null,
      difficulty: clamp(q.difficulty, 1, 5, 3),
      position: startPosition + i,
    }));
}

export function conceptRows(
  concepts: Pack["key_concepts"] | undefined,
  { setId, userId, topicIdFor }: { setId: string; userId: string; topicIdFor: (name?: string) => string | null },
) {
  return (concepts ?? [])
    .filter((c) => c?.term?.trim() && c?.definition?.trim())
    .map((c, i) => ({
      study_set_id: setId,
      user_id: userId,
      topic_id: topicIdFor(c.topic),
      term: c.term.trim(),
      definition: c.definition.trim(),
      importance: clamp(c.importance, 1, 5, 3),
      position: i,
    }));
}

/** Topic ids for a pack's topics, and a lookup from a topic name to its id. */
export async function topicLookup(
  db: SupabaseClient,
  userId: string,
  subjectId: string | null,
  topics: { name: string }[] | undefined,
) {
  const ids = await resolveTopics(db, userId, subjectId, (topics ?? []).map((t) => t?.name).filter(Boolean) as string[]);
  return {
    ids,
    topicIdFor: (name?: string) => (name ? (ids.get(topicKey(name)) ?? null) : null),
  };
}

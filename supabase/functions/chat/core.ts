/**
 * One turn of AI Chat: save the student's message, check what it asks for
 * (guard.ts), then either answer it with help from their study material,
 * make a practice quiz (quiz.ts), or kindly decline. Save the reply.
 *
 * Kept apart from index.ts (which only handles HTTP and sign-in) so the same
 * code can be exercised directly in tests.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { embedMany } from "../_shared/ai/gemini.ts";
import { generateJson } from "../_shared/ai/generate.ts";
import { logError } from "../_shared/security.ts";
import { classify, DECLINE, stripCode } from "./guard.ts";
import { makeQuiz } from "./quiz.ts";

export type ChatRequest = {
  conversation_id?: string | null;
  message?: string;
  study_set_id?: string | null;
  /** Replace the last reply (or answer a message whose reply failed). */
  regenerate?: boolean;
  /** A file attached in the chat, already uploaded and read. */
  material_id?: string | null;
};

/** The choices offered when Novi asks how many practice questions to make. */
const QUIZ_COUNTS = [5, 10, 20, 30, 50];

type Result = { status: number; body: Record<string, unknown> };

const MAX_MESSAGE_CHARS = 4_000;
const HISTORY_MESSAGES = 12;
const HISTORY_CHARS_EACH = 1_500;
const MATCH_COUNT = 6;
/**
 * Cosine similarity a passage needs before it is shown to the model. Measured
 * on a real pack (2026-10-23): related questions scored 0.67-0.72, unrelated
 * ones 0.42-0.50. Lower when the student picked a pack (they are asking about
 * it), higher across all their material (only clearly related passages).
 */
const PACK_THRESHOLD = 0.5;
const GLOBAL_THRESHOLD = 0.6;
const OUTPUT_TOKENS = 1_800;

const CONVERSATION_COLUMNS = "id, title, study_set_id, last_message_at, created_at";
const MESSAGE_COLUMNS = "id, role, content, created_at, metadata, cited_chunk_ids, study_set_id";

const REPLY_SCHEMA = {
  type: "OBJECT",
  properties: {
    reply: { type: "STRING" },
    follow_ups: { type: "ARRAY", items: { type: "STRING" } },
    used_material: { type: "BOOLEAN" },
  },
  required: ["reply", "follow_ups", "used_material"],
};

type Reply = { reply: string; follow_ups: string[]; used_material: boolean };
type Chunk = { id: string; material_id: string; content: string; similarity: number };

/** First message, tidied and cut at a word boundary. */
export function titleFrom(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= 60) return clean;
  const cut = clean.slice(0, 60);
  const space = cut.lastIndexOf(" ");
  return `${space > 30 ? cut.slice(0, space) : cut}…`;
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);

function friendlyError(err: unknown, signal: AbortSignal): string {
  const message = err instanceof Error ? err.message : String(err);
  if (signal.aborted) return "Novi took too long to answer. Try again.";
  if (/429|quota|rate limit|exhausted/i.test(message)) {
    return "Novi has reached its AI limit for the moment. Try again in a minute.";
  }
  return "Novi couldn't answer right now. Try again.";
}

/**
 * How each personality chosen in "Edit your buddy" sounds. Keys match the
 * CHECK constraint on public.buddies.personality. Tone only: the rules below
 * (accuracy, no code, no cheating) apply whatever the personality.
 */
const PERSONALITIES: Record<string, string> = {
  supportive:
    "Supportive: patient and encouraging. Notice their effort, reassure them when they're stuck, and celebrate progress, without overdoing the praise.",
  cheerful:
    "Cheerful: upbeat and warm, with a bright, friendly tone and a little enthusiasm. At most one emoji in a reply, and only when it fits.",
  calm:
    "Calm: steady and unhurried. Use gentle, measured sentences and no exclamation marks. If they sound stressed, help them slow down and take one step at a time.",
  witty:
    "Witty: light and a bit playful. A small joke, pun or clever analogy now and then is welcome, but clarity and accuracy always come first, and never joke about their mistakes.",
  focused:
    "Focused: direct and efficient. Keep replies short and to the point, skip small talk and filler, and end with a clear next step.",
};

/** Settings -> Study Preferences -> Buddy reply length. "balanced" adds nothing. */
const REPLY_LENGTHS: Record<string, string> = {
  short: "Keep replies short: two to four sentences or a few bullet points, unless they ask for more detail.",
  detailed: "Give thorough explanations: walk through the reasoning step by step, include an example, and use headings or lists when it helps.",
};

/** Settings -> Profile -> Education level, as the model should read it. "other" adds nothing. */
const LEVELS: Record<string, string> = {
  junior_high: "a junior high school student",
  senior_high: "a senior high school student",
  college: "a college student",
  graduate: "a graduate student",
  self_learner: "a self-learner studying on their own",
};

/** One line saying who Novi is teaching, from the profile; "" when they haven't said. */
export function learnerLine(level?: string | null, course?: string | null): string {
  const who = level ? LEVELS[level] : undefined;
  const subject = course?.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!who && !subject) return "";
  const intro = who
    ? `The student is ${who}${subject ? `, studying "${subject}"` : ""}.`
    : `The student is studying "${subject}".`;
  return `${intro} Pitch explanations, questions, examples and vocabulary at that level.`;
}

function buildPrompt({ name, buddy, learner, replyLength, packTitle, chunks, titles, history, question, decline, attachmentTitle = null }: {
  decline?: string;
  attachmentTitle?: string | null;
  name: string | null;
  buddy: { name: string; personality: string };
  learner: string;
  replyLength: string;
  packTitle: string | null;
  chunks: Chunk[];
  titles: Map<string, string>;
  history: { role: string; content: string }[];
  question: string;
}): string {
  const lines = [
    `You are ${buddy.name}, the student's AI study buddy inside Novi, a study app for students.`,
    `Your personality, which the student chose: ${PERSONALITIES[buddy.personality] ?? PERSONALITIES.supportive} Let it shape your tone in every reply.`,
    name ? `The student's name is ${name}. Use it only now and then, not in every reply.` : "",
    learner,
    "",
    "How to answer:",
    "- Be clear and accurate. Explain simply first, then add detail if it helps.",
    REPLY_LENGTHS[replyLength] ? `- ${REPLY_LENGTHS[replyLength]}` : "",
    "- Use markdown: short paragraphs, **bold** for key terms, bullet or numbered lists for steps.",
    "- Never write code: no code blocks, programs, scripts, commands, queries or formulas to run. If programming comes up, explain the idea in plain words.",
    "- For homework-style problems, teach the method step by step and let the student try. Check their answer if they share it. Never hand over answers to graded work, tests or assignments.",
    "- Write maths in plain text (for example x^2 + 3x = 0), not LaTeX.",
    "- If the request is missing something you need, ask one short question instead of guessing. For example \"Explain a concept\" or \"Summarize my notes\" with no subject means: ask which concept or which notes (unless the study material below makes it clear).",
    "- If they want practice questions saved to a pack, that is handled separately; here, answer what they asked.",
    "- Only help with studying and learning.",
    "- About yourself, only say what is true. If asked what AI you use: you run on more than one AI model from two providers, Groq (an open model called gpt-oss) and Google Gemini, and which one writes a reply depends on availability. You are not fine-tuned or trained by Novi, and you are not GPT-4. Each reply is written from the conversation and, when relevant, excerpts of the student's uploaded material. You don't remember other conversations and can't browse the internet. For how their data is handled, point them to Settings, under Data & Privacy. Never invent other details about how you were built; if you don't know, say so.",
    "- You cannot take actions in the app. You cannot delete, rename, move or edit study packs, materials, questions, chats or settings, so never say you did, are doing or will do any of that. If they ask, tell them how to do it themselves: a study pack is deleted from Home, under \"Your material\": tick the material and press Delete, which removes its pack too. A chat can be renamed or deleted from the ⋯ menu next to it in Recent Chats.",
    "",
    "Study material:",
    chunks.length
      ? "- Excerpts from the student's own uploaded material are below. Base your answer on them when they are relevant, and say so naturally (for example \"From your notes on ...\"). Set used_material to true only if you actually used them."
      : "- No excerpts from the student's material are attached to this message. Answer from general knowledge, set used_material to false, and never claim to have read their files.",
    "- If you add general knowledge beyond the excerpts, make that clear.",
    "",
    "Also return follow_ups: three short next messages the student might send, written in their voice, under 8 words each, specific to this conversation.",
  ];

  if (decline) lines.push("", "IMPORTANT FOR THIS MESSAGE:", decline);
  if (attachmentTitle) {
    lines.push(
      "",
      `The student just attached "${attachmentTitle}", and you have read it. Answer their message using it. If they only shared the file, ` +
        "say in a sentence or two what it covers. Do not write practice questions here: below your reply they can choose how many to make.",
    );
  }
  if (packTitle) lines.push("", `The student chose the study pack "${packTitle}" as context.`);

  if (chunks.length) {
    lines.push("", "MATERIAL EXCERPTS:");
    chunks.forEach((c, i) => {
      lines.push(`[${i + 1}] From "${titles.get(c.material_id) ?? "their material"}":`, c.content.trim(), "");
    });
  }

  if (history.length) {
    lines.push("", "CONVERSATION SO FAR:");
    for (const m of history) {
      lines.push(`${m.role === "user" ? "Student" : "Novi"}: ${clip(m.content.trim(), HISTORY_CHARS_EACH)}`);
    }
  }

  lines.push("", "NEW MESSAGE FROM THE STUDENT:", question);
  return lines.filter((l, i, all) => !(l === "" && all[i - 1] === "")).join("\n");
}

/** Saves a reply that needs no AI call and returns the usual response. */
async function saveReply({ db, user, conversation, conversationId, userMessage, content, metadata }: {
  db: SupabaseClient;
  user: { id: string };
  conversation: Record<string, unknown>;
  conversationId: string;
  userMessage: Record<string, unknown> | null;
  content: string;
  metadata: Record<string, unknown>;
}): Promise<Result> {
  const { data: saved, error } = await db.from("chat_messages").insert({
    user_id: user.id,
    conversation_id: conversationId,
    study_set_id: conversation.study_set_id ?? null,
    role: "buddy",
    content,
    metadata,
  }).select(MESSAGE_COLUMNS).single();
  if (error || !saved) {
    return { status: 500, body: { error: "Novi's reply could not be saved. Try again.", conversation, user_message: userMessage } };
  }
  const at = new Date().toISOString();
  await db.from("chat_conversations").update({ last_message_at: at }).eq("id", conversationId);
  return { status: 200, body: { conversation: { ...conversation, last_message_at: at }, user_message: userMessage, reply: saved } };
}

export async function runChat(
  db: SupabaseClient,
  user: { id: string; user_metadata?: Record<string, unknown> },
  body: ChatRequest,
  signal: AbortSignal,
  /** `onSaved` runs as soon as the student's message is stored, before Novi answers. */
  hooks: { onSaved?: (conversation: Record<string, unknown>, userMessage: Record<string, unknown>) => void } = {},
): Promise<Result> {
  let message = typeof body.message === "string" ? body.message.trim() : "";
  const regenerate = body.regenerate === true;

  if (!regenerate && !message && !body.material_id) return { status: 400, body: { error: "Type a message first." } };
  if (message.length > MAX_MESSAGE_CHARS) {
    return { status: 400, body: { error: `Messages can be up to ${MAX_MESSAGE_CHARS.toLocaleString()} characters.` } };
  }

  // A pack id is only used if the student can actually see that pack.
  let packId: string | null | undefined = undefined;
  if (body.study_set_id !== undefined) {
    packId = null;
    if (body.study_set_id) {
      const { data: pack } = await db.from("study_sets").select("id").eq("id", body.study_set_id).maybeSingle();
      packId = pack?.id ?? null;
    }
  }

  // ── An attached file becomes the chat's study pack ──────────
  // Only once it has been read: Novi never answers about a file it has not
  // processed.
  let attachment: { material_id: string; title: string; source_type: string; pack_id: string } | null = null;
  if (body.material_id && !regenerate) {
    const { data: material } = await db.from("materials")
      .select("id, title, source_type, status").eq("id", body.material_id).maybeSingle();
    if (!material) return { status: 404, body: { error: "That file is no longer available. Attach it again." } };
    if (material.status !== "ready") {
      return { status: 409, body: { error: "Novi is still reading that file. Try again in a moment." } };
    }
    const { data: pack } = await db.from("study_sets").select("id").eq("material_id", material.id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!pack) return { status: 409, body: { error: "Novi is still reading that file. Try again in a moment." } };
    attachment = { material_id: material.id, title: material.title, source_type: material.source_type, pack_id: pack.id };
    packId = pack.id;
    if (!message) message = `I've attached "${material.title}".`;
  }

  // ── Conversation ─────────────────────────────────────────────
  let conversation: Record<string, unknown> | null = null;
  if (body.conversation_id) {
    const { data, error } = await db.from("chat_conversations")
      .select(CONVERSATION_COLUMNS).eq("id", body.conversation_id).maybeSingle();
    if (error) {
      logError("chat.load_conversation", error);
      return { status: 500, body: { error: "Novi couldn't open that conversation. Try again." } };
    }
    if (!data) return { status: 404, body: { error: "That conversation no longer exists." } };
    conversation = data;
    if (packId !== undefined && packId !== data.study_set_id) {
      const { data: updated } = await db.from("chat_conversations")
        .update({ study_set_id: packId }).eq("id", data.id).select(CONVERSATION_COLUMNS).single();
      if (updated) conversation = updated;
    }
  } else {
    if (regenerate) return { status: 400, body: { error: "Nothing to regenerate yet." } };
    const { data, error } = await db.from("chat_conversations")
      .insert({ user_id: user.id, title: titleFrom(message), study_set_id: packId ?? null })
      .select(CONVERSATION_COLUMNS).single();
    if (error || !data) {
      logError("chat.start_conversation", error);
      return { status: 500, body: { error: "Could not start the chat. Try again." } };
    }
    conversation = data;
  }
  const conversationId = conversation.id as string;

  // ── The student's message ───────────────────────────────────
  let question: { id: string; content: string } | null = null;
  let userMessage: Record<string, unknown> | null = null;

  if (regenerate) {
    const { data: recent } = await db.from("chat_messages")
      .select("id, role, content, metadata").eq("conversation_id", conversationId)
      .order("created_at", { ascending: false }).limit(2);
    const [last, before] = recent ?? [];
    if (last?.role === "buddy" && last.metadata?.quiz) {
      return { status: 400, body: { error: "That reply made a quiz, so it can't be regenerated. Ask for more questions instead." } };
    }
    if (last?.role === "buddy" && before?.role === "user") {
      await db.from("chat_messages").delete().eq("id", last.id);
      question = before;
    } else if (last?.role === "user") {
      question = last;
    }
    if (!question) return { status: 400, body: { error: "Nothing to regenerate yet." } };
  } else {
    const { data, error } = await db.from("chat_messages").insert({
      user_id: user.id,
      conversation_id: conversationId,
      study_set_id: conversation.study_set_id ?? null,
      role: "user",
      content: message,
      metadata: attachment ? { attachment } : {},
    }).select(MESSAGE_COLUMNS).single();
    if (error || !data) {
      logError("chat.save_message", error);
      return { status: 500, body: { error: "Could not save your message. Try again.", conversation } };
    }
    userMessage = data;
    question = { id: data.id, content: data.content };
  }

  const touched = new Date().toISOString();
  await db.from("chat_conversations").update({ last_message_at: touched }).eq("id", conversationId);
  conversation = { ...conversation, last_message_at: touched };
  if (userMessage) hooks.onSaved?.(conversation, userMessage);

  // ── Earlier messages, oldest first, without the current one ──
  const { data: past } = await db.from("chat_messages")
    .select("id, role, content").eq("conversation_id", conversationId)
    .order("created_at", { ascending: false }).limit(HISTORY_MESSAGES + 1);
  const history = (past ?? []).filter((m) => m.id !== question!.id).slice(0, HISTORY_MESSAGES).reverse();

  // The student's buddy (name and personality from "Edit your buddy") and their
  // study preferences (Settings -> Study Preferences).
  const [{ data: buddyRow }, { data: profile }] = await Promise.all([
    db.from("buddies").select("name, personality").eq("user_id", user.id).maybeSingle(),
    db.from("profiles").select("chat_quiz_size, reply_length, question_types, education_level, course").eq("id", user.id).maybeSingle(),
  ]);
  const replyLength = (profile?.reply_length as string | undefined) ?? "balanced";
  const questionTypes = (profile?.question_types as string[] | null | undefined) ?? null;
  const defaultQuizSize = (profile?.chat_quiz_size as number | null | undefined) ?? null;
  const learner = learnerLine(profile?.education_level as string | null, profile?.course as string | null);
  const buddy = {
    name: (buddyRow?.name as string | undefined)?.trim().slice(0, 40) || "Novi",
    personality: (buddyRow?.personality as string | undefined) ?? "supportive",
  };

  let packTitle: string | null = null;
  let materialId: string | null = null;
  if (conversation.study_set_id) {
    const { data: pack } = await db.from("study_sets")
      .select("title, material_id").eq("id", conversation.study_set_id).maybeSingle();
    packTitle = pack?.title ?? null;
    materialId = pack?.material_id ?? null;
  }

  // ── What is being asked ──────────────────────────────────────
  let verdict;
  try {
    verdict = await classify({ message: question.content, history, packTitle, attachmentTitle: attachment?.title ?? null, signal });
  } catch (err) {
    return { status: 504, body: { error: friendlyError(err, signal), conversation, user_message: userMessage } };
  }
  // Kept on the student's message so decisions can be reviewed later.
  const userMeta = { ...(attachment ? { attachment } : {}), guard: verdict.category, guard_reason: verdict.reason ?? null };
  await db.from("chat_messages").update({ metadata: userMeta }).eq("id", question.id);
  if (userMessage) userMessage = { ...userMessage, metadata: userMeta };

  // ── A quiz with no number: their default size, or they choose ─
  if (verdict.category === "quiz" && !verdict.question_count && defaultQuizSize) {
    verdict = { ...verdict, question_count: defaultQuizSize };
  }
  if (verdict.category === "quiz" && !verdict.question_count) {
    const topic = verdict.quiz_topic?.trim() || attachment?.title || packTitle || "this topic";
    return await saveReply({
      db, user, conversation, conversationId, userMessage,
      content: `How many practice questions would you like on **${topic}**? Pick a number below.`,
      metadata: { guard: "quiz", ask_quiz_count: { topic, options: QUIZ_COUNTS }, follow_ups: [] },
    });
  }

  // ── A practice quiz, saved into a pack ──────────────────────
  if (verdict.category === "quiz") {
    let result;
    try {
      result = await makeQuiz({
        db,
        userId: user.id,
        verdict,
        question: question.content,
        chosenPackId: (conversation.study_set_id as string | null) ?? null,
        conversationId,
        history,
        questionTypes,
        learner,
        signal,
      });
    } catch (err) {
      console.log(JSON.stringify({ quiz_failed: err instanceof Error ? err.message : String(err) }));
      const limit = friendlyError(err, signal);
      return {
        status: 502,
        body: {
          error: limit.startsWith("Novi couldn't") ? "Novi couldn't make that quiz right now. Try again." : limit,
          conversation,
          user_message: userMessage,
        },
      };
    }

    const { data: saved, error: saveError } = await db.from("chat_messages").insert({
      user_id: user.id,
      conversation_id: conversationId,
      study_set_id: result.packId,
      role: "buddy",
      content: result.reply,
      metadata: { model: result.model, guard: "quiz", follow_ups: result.followUps, quiz: result.quiz },
    }).select(MESSAGE_COLUMNS).single();
    if (saveError || !saved) {
      return { status: 500, body: { error: "The quiz was saved, but the reply could not be. Check Study Packs.", conversation, user_message: userMessage } };
    }

    // Follow-ups like "add 5 more" now go to the same pack.
    const doneAt = new Date().toISOString();
    const { data: updated } = await db.from("chat_conversations")
      .update({ last_message_at: doneAt, study_set_id: result.packId })
      .eq("id", conversationId).select(CONVERSATION_COLUMNS).single();
    return {
      status: 200,
      body: { conversation: updated ?? { ...conversation, last_message_at: doneAt }, user_message: userMessage, reply: saved },
    };
  }

  const decline = DECLINE[verdict.category];

  // ── Relevant passages from the student's material ───────────
  // Skipped when declining. A failed lookup is not worth failing the chat
  // over: Novi answers from general knowledge instead, and says so.
  let chunks: Chunk[] = [];
  const titles = new Map<string, string>();
  try {
    if (decline) throw new Error("skip");
    const [vector] = await embedMany([question.content], signal);
    const { data, error } = await db.rpc("match_material_chunks", {
      query_embedding: JSON.stringify(vector),
      match_count: MATCH_COUNT,
      filter_material_id: materialId,
      similarity_threshold: materialId ? PACK_THRESHOLD : GLOBAL_THRESHOLD,
    });
    if (error) throw error;
    chunks = (data ?? []) as Chunk[];
    const ids = [...new Set(chunks.map((c) => c.material_id))];
    if (ids.length) {
      const { data: mats } = await db.from("materials").select("id, title").in("id", ids);
      for (const m of mats ?? []) titles.set(m.id, m.title);
    }
  } catch (err) {
    if (signal.aborted) {
      return { status: 504, body: { error: friendlyError(err, signal), conversation, user_message: userMessage } };
    }
    if (!decline) console.log(JSON.stringify({ retrieval_failed: err instanceof Error ? err.message : String(err) }));
    chunks = [];
  }

  // ── Reply ────────────────────────────────────────────────────
  const name = (user.user_metadata?.display_name as string | undefined)?.split(" ")[0] ?? null;
  const prompt = buildPrompt({
    name, buddy, learner, replyLength, packTitle, chunks, titles, history, question: question.content, decline,
    attachmentTitle: decline ? null : attachment?.title ?? null,
  });

  let reply: Reply;
  let model: string;
  try {
    const result = await generateJson<Reply>(prompt, REPLY_SCHEMA, { outputTokens: OUTPUT_TOKENS, signal });
    reply = result.data;
    model = result.model;
    if (typeof reply?.reply !== "string" || !reply.reply.trim()) throw new Error("Empty reply");
  } catch (err) {
    console.log(JSON.stringify({ chat_reply_failed: err instanceof Error ? err.message : String(err) }));
    return {
      status: 502,
      body: { error: friendlyError(err, signal), conversation, user_message: userMessage },
    };
  }

  const usedMaterial = Boolean(reply.used_material) && chunks.length > 0;
  // Last line of defence for the no-code rule.
  const { text: content, removed: codeRemoved } = stripCode(reply.reply.trim());
  const followUps = (Array.isArray(reply.follow_ups) ? reply.follow_ups : [])
    .filter((f) => typeof f === "string" && f.trim())
    .map((f) => f.trim().slice(0, 80))
    .slice(0, 3);

  const { data: saved, error: saveError } = await db.from("chat_messages").insert({
    user_id: user.id,
    conversation_id: conversationId,
    study_set_id: conversation.study_set_id ?? null,
    role: "buddy",
    content,
    cited_chunk_ids: usedMaterial ? chunks.map((c) => c.id) : [],
    metadata: {
      model,
      guard: verdict.category,
      ...(codeRemoved ? { code_removed: true } : {}),
      follow_ups: followUps,
      used_material: usedMaterial,
      sources: usedMaterial ? [...new Set(chunks.map((c) => titles.get(c.material_id)).filter(Boolean))] : [],
      // Just attached: offer to make practice questions, and let them choose how many.
      ...(attachment && !decline ? { ask_quiz_count: { topic: attachment.title, options: QUIZ_COUNTS } } : {}),
    },
  }).select(MESSAGE_COLUMNS).single();
  if (saveError || !saved) {
    return { status: 500, body: { error: "Novi answered, but the reply could not be saved. Try again.", conversation, user_message: userMessage } };
  }

  const answered = new Date().toISOString();
  await db.from("chat_conversations").update({ last_message_at: answered }).eq("id", conversationId);

  return {
    status: 200,
    body: {
      conversation: { ...conversation, last_message_at: answered },
      user_message: userMessage,
      reply: saved,
    },
  };
}

/**
 * What Novi will and won't do in AI Chat.
 *
 * Novi only helps students study. Every message is checked by a short,
 * separate AI call before Novi answers. A separate call matters: a message
 * that tries to talk the main model out of its rules is judged by a model
 * that is only classifying it, not answering it. Replies are then checked
 * once more for code, which Novi never writes.
 *
 * This is a strong filter, not a guarantee: the check can only judge what the
 * student says, so a disguised request can slip through and an innocent one
 * can be refused. Every decision is stored on the message (metadata.guard) so
 * it can be reviewed and the rules tuned.
 */

import { generateJson } from "../_shared/ai/generate.ts";

export type Category = "study" | "quiz" | "cheating" | "code" | "off_topic";

export type Verdict = {
  category: Category;
  reason?: string;
  quiz_topic?: string;
  question_count?: number;
  about?: "chosen_pack" | "existing_material" | "new_topic";
  /** "add": write new questions. "set_total": make the quiz end up with question_count questions. */
  quiz_action?: "add" | "set_total";
};

const GUARD_SCHEMA = {
  type: "OBJECT",
  properties: {
    category: { type: "STRING", enum: ["study", "quiz", "cheating", "code", "off_topic"] },
    reason: { type: "STRING" },
    quiz_topic: { type: "STRING" },
    question_count: { type: "INTEGER" },
    about: { type: "STRING", enum: ["chosen_pack", "existing_material", "new_topic"] },
    quiz_action: { type: "STRING", enum: ["add", "set_total"] },
  },
  required: ["category", "reason"],
};

const RULES = `You review messages sent to Novi, an AI study buddy inside a study app. Novi only helps students study better.
Classify the student's NEW message. Use the conversation for context (for example "make it 10" right after a quiz request is a quiz request).

Categories:
- "study": learning help. Explaining concepts and topics (including programming concepts in plain words), summaries, study plans, study strategies, memory techniques, exam preparation, checking or giving feedback on the student's own attempt, explaining how to solve a type of problem, motivation, greetings, questions about Novi or their study packs.
- "quiz": the student wants practice questions or a practice quiz created for them, more or different questions added to one, or a quiz made bigger or smaller ("quiz me on X", "make 10 questions about chapter 2", "add 5 harder ones", "cut it down to 20", "I asked for 30, not 15").
- "cheating": help that would be academic dishonesty. Answering questions from a test, quiz or exam they are taking now or that is graded; doing graded homework, assignments or essays for them to hand in; writing anything they will submit as their own work; getting around proctoring, plagiarism checkers or AI detectors. Asking how to solve a kind of problem in order to learn it is "study".
- "code": asks Novi to write, complete, fix, convert or output code: programs, scripts, functions, commands, SQL, regex, spreadsheet formulas, HTML or CSS. Explaining what a programming idea means, in words, is "study".
- "off_topic": anything not about learning or studying: entertainment, personal errands, role-play, unrelated writing, general chit-chat.

When unsure between "study" and another category, choose "study" unless the message clearly asks for one of the things above.

For "quiz", also fill in:
- quiz_topic: short, for example "cell biology" or "attributes of global cities"
- question_count: only if the student gave a number
- about: "chosen_pack" if it is about the study pack the student has selected, "existing_material" if it is about material they uploaded before, "new_topic" if it is a topic not tied to their uploads.
- quiz_action: "set_total" when the student wants the quiz they already have to end up with a certain number of questions in total: making it smaller ("reduce it to 20", "only keep 10", "too many, make it 15"), or correcting a quiz that came out the wrong size ("I requested 30 items, not 15", "where are the other 15?"). question_count is then the TOTAL they want, never the difference. Otherwise "add": new questions are written and added (question_count is how many to add).

reason: a few words explaining the decision.`;

/**
 * Falls back to "study" if the check itself fails: the main reply still
 * carries the same rules, so a brief outage does not lock students out.
 */
export async function classify({ message, history, packTitle, attachmentTitle = null, signal }: {
  message: string;
  history: { role: string; content: string }[];
  packTitle: string | null;
  attachmentTitle?: string | null;
  signal: AbortSignal;
}): Promise<Verdict> {
  const context = history.slice(-4)
    .map((m) => `${m.role === "user" ? "Student" : "Novi"}: ${m.content.replace(/\s+/g, " ").slice(0, 300)}`)
    .join("\n");

  const prompt = [
    RULES,
    "",
    packTitle ? `Study pack the student has selected: "${packTitle}"` : "The student has not selected a study pack.",
    attachmentTitle
      ? `The student attached a file with this message: "${attachmentTitle}". It is now their selected study pack, so a quiz on it is about "chosen_pack".`
      : "",
    context ? `\nRECENT CONVERSATION:\n${context}` : "",
    "",
    "NEW MESSAGE:",
    message.slice(0, 2_000),
  ].join("\n");

  try {
    const { data } = await generateJson<Verdict>(prompt, GUARD_SCHEMA, { outputTokens: 400, signal });
    const valid: Category[] = ["study", "quiz", "cheating", "code", "off_topic"];
    return valid.includes(data?.category) ? data : { category: "study", reason: "unrecognised verdict" };
  } catch (err) {
    if (signal.aborted) throw err;
    console.log(JSON.stringify({ guard_failed: err instanceof Error ? err.message : String(err) }));
    return { category: "study", reason: "check unavailable" };
  }
}

/** How Novi should answer a message it will not help with. */
export const DECLINE: Partial<Record<Category, string>> = {
  cheating:
    "This message asks for help that would be cheating. Kindly decline in one or two sentences, without lecturing. Then offer honest help instead: explaining the concepts behind it, making practice questions, or helping them prepare.",
  code:
    "This message asks you to write code. Explain briefly that you don't write code in Novi, then offer to explain the idea, the logic or the steps in plain words so they can write it themselves. Do not include any code.",
  off_topic:
    "This message isn't about studying. Say kindly, in one or two sentences, that you can only help with studying, and suggest one or two ways you could help with their studies instead.",
};

const CODE_FENCE = /```[\s\S]*?(```|$)/g;
const CODE_LINE = /^\s*(def |class |import |from \S+ import|function |const |let |var |public |private |#include|SELECT |INSERT |UPDATE |DELETE |CREATE |<\/?[a-z]+[\s>]|[a-z_]\w*\s*\(.*\)\s*\{\s*$|.*;\s*$|.*\{\s*$|\s*\}\s*$)/i;

/**
 * Removes code a reply should not contain. Fenced blocks go entirely; a run
 * of three or more code-looking lines is treated the same way. Inline
 * `terms` stay, since naming a function or keyword is not writing code.
 */
export function stripCode(text: string): { text: string; removed: boolean } {
  let removed = false;
  let out = text.replace(CODE_FENCE, () => {
    removed = true;
    return "";
  });

  const lines = out.split("\n");
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    let j = i;
    while (j < lines.length && lines[j].trim() && CODE_LINE.test(lines[j])) j++;
    if (j - i >= 3) {
      removed = true;
      i = j - 1;
      continue;
    }
    kept.push(lines[i]);
  }
  out = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();

  if (removed) {
    out += `${out ? "\n\n" : ""}_Novi doesn't write code, so I left that part out. Ask me to explain any step in plain words._`;
  }
  return { text: out, removed };
}

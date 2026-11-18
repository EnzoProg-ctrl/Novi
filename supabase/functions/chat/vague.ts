/**
 * Requests that name no subject: "summarize", "let's discuss", "explain this
 * concept", or a chat task sent before the student filled it in. With nothing
 * else to go on (no attached file, no chosen pack, no earlier messages) the
 * model tends to pick a topic of its own, so these get a question back
 * instead of an AI reply. Anything that names a subject is left alone.
 */

export type VagueVerb = "summarize" | "discuss" | "explain" | "review";

const POLITE = String.raw`(?:(?:hi|hey|hello|ok|okay|so|um|please|pls|now)[,!.]?\s+)*` +
  String.raw`(?:(?:can|could|would|will) you\s+|i (?:want|need|would like|'d like) (?:you )?to\s+|let'?s\s+|lets\s+|help me\s+|we should\s+)?` +
  String.raw`(?:please\s+)?`;

const VERBS: [VagueVerb, string][] = [
  ["summarize", String.raw`summari[sz]e|sum up|recap|(?:give me|make|write|do)\s+(?:a\s+)?summary(?:\s+of)?|summary`],
  ["discuss", String.raw`discuss|talk about|chat about|talk|discussion(?:\s+about)?`],
  ["explain", String.raw`explain|teach me(?:\s+about)?|break down|tell me about|elaborate(?:\s+on)?`],
  ["review", String.raw`review|go over|go through|study`],
];

/** Words that point at something without naming it. */
const OBJECT = String.raw`(?:(?:this|that|it|these|those|something|anything|everything|stuff|a topic|the topic|some topics?|a concept|this concept|the concept|a subject|the subject|my notes?|the notes?|these notes?|my materials?|the materials?|my study packs?|the study packs?|my packs?|the lesson|my lessons?|the chapter|my class|my subject|for me|with me|together)\s*)*`;

/** Tails a chat task adds ("…into key points", "…in simple terms"). */
const TAIL = String.raw`(?:(?:into|in|as)\s+(?:key points|bullet points|simple terms|simple words|short|detail|a few points)\s*)?(?:for me\s*)?(?:please\s*)?`;

const PATTERNS = VERBS.map(([verb, words]) => [verb, new RegExp(`^${POLITE}(?:${words})\\s*${OBJECT}${TAIL}$`, "i")] as const);

export function vagueRequest(text: string): VagueVerb | null {
  const plain = text
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[\s ]+/g, " ")
    .replace(/[.!?:;,\s]+$/g, "")
    .trim();
  if (!plain || plain.length > 80) return null;
  for (const [verb, pattern] of PATTERNS) if (pattern.test(plain)) return verb;
  return null;
}

const ASK: Record<VagueVerb, string> = {
  summarize: "What should I summarize?",
  discuss: "What would you like to discuss?",
  explain: "What would you like me to explain?",
  review: "What would you like to go over?",
};

const EXAMPLES: Record<VagueVerb, string[]> = {
  summarize: ["Summarize how photosynthesis works", "Summarize the causes of World War I", "Summarize the water cycle"],
  discuss: ["Discuss the causes of World War I", "Discuss how vaccines work", "Discuss supply and demand"],
  explain: ["Explain photosynthesis simply", "Explain Newton's laws of motion", "Explain how the heart works"],
  review: ["Go over cell structure with me", "Go over the basics of fractions", "Go over the French Revolution"],
};

/** The question Novi asks back, and suggested next messages that name a subject. */
export function clarifyReply(verb: VagueVerb, hasPacks: boolean): { content: string; followUps: string[] } {
  const how = hasPacks
    ? "Tell me the topic, paste your notes here, or choose one of your study packs with the paperclip and I'll work from it."
    : "Tell me the topic, or paste your notes here. You haven't added any study material yet, so there are no notes of yours for me to work from.";
  return { content: `${ASK[verb]} ${how}`, followUps: EXAMPLES[verb] };
}

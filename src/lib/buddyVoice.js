/**
 * How the buddy sounds outside AI Chat, per the personality chosen in "Edit
 * your buddy". Same tone rules as AI Chat (supabase/functions/chat/core.ts):
 * calm never uses exclamation marks, nobody uses emojis (cheerful is warm in words),
 * focused stays short. Lines are tone only: what is right or wrong is always
 * stated plainly.
 *
 * Keys match the check constraint on public.buddies.personality.
 */

const VOICES = {
  // Like a friend texting: casual, Gen Z, still clear about right and wrong.
  supportive: {
    home: [['you got this fr', 'stuck on something? just ask me'], ['every bit of practice counts tbh', 'lmk if anything’s confusing']],
    start: ['Add something to study', 'and we’ll figure it out together'],
    right: ['Correct, let’s gooo', 'Correct, you ate that', 'Correct, you’re so locked in'],
    wrong: ['Not quite, but you’re so close', 'Not quite, no worries tho', 'Not quite, happens to the best of us'],
    done: ['Session complete', 'W session fr. You showed up and that’s what counts.'],
  },
  cheerful: {
    home: [['bestie we’re learning today!', 'ask me literally anything'], ['today’s gonna be a W!', 'i’m here if you need me']],
    start: ['Add something to study', 'and let’s gooo!'],
    right: ['Correct, slay!', 'Correct, big W!', 'Correct, omg you’re so smart!'],
    wrong: ['Not quite, but so close bestie', 'Not quite, next one’s yours fr', 'Not quite, we keep going!'],
    done: ['Session complete, let’s gooo!', 'That was such a W. Come back soon bestie!'],
  },
  calm: {
    home: [['one thing at a time', 'ask me whenever, no rush'], ['we got time today', 'i’m here if anything’s unclear']],
    start: ['Add something to study', 'and we’ll take it slow'],
    right: ['Correct. lowkey well done', 'Correct. nicely reasoned', 'Correct. that’s it'],
    wrong: ['Not quite. it’s okay fr', 'Not quite. no rush', 'Not quite. take another look'],
    done: ['Session complete', 'Good, steady work. take a breather before the next one.'],
  },
  witty: {
    home: [['brain: warmed up. snacks: optional.', 'ask me anything, no judgment'], ['main character study arc starts now', 'bring me your questions']],
    start: ['Feed me some notes', 'and i’ll turn them into questions, chef’s kiss'],
    right: ['Correct, understood the assignment', 'Correct, main character energy', 'Correct, it’s giving genius'],
    wrong: ['Not quite, plot twist', 'Not quite, the answer said "not today"', 'Not quite, villain arc for this question only'],
    done: ['Session complete', 'Another one for the brain bank. no notes.'],
  },
  focused: {
    home: [['Pick a pack and practise.', 'Questions? Ask me.'], ['Keep the streak going.', 'Ask if you get stuck.']],
    start: ['Add material', 'to start.'],
    right: ['Correct.', 'Correct. Next.', 'Correct.'],
    wrong: ['Not quite', 'Not quite', 'Not quite'],
    done: ['Session complete', 'Done. Review your misses next.'],
  },
}

const voiceOf = (personality) => VOICES[personality] ?? VOICES.supportive

/** A stable choice from `options` for `seed`, so a line doesn't change on every render. */
function pick(options, seed = '') {
  let h = 0
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return options[h % options.length]
}

/** Home buddy card: two short lines. `seed` keeps it steady through the day. */
export function homeLines(personality, { hasMaterial, seed } = {}) {
  const voice = voiceOf(personality)
  return hasMaterial ? pick(voice.home, seed) : voice.start
}

/** The start of a practice verdict: always begins "Correct" or "Not quite". */
export function verdictLine(personality, correct, seed) {
  const voice = voiceOf(personality)
  return pick(correct ? voice.right : voice.wrong, seed)
}

/** End-of-session title and note. */
export function doneLines(personality) {
  return voiceOf(personality).done
}

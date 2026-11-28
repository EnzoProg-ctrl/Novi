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
    home: [['Ready to learn something new today?', 'Ask me anything!'], ["Let's make today a good one!", "I'm here if you need me."]],
    start: ['Add something to study', "and let's get going!"],
    right: ['Correct, yay!', 'Correct, awesome!', 'Correct, nailed it!'],
    wrong: ['Not quite, almost there', 'Not quite, next one’s yours', 'Not quite, keep it up'],
    done: ['Session complete, woohoo!', 'That was fun. Come back soon!'],
  },
  calm: {
    home: [['One step at a time.', 'Ask me whenever you need.'], ['No rush today.', "I'm here if something's unclear."]],
    start: ['Add something to study', "and we'll take it slowly."],
    right: ['Correct. Well done.', 'Correct. Nicely reasoned.', 'Correct.'],
    wrong: ['Not quite. That’s all right', 'Not quite. Take your time', 'Not quite. One more look'],
    done: ['Session complete', 'Good, steady work. Rest a little before the next one.'],
  },
  witty: {
    home: [["Brain: warmed up. Snacks: optional.", 'Ask me anything.'], ['Facts are better in pairs.', "Bring me your questions."]],
    start: ['Feed me some notes', "and we'll make them into questions."],
    right: ['Correct, look at you go!', 'Correct, textbook answer!', 'Correct, smarty pants!'],
    wrong: ['Not quite, plot twist', 'Not quite, so close', 'Not quite, the next one’s yours'],
    done: ['Session complete', 'Another one for the brain bank.'],
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

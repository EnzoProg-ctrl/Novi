/**
 * Fixed prompts for AI Chat. Starters are complete questions and are sent as
 * they are. Tasks only fill the message box, because each one needs something
 * from the student (a topic, the notes) that Novi should not make up.
 */

export const STARTERS = [
  { id: 'study', tone: 'violet', label: 'Study Help', prompt: 'Explain the concept of photosynthesis in simple terms.' },
  { id: 'practice', tone: 'green', label: 'Practice Questions', prompt: 'Give me 5 practice questions on cell biology.' },
  { id: 'strategies', tone: 'blue', label: 'Study Strategies', prompt: 'How can I improve my memorization for exams?' },
  { id: 'plan', tone: 'coral', label: 'Plan & Organize', prompt: 'Help me create a study plan for my upcoming exam.' },
]

/**
 * `fill(pack)` returns the text to put in the box. With a study pack chosen,
 * tasks can refer to it; without one, they end where the student types.
 */
export const TASKS = [
  {
    id: 'explain',
    tone: 'violet',
    title: 'Explain a concept',
    description: 'Break down a topic in simple terms.',
    fill: (pack) => (pack ? `Explain the main concepts in "${pack.title}" in simple terms.` : 'Explain this concept in simple terms: '),
  },
  {
    id: 'practice',
    tone: 'green',
    title: 'Create practice questions',
    description: 'Quiz yourself, with answers.',
    fill: (pack) =>
      pack
        ? `Create 5 practice questions from "${pack.title}", with the answers and a short explanation for each.`
        : 'Create 5 practice questions, with answers and short explanations, about: ',
  },
  {
    id: 'summarize',
    tone: 'blue',
    title: 'Summarize notes',
    description: 'Turn your notes into key points.',
    fill: (pack) => (pack ? `Summarize the key points of "${pack.title}".` : 'Summarize these notes into key points:\n'),
    hint: 'Paste your notes, or choose a study pack with the paperclip.',
  },
  {
    id: 'strategies',
    tone: 'coral',
    title: 'Give study strategies',
    description: 'Practical ways to learn better.',
    fill: () => 'Give me practical study strategies for ',
  },
]

/** Used when a reply comes back without follow-ups of its own. */
export const FALLBACK_FOLLOW_UPS = ['Can you simplify that?', 'Give me an example.', 'Quiz me on this.']

/** How many conversations the Recent Chats card lists before "See all". */
export const RECENT_SHOWN = 5

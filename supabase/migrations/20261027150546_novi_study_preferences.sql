-- Study preferences that change how studying works (Settings -> Study Preferences).
-- Lives on profiles beside the other preferences, so the existing own-row RLS,
-- two-step verification policy and table grants already cover them.

alter table public.profiles
  -- Questions per practice session; null = ask each time.
  add column practice_session_size smallint
    check (practice_session_size in (5, 10, 15, 20)),
  -- Questions when a chat quiz request gives no number; null = ask each time.
  add column chat_quiz_size smallint
    check (chat_quiz_size in (5, 10, 20, 30, 50)),
  -- How long the buddy's chat replies are.
  add column reply_length text not null default 'balanced'
    check (reply_length in ('short', 'balanced', 'detailed')),
  -- Question types new practice questions may use (at least one).
  add column question_types text[] not null
    default array['multiple_choice', 'true_false', 'short_answer', 'fill_blank', 'flashcard']
    check (
      cardinality(question_types) >= 1
      and question_types <@ array['multiple_choice', 'true_false', 'short_answer', 'fill_blank', 'flashcard']
    );

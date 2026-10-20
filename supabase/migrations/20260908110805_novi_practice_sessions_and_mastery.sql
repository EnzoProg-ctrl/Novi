-- Novi: studying with the buddy — sessions, attempts, chat, per-topic mastery

-- ---------------------------------------------------------------
-- study_sessions: one sitting with the buddy
-- ---------------------------------------------------------------
create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  study_set_id uuid references public.study_sets(id) on delete set null,
  subject_id uuid references public.subjects(id) on delete set null,
  mode text not null default 'practice' check (mode in
    ('practice','review','quiz','chat','reading')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds integer generated always as (
    case when ended_at is null then null
         else greatest(0, (extract(epoch from (ended_at - started_at)))::integer)
    end
  ) stored,
  questions_answered integer not null default 0 check (questions_answered >= 0),
  questions_correct integer not null default 0 check (questions_correct >= 0),
  created_at timestamptz not null default now(),
  constraint study_sessions_time_order check (ended_at is null or ended_at >= started_at),
  constraint study_sessions_correct_lte_answered check (questions_correct <= questions_answered)
);
create index study_sessions_user_started_idx on public.study_sessions (user_id, started_at desc);
create index study_sessions_open_idx on public.study_sessions (user_id) where ended_at is null;

comment on column public.study_sessions.duration_seconds is
  'Auto-computed once the session is closed; null while still open.';

-- ---------------------------------------------------------------
-- question_attempts: the raw signal the learning engine reads
-- ---------------------------------------------------------------
create table public.question_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.study_sessions(id) on delete set null,
  question_id uuid not null references public.questions(id) on delete cascade,
  topic_id uuid references public.topics(id) on delete set null,
  given_answer text,
  is_correct boolean not null,
  confidence smallint check (confidence between 1 and 5),
  time_taken_ms integer check (time_taken_ms >= 0),
  hint_used boolean not null default false,
  attempt_number integer not null default 1 check (attempt_number >= 1),
  created_at timestamptz not null default now()
);
create index question_attempts_user_created_idx on public.question_attempts (user_id, created_at desc);
create index question_attempts_question_idx on public.question_attempts (question_id);
create index question_attempts_topic_idx on public.question_attempts (user_id, topic_id, created_at desc);
create index question_attempts_session_idx on public.question_attempts (session_id);

-- ---------------------------------------------------------------
-- chat_messages: the conversation with the buddy
-- ---------------------------------------------------------------
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.study_sessions(id) on delete cascade,
  study_set_id uuid references public.study_sets(id) on delete set null,
  role text not null check (role in ('user','buddy','system')),
  content text not null,
  cited_chunk_ids uuid[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index chat_messages_session_idx on public.chat_messages (session_id, created_at);
create index chat_messages_user_created_idx on public.chat_messages (user_id, created_at desc);

comment on column public.chat_messages.cited_chunk_ids is
  'material_chunks the buddy grounded this reply on, so explanations can show their source.';

-- ---------------------------------------------------------------
-- topic_mastery: rolling per-topic strength, one row per student+topic
-- ---------------------------------------------------------------
create table public.topic_mastery (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,
  mastery_score numeric(4,3) not null default 0 check (mastery_score between 0 and 1),
  strength text generated always as (
    case when mastery_score >= 0.80 then 'strong'
         when mastery_score >= 0.50 then 'developing'
         else 'weak'
    end
  ) stored,
  attempts_total integer not null default 0 check (attempts_total >= 0),
  attempts_correct integer not null default 0 check (attempts_correct >= 0),
  current_streak integer not null default 0,
  last_practiced_at timestamptz,
  next_review_at timestamptz,
  review_interval_days numeric(6,2) not null default 1 check (review_interval_days > 0),
  ease_factor numeric(4,2) not null default 2.50 check (ease_factor >= 1.30),
  updated_at timestamptz not null default now(),
  unique (user_id, topic_id),
  constraint topic_mastery_correct_lte_total check (attempts_correct <= attempts_total)
);
create index topic_mastery_weak_idx on public.topic_mastery (user_id, mastery_score);
create index topic_mastery_due_idx on public.topic_mastery (user_id, next_review_at)
  where next_review_at is not null;
create trigger topic_mastery_set_updated_at before update on public.topic_mastery
  for each row execute function public.set_updated_at();

comment on table public.topic_mastery is
  'Spaced-repetition state per topic. ease_factor / review_interval_days follow an SM-2 style schedule.';

-- ---------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------
alter table public.study_sessions    enable row level security;
alter table public.question_attempts enable row level security;
alter table public.chat_messages     enable row level security;
alter table public.topic_mastery     enable row level security;

create policy "study_sessions: own rows" on public.study_sessions for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "question_attempts: own rows" on public.question_attempts for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "chat_messages: own rows" on public.chat_messages for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "topic_mastery: own rows" on public.topic_mastery for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
